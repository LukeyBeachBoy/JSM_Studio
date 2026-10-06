//! Native controller keyboard. The WebView only draws; input edges are handled
//! on every mapper packet, never by a throttled background JavaScript timer.
//! Capture is a temporary empty mapping in the existing serialized chord stack.
//! User global chords remain above it and the exact applied profile restores.
use std::{sync::{Mutex, OnceLock, atomic::{AtomicBool, Ordering}}, time::{Instant, Duration}};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use crate::{runtime, services::{app_state::AppState, global_chords::pressed}};
pub const LABEL: &str = "keyboard";
pub const CAPTURE: &str = "profiles-library/.layers/virtual-keyboard.txt";
static ENGINE: OnceLock<Mutex<Engine>> = OnceLock::new();
static TOGGLE: AtomicBool = AtomicBool::new(false);
static GLOBAL: AtomicBool = AtomicBool::new(false);
static REQUESTED: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all="camelCase")]
pub struct Preferences {
    pub layout: String,
    #[serde(default="default_variant")] pub daisywheel_variant: String,
    #[serde(default)] pub right_stick_dpad: bool,
    #[serde(default="yes")] pub guide_shortcut: bool,
    #[serde(default="default_appearance")] pub appearance: String,
    #[serde(default="default_press_threshold")] pub pad_press_threshold: f64,
    #[serde(default="default_touch_smoothing")] pub touch_smoothing: f64,
    #[serde(default="default_vertical_steadying")] pub vertical_steadying: f64,
    #[serde(default="default_haptic_type")] pub haptic_type: String,
    #[serde(default="default_haptic_intensity")] pub haptic_intensity: f32,
    #[serde(default="default_shortcuts")] pub shortcuts: std::collections::BTreeMap<String, std::collections::BTreeMap<String,String>>,
}
fn default_variant()->String {"classic".into()}
fn default_appearance()->String { "theme".into() }
// Steam's own keyboard presses at about 8.4% pad force and releases at about
// 4% (docs/steam-keyboard-haptic-capture.md; tools/analyse-pad-swipes.mjs on
// that capture). 2% fires on the first touch of force, while the thumb is
// still sliding onto the key.
fn default_press_threshold()->f64 {0.08}
const PRESS_RELEASE_RATIO:f64=0.5;
// 0..1. Half is 3 Hz at rest plus 15 Hz per pad unit/s: a slow 0.1 unit/s
// move trails by ~35 ms (1.5 Hz/10 gave ~64 ms, which felt slow), and on the
// 4 October capture a hovering thumb still draws well under half its raw path.
fn default_touch_smoothing()->f64 {0.5}
// 0..1, the share of sideways movement removed from a purely vertical stroke.
fn default_vertical_steadying()->f64 {0.7}
fn default_haptic_type()->String {"automatic".into()}
fn default_haptic_intensity()->f32 {35.0}
fn default_shortcuts()->std::collections::BTreeMap<String,std::collections::BTreeMap<String,String>> {
    ["standard","split","daisywheel"].into_iter().map(|layout| (layout.into(),
        [("backspace",if layout=="daisywheel" {"LEFT"} else {"W"}),("space",if layout=="daisywheel" {"RIGHT"} else {"N"}),("shift","ZL"),("caps",if layout=="daisywheel" {"UP"} else {"L3"}),
         ("enter",if layout=="daisywheel" {"DOWN"} else {"ZR"}),("symbols",if layout=="daisywheel" {"ZR"} else {"L"}),
         ("close","+"),("move",if layout=="daisywheel" {"R"} else {"R3"}),("scale",if layout=="daisywheel" {"L"} else {"R"}),("reset","L+R")]
        .into_iter().map(|(k,v)|(k.into(),v.into())).collect())).collect()

}
fn yes() -> bool { true }
impl Default for Preferences { fn default() -> Self { Self { layout:"split".into(), daisywheel_variant:"classic".into(), right_stick_dpad:false, guide_shortcut:true, appearance:default_appearance(), pad_press_threshold:default_press_threshold(), touch_smoothing:default_touch_smoothing(), vertical_steadying:default_vertical_steadying(), haptic_type:default_haptic_type(), haptic_intensity:default_haptic_intensity(), shortcuts:default_shortcuts() } } }
#[derive(Clone, Serialize, PartialEq, Debug)]
#[serde(rename_all="camelCase")]
pub struct Frame {
    pub open: bool, pub ready: bool, pub layout: String, pub shift: bool, pub symbols: bool,
    pub left: Option<usize>, pub right: Option<usize>, pub selected: usize, pub petal: Option<usize>,
    pub rows: Vec<Vec<String>>, pub petals: Vec<Vec<String>>,
    pub preferences: Preferences, pub controller_type: u64, pub stick: [f64;2], pub secondary: bool, pub caps: bool,
    pub left_touch: Option<[f64;2]>, pub right_touch: Option<[f64;2]>,
    pub daisy_presses: [[u32;4];8],

}
struct Engine {
    prefs: Preferences, frame: Frame, previous: std::collections::HashMap<i64,u64>,
    pad_rotation: [f64;2],
    owner: Option<i64>, opened_at: Instant, last_packet: Instant, last_emit: Instant, emitted: Option<Frame>,
    repeat: Option<(String,Instant,Instant)>, nav_repeat: Option<(usize,Instant,Instant)>,
    armed: bool,
    capture_acknowledged: bool,
    transform_pad: [Option<[f64;2]>;2], transform_at: Instant, shift_latched: bool,
    last_haptic: Option<Instant>,
    touch_filter: [TouchFilter;2], clock: Instant, sample_time: f64,

}
impl Engine {
    fn new(prefs: Preferences) -> Self {
        Self { frame: Frame { open:false, ready:false, layout:prefs.layout.clone(), shift:false,
            symbols:false, left:None, right:None, selected:0, petal:None,
            rows:rows(false,false), petals:petals(false,false), preferences:prefs.clone(), controller_type:0,
            stick:[0.0,0.0], secondary:false, caps:false, left_touch:None,right_touch:None, daisy_presses:[[0;4];8] }, prefs,
            pad_rotation:[0.0;2], previous:Default::default(), owner:None, opened_at:Instant::now(), last_packet:Instant::now(),
            last_emit:Instant::now(), emitted:None, repeat:None, nav_repeat:None, armed:false, capture_acknowledged:false, transform_pad:[None;2], transform_at:Instant::now(), shift_latched:false, last_haptic:None,
            touch_filter:Default::default(), clock:Instant::now(), sample_time:0.0 }
    }
    fn refresh(&mut self) {
        self.frame.preferences=self.prefs.clone();
        self.frame.rows=rows(self.frame.shift,self.frame.symbols);
        if self.frame.caps { for row in &mut self.frame.rows {for key in row {if key.len()==1 && key.chars().all(|c|c.is_ascii_alphabetic()) {*key=if self.frame.shift {key.to_lowercase()} else {key.to_uppercase()};}}} }
        self.frame.petals=petals_variant(self.frame.shift,self.frame.caps,self.frame.symbols,&self.prefs.daisywheel_variant);
    }
}
fn engine() -> &'static Mutex<Engine> { ENGINE.get_or_init(||Mutex::new(Engine::new(Preferences::default()))) }
pub fn initialize(app: &AppHandle) -> Result<(),String> {
    let root=runtime::runtime_dir(app)?;
    let prefs=match std::fs::read_to_string(root.join("virtual-keyboard.json")) {
        Ok(text)=>{
            let raw:Value=serde_json::from_str(&text).map_err(|e|format!("Invalid keyboard preferences: {e}"))?;
            let mut prefs:Preferences=serde_json::from_value(raw.clone()).map_err(|e|e.to_string())?;
            if raw.get("daisywheelVariant").is_none() {
                prefs.daisywheel_variant="classic".into();
                for layout in ["standard","split"] {
                    if let Some(b)=prefs.shortcuts.get_mut(layout) {
                        if b.get("close").is_some_and(|s|s=="-") && b.get("enter").is_some_and(|s|s=="+") {
                            b.insert("close".into(),"+".into());b.insert("enter".into(),"-".into());
                        }
                    }
                }
                if let Some(b)=prefs.shortcuts.get_mut("daisywheel") {
                    let legacy=[("shift","L"),("symbols","R"),("move","R3"),("scale","L3"),("reset","L3+R3"),("close","-")];
                    if legacy.iter().all(|(a,v)|b.get(*a).is_some_and(|s|s==v)) { *b=default_shortcuts().remove("daisywheel").unwrap(); }
                }
            }
            prefs
        },
        Err(e) if e.kind()==std::io::ErrorKind::NotFound=>Preferences::default(),
        Err(e)=>return Err(e.to_string()),
    };
    validate(&prefs)?;
    *engine().lock().map_err(|e|e.to_string())?=Engine::new(prefs);
    std::fs::create_dir_all(root.join("profiles-library/.layers")).map_err(|e|e.to_string())?;
    // Reset loads the user's OnReset and StudioDefaults too. Explicitly silence
    // EVERY input afterwards, including their bindings and all derived regions.
    runtime::write_file_atomically(root.join(CAPTURE),capture_profile())?;
    ensure(app)?;
    Ok(())
}
fn capture_profile()->String {
    // NONE is a binding value, not a supported TouchpadMode. Use the grid
    // with cleared bindings and silence touch sticks even if OnReset enables them.
    let mut text=String::from("RESET_MAPPINGS\nGYRO_SENS = 0\nMIN_GYRO_SENS = 0\nMAX_GYRO_SENS = 0\nLEFT_STICK_MODE = NO_MOUSE\nRIGHT_STICK_MODE = NO_MOUSE\nMOTION_STICK_MODE = NO_MOUSE\nTOUCHPAD_MODE = GRID_AND_STICK\nLEFT_TOUCHPAD_MODE = GRID_AND_STICK\nRIGHT_TOUCHPAD_MODE = GRID_AND_STICK\nTOUCH_STICK_MODE = NO_MOUSE\nLEFT_TOUCH_STICK_MODE = NO_MOUSE\nRIGHT_TOUCH_STICK_MODE = NO_MOUSE\nVIRTUAL_CONTROLLER = NONE\nAUTOLOAD = OFF\n");
    let inputs="UP DOWN LEFT RIGHT L ZL - E S N W R ZR + HOME LSL LSR RSL RSR L3 R3 LEAN_LEFT LEAN_RIGHT MIC LUP LDOWN LLEFT LRIGHT LRING RUP RDOWN RLEFT RRIGHT RRING MUP MDOWN MLEFT MRIGHT MRING TOUCH LTOUCH RTOUCH LMINI RMINI MISC1 MISC2 MISC3 MISC4 MISC5 MISC6 ZLF CAPTURE ZRF TUP TDOWN TLEFT TRIGHT TRING";
    for input in inputs.split_whitespace() { text.push_str(&format!("{input} = NONE\n")); }
    for prefix in ["T","LT","RT","LM","RM"] { for i in 1..=25 { text.push_str(&format!("{prefix}{i} = NONE\n")); } }
    text.push_str("TELEMETRY_ENABLED = ON\nTELEMETRY_PORT = 8974\n");
    text
}
fn validate(p:&Preferences)->Result<(),String> {
    if !["automatic","off","tick","click","tone","rumble","sweep","pulse","tap"].contains(&p.haptic_type.as_str()) {return Err("Unknown keyboard haptic feedback type".into());}
    if !p.haptic_intensity.is_finite() || !(0.0..=100.0).contains(&p.haptic_intensity) {return Err("Keyboard haptic intensity must be between 0 and 100%.".into());}
    if !p.pad_press_threshold.is_finite() || !(0.0..=0.2).contains(&p.pad_press_threshold) {return Err("Pad press threshold must be between 0 and 20%.".into());}
    if !p.touch_smoothing.is_finite() || !(0.0..=1.0).contains(&p.touch_smoothing) {return Err("Touch smoothing must be between 0 and 100%.".into());}
    if !p.vertical_steadying.is_finite() || !(0.0..=1.0).contains(&p.vertical_steadying) {return Err("Vertical steadying must be between 0 and 100%.".into());}
    if !["standard","split","daisywheel"].contains(&p.layout.as_str()) { return Err("Unknown keyboard layout".into()); }
    if !["theme","dark","light"].contains(&p.appearance.as_str()) { return Err("Unknown keyboard appearance".into()); }
    if !["classic","inputlabs"].contains(&p.daisywheel_variant.as_str()) {return Err("Unknown Daisywheel variant".into());}
    for layout in ["standard","split","daisywheel"] {
        let bindings=p.shortcuts.get(layout).ok_or("Missing keyboard shortcuts")?;
        for action in ["backspace","space","shift","caps","enter","symbols","close","move","scale","reset"] {
            let value=bindings.get(action).ok_or("Missing keyboard shortcut")?;
            if shortcut_mask(value)==0 { return Err("Invalid keyboard shortcut".into()); }
            if layout=="daisywheel" && value.split('+').any(|c|["S","E","W","N"].contains(&c)) { return Err("Daisywheel face buttons select characters".into()); }
        }
        let values:Vec<_>=bindings.values().collect();
        for (i,v) in values.iter().enumerate() { if values[..i].contains(v) { return Err("Keyboard shortcuts must be unique".into()); } }
    }
    Ok(())
}
pub fn preferences()->Preferences { engine().lock().unwrap().prefs.clone() }
pub fn save_preferences(app:&AppHandle,p:Preferences)->Result<Preferences,String> {
    validate(&p)?;
    runtime::write_file_atomically(runtime::runtime_dir(app)?.join("virtual-keyboard.json"),serde_json::to_string_pretty(&p).map_err(|e|e.to_string())?)?;
    let mut e=engine().lock().map_err(|e|e.to_string())?;
    let layout_changed=e.prefs.layout!=p.layout;
    e.prefs=p.clone(); e.frame.layout=p.layout.clone(); e.frame.left=None; e.frame.right=None;
    e.frame.petal=None; e.repeat=None; e.nav_repeat=None; e.armed=false;
    e.refresh();
    let _=app.emit("virtual-keyboard-preferences",&p);
    let _=app.emit_to(LABEL,"keyboard-frame",&e.frame);
    drop(e);
    if requested() && layout_changed {transform_window(app,(0.0,0.0,0.0,true));}
    Ok(p)
}
pub fn frame()->Frame { engine().lock().unwrap().frame.clone() }
pub fn requested()->bool { REQUESTED.load(Ordering::Relaxed) }
pub fn set_pad_orientation(left:f64,right:f64) {
    if let Ok(mut e)=engine().lock() {
        if e.pad_rotation!=[left,right] {
            e.pad_rotation=[left,right];
            e.frame.left=None;e.frame.right=None;e.transform_pad=[None;2];
        }
    }
}
pub fn set_global(active:bool) { GLOBAL.store(active,Ordering::Relaxed); }
pub fn request_toggle(owner:i64) {
    if let Ok(mut e)=engine().lock() {if !e.frame.open {e.owner=Some(owner);}}
    TOGGLE.fetch_xor(true,Ordering::Relaxed);
}
pub fn take_toggle()->bool { TOGGLE.swap(false,Ordering::Relaxed) }
pub fn ensure(app:&AppHandle)->Result<tauri::WebviewWindow,String> {
    if let Some(w)=app.get_webview_window(LABEL) { return Ok(w); }
    let w=WebviewWindowBuilder::new(app,LABEL,WebviewUrl::App("keyboard.html".into()))
        .title("JSM Evolved Keyboard").transparent(true).decorations(false).always_on_top(true)
        .skip_taskbar(true).resizable(false).shadow(false).focused(false).visible(false)
        .inner_size(1000.0,470.0).build().map_err(|e|e.to_string())?;
    w.set_ignore_cursor_events(true).map_err(|e|e.to_string())?;
    let _=w.hide();
    #[cfg(target_os="windows")]
    unsafe {
        use windows_sys::Win32::UI::WindowsAndMessaging::*;
        let h=w.hwnd().map_err(|e|e.to_string())?.0 as _;
        let style=GetWindowLongPtrW(h,GWL_EXSTYLE);
        SetWindowLongPtrW(h,GWL_EXSTYLE,style | WS_EX_NOACTIVATE as isize);
    }
    Ok(w)
}
pub fn set_open(app:&AppHandle,open:bool)->Result<(),String> {
    let w=ensure(app)?;
    if open {
        let prefs=runtime::read_runtime_mapping_state(app)?;
        set_pad_orientation(prefs.left_pad_rotation,prefs.right_pad_rotation);
        let point=app.cursor_position().map_err(|e|e.to_string())?;
        let monitor=app.monitor_from_point(point.x,point.y).ok().flatten()
            .or_else(||app.primary_monitor().ok().flatten()).ok_or("No keyboard monitor")?;
        let scale=monitor.scale_factor();
        let daisy=preferences().layout=="daisywheel";
        let (base_w,base_h)=if daisy {(420.0,440.0)} else {(1000.0,350.0)};
        let fit=scale.min(monitor.size().width as f64*0.94/base_w).min(monitor.size().height as f64*0.85/base_h);
        let width=base_w*fit;let height=base_h*fit;
        w.set_size(tauri::PhysicalSize::new(width as u32,height as u32)).map_err(|e|e.to_string())?;
        w.set_position(tauri::PhysicalPosition::new(monitor.position().x+(monitor.size().width as i32-width as i32)/2,
            monitor.position().y+monitor.size().height as i32-height as i32-(24.0*scale) as i32)).map_err(|e|e.to_string())?;
    }
    {
        let mut e=engine().lock().map_err(|e|e.to_string())?;
        e.frame.open=open; e.frame.ready=false; e.shift_latched=false; e.frame.shift=false; e.frame.symbols=false;
        e.frame.daisy_presses=[[0;4];8];
        e.frame.left=None; e.frame.right=None; e.frame.petal=None; e.frame.stick=[0.0,0.0]; e.frame.secondary=false; e.frame.caps=false; e.transform_pad=[None;2]; e.repeat=None; e.nav_repeat=None;
        e.armed=false; e.capture_acknowledged=false; e.refresh(); e.opened_at=Instant::now(); e.last_packet=Instant::now(); e.emitted=None;
        if !open { e.owner=None; }
    }
    REQUESTED.store(open,Ordering::Relaxed);
    let _=app.emit("virtual-keyboard-open",open);
    if !open { let _=w.hide(); }
    if let Some(overlay)=app.get_webview_window(crate::services::overlay::OVERLAY_LABEL) {
        if open { let _=overlay.hide(); }
        else if app.state::<AppState>().overlay_active.load(Ordering::Relaxed) { let _=overlay.show(); }
    }
    // Show only after telemetry acknowledges capture, so no typing is accepted
    // while the game mapping is still active.
    Ok(())
}
pub fn health(app:&AppHandle) {
    let stale=engine().lock().map(|e|e.frame.open && (e.last_packet.elapsed()>Duration::from_secs(2) || (!e.frame.ready && !GLOBAL.load(Ordering::Relaxed) && e.opened_at.elapsed()>Duration::from_secs(3) && !e.capture_acknowledged))).unwrap_or(false);
    if stale { let _=set_open(app,false); }
}

fn rows(shift:bool,symbols:bool)->Vec<Vec<String>> {
    let raw=if symbols { vec![
        vec!["!","@","#","$","%","^","&","*","(",")","-","⌫"],
        vec!["[","]","{","}","<",">","/","\\","|","~","=","+"],
        vec!["€","£","¥","_",";",":","'","\"","?","!","@","↵"],
        vec!["⇧","1","2","3","4","5","6","7","8","9","0","⇧"],
        vec!["Caps","←","→","Space","Space","Space","Space","Space","Space","←","→","Done"],
    ] } else { vec![
        vec!["1","2","3","4","5","6","7","8","9","0","-","⌫"],
        vec!["q","w","e","r","t","y","u","i","o","p","[","]"],
        vec!["a","s","d","f","g","h","j","k","l",";","'","↵"],
        vec!["⇧","z","x","c","v","b","n","m",",",".","/","⇧"],
        vec!["Caps","←","→","Space","Space","Space","Space","Space","Space","←","→","Done"],
    ] };
    raw.into_iter().map(|row|row.into_iter().map(|s|if shift && s.len()==1 { shifted(s) } else { s.into() }).collect()).collect()
}
fn shifted(s:&str)->String {
    match s { "1"=>"!","2"=>"@","3"=>"#","4"=>"$","5"=>"%","6"=>"^","7"=>"&","8"=>"*","9"=>"(","0"=>")",
        "-"=>"_","["=>"{","]"=>"}",";"=>":","'"=>"\"",","=>"<","."=>">","/"=>"?",_=>return s.to_uppercase() }.into()
}
fn petals(shift:bool,symbols:bool)->Vec<Vec<String>> { petals_variant(shift,false,symbols,"classic") }
// Petals run clockwise from up; each one's characters are [X, Y, B, A], which
// is the order they sit around the petal: left, top, right, bottom.
// The letter bank carries the sentence punctuation, so prose never needs a
// trigger. The trigger bank holds digits (with . and , for numbers) and the
// rest of ASCII's common punctuation; adding Shift reaches the remainder.
const CLASSIC_PETALS:[&str;8]=["abcd","efgh","ijkl","mnop","qrst","uvwx","yz,.","?!'-"];
// Input Labs' desktop profile (alpakka_firmware src/profiles/desktop.c),
// converted from their A/B/X/Y fields. Their two empty slots carry ' and -.
const INPUTLABS_PETALS:[&str;8]=["cdba","ghfe","n'mo","xyzw","v-tu","rspq","klji","@?.,"];
const SYMBOL_PETALS:[&str;8]=["1234","5678","90.,","+-*/","=%()","@#$&",":;'\"","?!_\\"];
const EXTENDED_PETALS:[&str;8]=["[]{}","<>|~","^`€£","¥¢°§","±×÷…","«»¿¡","–—•¶","©®™µ"];
fn petals_variant(shift:bool,caps:bool,symbols:bool,variant:&str)->Vec<Vec<String>> {
    let (groups,upper)=if symbols {(if shift {EXTENDED_PETALS} else {SYMBOL_PETALS},false)}
        else {(if variant=="inputlabs" {INPUTLABS_PETALS} else {CLASSIC_PETALS},shift^caps)};
    groups.into_iter().map(|s|s.chars().map(|c|if upper {c.to_uppercase().collect()} else {c.to_string()}).collect()).collect()
}
fn pad_cell(p:&Value,split:bool,right:bool)->Option<usize> {
    if !p["touched"].as_bool().unwrap_or(false) {return None}
    let cols=if split {6} else {12};
    let x=p["x"].as_f64()?.clamp(-1.0,1.0);
    let y=p["y"].as_f64()?.clamp(-1.0,1.0);
    let col=(((x+1.0)*0.5*cols as f64).floor() as usize).min(cols-1);
    let row=(((y+1.0)*2.5).floor() as usize).min(4);
    Some(row*12+col+if split && right {6} else {0})
}
// Retain the current key inside a small boundary band. Each axis settles
// independently, so noise along one edge cannot block intentional movement
// along the other. No timer or cursor smoothing delays deliberate crossings.
fn stable_pad_cell(p:&Value,split:bool,right:bool,previous:Option<usize>)->Option<usize> {
    let candidate=pad_cell(p,split,right)?;
    let x=p["x"].as_f64()?;let y=p["y"].as_f64()?;
    if !x.is_finite() || !y.is_finite() {return None;}
    let Some(previous)=previous.filter(|cell|*cell<60) else {return Some(candidate)};
    let cols=if split {6} else {12};let offset=if split && right {6} else {0};
    let old_col=previous%12;
    if old_col<offset || old_col>=offset+cols {return Some(candidate);}
    let px=(x.clamp(-1.0,1.0)+1.0)*0.5*cols as f64;
    let py=(y.clamp(-1.0,1.0)+1.0)*2.5;
    const BAND:f64=0.10; // 10% of one key, identical in Standard and Split.
    let local_col=old_col-offset;let old_row=previous/12;
    let col=if px>=local_col as f64-BAND && px<=local_col as f64+1.0+BAND {old_col} else {candidate%12};
    let row=if py>=old_row as f64-BAND && py<=old_row as f64+1.0+BAND {old_row} else {candidate/12};
    Some(row*12+col)
}
const WHEEL_ENGAGE:f64=0.32;
const WHEEL_RELEASE:f64=0.26;
fn wheel(x:f64,y:f64)->Option<usize> {
    if !x.is_finite() || !y.is_finite() || x.hypot(y)<WHEEL_ENGAGE {None} else {Some(((x.atan2(y).rem_euclid(std::f64::consts::TAU)/std::f64::consts::TAU*8.0+0.5).floor() as usize)%8)}
}
// The petal equivalent of stable_pad_cell: a stick resting on a boundary, or
// easing back past the deadzone, keeps its petal instead of flickering (and
// ticking) between neighbours. A deliberate move still switches immediately.
fn stable_wheel(x:f64,y:f64,previous:Option<usize>)->Option<usize> {
    let Some(previous)=previous.filter(|p|*p<8) else {return wheel(x,y)};
    if !x.is_finite() || !y.is_finite() || x.hypot(y)<WHEEL_RELEASE {return None;}
    use std::f64::consts::{PI,TAU};
    const BAND:f64=7.0*PI/180.0;
    let off=(x.atan2(y)-previous as f64*TAU/8.0+PI).rem_euclid(TAU)-PI;
    if off.abs()<=TAU/16.0+BAND {Some(previous)} else {wheel(x,y)}
}
pub(super) fn physical_mask(d:&Value)->u64 {
    let mut b=d["status"]["buttons"].as_u64().unwrap_or(0);
    if pressed(d,"ZL") {b|=1<<40;} if pressed(d,"ZR") {b|=1<<41;}
    b
}
fn keyboard_buttons(e:&Engine,d:&Value)->u64 {
    let mut buttons=physical_mask(d);
    // Steam Controller's analogue force can actuate before the firmware click.
    // A release band (half the press force, as Steam's) prevents duplicate
    // letters while force hovers at threshold.
    // Other devices, missing force data, and threshold zero use physical clicks.
    if d["type"].as_u64()!=Some(24) || e.prefs.pad_press_threshold<=0.0 {return buttons;}
    let old=e.previous.get(&d["handle"].as_i64().unwrap_or(0)).copied().unwrap_or(0);
    for (side,bit) in [("leftPad",29),("rightPad",28)] {
        let pad=&d["status"][side];
        let threshold=e.prefs.pad_press_threshold * if old&(1<<bit)!=0 {PRESS_RELEASE_RATIO} else {1.0};
        if pad["touched"].as_bool().unwrap_or(false) && pad["pressure"].as_f64().is_some_and(|p|p.is_finite() && p>=threshold) {buttons|=1<<bit;}
    }
    buttons
}
fn stick_dpad(stick:&Value)->u64 {
    let x=stick["x"].as_f64().unwrap_or(0.0);let y=stick["y"].as_f64().unwrap_or(0.0);
    if x.abs().max(y.abs())<0.55 {return 0;}
    1<<if y.abs()>x.abs() {if y>0.0 {0} else {1}} else if x<0.0 {2} else {3}
}
fn held_mask(d:&Value)->u64 {
    let mut b=physical_mask(d);
    let s=&d["status"]["leftStick"];
    let x=s["x"].as_f64().unwrap_or(0.0); let y=s["y"].as_f64().unwrap_or(0.0);
    if x.abs().max(y.abs())>0.55 {
        b|=1 << if y.abs()>=x.abs() {if y>0.0 {0} else {1}} else if x<0.0 {2} else {3};
    }
    b
}
fn action(e:&mut Engine,key:&str)->Option<String> {
    match key {
        "Done"=>{TOGGLE.store(true,Ordering::Relaxed);None},
        "Caps"=>{e.frame.caps=!e.frame.caps;e.refresh();None},
        "⇧"=>{e.shift_latched=!e.shift_latched;e.frame.shift=e.shift_latched;e.refresh();None},
        "Symbols"=>{e.frame.symbols=!e.frame.symbols;e.refresh();None},
        _=>Some(key.into()),
    }
}
pub fn on_packet(app:&AppHandle,packet:&Value) {
    let mut output=Vec::new();
    let mut haptic=None;
    let mut show=false;
    let mut transform=None;
    {
        let Ok(mut e)=engine().lock() else {return};
        e.sample_time=e.clock.elapsed().as_secs_f64();
        let devices=packet["devices"].as_array().map(Vec::as_slice).unwrap_or(&[]);

        let guide=false;
        let d=e.owner.and_then(|id|devices.iter().find(|d|d["handle"].as_i64()==Some(id)))
            .or_else(||if e.owner.is_none(){devices.first()} else {None});
        if let Some(d)=d {
            let captured=packet["activeProfile"].as_str().unwrap_or("").replace('\\',"/")==CAPTURE;
            if e.frame.open && e.frame.ready && e.armed && !guide && !GLOBAL.load(Ordering::Relaxed) {
                transform=transform_input(&mut e,d);
            }
            let before=FeedbackState::from(&e.frame);
            let armed=e.armed;
            let buttons=keyboard_buttons(&e,d);
            let old=e.previous.get(&d["handle"].as_i64().unwrap_or(0)).copied().unwrap_or(buttons);
            let result=advance(&mut e,d,captured,guide,GLOBAL.load(Ordering::Relaxed));
            show=result.0;output=result.1;
            if let Some(pulse)=keyboard_feedback(&before,&e.frame,&output,buttons,old,armed) {
                // Key presses always win. Bound crossing buzz without delaying input.
                if pulse.intensity>=35.0 || e.last_haptic.is_none_or(|last|last.elapsed()>=Duration::from_millis(18)) {
                    haptic=configure_haptic(pulse,&e.prefs).map(|pulse|{
                        let (rumble,grips)=keyboard_haptic_target(&e.prefs);
                        let gain=if e.prefs.haptic_type=="automatic" {Some(steam_keyboard_gain(&pulse,&e.prefs))} else {None};
                        (pulse,rumble,grips,gain)
                    });
                    if haptic.is_some() {e.last_haptic=Some(Instant::now());}
                }
            }
        } else if e.frame.open {
            // The owning controller was unplugged; another device must not
            // silently inherit its held controls or keep capture alive.
            TOGGLE.store(true,Ordering::Relaxed);
        }
        e.previous=devices.iter().map(|d|(d["handle"].as_i64().unwrap_or(0),keyboard_buttons(&e,d)|if e.prefs.layout=="daisywheel" && e.prefs.right_stick_dpad {stick_dpad(&d["status"]["rightStick"])} else {0})).collect();
        if e.frame.open && e.emitted.as_ref()!=Some(&e.frame) && e.last_emit.elapsed()>Duration::from_millis(2) {
            let _=app.emit_to(LABEL,"keyboard-frame",&e.frame);
            e.emitted=Some(e.frame.clone());e.last_emit=Instant::now();
        }
    }
    if let Some((pulse,rumble,grips,gain))=haptic {
        if let Some(gain)=gain {crate::services::feedback::send_keyboard(pulse.effect,pulse.intensity,pulse.side,gain,rumble);}
        else {crate::services::feedback::send(pulse.effect,pulse.intensity,pulse.side,12,rumble,grips);}
    }
    if let Some(change)=transform { transform_window(app,change); }
    if show {if let Some(w)=app.get_webview_window(LABEL) {
        let _=w.show();crate::services::overlay::refresh_stacking(app);
    }}
    for key in output {if let Err(error)=send(&key) {
        let _=app.emit_to(LABEL,"keyboard-error",error);
    }}
}
#[derive(Debug, PartialEq)]
struct KeyboardHaptic { effect:u8, intensity:f32, side:u8 }
fn keyboard_haptic_target(prefs:&Preferences)->(f32,bool) {
    // Adaptive keyboard feedback uses pads rather than dedicated grip actuators.
    // Retain short rumble feedback on controllers without Steam pad actuators.
    (if prefs.haptic_type=="automatic" {prefs.haptic_intensity*8.0/35.0} else {0.0},false)
}
fn configure_haptic(mut pulse:KeyboardHaptic,prefs:&Preferences)->Option<KeyboardHaptic> {
    if prefs.haptic_type=="off" || prefs.haptic_intensity==0.0 {return None;}
    pulse.effect=match prefs.haptic_type.as_str() {"tick"=>1,"click"=>2,"tone"=>3,"rumble"=>4,"sweep"=>7,"pulse"=>8,"tap"=>9,_=>if pulse.effect==2 {8} else {1}};
    pulse.intensity=(pulse.intensity*prefs.haptic_intensity/35.0).min(100.0);
    Some(pulse)
}
fn steam_keyboard_gain(pulse:&KeyboardHaptic,prefs:&Preferences)->i32 {
    let original=pulse.intensity*35.0/prefs.haptic_intensity;
    let base=if original>=34.99 {5.0} else {1.0};
    (base+20.0*(prefs.haptic_intensity/35.0).log10()).round().clamp(-128.0,127.0) as i32
}
// Copy only feedback state, avoiding a second allocation of the key labels
// and preference maps on every high-frequency telemetry packet.
struct FeedbackState { ready:bool,shift:bool,symbols:bool,caps:bool,left:Option<usize>,right:Option<usize>,selected:usize,petal:Option<usize>,secondary:bool,left_touch:bool,right_touch:bool }
impl From<&Frame> for FeedbackState {
    fn from(f:&Frame)->Self {Self {ready:f.ready,shift:f.shift,symbols:f.symbols,caps:f.caps,left:f.left,right:f.right,selected:f.selected,petal:f.petal,secondary:f.secondary,left_touch:f.left_touch.is_some(),right_touch:f.right_touch.is_some()}}
}

// Adaptive reproduces captured Steam pad ticks and touch/shortcut pulses.
// Feedback follows accepted native input, including when the WebView is busy.
fn keyboard_feedback(before:&FeedbackState,after:&Frame,output:&[String],buttons:u64,old:u64,armed:bool)->Option<KeyboardHaptic> {
    if !armed || !before.ready || !after.ready {return None;}
    let bindings=&after.preferences.shortcuts[&after.layout];
    let edge=|action:&str|shortcut_held(bindings,buttons,action) && !shortcut_held(bindings,old,action);
    if ["move","scale","reset"].iter().any(|a|shortcut_held(bindings,buttons,a)) {
        return ["move","scale","reset"].iter().any(|a|edge(a)).then_some(KeyboardHaptic {effect:8,intensity:10.0,side:3});
    }
    let down=buttons & !old;
    let up=old & !buttons;
    let mut clicked=0;
    if after.layout!="daisywheel" {
        if (down&(1<<29)!=0 && after.left.is_some()) || (up&(1<<29)!=0 && before.left.is_some()) {clicked|=1;}
        if (down&(1<<28)!=0 && after.right.is_some()) || (up&(1<<28)!=0 && before.right.is_some()) {clicked|=2;}
    }
    if clicked!=0 {return Some(KeyboardHaptic {effect:9,intensity:35.0,side:clicked});}
    if ["backspace","space","shift","caps","enter","symbols","close"].iter().any(|a|edge(a)) {
        let side=if edge("shift") || edge("caps") {1} else {2};
        return Some(KeyboardHaptic {effect:2,intensity:35.0,side});
    }
    if before.shift!=after.shift {return Some(KeyboardHaptic {effect:2,intensity:35.0,side:1});}
    if after.layout!="daisywheel" {
        let mut touched=0;
        if before.left_touch!=after.left_touch.is_some() {touched|=1;}
        if before.right_touch!=after.right_touch.is_some() {touched|=2;}
        if touched!=0 {return Some(KeyboardHaptic {effect:2,intensity:35.0,side:touched});}
    }
    if !output.is_empty() {return Some(KeyboardHaptic {effect:8,intensity:35.0,side:if after.layout=="daisywheel" {if after.secondary {2} else {1}} else {3}});}
    if before.shift!=after.shift || before.symbols!=after.symbols || before.caps!=after.caps || edge("close") {
        return Some(KeyboardHaptic {effect:8,intensity:10.0,side:3});
    }
    if after.layout=="daisywheel" {
        if after.petal.is_some() && (before.petal!=after.petal || before.secondary!=after.secondary) {
            return Some(KeyboardHaptic {effect:8,intensity:18.0,side:if after.secondary {2} else {1}});
        }
    } else {
        // A merged space bar is one key, even while crossing its internal cells.
        let key=|cell:Option<usize>|cell.map(|c|if c/12==4 && (3..9).contains(&(c%12)) {if after.layout=="split" && c%12>=6 {54} else {51}} else {c});
        let mut side=0;
        if after.left.is_some() && key(before.left)!=key(after.left) {side|=1;}
        if after.right.is_some() && key(before.right)!=key(after.right) {side|=2;}
        if side!=0 {return Some(KeyboardHaptic {effect:8,intensity:18.0,side});}
        if before.selected!=after.selected {return Some(KeyboardHaptic {effect:8,intensity:18.0,side:1});}
    }
    None
}
fn advance(e:&mut Engine,d:&Value,captured:bool,guide:bool,global:bool)->(bool,Vec<String>) {
    let mut output=Vec::new();
            let id=d["handle"].as_i64().unwrap_or(0);
            if e.frame.open && e.owner.is_none() {e.owner=Some(id);}
            e.last_packet=Instant::now();
            let physical_pads=keyboard_buttons(e,d);
            let b=held_mask(d)|physical_pads; let old=e.previous.get(&id).copied().unwrap_or(b);
            let alias=if e.prefs.layout=="daisywheel" && e.prefs.right_stick_dpad { stick_dpad(&d["status"]["rightStick"]) } else {0};
            let physical=physical_pads|alias;
            let down=physical & !old;
            
            if captured { e.capture_acknowledged=true; }
            let ready=e.frame.open && captured && !global && !guide;
            let show=e.frame.open && captured && !e.frame.ready;
            e.frame.ready=ready;
            // All controls must be released once after opening/chord return.
            // A held confirm/backspace/trigger cannot leak into typing.
            if !ready {e.armed=false;e.repeat=None;e.nav_repeat=None;e.touch_filter=Default::default();}
            else if !e.armed {
                if b & (e.prefs.shortcuts[&e.prefs.layout].values().fold(0,|mask,c|mask|shortcut_mask(c)) | (15u64<<12)|(3u64<<28)|15)==0 {e.armed=true;}
            } else {
                let daisy=e.prefs.layout=="daisywheel";
                e.frame.controller_type=d["type"].as_u64().unwrap_or(0);
                let (now,smoothing,steadying)=(e.sample_time,e.prefs.touch_smoothing,e.prefs.vertical_steadying);
                let left_pad=filtered_pad(oriented_pad(d,"leftPad",e.pad_rotation[0]),&mut e.touch_filter[0],now,smoothing,steadying);
                let right_pad=filtered_pad(oriented_pad(d,"rightPad",e.pad_rotation[1]),&mut e.touch_filter[1],now,smoothing,steadying);
                e.frame.left_touch=touch_point(&left_pad);
                e.frame.right_touch=touch_point(&right_pad);
                let bindings=e.prefs.shortcuts[&e.prefs.layout].clone();
                let held=|action:&str| shortcut_held(&bindings,physical,action);
                let edge=|action:&str| shortcut_held(&bindings,physical,action) && !shortcut_held(&bindings,old,action);
                // Moving the window uses the pads as deltas; typing resumes from the thumb.
                if held("move") || held("scale") || held("reset") { e.repeat=None; e.nav_repeat=None; e.touch_filter=Default::default(); return (show,output); }
                let shift=held("shift") || e.shift_latched;
                // Trigger is momentary shift; Caps via on-screen shift is latched.
                if e.frame.shift!=shift {e.frame.shift=shift;e.refresh();}

                let split=e.prefs.layout=="split";
                e.frame.left=stable_pad_cell(&left_pad,split,false,e.frame.left);
                e.frame.right=stable_pad_cell(&right_pad,split,true,e.frame.right);
                if daisy {
                    let right=&d["status"]["rightStick"];
                    let was_secondary=e.frame.secondary;
                    let reach=right["x"].as_f64().unwrap_or(0.0).hypot(right["y"].as_f64().unwrap_or(0.0));
                    e.frame.secondary=!e.prefs.right_stick_dpad && reach>if was_secondary {WHEEL_RELEASE} else {WHEEL_ENGAGE};
                    let stick=&d["status"][if e.frame.secondary {"rightStick"} else {"leftStick"}];
                    e.frame.stick=[stick["x"].as_f64().unwrap_or(0.0),stick["y"].as_f64().unwrap_or(0.0)];
                    // Changing sticks starts a fresh selection, as lifting a pad does.
                    let previous=e.frame.petal.filter(|_|was_secondary==e.frame.secondary);
                    e.frame.petal=stable_wheel(e.frame.stick[0],e.frame.stick[1],previous);
                    let symbols=held("symbols") || e.frame.secondary;
                    if e.frame.symbols!=symbols {e.frame.symbols=symbols;e.refresh();}
                    if !e.frame.secondary && edge("caps") {action(e,"Caps");}
                    if let Some(petal)=e.frame.petal {
                        for (bit,index) in if e.frame.secondary {[(2,0),(0,1),(3,2),(1,3)]} else {[(14,0),(15,1),(13,2),(12,3)]} {
                            if down&(1<<bit)!=0 {
                                // Keep edges in the frame so short taps survive WebView batching.
                                e.frame.daisy_presses[petal][index]=e.frame.daisy_presses[petal][index].wrapping_add(1);
                                let key=e.frame.petals[petal][index].clone();if !key.trim().is_empty() {output.push(key);}
                            }
                        }
                    }
                } else {
                    if edge("caps") {action(e,"Caps");}
                    if let Some(cell)=e.frame.right.or(e.frame.left) {e.frame.selected=cell;}
                    let direction=(0..4).find(|bit|b&(1<<bit)!=0);
                    if let Some(bit)=direction {
                        let now=Instant::now();
                        let fire=match e.nav_repeat {
                            Some((previous,start,last)) if previous==bit => start.elapsed()>Duration::from_millis(300) && last.elapsed()>Duration::from_millis(70),
                            _=>true,
                        };
                        if fire {
                            let (row,col)=(e.frame.selected/12,e.frame.selected%12);
                            e.frame.selected=match bit {0=>row.saturating_sub(1)*12+col,1=>(row+1).min(4)*12+col,
                                2=>row*12+col.saturating_sub(1),_=>row*12+(col+1).min(11)};
                            let start=e.nav_repeat.filter(|(previous,_,_)|*previous==bit).map(|(_,start,_)|start).unwrap_or(now);
                            e.nav_repeat=Some((bit,start,now));
                        }
                    } else {e.nav_repeat=None;}
                    for (bit,cell) in [(29,e.frame.left),(28,e.frame.right),(12,Some(e.frame.selected)),(17,e.frame.right.or(e.frame.left))] {
                        if down&(1<<bit)!=0 {if let Some(cell)=cell {
                            let key=e.frame.rows[cell/12][cell%12].clone();
                            if let Some(key)=action(e,&key) {output.push(key);}
                        }}
                    }
                    if edge("symbols") {action(e,"Symbols");}
                }
                if edge("close") {TOGGLE.store(true,Ordering::Relaxed);}
                if !(daisy && e.frame.secondary) && edge("enter") {output.push("↵".into());}
                if !(daisy && e.frame.secondary) && edge("space") {output.push("Space".into());}
                let back=!(daisy && e.frame.secondary) && held("backspace");
                if back {
                    let now=Instant::now();
                    match &mut e.repeat {
                        Some((key,start,last)) if key=="⌫"=>{
                            if start.elapsed()>Duration::from_millis(400) && last.elapsed()>Duration::from_millis(55) {
                                output.push("⌫".into());*last=now;
                            }
                        },
                        _=>{output.push("⌫".into());e.repeat=Some(("⌫".into(),now,now));}
                    }
                } else {e.repeat=None;}
            }
    (show,output)
}

pub(super) fn shortcut_mask(command:&str)->u64 {
    // '+' is the Menu button; compounds use explicit named PLUS/MINUS.
    if command=="+" { return 1<<4; }
    let mut result=0;
    for c in command.split('+') {
        let bit=match c {"UP"=>0,"DOWN"=>1,"LEFT"=>2,"RIGHT"=>3,"PLUS"=>4,"-"|"MINUS"=>5,
            "L3"=>6,"R3"=>7,"L"=>8,"R"=>9,"S"=>12,"E"=>13,"W"=>14,"N"=>15,"HOME"=>16,
            "TOUCH"=>17,"LSL"=>19,"RSR"=>20,"LSR"=>21,"RSL"=>22,"MISC1"=>27,"ZL"=>40,"ZR"=>41,_=>return 0};
        result|=1<<bit;
    }
    result
}
fn shortcut_held(bindings:&std::collections::BTreeMap<String,String>,buttons:u64,action:&str)->bool {
    let mask=shortcut_mask(&bindings[action]);
    buttons&mask==mask && !bindings.iter().any(|(other,command)| {
        let more=shortcut_mask(command);
        other!=action && more!=mask && more&mask==mask && buttons&more==more
    })
}

// The cursor and the key under it come from one filtered point per pad.
//
// Smoothing is a One Euro filter (Casiez, Roussel & Vogel 2012) with ONE
// cutoff for both axes, taken from the 2-D speed: each output is a blend of
// the previous output and the new point, so a straight swipe stays straight.
// The pad itself is quiet (~0.0015 units at rest); what shakes is the thumb,
// whose 2 Hz+ wobble reaches ~0.3 key sideways while aiming.
//
// Vertical steadying: the Standard grid packs 6 keys across one pad unit but
// only 2.5 rows down it, so a thumb's sideways drift during an up/down stroke
// moves 2.4x more keys than the same drift vertically. While the motion is
// steeper than 45 degrees, part of its sideways component is held back as an
// offset. Flatter motion (including deliberate diagonals) passes untouched
// and pays the offset back as it travels sideways, so the cursor returns to
// the thumb's absolute position. A new touch starts with no offset.
#[derive(Clone,Copy,Debug,Default,PartialEq)]
struct TouchFilter { active:bool, at:f64, point:[f64;2], velocity:[f64;2], heading:[f64;2], offset:f64 }
impl TouchFilter {
    const MIN_CUTOFF_HZ:f64=3.0; const SPEED_GAIN:f64=15.0; const VELOCITY_CUTOFF_HZ:f64=3.0;
    const HEADING_CUTOFF_HZ:f64=8.0; const CATCH_UP:f64=0.2; const MAX_OFFSET:f64=0.3;
    fn update(&mut self,point:Option<[f64;2]>,now:f64,smoothing:f64,steadying:f64)->Option<[f64;2]> {
        let Some(p)=point.filter(|p|p[0].is_finite() && p[1].is_finite()) else {*self=Self::default();return None};
        if !self.active {*self=Self{active:true,at:now,point:p,..Self::default()};return Some(p);}
        let dt=(now-self.at).clamp(0.001,0.05);self.at=now;
        let alpha=|cutoff:f64|1.0/(1.0+1.0/(std::f64::consts::TAU*cutoff*dt));
        let mut next=p;
        if smoothing>0.0 {
            let a=alpha(Self::VELOCITY_CUTOFF_HZ);
            for i in 0..2 {self.velocity[i]+=a*((p[i]-self.point[i])/dt-self.velocity[i]);}
            // 50% is 3 Hz; each 25% halves or doubles it.
            let cutoff=Self::MIN_CUTOFF_HZ*2f64.powf((0.5-smoothing)*4.0)+Self::SPEED_GAIN*self.velocity[0].hypot(self.velocity[1]);
            let a=alpha(cutoff);
            next=[self.point[0]+a*(p[0]-self.point[0]),self.point[1]+a*(p[1]-self.point[1])];
        }
        let delta=[next[0]-self.point[0],next[1]-self.point[1]];
        self.point=next;
        if steadying>0.0 {
            let a=alpha(Self::HEADING_CUTOFF_HZ);
            for i in 0..2 {self.heading[i]+=a*(delta[i]/dt-self.heading[i]);}
            let (across,down)=(self.heading[0].abs(),self.heading[1].abs());
            if across+down>1e-9 {
                let vertical=((down-across)/(across+down)).max(0.0);
                let horizontal=((across-down)/(across+down)).max(0.0);
                self.offset+=delta[0]*steadying*vertical;
                self.offset*=(1.0-delta[0].abs()*horizontal/Self::CATCH_UP).max(0.0);
                self.offset=self.offset.clamp(-Self::MAX_OFFSET,Self::MAX_OFFSET);
            }
        } else {self.offset=0.0;}
        Some([(next[0]-self.offset).clamp(-1.0,1.0),next[1].clamp(-1.0,1.0)])
    }
}
fn filtered_pad<'a>(pad:std::borrow::Cow<'a,Value>,filter:&mut TouchFilter,now:f64,smoothing:f64,steadying:f64)->std::borrow::Cow<'a,Value> {
    let Some([x,y])=filter.update(touch_point(&pad),now,smoothing,steadying) else {return pad};
    let mut pad=pad.into_owned();pad["x"]=Value::from(x);pad["y"]=Value::from(y);
    std::borrow::Cow::Owned(pad)
}
fn touch_point(p:&Value)->Option<[f64;2]> {
    p["touched"].as_bool().unwrap_or(false).then(||[p["x"].as_f64().unwrap_or(0.0),p["y"].as_f64().unwrap_or(0.0)])
}
// Absolute keyboard positioning must start before the mapper's radial edge
// containment, which changes BOTH axes when one reaches an edge and bends
// straight swipes. New packets carry the original sensor position separately.
// Older packets use the difference from their already-applied rotation.
fn oriented_pad<'a>(d:&'a Value,name:&str,degrees:f64)->std::borrow::Cow<'a,Value> {
    let p=&d["status"][name];
    if d["type"].as_u64()!=Some(24) {return std::borrow::Cow::Borrowed(p);}
    let raw=&d["status"][format!("{name}Raw")];
    let raw_point=raw["x"].as_f64().zip(raw["y"].as_f64()).filter(|(x,y)|x.is_finite() && y.is_finite());
    let applied=p["rotation"].as_f64().filter(|n|n.is_finite()).unwrap_or(0.0);
    let delta=if raw_point.is_some() {degrees} else {degrees-applied};
    if !delta.is_finite() || (delta==0.0 && raw_point.is_none()) {
        return std::borrow::Cow::Borrowed(p);
    }
    let Some([px,py])=touch_point(p) else {return std::borrow::Cow::Borrowed(p)};
    let (x,y)=raw_point.unwrap_or((px,py));
    if !x.is_finite() || !y.is_finite() {return std::borrow::Cow::Borrowed(p);}
    let (s,c)=delta.to_radians().sin_cos();
    // Saturate only the axis that reaches the keyboard edge. The other axis
    // remains independent, so vertical/horizontal swipes stay straight.
    let (x,y)=((x*c-y*s).clamp(-1.0,1.0),(x*s+y*c).clamp(-1.0,1.0));
    let mut pad=p.clone();pad["x"]=Value::from(x);pad["y"]=Value::from(y);
    std::borrow::Cow::Owned(pad)
}
// Ignore resting stick noise and keep the response continuous at the deadzone.
fn transform_axis(value:f64)->f64 {
    const DEADZONE:f64=0.2;
    if value.abs()<=DEADZONE {0.0}
    else {value.signum()*(value.abs().min(1.0)-DEADZONE)/(1.0-DEADZONE)}
}
fn transform_input(e:&mut Engine,d:&Value)->Option<(f64,f64,f64,bool)> {
    let b=physical_mask(d); let old=e.previous.get(&d["handle"].as_i64().unwrap_or(0)).copied().unwrap_or(b);
    let bindings=&e.prefs.shortcuts[&e.prefs.layout];
    let held=|a:&str| shortcut_held(bindings,b,a);
    let dt=e.transform_at.elapsed().as_secs_f64().min(0.04);e.transform_at=Instant::now();
    let reset=shortcut_mask(&bindings["reset"]);
    if held("reset") {e.transform_pad=[None;2];return (old&reset!=reset).then_some((0.0,0.0,0.0,true));}
    let moving=held("move");let scaling=held("scale");
    if !moving && !scaling { e.transform_pad=[None;2];return None; }
    if !shortcut_held(bindings,old,if moving {"move"} else {"scale"}) {e.transform_pad=[None;2];}
    let side=if moving {"right"} else {"left"};
    let mut delta=[0.0;2];
    for (index,name) in ["leftPad","rightPad"].into_iter().enumerate() {
        let pad=touch_point(&oriented_pad(d,name,e.pad_rotation[index]));
        if let (Some(p),Some(previous))=(pad,e.transform_pad[index]) {
            delta[0]+=p[0]-previous[0];delta[1]+=p[1]-previous[1];
        }
        e.transform_pad[index]=pad;
    }
    let stick=&d["status"][format!("{side}Stick")];
    let x=transform_axis(stick["x"].as_f64().unwrap_or(0.0));
    let y=transform_axis(stick["y"].as_f64().unwrap_or(0.0));
    let change=if moving {(x*650.0*dt+delta[0]*420.0,-y*650.0*dt+delta[1]*420.0,0.0,false)}
    else {(0.0,0.0,y*dt+(-delta[1])*0.5,false)};
    // A horizontal resize input must not reapply the current size: converting
    // physical pixels through the scale ratio can round it down repeatedly.
    (change.0!=0.0 || change.1!=0.0 || change.2!=0.0).then_some(change)
}
fn transform_window(app:&AppHandle,change:(f64,f64,f64,bool)) {
    let Some(w)=app.get_webview_window(LABEL) else {return};
    let Ok(Some(m))=w.current_monitor() else {return};
    let Ok(pos)=w.outer_position() else {return};let Ok(size)=w.inner_size() else {return};
    let scale=m.scale_factor();let daisy=preferences().layout=="daisywheel";
    let base_w=if daisy {420.0} else {1000.0};let base_h=if daisy {440.0} else {350.0};
    let ratio=if change.3 {1.0} else {(size.width as f64/(base_w*scale)+change.2).clamp(0.55,1.8)};
    let ratio=ratio.min(m.size().width as f64/(base_w*scale)).min(m.size().height as f64/(base_h*scale));
    let width=(base_w*scale*ratio) as u32;let height=(base_h*scale*ratio) as u32;
    let x=if change.3 {m.position().x+(m.size().width-width) as i32/2} else {pos.x+(change.0*scale) as i32};
    let y=if change.3 {m.position().y+(m.size().height-height) as i32-(24.0*scale) as i32} else {pos.y+(change.1*scale) as i32};
    let x=x.clamp(m.position().x,m.position().x+(m.size().width-width) as i32);
    let y=y.clamp(m.position().y,m.position().y+(m.size().height-height) as i32);
    let _=w.set_size(tauri::PhysicalSize::new(width,height));let _=w.set_position(tauri::PhysicalPosition::new(x,y));
}

fn send(key:&str)->Result<(),String> {
    #[cfg(target_os="windows")]
    {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::*;
        let vk=match key {"⌫"=>Some(VK_BACK),"↵"=>Some(VK_RETURN),"Tab"=>Some(VK_TAB),"←"=>Some(VK_LEFT),"→"=>Some(VK_RIGHT),_=>None};
        let text=if key=="Space" {" "} else {key};
        let units:Vec<u16>=if let Some(vk)=vk {vec![vk]} else {text.encode_utf16().collect()};
        let mut inputs=Vec::with_capacity(units.len()*2);
        for unit in units {
            for up in [false,true] {
                let mut input:INPUT=unsafe{std::mem::zeroed()};input.r#type=INPUT_KEYBOARD;
                input.Anonymous.ki=KEYBDINPUT {wVk:if vk.is_some(){unit}else{0},wScan:if vk.is_some(){0}else{unit},
                    dwFlags:if vk.is_some(){0}else{KEYEVENTF_UNICODE} | if up{KEYEVENTF_KEYUP}else{0},time:0,dwExtraInfo:0};
                inputs.push(input);
            }
        }
        let count=unsafe{SendInput(inputs.len() as u32,inputs.as_ptr(),std::mem::size_of::<INPUT>() as i32)};
        if count!=inputs.len() as u32 {return Err("Windows could not type into this application. Check its elevation level.".into())}
        Ok(())
    }
    #[cfg(not(target_os="windows"))]
    {let _=key;Err("Virtual keyboard typing currently requires Windows.".into())}
}
#[tauri::command]
pub fn keyboard_preferences()->Preferences {preferences()}
#[tauri::command]
pub fn keyboard_save_preferences(app:AppHandle,preferences:Preferences)->Result<Preferences,String> {save_preferences(&app,preferences)}
#[tauri::command]
pub fn keyboard_state()->Frame {frame()}
#[tauri::command]
pub fn keyboard_set_open(app:AppHandle,open:bool)->Result<(),String> {
    let state=app.state::<AppState>();
    if open && !crate::services::jsm_process::is_running(&state)? {return Err("Start the mapper before opening the controller keyboard.".into())}
    set_open(&app,open)
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test] fn capture_profile_uses_supported_pad_modes_and_silences_pad_outputs() {
        let text=capture_profile();
        for prefix in ["","LEFT_","RIGHT_"] {
            assert!(text.lines().any(|line|line==format!("{prefix}TOUCHPAD_MODE = GRID_AND_STICK")));
            assert!(text.lines().any(|line|line==format!("{prefix}TOUCH_STICK_MODE = NO_MOUSE")));
        }
        for prefix in ["T","LT","RT","LM","RM"] {
            for i in 1..=25 {assert!(text.lines().any(|line|line==format!("{prefix}{i} = NONE")));}
        }
    }
    #[test] fn split_pads_have_independent_halves_and_clamped_edges() {
        let p=json!({"x":1.0,"y":1.0,"touched":true});
        assert_eq!(pad_cell(&p,true,false),Some(53));
        assert_eq!(pad_cell(&p,true,true),Some(59));
        assert_eq!(pad_cell(&json!({"touched":false}),true,true),None);
        assert_eq!(pad_cell(&json!({"x":-1,"y":-1,"touched":true}),false,false),Some(0));
    }
    #[test] fn daisywheel_geometry_and_complete_alphabet() {
        assert_eq!(wheel(0.0,0.0),None);assert_eq!(wheel(0.0,1.0),Some(0));
        assert_eq!(wheel(1.0,0.0),Some(2));assert_eq!(wheel(0.0,-1.0),Some(4));
        let chars=petals(false,false).concat().concat();
        for c in 'a'..='z' {assert!(chars.contains(c));}
    }
    #[test] fn daisywheel_types_sentence_punctuation_without_a_trigger_and_all_of_ascii_with_one() {
        for variant in ["classic","inputlabs"] {
            let letters=petals_variant(false,false,false,variant).concat().concat();
            for c in ['.',',','?','\''] {assert!(letters.contains(c),"{variant} letter bank lacks {c:?}");}
            let mut reachable=letters.clone();
            for shift in [false,true] {reachable+=&petals_variant(shift,false,true,variant).concat().concat();}
            for c in (b'!'..=b'~').map(char::from).filter(|c|!c.is_ascii_uppercase()) {assert!(reachable.contains(c),"{variant} cannot type {c:?}");}
            // Caps Lock must not swap the trigger bank for the extended one.
            assert_eq!(petals_variant(false,true,true,variant),petals_variant(false,false,true,variant));
            assert_eq!(petals_variant(true,false,false,variant)[0],petals_variant(false,true,false,variant)[0]);
        }
        for bank in [CLASSIC_PETALS,INPUTLABS_PETALS,SYMBOL_PETALS,EXTENDED_PETALS] {
            for petal in bank {assert_eq!(petal.chars().count(),4,"{petal:?} fills four buttons");}
        }
    }
    #[test] fn daisywheel_petals_hold_across_boundaries_and_release_below_the_engage_radius() {
        let at=|degrees:f64,r:f64|{let a=degrees.to_radians();(a.sin()*r,a.cos()*r)};
        // Petal 0 spans -22.5..22.5 degrees; noise across its edge does not flip.
        for degrees in [21.0,24.0,28.0,20.0,26.0] {let (x,y)=at(degrees,0.9);assert_eq!(stable_wheel(x,y,Some(0)),Some(0));}
        let (x,y)=at(31.0,0.9);assert_eq!(stable_wheel(x,y,Some(0)),Some(1),"a deliberate move switches at once");
        let (x,y)=at(24.0,0.9);assert_eq!(stable_wheel(x,y,None),Some(1),"a fresh selection uses the plain sectors");
        let (x,y)=at(0.0,0.29);assert_eq!(stable_wheel(x,y,None),None);assert_eq!(stable_wheel(x,y,Some(0)),Some(0));
        let (x,y)=at(0.0,0.2);assert_eq!(stable_wheel(x,y,Some(0)),None);
        assert_eq!(stable_wheel(f64::NAN,0.9,Some(3)),None);assert_eq!(wheel(f64::NAN,0.9),None);
        let (x,y)=at(180.0,0.9);assert_eq!(stable_wheel(x,y,Some(0)),Some(4),"a flick across the wheel is not held");
    }
    #[test] fn layout_validation_and_shift_symbols() {
        assert!(validate(&Preferences {layout:"invalid".into(),guide_shortcut:true,..Preferences::default()}).is_err());
        assert_eq!(Preferences::default().guide_shortcut,true);
        assert_eq!(rows(true,false)[1][0],"Q");
        assert_eq!(rows(true,false)[0][0],"!");
        assert_eq!(rows(false,true)[0][0],"!");
    }
}

#[cfg(test)]
mod input_tests {
    use super::*;
    use serde_json::json;
    fn device(buttons:u64)->Value {json!({"handle":7,"status":{"buttons":buttons,"leftPad":{"x":-1.0,"y":0.0,"touched":true},"rightPad":{"x":-1.0,"y":0.0,"touched":true},"leftStick":{"x":0.0,"y":0.0}}})}
    fn open(layout:&str)->Engine {
        // Geometry tests check the unfiltered pad; the filter has its own tests.
        let mut e=Engine::new(Preferences {layout:layout.into(),guide_shortcut:true,touch_smoothing:0.0,vertical_steadying:0.0,..Preferences::default()});
        e.frame.open=true;e
    }
    fn step(e:&mut Engine,d:&Value,captured:bool,global:bool)->Vec<String> {
        let output=advance(e,d,captured,false,global).1;
        let buttons=keyboard_buttons(e,d);
        e.previous.insert(7,buttons);
        output
    }
    #[test] fn keyboard_orientation_levels_both_pads_without_double_rotation() {
        for layout in ["standard","split"] {
            for (name,other,index,angle) in [("leftPad","rightPad",0,10.7_f64),("rightPad","leftPad",1,-10.5_f64)] {
                // Raw legacy telemetry, already corrected telemetry, and a
                // profile override must all land in the preference's frame.
                for applied in [None,Some(0.0),Some(angle),Some(25.0)] {
                    let mut e=open(layout);e.pad_rotation[index]=angle;
                    let mut d=device(0);d["type"]=json!(24);d["status"][other]["touched"]=json!(false);
                    step(&mut e,&d,true,false);
                    let mut column=None;
                    for y in [-0.6,0.0,0.6] {
                        let (s,c)=(applied.unwrap_or(0.0)-angle).to_radians().sin_cos();
                        d["status"][name]=json!({"x":0.1*c-y*s,"y":0.1*s+y*c,"touched":true});
                        if let Some(applied)=applied {d["status"][name]["rotation"]=json!(applied);}
                        step(&mut e,&d,true,false);
                        let point=if index==0 {e.frame.left_touch} else {e.frame.right_touch}.unwrap();
                        assert!((point[0]-0.1).abs()<1e-9 && (point[1]-y).abs()<1e-9,"cursor follows a vertical swipe");
                        let cell=if index==0 {e.frame.left} else {e.frame.right}.unwrap();
                        assert_eq!(*column.get_or_insert(cell%12),cell%12,"selection stays in the cursor's column");
                        d["status"]["buttons"]=json!(1u64<<if index==0 {29} else {28});
                        assert_eq!(step(&mut e,&d,true,false),vec![e.frame.rows[cell/12][cell%12].clone()]);
                        d["status"]["buttons"]=json!(0);step(&mut e,&d,true,false);
                    }
                }
            }
        }
    }
    #[test] fn keyboard_orientation_preserves_other_devices_and_bounds() {
        let mut d=device(0);
        let raw=d["status"]["leftPad"].clone();
        assert_eq!(oriented_pad(&d,"leftPad",45.0).as_ref(),&raw,"other controllers retain their coordinates");
        d["type"]=json!(24);
        d["status"]["leftPad"]=json!({"x":1.0,"y":1.0,"touched":true,"pressure":0.4});
        let p=oriented_pad(&d,"leftPad",45.0);
        let point=touch_point(&p).unwrap();
        assert!(point[0].abs()<1e-9 && (point[1]-1.0).abs()<1e-9);
        assert_eq!(p["pressure"],json!(0.4));
        d["status"]["leftPad"]["touched"]=json!(false);
        assert!(touch_point(&oriented_pad(&d,"leftPad",45.0)).is_none());
    }
    #[test] fn raw_keyboard_swipes_do_not_bend_when_rotated_past_an_edge() {
        for (name,index,angle) in [("leftPad",0,10.7_f64),("rightPad",1,-10.5_f64)] {
            let mut e=open("standard");e.pad_rotation[index]=angle;
            let mut d=device(0);d["type"]=json!(24);
            step(&mut e,&d,true,false);
            // A vertical swipe near the outside corner enters edge containment.
            // Legacy telemetry pulls x inward as y exceeds 1; raw telemetry
            // must retain constant x for the cursor AND highlighted key.
            let fixed_x=if index==0 {0.8} else {-0.8};
            for y in [0.7,0.9,1.0,1.04,1.08,1.04,0.9,0.7] {
                let (s,c)=(-angle).to_radians().sin_cos();
                let (raw_x,raw_y)=(fixed_x*c-y*s,fixed_x*s+y*c);
                assert!(raw_x.abs()<=1.0 && raw_y.abs()<=1.0);
                let extent=y.max(1.0);
                d["status"][name]=json!({"x":fixed_x/extent,"y":y/extent,"rotation":angle,"touched":true});
                d["status"][format!("{name}Raw")]=json!({"x":raw_x,"y":raw_y});
                step(&mut e,&d,true,false);
                let point=if index==0 {e.frame.left_touch} else {e.frame.right_touch}.unwrap();
                assert!((point[0]-fixed_x).abs()<1e-9,"vertical edge swipe cannot pull sideways");
                assert!((point[1]-y.min(1.0)).abs()<1e-9);
                let cell=if index==0 {e.frame.left} else {e.frame.right}.unwrap();
                assert_eq!(cell%12,if index==0 {10} else {1});
            }
            // No orientation must reproduce raw coordinates even when a
            // previous mapper profile rotated and contained the packet.
            let p=oriented_pad(&d,name,0.0);
            let raw=&d["status"][format!("{name}Raw")];
            assert_eq!(p["x"],raw["x"]);assert_eq!(p["y"],raw["y"]);
        }
    }
    #[test] fn raw_keyboard_horizontal_swipes_keep_y_at_both_edges() {
        for angle in [10.7_f64,-10.5_f64] {
            for sign in [-1.0,1.0] {
                for x in [0.7,0.9,1.0,1.04,1.08,1.04,0.9,0.7] {
                    let x=x*sign;let y=-angle.signum()*0.8*sign;
                    let (s,c)=(-angle).to_radians().sin_cos();
                    let (raw_x,raw_y)=(x*c-y*s,x*s+y*c);
                    assert!(raw_x.abs()<=1.0 && raw_y.abs()<=1.0);
                    let d=json!({"type":24,"status":{
                        "leftPad":{"x":x/x.abs().max(1.0),"y":y/x.abs().max(1.0),"rotation":angle,"touched":true},
                        "leftPadRaw":{"x":raw_x,"y":raw_y}
                    }});
                    let p=oriented_pad(&d,"leftPad",angle);
                    let point=touch_point(&p).unwrap();
                    assert!((point[1]-y).abs()<1e-9,"horizontal edge swipe cannot pull vertically");
                    assert!((point[0]-x.clamp(-1.0,1.0)).abs()<1e-9);
                }
            }
        }
    }
    #[test] fn straight_sensor_swipes_remain_collinear_through_keyboard_selection_and_presses() {
        for layout in ["standard","split"] {
            for (name,other,index) in [("leftPad","rightPad",0),("rightPad","leftPad",1)] {
                for angle in [0.0,10.7,-10.5,45.0,-45.0] {
                    let mut e=open(layout);e.pad_rotation[index]=angle;
                    let mut d=device(0);d["type"]=json!(24);
                    d["status"][other]["touched"]=json!(false);
                    step(&mut e,&d,true,false);
                    let mut points=Vec::new();
                    for tick in 0..=200 {
                        let t=tick as f64/200.0;
                        // The segment stays inside the unit circle, so every
                        // rotation fits without encountering edge saturation.
                        let raw=[-0.4+0.8*t,-0.75+1.5*t];
                        d["status"][format!("{name}Raw")]=json!({"x":raw[0],"y":raw[1]});
                        // Deliberately curved processed coordinates prove the
                        // cursor uses the original stream throughout a swipe.
                        d["status"][name]=json!({"x":(t*std::f64::consts::TAU).sin(),"y":raw[1],"touched":true,"pressure":if tick%7==0 {0.2} else {0.0},"rotation":25.0});
                        step(&mut e,&d,true,false);
                        points.push(if index==0 {e.frame.left_touch} else {e.frame.right_touch}.unwrap());
                    }
                    let start=points[0];let end=points[200];
                    let direction=[end[0]-start[0],end[1]-start[1]];
                    assert!(direction[0].hypot(direction[1])>1.0,"swipe must move");
                    for point in points {
                        let cross=(point[0]-start[0])*direction[1]-(point[1]-start[1])*direction[0];
                        assert!(cross.abs()<1e-12,"{layout}/{name}/{angle}: selection and pressure cannot curve a straight swipe: {point:?}");
                    }
                }
            }
        }
    }
    #[test] fn keyboard_window_movement_uses_oriented_pad_deltas() {
        let mut e=open("split");e.pad_rotation[0]=10.7;
        let mut d=device(shortcut_mask(&e.prefs.shortcuts["split"]["move"]));d["type"]=json!(24);
        d["status"]["rightPad"]["touched"]=json!(false);
        d["status"]["leftPad"]=json!({"x":0.0,"y":0.0,"touched":true});
        let buttons=physical_mask(&d);e.previous.insert(7,buttons);
        assert!(transform_input(&mut e,&d).is_none());
        let (s,c)=(-10.7_f64).to_radians().sin_cos();
        d["status"]["leftPad"]["x"]=json!(-0.2*s);d["status"]["leftPad"]["y"]=json!(0.2*c);
        let change=transform_input(&mut e,&d).unwrap();
        assert!(change.0.abs()<1e-9 && (change.1-84.0).abs()<1e-9);
    }
    #[test] fn pad_boundary_noise_does_not_reselect_buzz_or_change_clicked_key() {
        for layout in ["standard","split"] {
            for right in [false,true] {
                let cols=if layout=="split" {6.0} else {12.0};
                let offset=if layout=="split" && right {6} else {0};
                let mut e=open(layout);step(&mut e,&device(0),true,false);
                let name=if right {"rightPad"} else {"leftPad"};
                let other=if right {"leftPad"} else {"rightPad"};
                let mut d=device(0);d["status"][other]["touched"]=json!(false);
                d["status"][name]["x"]=json!(1.8/cols*2.0-1.0);
                step(&mut e,&d,true,false);
                for index in 0..200 {
                    let before=FeedbackState::from(&e.frame);
                    let coordinate=2.0+if index%2==0 {0.04} else {-0.04};
                    d["status"][name]["x"]=json!(coordinate/cols*2.0-1.0);
                    assert!(step(&mut e,&d,true,false).is_empty());
                    assert_eq!(if right {e.frame.right} else {e.frame.left},Some(25+offset));
                    assert!(keyboard_feedback(&before,&e.frame,&[],0,0,true).is_none(),"stationary edge noise must not buzz");
                }
                d["status"]["buttons"]=json!(1u64<<if right {28} else {29});
                assert_eq!(step(&mut e,&d,true,false),vec![e.frame.rows[2][1+offset].clone()],"press uses the stable highlighted key");
                d["status"]["buttons"]=json!(0);step(&mut e,&d,true,false);
                d["status"][name]["x"]=json!(2.11/cols*2.0-1.0);
                step(&mut e,&d,true,false);
                assert_eq!(if right {e.frame.right} else {e.frame.left},Some(26+offset),"deliberate crossing switches on the same packet");
                d["status"][name]["touched"]=json!(false);step(&mut e,&d,true,false);
                d["status"][name]["touched"]=json!(true);
                d["status"][name]["x"]=json!(1.99/cols*2.0-1.0);
                step(&mut e,&d,true,false);
                assert_eq!(if right {e.frame.right} else {e.frame.left},Some(25+offset),"retouch starts with a fresh selection");
            }
        }
    }
    #[test] fn pad_boundary_band_handles_rows_corners_and_large_moves() {
        for split in [false,true] {
            let cols=if split {6.0} else {12.0};
            let point=|x:f64,y:f64|json!({"touched":true,"x":x/cols*2.0-1.0,"y":y/2.5-1.0});
            for noise in [-0.04,0.04] {
                assert_eq!(stable_pad_cell(&point(2.0+noise,3.0+noise),split,false,Some(25)),Some(25));
            }
            assert_eq!(stable_pad_cell(&point(3.2,3.04),split,false,Some(25)),Some(27),"row noise does not block horizontal movement");
            assert_eq!(stable_pad_cell(&point(2.04,3.2),split,false,Some(25)),Some(37),"column noise does not block vertical movement");
            assert_eq!(stable_pad_cell(&point(cols-0.1,4.9),split,false,Some(25)),Some(48+cols as usize-1),"large moves do not step through intermediate keys");
        }
    }
    #[test] fn inputlabs_vowels_and_face_button_order_match_the_reference() {
        let groups=petals_variant(false,false,false,"inputlabs");
        let letters:Vec<String>=groups.iter().flatten().filter(|k|k.chars().all(|c|c.is_ascii_alphabetic())).cloned().collect();
        let mut alphabet=letters.clone();alphabet.sort();
        assert_eq!(alphabet,('a'..='z').map(|c|c.to_string()).collect::<Vec<_>>());
        for vowel in ["a","e","i","o","u"] {assert!(groups.iter().any(|g|g[3]==vowel));}
        assert_eq!(groups[3][0],"x");assert_eq!(groups[3][1],"y");
        for (bit,key) in [(12,"a"),(13,"b"),(14,"c"),(15,"d")] {
            let mut e=open("daisywheel");e.prefs.daisywheel_variant="inputlabs".into();e.refresh();
            step(&mut e,&device(0),true,false);
            let mut d=device(1<<bit);d["status"]["leftStick"]["y"]=json!(1.0);
            assert_eq!(step(&mut e,&d,true,false),vec![key]);
        }
    }
    #[test] fn daisywheel_types_full_stop_and_comma_from_the_letter_bank() {
        for (variant,x,y,bits) in [("classic",-1.0,0.0,[(12,"."),(13,",")]),("inputlabs",-0.7,0.7,[(13,"."),(12,",")])] {
            let mut e=open("daisywheel");e.prefs.daisywheel_variant=variant.into();e.refresh();
            step(&mut e,&device(0),true,false);
            for (bit,key) in bits {
                let mut d=device(1<<bit);d["status"]["leftStick"]=json!({"x":x,"y":y});
                assert_eq!(step(&mut e,&d,true,false),vec![key],"{variant}");
                d["status"]["buttons"]=json!(0);step(&mut e,&d,true,false);
            }
        }
    }
    #[test] fn right_stick_symbols_do_not_flicker_at_the_engage_radius() {
        let mut e=open("daisywheel");step(&mut e,&device(0),true,false);
        let mut d=device(0);
        d["status"]["rightStick"]=json!({"x":0.0,"y":0.4});step(&mut e,&d,true,false);
        assert!(e.frame.secondary);assert_eq!(e.frame.petal,Some(0));
        for reach in [0.3,0.28,0.31,0.27] {
            d["status"]["rightStick"]=json!({"x":0.0,"y":reach});step(&mut e,&d,true,false);
            assert!(e.frame.secondary && e.frame.symbols,"easing off at {reach} keeps symbols");
        }
        d["status"]["rightStick"]=json!({"x":0.0,"y":0.1});step(&mut e,&d,true,false);
        assert!(!e.frame.secondary);assert!(!e.frame.symbols);assert_eq!(e.frame.petal,None);
    }
    #[test] fn right_stick_alias_preserves_left_petal_and_center_utilities() {
        let mut e=open("daisywheel");e.prefs.right_stick_dpad=true;
        step(&mut e,&device(0),true,false);
        let mut d=device(1<<14);d["status"]["leftStick"]["y"]=json!(1.0);
        d["status"]["rightStick"]["x"]=json!(1.0);
        assert_eq!(step(&mut e,&d,true,false),vec!["a","Space"]);
        assert!(!e.frame.secondary);assert!(!e.frame.symbols);assert_eq!(e.frame.petal,Some(0));
    }
    #[test] fn daisy_bumpers_transform_pads_and_triggers_change_letter_banks() {
        let mut e=open("daisywheel");step(&mut e,&device(0),true,false);
        assert_eq!(e.prefs.shortcuts["daisywheel"]["close"],"+");
        let mut d=device(1<<9);d["status"]["rightPad"]=json!({"x":0.0,"y":0.0,"touched":true});
        transform_input(&mut e,&d);e.previous.insert(7,1<<9);d["status"]["rightPad"]["x"]=json!(0.5);
        assert!(transform_input(&mut e,&d).unwrap().0>0.0);
        assert!(step(&mut e,&d,true,false).is_empty());
        step(&mut e,&device(0),true,false);
        let mut d=device(1<<14);d["status"]["leftStick"]["y"]=json!(1.0);d["status"]["triggers"]=json!({"right":1.0});
        assert_eq!(step(&mut e,&d,true,false),vec!["1"]);assert!(!e.frame.shift);assert!(e.frame.symbols);
        step(&mut e,&device(0),true,false);
        d["status"]["triggers"]=json!({"left":1.0,"right":1.0});
        assert_eq!(step(&mut e,&d,true,false),vec!["["],"Shift with symbols reaches the extended bank");assert!(e.frame.shift);assert!(e.frame.symbols);
        let reset=device((1<<8)|(1<<9));assert!(transform_input(&mut e,&reset).unwrap().3);
    }
    #[test] fn capture_ack_and_neutral_release_precede_typing() {
        let mut e=open("split");
        step(&mut e,&device(0),false,false);
        assert!(step(&mut e,&device(1<<28),false,false).is_empty());
        assert!(step(&mut e,&device(1<<28),true,false).is_empty());
        step(&mut e,&device(0),true,false);
        assert_eq!(step(&mut e,&device(1<<28),true,false),vec!["j"]);
        assert!(step(&mut e,&device(1<<28),true,false).is_empty(),"a held click types once");
    }
    #[test] fn light_pressure_types_once_until_release_and_physical_click_does_not_double_type() {
        let mut e=open("split");
        let mut d=device(0);d["type"]=json!(24);
        d["status"]["rightPad"]["pressure"]=json!(0.01);
        step(&mut e,&d,true,false);
        d["status"]["rightPad"]["pressure"]=json!(0.03);
        assert!(step(&mut e,&d,true,false).is_empty(),"resting or gliding force does not type");
        d["status"]["rightPad"]["pressure"]=json!(0.085);
        assert_eq!(step(&mut e,&d,true,false),vec!["j"]);
        d["status"]["buttons"]=json!(1u64<<28);
        assert!(step(&mut e,&d,true,false).is_empty());
        d["status"]["buttons"]=json!(0);
        d["status"]["rightPad"]["pressure"]=json!(0.045);
        assert!(step(&mut e,&d,true,false).is_empty(),"release band holds the press");
        d["status"]["rightPad"]["pressure"]=json!(0.035);step(&mut e,&d,true,false);
        d["status"]["rightPad"]["pressure"]=json!(0.085);
        assert_eq!(step(&mut e,&d,true,false),vec!["j"]);
        e.prefs.pad_press_threshold=0.0;
        assert_eq!(keyboard_buttons(&e,&d)&(1<<28),0);
        e.prefs.pad_press_threshold=0.08;d["type"]=json!(0);
        assert_eq!(keyboard_buttons(&e,&d)&(1<<28),0,"force threshold applies only to Steam Controller");
    }
    #[test] fn keyboard_haptic_preferences_migrate_validate_and_scale() {
        let mut raw=serde_json::to_value(Preferences::default()).unwrap();
        raw.as_object_mut().unwrap().remove("hapticType");
        raw.as_object_mut().unwrap().remove("hapticIntensity");
        let mut prefs:Preferences=serde_json::from_value(raw).unwrap();
        assert_eq!(prefs.haptic_type,"automatic");assert_eq!(prefs.haptic_intensity,35.0);
        let pulse=||KeyboardHaptic {effect:9,intensity:35.0,side:2};
        assert_eq!(configure_haptic(pulse(),&prefs),Some(KeyboardHaptic {effect:1,intensity:35.0,side:2}));
        prefs.haptic_type="pulse".into();prefs.haptic_intensity=70.0;
        assert_eq!(configure_haptic(pulse(),&prefs),Some(KeyboardHaptic {effect:8,intensity:70.0,side:2}));
        prefs.haptic_type="tap".into();
        assert_eq!(configure_haptic(KeyboardHaptic {effect:8,intensity:18.0,side:1},&prefs),Some(KeyboardHaptic {effect:9,intensity:36.0,side:1}));
        prefs.haptic_type="off".into();assert_eq!(configure_haptic(pulse(),&prefs),None);
        prefs.haptic_type="automatic".into();prefs.haptic_intensity=0.0;assert_eq!(configure_haptic(pulse(),&prefs),None);
        for intensity in [-1.0,101.0,f32::NAN,f32::INFINITY] {prefs.haptic_intensity=intensity;assert!(validate(&prefs).is_err());}
        prefs.haptic_intensity=35.0;prefs.haptic_type="invalid".into();assert!(validate(&prefs).is_err());
    }
    #[test] fn keyboard_explicit_effects_use_binding_motor_routing() {
        let mut prefs=Preferences::default();
        assert_eq!(keyboard_haptic_target(&prefs),(8.0,false));
        for (kind,effect) in [("tick",1),("click",2),("tone",3),("rumble",4),("sweep",7),("pulse",8),("tap",9)] {
            prefs.haptic_type=kind.into();assert!(validate(&prefs).is_ok());
            let pulse=configure_haptic(KeyboardHaptic {effect:8,intensity:35.0,side:2},&prefs).unwrap();
            assert_eq!(pulse.effect,effect);assert_eq!(pulse.side,2);
            let (rumble,grips)=keyboard_haptic_target(&prefs);
            assert_eq!((rumble,grips),(0.0,false),"{kind} must not force grip motors or add fallback rumble");
            assert_eq!(crate::services::feedback::datagram(pulse.effect,pulse.intensity,pulse.side,12,rumble,grips),Some(format!("FEEDBACK {effect} 35 2 12 0")));
        }
    }
    #[test] fn keyboard_haptics_follow_capture_keys_petals_and_secondary_actions() {
        let mut e=open("split");e.frame.ready=true;
        let before=FeedbackState::from(&e.frame);
        e.frame.left=Some(15);e.frame.right=Some(20);
        assert_eq!(keyboard_feedback(&before,&e.frame,&[],0,0,true),Some(KeyboardHaptic {effect:8,intensity:18.0,side:3}));
        let before=FeedbackState::from(&e.frame);
        assert_eq!(keyboard_feedback(&before,&e.frame,&["r".into()],(1<<28)|(1<<29),0,true),Some(KeyboardHaptic {effect:9,intensity:35.0,side:3}));
        assert_eq!(keyboard_feedback(&before,&e.frame,&[],0,0,true),None,"stationary touch has no buzz");
        assert_eq!(keyboard_feedback(&before,&e.frame,&["r".into()],1<<29,0,false),None);
        e.frame.ready=false;
        assert_eq!(keyboard_feedback(&before,&e.frame,&["r".into()],1<<29,0,true),None);
        e.frame.ready=true;e.frame.left=Some(51);e.frame.right=None;
        let before=FeedbackState::from(&e.frame);e.frame.left=Some(53);
        assert_eq!(keyboard_feedback(&before,&e.frame,&[],0,0,true),None,"one merged space bar");
        assert_eq!(keyboard_feedback(&before,&e.frame,&[],1<<7,0,true),Some(KeyboardHaptic {effect:8,intensity:10.0,side:3}));
        e.frame.layout="daisywheel".into();e.frame.petal=None;
        let before=FeedbackState::from(&e.frame);e.frame.petal=Some(2);
        assert_eq!(keyboard_feedback(&before,&e.frame,&[],0,0,true),Some(KeyboardHaptic {effect:8,intensity:18.0,side:1}));
        let before=FeedbackState::from(&e.frame);
        assert_eq!(keyboard_feedback(&before,&e.frame,&["i".into()],1<<14,0,true),Some(KeyboardHaptic {effect:8,intensity:35.0,side:1}));
        e.frame.secondary=true;
        assert_eq!(keyboard_feedback(&before,&e.frame,&["1".into()],1<<2,0,true),Some(KeyboardHaptic {effect:2,intensity:35.0,side:2}));
    }
    #[test] fn steam_keyboard_capture_matches_tick_gains_release_and_touch_pulses() {
        let prefs=Preferences::default();
        for (strength,gain) in [(18.0,1),(35.0,5)] {
            let pulse=configure_haptic(KeyboardHaptic {effect:9,intensity:strength,side:1},&prefs).unwrap();
            assert_eq!(pulse.effect,1);assert_eq!(steam_keyboard_gain(&pulse,&prefs),gain);
        }
        let mut e=open("split");e.frame.ready=true;e.frame.left=Some(15);
        let before=FeedbackState::from(&e.frame);
        let pulse=keyboard_feedback(&before,&e.frame,&[],0,1<<29,true).unwrap();
        assert_eq!(configure_haptic(pulse,&prefs),Some(KeyboardHaptic {effect:1,intensity:35.0,side:1}));
        e.frame.left_touch=Some([0.0,0.0]);
        let pulse=keyboard_feedback(&before,&e.frame,&[],0,0,true).unwrap();
        assert_eq!(configure_haptic(pulse,&prefs),Some(KeyboardHaptic {effect:8,intensity:35.0,side:1}));
    }
    #[test] fn shortcuts_click_and_each_pad_routes_to_its_own_actuator() {
        for layout in ["standard","split"] {
            let mut e=open(layout);e.frame.ready=true;e.frame.left=Some(15);e.frame.right=Some(20);
            let before=FeedbackState::from(&e.frame);
            for (bit,side) in [(29,1),(28,2)] {
                let pulse=keyboard_feedback(&before,&e.frame,&["a".into()],1<<bit,0,true).unwrap();
                let pulse=configure_haptic(pulse,&e.prefs).unwrap();
                assert_eq!(pulse,KeyboardHaptic {effect:1,intensity:35.0,side});
                assert_eq!(crate::services::feedback::datagram(pulse.effect,pulse.intensity,pulse.side,12,0.0,false),Some(format!("FEEDBACK 1 35 {side} 12 0")));
            }
            for action in ["shift","caps","enter","space","backspace","symbols","close"] {
                let button=shortcut_mask(&e.prefs.shortcuts[layout][action]);
                let pulse=keyboard_feedback(&before,&e.frame,&[],button,0,true).unwrap();
                assert_eq!(pulse,KeyboardHaptic {effect:2,intensity:35.0,side:if ["shift","caps"].contains(&action) {1} else {2}},"{layout}/{action}");
                assert!(keyboard_feedback(&before,&e.frame,&[],button,button,true).is_none());
            }
        }
    }
    #[test] fn either_pad_moves_and_resizes_without_cross_pad_or_retouch_jumps() {
        for layout in ["standard","split","daisywheel"] {
            for action in ["move","scale"] {
                for pad in ["leftPad","rightPad"] {
                    let mut e=open(layout);
                    let button=shortcut_mask(&e.prefs.shortcuts[layout][action]);
                    let mut d=device(button);
                    d["status"]["leftPad"]["touched"]=json!(false);
                    d["status"]["rightPad"]["touched"]=json!(false);
                    d["status"][pad]=json!({"x":0.0,"y":0.0,"touched":true});
                    assert!(transform_input(&mut e,&d).is_none());e.previous.insert(7,button);
                    d["status"][pad]["y"]=json!(0.4);
                    let change=transform_input(&mut e,&d).unwrap();
                    if action=="move" {assert!(change.1>0.0);assert_eq!(change.2,0.0);}
                    else {assert!(change.2<0.0);assert_eq!(change.1,0.0);}
                    let other=if pad=="leftPad" {"rightPad"} else {"leftPad"};
                    d["status"][pad]["touched"]=json!(false);
                    d["status"][other]=json!({"x":-0.8,"y":-0.8,"touched":true});
                    assert!(transform_input(&mut e,&d).is_none(),"changing pads does not jump");
                    d["status"][other]["touched"]=json!(false);assert!(transform_input(&mut e,&d).is_none());
                    d["status"][other]=json!({"x":0.8,"y":0.8,"touched":true});
                    assert!(transform_input(&mut e,&d).is_none(),"retouch does not jump");
                }
            }
        }
    }
    #[test] fn both_pad_edges_are_independent_and_global_chords_suspend_typing() {
        let mut e=open("split");step(&mut e,&device(0),true,false);
        assert_eq!(step(&mut e,&device((1<<28)|(1<<29)),true,false),vec!["a","j"]);
        step(&mut e,&device(0),true,true);
        assert!(step(&mut e,&device(1<<28),true,true).is_empty());
        assert!(step(&mut e,&device(1<<28),true,false).is_empty(),"held chord input cannot type on resume");
        step(&mut e,&device(0),true,false);
        assert_eq!(step(&mut e,&device(1<<28),true,false),vec!["j"]);
    }
    #[test] fn daisywheel_face_buttons_choose_the_four_characters() {
        for (index,(bit,ch)) in [(14,"a"),(15,"b"),(13,"c"),(12,"d")].into_iter().enumerate() {
            let mut e=open("daisywheel");step(&mut e,&device(0),true,false);
            let mut d=device(1<<bit);d["status"]["leftStick"]["y"]=json!(1.0);
            assert_eq!(step(&mut e,&d,true,false),vec![ch]);
            assert_eq!(e.frame.daisy_presses[0][index],1);
            assert!(step(&mut e,&d,true,false).is_empty());
            assert_eq!(e.frame.daisy_presses[0][index],1,"holding does not restart the pulse");
            step(&mut e,&device(0),true,false);
            assert_eq!(step(&mut e,&d,true,false),vec![ch]);
            assert_eq!(e.frame.daisy_presses[0][index],2,"a repeated tap restarts the pulse");
        }
    }
    #[test] fn keyboard_input_never_executes_unrelated_game_bindings() {
        let mut e=open("standard");step(&mut e,&device(0),true,false);
        for bit in [6,7,16,19,20,21,22,23,24,25,26,27,30,31,32] {
            assert!(step(&mut e,&device(1<<bit),true,false).is_empty());
            step(&mut e,&device(0),true,false);
        }
    }
    #[test] fn configurable_shortcuts_replace_defaults_and_caps_preserve_numbers() {
        let mut e=open("standard");
        e.prefs.shortcuts.get_mut("standard").unwrap().insert("backspace".into(),"E".into());
        step(&mut e,&device(0),true,false);
        assert_eq!(step(&mut e,&device(1<<13),true,false),vec!["⌫"]);
        step(&mut e,&device(0),true,false);
        assert!(step(&mut e,&device(1<<14),true,false).is_empty());
        action(&mut e,"Caps"); assert_eq!(e.frame.rows[1][0],"Q");assert_eq!(e.frame.rows[0][0],"1");
        e.frame.shift=true;e.refresh();assert_eq!(e.frame.rows[1][0],"q");assert_eq!(e.frame.rows[0][0],"!");
    }
    #[test] fn moving_resizing_and_resetting_never_type() {
        let mut e=open("split");step(&mut e,&device(0),true,false);
        for button in [1<<7,1<<9,(1<<8)|(1<<9)] {
            assert!(step(&mut e,&device(button|(1<<28)|(1<<12)|(1<<8)),true,false).is_empty());
            step(&mut e,&device(0),true,false);
        }
        let mut d=device(1<<7);d["status"]["rightStick"]=json!({"x":1.0,"y":0.5});
        let movement=transform_input(&mut e,&d).unwrap();assert!(movement.0>=0.0);assert!(movement.1<=0.0);assert_eq!(movement.2,0.0);
        let reset=device((1<<8)|(1<<9));assert!(transform_input(&mut e,&reset).unwrap().3);
    }
    #[test] fn transform_stick_deadzone_prevents_idle_and_horizontal_resize_updates() {
        for layout in ["standard","split","daisywheel"] {
            let mut e=open(layout);
            let scale=shortcut_mask(&e.prefs.shortcuts[layout]["scale"]);
            let mut d=device(scale);e.previous.insert(7,scale);
            for y in [-0.2,-0.08,0.0,0.08,0.2] {
                // Even full horizontal deflection must not resize the keyboard.
                d["status"]["leftStick"]=json!({"x":1.0,"y":y});
                for _ in 0..100 {assert!(transform_input(&mut e,&d).is_none());}
            }
            for y in [-0.6_f64,0.6] {
                d["status"]["leftStick"]=json!({"x":0.0,"y":y});
                e.transform_at=Instant::now()-Duration::from_millis(20);
                let change=transform_input(&mut e,&d).unwrap();
                assert_eq!((change.0,change.1),(0.0,0.0));
                assert_eq!(change.2.signum(),y.signum());
            }
            d["status"]["leftStick"]=json!({"x":0.0,"y":-0.08});
            assert!(transform_input(&mut e,&d).is_none());
            d["status"]["leftPad"]["y"]=json!(0.3);
            assert!((transform_input(&mut e,&d).unwrap().2+0.15).abs()<1e-9);

            d=device(shortcut_mask(&e.prefs.shortcuts[layout]["move"]));
            d["status"]["rightStick"]=json!({"x":0.12,"y":-0.15});
            e.transform_pad=[None;2];
            assert!(transform_input(&mut e,&d).is_none());
        }
        assert_eq!(transform_axis(0.2),0.0);
        assert!(transform_axis(0.2001)>0.0 && transform_axis(0.2001)<0.001);
        assert_eq!(transform_axis(1.0),1.0);
        assert_eq!(transform_axis(-1.0),-1.0);
    }
    #[test] fn right_stick_symbol_bank_uses_dpad_without_firing_shortcuts() {
        let mut e=open("daisywheel");step(&mut e,&device(0),true,false);
        let mut d=device(1);d["status"]["rightStick"]=json!({"x":0.0,"y":1.0});
        assert_eq!(step(&mut e,&d,true,false),vec!["2"]);assert!(!e.frame.caps);assert!(e.frame.secondary);
        step(&mut e,&device(0),true,false);
        let mut left=device(1<<14);left["status"]["leftStick"]["y"]=json!(1.0);
        assert_eq!(step(&mut e,&left,true,false),vec!["a"]);assert!(!e.frame.caps);
    }
    #[test] fn legacy_preferences_receive_new_defaults_and_conflicts_are_rejected() {
        let mut p:Preferences=serde_json::from_str(r#"{"layout":"split","guideShortcut":true}"#).unwrap();
        assert!(validate(&p).is_ok());assert_eq!(p.appearance,"theme");
        p.shortcuts.get_mut("split").unwrap().insert("enter".into(),"W".into());assert!(validate(&p).is_err());
    }
    #[test] fn compound_shortcuts_take_priority_over_their_individual_buttons() {
        let mut e=open("split");
        let bindings=e.prefs.shortcuts.get_mut("split").unwrap();
        bindings.insert("caps".into(),"L3+R3".into());bindings.insert("reset".into(),"ZR".into());bindings.insert("scale".into(),"L3".into());
        step(&mut e,&device(0),true,false);
        assert!(step(&mut e,&device((1<<6)|(1<<7)),true,false).is_empty());assert!(e.frame.caps);
        assert!(!shortcut_held(&e.prefs.shortcuts["split"],(1<<6)|(1<<7),"move"));
        assert!(!shortcut_held(&e.prefs.shortcuts["split"],(1<<6)|(1<<7),"scale"));
    }
    #[test] fn input_reducer_performance_budget() {
        let mut e=open("split");let d=device(0);step(&mut e,&d,true,false);
        let start=Instant::now();
        for _ in 0..100_000 {assert!(advance(&mut e,&d,true,false,false).1.is_empty());}
        let elapsed=start.elapsed();
        println!("100000 native keyboard input samples: {:?} ({:.2} us/sample)",elapsed,elapsed.as_micros() as f64/100000.0);
        assert!(elapsed<Duration::from_secs(5),"input reducer should stay well below the mapper's 3 ms tick");
    }
}
#[cfg(test)]
mod touch_filter_tests {
    use super::*;
    use serde_json::json;
    const DT:f64=0.004; // the pad reports at ~250 Hz
    fn run(filter:&mut TouchFilter,points:&[[f64;2]],start:f64,smoothing:f64,steadying:f64)->Vec<[f64;2]> {
        points.iter().enumerate().map(|(i,p)|filter.update(Some(*p),start+i as f64*DT,smoothing,steadying).unwrap()).collect()
    }
    fn line(from:[f64;2],to:[f64;2],steps:usize)->Vec<[f64;2]> {
        (0..=steps).map(|i|{let t=i as f64/steps as f64;[from[0]+(to[0]-from[0])*t,from[1]+(to[1]-from[1])*t]}).collect()
    }
    #[test] fn filter_off_is_the_pad_itself() {
        let mut f=TouchFilter::default();
        let points=line([-0.3,0.8],[0.4,-0.6],120);
        assert_eq!(run(&mut f,&points,0.0,0.0,0.0),points);
        assert_eq!(f.update(None,1.0,0.5,0.7),None);
        assert!(!f.active,"lifting forgets the contact");
    }
    #[test] fn smoothing_keeps_straight_swipes_straight_and_lands_on_the_thumb() {
        for (from,to) in [([-0.8,0.6],[0.7,-0.5]),([0.1,0.9],[0.1,-0.9]),([-0.9,0.2],[0.9,0.2])] {
            let mut f=TouchFilter::default();
            let mut points=line(from,to,150);points.extend(std::iter::repeat(to).take(100));
            let out=run(&mut f,&points,0.0,0.5,0.0);
            let (dx,dy)=(to[0]-from[0],to[1]-from[1]);let length=dx.hypot(dy);
            for p in &out {
                let off_line=((p[0]-from[0])*dy-(p[1]-from[1])*dx).abs()/length;
                assert!(off_line<1e-9,"{p:?} left the line {from:?}->{to:?}");
            }
            let end=out.last().unwrap();
            assert!((end[0]-to[0]).hypot(end[1]-to[1])<1e-3,"settles on the thumb: {end:?}");
        }
    }
    #[test] fn smoothing_calms_a_resting_thumb_without_dragging_a_fast_one() {
        let mut f=TouchFilter::default();
        // A thumb resting on 0.2 with a 0.02 tremor (about 0.12 key).
        let resting:Vec<[f64;2]>=(0..250).map(|i|[0.2+if i%6<3 {0.01} else {-0.01},0.0]).collect();
        let out=run(&mut f,&resting,0.0,0.5,0.0);
        let spread=out[100..].iter().map(|p|p[0]).fold(f64::NEG_INFINITY,f64::max)-out[100..].iter().map(|p|p[0]).fold(f64::INFINITY,f64::min);
        assert!(spread<0.004,"tremor 0.02 wide leaves {spread} on screen");
        // Then a flick across the pad at 5 units/s.
        let flick=line([0.2,0.0],[-0.8,0.0],50);
        let out=run(&mut f,&flick,250.0*DT,0.5,0.0);
        let lag=out.iter().zip(&flick).map(|(o,p)|(o[0]-p[0]).abs()).fold(0.0,f64::max);
        assert!(lag<0.05,"fast swipe trails by {lag} pad units");
    }
    #[test] fn steadying_holds_back_sideways_wobble_of_vertical_strokes_only() {
        // An up stroke that wanders 0.06 sideways and back (about a third of a key).
        let wobbly:Vec<[f64;2]>=(0..=200).map(|i|{let t=i as f64/200.0;[0.1+0.06*(t*std::f64::consts::PI).sin(),0.8-1.5*t]}).collect();
        let free=run(&mut TouchFilter::default(),&wobbly,0.0,0.0,0.0);
        let steady=run(&mut TouchFilter::default(),&wobbly,0.0,0.0,0.7);
        let swing=|v:&[[f64;2]]|v.iter().map(|p|p[0]).fold(f64::NEG_INFINITY,f64::max)-v.iter().map(|p|p[0]).fold(f64::INFINITY,f64::min);
        assert!(swing(&steady)<0.5*swing(&free),"sideways swing {} vs {}",swing(&steady),swing(&free));
        for (a,b) in steady.iter().zip(&wobbly) {assert!((a[1]-b[1]).abs()<1e-12,"vertical travel is never changed");}
        // Horizontal and 45 degree strokes, and anything flatter, pass untouched.
        for to in [[0.9,0.1],[0.6,-0.4],[0.8,-0.2]] {
            let points=line([-0.4,0.1],to,150);
            assert_eq!(run(&mut TouchFilter::default(),&points,0.0,0.0,0.7),points,"stroke to {to:?}");
        }
    }
    #[test] fn steadying_pays_back_its_offset_and_a_new_touch_starts_clean() {
        let mut f=TouchFilter::default();
        // A steep stroke drifting 0.2 right builds an offset...
        let steep=line([0.0,0.8],[0.2,-0.6],150);
        let out=run(&mut f,&steep,0.0,0.0,0.7);
        let lagging=steep.last().unwrap()[0]-out.last().unwrap()[0];
        assert!(lagging>0.03 && lagging<=TouchFilter::MAX_OFFSET,"held back {lagging}");
        // ...that a sideways move returns, so the far edge is still reachable.
        let across=line([0.2,-0.6],[1.0,-0.6],150);
        let out=run(&mut f,&across,151.0*DT,0.0,0.7);
        assert!((out.last().unwrap()[0]-1.0).abs()<0.01,"ends at {:?}",out.last());
        f.update(None,1.0,0.0,0.7);
        assert_eq!(f.update(Some([0.5,0.5]),1.1,0.0,0.7),Some([0.5,0.5]));
    }
    #[test] fn cursor_and_selected_key_follow_the_same_filtered_point() {
        let mut e=Engine::new(Preferences {layout:"standard".into(),..Preferences::default()});
        e.frame.open=true;
        let mut d=json!({"handle":7,"type":24,"status":{"buttons":0,"leftPad":{"x":0.0,"y":0.0,"touched":false},
            "rightPad":{"x":0.0,"y":0.8,"touched":true},"leftStick":{"x":0.0,"y":0.0}}});
        let mut widest:f64=0.0;
        for i in 0..=150 {
            let t=i as f64/150.0;
            d["status"]["rightPad"]["x"]=json!(0.05+0.08*(t*std::f64::consts::PI).sin());
            d["status"]["rightPad"]["y"]=json!(0.8-1.5*t);
            e.sample_time=i as f64*DT;
            advance(&mut e,&d,true,false,false);
            e.previous.insert(7,0);
            if let (Some(point),Some(cell))=(e.frame.right_touch,e.frame.right) {
                widest=widest.max(point[0]);
                let pad=json!({"x":point[0],"y":point[1],"touched":true});
                let direct=pad_cell(&pad,false,true).unwrap();
                assert!(cell==direct || (cell%12).abs_diff(direct%12)<=1 && (cell/12).abs_diff(direct/12)<=1,"highlight {cell} vs cursor cell {direct}");
            }
        }
        assert!(widest>0.05 && widest<0.05+0.08*0.6,"the defaults steady a 0.08 sideways bulge to {widest}");
    }
}
