use std::{thread, time::{Duration, Instant}};
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use crate::{runtime, services::{app_state::AppState, jsm_process, telemetry, config_layers, layer_activation::LayerActivation}};

// Run independently of WebView rendering and its background timer throttling.
// One worker serializes press/release commands, including very short holds.
/// The layers active right now, in stack order, for the Layers page's "Active
/// now" card: the live stack, not the one being edited.
static LAYER_STACK: std::sync::Mutex<Option<Value>> = std::sync::Mutex::new(None);

static CANCEL_GLOBAL:std::sync::atomic::AtomicBool=std::sync::atomic::AtomicBool::new(false);
pub fn consume_until_release() {CANCEL_GLOBAL.store(true,std::sync::atomic::Ordering::Relaxed);}
pub fn layer_stack() -> Value {
    LAYER_STACK.lock().ok().and_then(|stack| stack.clone()).unwrap_or_else(|| serde_json::json!({ "profile": "", "layers": [] }))
}

fn publish_layer_stack(app: &AppHandle, profile: &str, layers: &[config_layers::PreparedLayer], ids: &[String]) {
    let names: Vec<Value> = ids.iter().filter_map(|id| layers.iter().find(|layer| &layer.id == id))
        .map(|layer| serde_json::json!({ "id": layer.id, "name": layer.name })).collect();
    let stack = serde_json::json!({ "profile": profile, "layers": names });
    let changed = LAYER_STACK.lock().map(|mut current| {
        let changed = current.as_ref() != Some(&stack);
        *current = Some(stack.clone());
        changed
    }).unwrap_or(false);
    if changed { let _ = app.emit("layer-stack", stack); }
}

#[derive(Default)]
struct DeviceRuntime {
    active: Option<String>, source: String, loaded_base: String, model: String,
    layers: Vec<config_layers::PreparedLayer>, activation: LayerActivation,
    composed_ids: Vec<String>, composed_path: Option<String>,
    cancelled: bool, begun: Option<Instant>, acknowledged: bool,
}
pub fn start(app: AppHandle, state: AppState) {
    thread::spawn(move || {
        let mut controllers = std::collections::BTreeMap::<i64, DeviceRuntime>::new();
        let mut chords=Vec::new();let mut enabled=false;
        let mut revision=config_layers::revision();let mut next_reload=Instant::now();
        loop {
            let cancel=CANCEL_GLOBAL.swap(false,std::sync::atomic::Ordering::Relaxed);
            if crate::services::virtual_keyboard::take_toggle() {
                let open=!crate::services::virtual_keyboard::requested();
                if let Err(error)=crate::services::virtual_keyboard::set_open(&app,open) {eprintln!("Keyboard: {error}");}
            }
            crate::services::virtual_keyboard::health(&app);
            let next_revision=config_layers::revision();
            if revision!=next_revision {
                for (id, controller) in &controllers {if controller.active.is_some() {let _=jsm_process::inject_console_command(&app,&state,&format!("STUDIO_DEVICE_CHORD_END {id}"));}}
                controllers.clear();revision=next_revision;
            }
            if Instant::now()>=next_reload {
                if let Ok(next)=runtime::read_global_chords(&app) {chords=next;}
                enabled=runtime::read_runtime_mapping_state(&app).map(|s|s.mapping_enabled).unwrap_or(false);
                next_reload=Instant::now()+Duration::from_millis(480);
            }
            let packet=telemetry::latest_packet(&state).ok().flatten();
            let devices=packet.as_ref().and_then(|p|p["devices"].as_array()).cloned().unwrap_or_default();
            let base=packet.as_ref().and_then(|p|p["activeProfile"].as_str()).unwrap_or("").replace('\\',"/");
            let mut any_global=false;let mut visible_layers=Vec::new();let mut visible_ids=Vec::new();
            for device in &devices {
                let Some(id)=device["handle"].as_i64() else {continue;};
                let model=super::controller_layouts::model(device);
                let controller=controllers.entry(id).or_default();
                let held=global_profile(&chords,Some(&vec![device.clone()]),true);
                if cancel {controller.cancelled=true;}
                let live=device["activeProfile"].as_str().unwrap_or(&base).replace('\\',"/");
                if controller.active.as_deref()==Some(live.as_str()) {controller.acknowledged=true;}
                let late=controller.active.is_some() && !controller.acknowledged && controller.begun.is_some_and(|begun|begun.elapsed()<BEGIN_ACK_WAIT);
                if !base.is_empty() && (controller.loaded_base!=base || controller.model!=model) {
                    controller.loaded_base=base.clone();controller.source=base.clone();controller.model=model.clone();controller.activation.reset();controller.composed_ids.clear();controller.composed_path=None;
                    controller.layers=config_layers::prepare_for_model(&app,&base,&model).unwrap_or_else(|error|{eprintln!("Layers: {error}");Vec::new()});
                }
                if !late && binding_chose_profile(controller.active.as_deref(),held.as_deref(),&live,&controller.source) {
                    controller.cancelled=true;
                    // A binding selected a normal profile for this controller.
                    controller.active=None;controller.source=live.clone();controller.activation.reset();
                    controller.layers=config_layers::prepare_for_model(&app,&live,&model).unwrap_or_default();
                }
                let global=eligible_global_profile(held,&mut controller.cancelled);any_global|=global.is_some();
                let keyboard=crate::services::virtual_keyboard::requested();
                let ids=if keyboard {controller.composed_ids.clone()} else {controller.activation.update(&controller.layers,std::slice::from_ref(device),enabled,global.is_some())};
                visible_layers.extend(controller.layers.clone());visible_ids.extend(ids.clone());
                if ids!=controller.composed_ids {
                    match config_layers::compose(&app,&controller.layers,&ids) {Ok(path)=>{controller.composed_ids=ids;controller.composed_path=path;},Err(error)=>eprintln!("Layers: {error}")}
                }
                let desired=global.or_else(||keyboard.then(||crate::services::virtual_keyboard::CAPTURE.to_string())).or_else(||controller.composed_path.clone());
                if desired!=controller.active {
                    let released=controller.active.is_none() || jsm_process::inject_console_command(&app,&state,&format!("STUDIO_DEVICE_CHORD_END {id}")).unwrap_or(false);
                    if released {
                        controller.active=None;
                        if let Some(path)=desired {if jsm_process::inject_console_command(&app,&state,&format!("STUDIO_DEVICE_CHORD_BEGIN {id} {path}")).unwrap_or(false) {controller.active=Some(path);controller.begun=Some(Instant::now());controller.acknowledged=false;}}
                    }
                }
            }
            let disconnected:Vec<_>=controllers.keys().filter(|id|!devices.iter().any(|d|d["handle"].as_i64()==Some(**id))).copied().collect();
            for id in disconnected {let _=jsm_process::inject_console_command(&app,&state,&format!("STUDIO_DEVICE_CHORD_END {id}"));controllers.remove(&id);}
            crate::services::virtual_keyboard::set_global(any_global);
            publish_layer_stack(&app,&base,&visible_layers,&visible_ids);
            thread::sleep(Duration::from_millis(16));
        }
    });
}

fn global_profile(chords: &[runtime::GlobalChord], devices: Option<&Vec<Value>>, enabled: bool) -> Option<String> {
    if !enabled { return None; }
    // The higher card wins (Settings ▸ Hold to swap's order); unordered lists
    // keep your own chords ahead of the built-in ones.
    runtime::chords_in_priority_order(chords).into_iter().find(|chord| devices.map(|devices|
        devices.iter().any(|device| chord_matches(chord,device))
    ).unwrap_or(false)).map(|chord| chord.profile_path.clone())
}

fn chord_matches(chord:&runtime::GlobalChord,device:&Value)->bool {
    if chord.controller_model.as_deref().is_some_and(|model| model != super::controller_layouts::model(device)) {return false;}
    if chord.trigger_groups.is_empty() {return !chord.buttons.is_empty() && chord.buttons.iter().all(|b|pressed(device,b));}
    chord.trigger_groups.iter().any(|group|!group.is_empty() && group.iter().all(|b|pressed(device,b)))
}
/// How long a packet naming the previous configuration counts as late after
/// STUDIO_CHORD_BEGIN. Past it, a mapper that refused the chord is believed.
const BEGIN_ACK_WAIT: Duration = Duration::from_millis(400);

/// The live configuration moved off a held global chord's to another library
/// configuration: a binding in the chord loaded it. Back to the configuration
/// the chord was held over is a refused or undone chord, not a choice; and a
/// layer composition or the applied-preview scratch file is Studio's own.
fn binding_chose_profile(active: Option<&str>, held_global: Option<&str>, live: &str, before_chord: &str) -> bool {
    active.is_some() && active == held_global && live != before_chord
        // The chord's own file is the chord answering (the mapper reports it as
        // the controller's live configuration), not a binding's choice. Taking it
        // for one dropped the chord without ending it: let go, and it stayed.
        && !active.is_some_and(|chord| chord.eq_ignore_ascii_case(live))
        && live.starts_with("profiles-library/") && !live.starts_with("profiles-library/.layers/")
        && !live.eq_ignore_ascii_case(runtime::APPLIED_PREVIEW_RELATIVE)
}

fn eligible_global_profile(detected: Option<String>, blocked_until_release: &mut bool) -> Option<String> {
    if *blocked_until_release {
        if detected.is_none() { *blocked_until_release = false; }
        return None;
    }
    detected
}

pub(super) fn pressed(device: &Value, button: &str) -> bool {
    let status = &device["status"];
    let bit = match button {
        "UP" => 0, "DOWN" => 1, "LEFT" => 2, "RIGHT" => 3,
        "+" => 4, "-" => 5, "L3" => 6, "R3" => 7, "L" => 8, "R" => 9,
        "S" => 12, "E" => 13, "W" => 14, "N" => 15, "HOME" => 16,
        "CAPTURE" => 17, "MIC" => 18, "LSL" => 19, "RSR" => 20,
        "LSR" => 21, "RSL" => 22, "LTOUCH" => 23, "RTOUCH" => 24,
        "LMINI" => 25, "RMINI" => 26, "MISC1" => 27, "MISC2" => 28,
        "MISC3" => 29, "MISC4" => 30, "MISC5" => 31, "MISC6" => 32,
        "TOUCH" => return status["leftPad"]["touched"].as_bool().unwrap_or(false),
        "ZL" | "ZLF" | "ZR" | "ZRF" => {
            let side = if button.starts_with("ZL") { "left" } else { "right" };
            return status["triggers"][side].as_f64().unwrap_or(0.0) >= if button.ends_with('F') { 0.99 } else { 0.5 };
        },
        _ => return false,
    };
    status["buttons"].as_u64().unwrap_or(0) & (1u64 << bit) != 0
}

/// An activator may be a chord: every input in "LSL,+" has to be down for it
/// to count, the same way a chorded binding reads in a configuration. A single
/// input is just the one-part case.
///
/// "!X" counts while X is up -- a layer held while a grip is let go, the same
/// "while released" the mapper reads in a `!MISC5,W` modeshift. Its edges
/// are X's edges reversed, so Toggle, Apply and Remove on "!X" act as X is
/// released.
pub(super) fn layer_pressed(device: &Value, button: &str, base: &str) -> bool {
    let mut parts = button.split(',').map(str::trim).filter(|part| !part.is_empty()).peekable();
    if parts.peek().is_none() { return false; }
    parts.all(|part| match part.strip_prefix('!') {
        Some(released) if !released.is_empty() => !layer_input_pressed(device, released, base),
        Some(_) => false,
        None => layer_input_pressed(device, part, base),
    })
}

/// Grid/menu activators use Default geometry so changing the active layer's
/// mode cannot release and immediately retrigger its own Hold action.
fn layer_input_pressed(device: &Value, button: &str, base: &str) -> bool {
    if pressed(device, button) { return true; }
    let get = |key: &str| base.lines().filter_map(|line| { let (k,v) = line.split_once('=')?; (k.trim() == key).then(|| v.split('#').next().unwrap_or("").trim()) }).last().unwrap_or("");
    let prefixes = [("LT", "LEFT_", "leftPad"), ("RT", "RIGHT_", "rightPad"), ("T", "", "leftPad"), ("LM", "LEFT_", "leftStick"), ("RM", "RIGHT_", "rightStick")];
    for (prefix, side, sensor) in prefixes {
        let Some(index) = button.strip_prefix(prefix).and_then(|n| n.parse::<usize>().ok()) else { continue; };
        let data = &device["status"][sensor];
        let x = data["x"].as_f64().unwrap_or(0.0);
        let y = data["y"].as_f64().unwrap_or(0.0);
        let menu = prefix.ends_with('M');
        let mode = get(&format!("{side}{}", if menu { "STICK_MODE" } else { "TOUCHPAD_MODE" }));
        if mode != if menu { "RADIAL_MENU" } else { "GRID_AND_STICK" } { return false; }
        if !menu && !data["touched"].as_bool().unwrap_or(false) { return false; }
        let click_key = if side.is_empty() { "TOUCHPAD_GRID_REQUIRES_CLICK".to_string() } else { format!("{side}GRID_REQUIRES_CLICK") };
        if !menu && get(&click_key) == "ON" && !pressed(device, if prefix == "RT" { "MISC2" } else if prefix == "LT" { "MISC3" } else { "CAPTURE" }) { return false; }
        let shape = get(&format!("{side}GRID_SHAPE"));
        let radial = menu || shape == "RADIAL" || shape == "FOUR_WAY";
        let size: Vec<usize> = get(&format!("{side}GRID_SIZE")).split_whitespace().filter_map(|n| n.parse().ok()).collect();
        let cols = size.first().copied().unwrap_or(2).clamp(1,25);
        let rows = size.get(1).copied().unwrap_or(1).clamp(1,25);
        let count = if menu { get(&format!("{side}STICK_MENU_SIZE")).parse::<usize>().unwrap_or(0).min(25) } else if shape == "FOUR_WAY" { 4 } else { (cols * rows).min(25) };
        if radial && count < 2 { return false; }
        if index == 0 || index > count { return false; }
        let region = if radial {
            let deadzone = get(&format!("{side}{}", if menu { "STICK_MENU_DEADZONE" } else { "GRID_DEADZONE" })).parse::<f64>().unwrap_or(if menu { 0.35 } else { 0.1 });
            if deadzone > 0.0 && x.hypot(y) <= deadzone { return false; }
            if shape == "FOUR_WAY" && !menu {
                let region = if y.abs() >= x.abs() { if y <= 0.0 { 1 } else { 3 } } else if x > 0.0 { 2 } else { 4 };
                return region == index;
            }
            let up = if menu { y } else { -y };
            let angle = x.atan2(up).rem_euclid(std::f64::consts::TAU);
            ((angle / std::f64::consts::TAU * count as f64 + 0.5).floor() as usize % count) + 1
        } else {
            let col = (((x + 1.0) * 0.5 * cols as f64).floor() as usize).min(cols-1);
            let row = (((y + 1.0) * 0.5 * rows as f64).floor() as usize).min(rows-1);
            row * cols + col + 1
        };
        return region == index;
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn model_chords_route_to_one_physical_controller() {
        let ds = json!({"handle":1,"type":5,"status":{"buttons":1u64<<5}});
        let xbox = json!({"handle":2,"type":6,"status":{"buttons":1u64<<5}});
        let chord = runtime::GlobalChord {id:"create".into(),controller_model:Some("type-5".into()),buttons:vec!["-".into()],trigger_groups:vec![],profile_path:"dual.txt".into(),rank:None};
        assert!(chord_matches(&chord,&ds)); assert!(!chord_matches(&chord,&xbox));
        assert_eq!(global_profile(&[chord.clone()],Some(&vec![ds]),true).as_deref(),Some("dual.txt"));
        assert!(global_profile(&[chord],Some(&vec![xbox]),true).is_none());
    }
    #[test]
    fn layer_regions_match_default_grid_geometry_and_release() {
        let mut device = json!({"status":{"leftPad":{"x":0.8,"y":-0.8,"touched":true},"rightStick":{"x":0.0,"y":1.0}}});
        let grid = "LEFT_TOUCHPAD_MODE = GRID_AND_STICK\nLEFT_GRID_SHAPE = FOUR_WAY";
        assert!(layer_pressed(&device,"LT1",grid), "diagonal ties go to vertical");
        assert!(!layer_pressed(&device,"LT2",grid));
        assert!(!layer_pressed(&device,"LT1",&(grid.to_string()+"\nLEFT_GRID_REQUIRES_CLICK = ON")));
        device["status"]["leftPad"]["touched"] = json!(false);
        assert!(!layer_pressed(&device,"LT1",grid));
        assert!(!layer_pressed(&device,"RM1","RIGHT_STICK_MODE = RADIAL_MENU"),"zero segments disables menu");
        let menu = "RIGHT_STICK_MODE = RADIAL_MENU\nRIGHT_STICK_MENU_SIZE = 8";
        assert!(layer_pressed(&device,"RM1",menu));
        device["status"]["rightStick"]["y"] = json!(0.3);
        assert!(!layer_pressed(&device,"RM1",menu),"native default deadzone is .35");
    }
    #[test]
    fn global_chords_keep_priority_and_release_on_disconnect_or_disable() {
        let chord = runtime::GlobalChord { controller_model:None, id: "quick".into(), trigger_groups:vec![], buttons: vec!["MISC1".into()], profile_path: "quick.txt".into(),rank:None};
        let devices = vec![json!({"status": {"buttons": 1u64 << 27}})];
        assert_eq!(global_profile(&[chord.clone()], Some(&devices), true).as_deref(), Some("quick.txt"));
        assert_eq!(global_profile(&[chord.clone()], Some(&devices), false), None);
        assert_eq!(global_profile(&[chord], None, true), None);
    }
    #[test] fn alternatives_contain_and_groups_without_combining_controllers() {
        let chord=runtime::GlobalChord {trigger_groups:vec![vec!["HOME".into()],vec!["L".into(),"R".into()]],..runtime::default_global_chord()};
        for (buttons,expected) in [(1u64<<16,true),(1<<8,false),(1<<9,false),((1<<8)|(1<<9),true),(0,false)] {
            assert_eq!(chord_matches(&chord,&json!({"status":{"buttons":buttons}})),expected);
        }
        let devices=vec![json!({"status":{"buttons":1<<8}}),json!({"status":{"buttons":1<<9}})];
        assert!(global_profile(&[chord],Some(&devices),true).is_none());
    }
    #[test]
    fn builtin_triggers_are_alternatives_and_personal_chords_take_priority() {
        let path="profiles-library/Default Global Chords.txt";
        let guide=runtime::GlobalChord {controller_model:None,id:"builtin-guide".into(),trigger_groups:vec![],buttons:vec!["HOME".into()],profile_path:path.into(),rank:None};
        let quick=runtime::GlobalChord {controller_model:None,id:"builtin-quick-access".into(),trigger_groups:vec![],buttons:vec!["MISC1".into()],profile_path:path.into(),rank:None};
        for bit in [16,27] {
            let devices=vec![json!({"status":{"buttons":1u64<<bit}})];
            assert_eq!(global_profile(&[guide.clone(),quick.clone()],Some(&devices),true).as_deref(),Some(path));
        }
        let personal=runtime::GlobalChord {controller_model:None,id:"personal".into(),trigger_groups:vec![],buttons:vec!["HOME".into()],profile_path:"personal.txt".into(),rank:None};
        let devices=vec![json!({"status":{"buttons":1u64<<16}})];
        assert_eq!(global_profile(&[guide,quick,personal],Some(&devices),true).as_deref(),Some("personal.txt"));
    }
    #[test]
    fn profile_switch_inside_global_chord_waits_for_release_before_rearming() {
        let mut blocked = true;
        assert_eq!(eligible_global_profile(Some("quick.txt".into()), &mut blocked), None);
        assert!(blocked, "still held: the chord must not immediately re-enter");
        assert_eq!(eligible_global_profile(None, &mut blocked), None);
        assert!(!blocked, "releasing the trigger rearms the chord");
        assert_eq!(eligible_global_profile(Some("quick.txt".into()), &mut blocked).as_deref(), Some("quick.txt"));
    }
    #[test]
    fn only_a_different_library_profile_under_a_held_chord_is_a_choice() {
        let quick = Some("profiles-library/Quick Access Chord.txt");
        let before = "AppNavigation.txt";
        assert!(binding_chose_profile(quick, quick, "profiles-library/Gamepad.txt", before));
        // Back to what the chord was held over: refused or undone, not chosen.
        assert!(!binding_chose_profile(quick, quick, before, before));
        // The mapper reporting the chord itself as live: the chord is on, nothing was chosen.
        assert!(!binding_chose_profile(quick, quick, quick.unwrap(), before));
        // The chord's trigger is already up: an ordinary switch.
        assert!(!binding_chose_profile(quick, None, "profiles-library/Gamepad.txt", before));
        // A composed layer, not a global chord.
        let layer = Some("profiles-library/.layers/Wardogs/1-Menu.txt");
        assert!(!binding_chose_profile(layer, quick, "profiles-library/Gamepad.txt", before));
        assert!(!binding_chose_profile(quick, quick, "profiles-library/applied-preview.txt", before));
        assert!(!binding_chose_profile(quick, quick, "profiles-library/.layers/Gamepad/1-X.txt", before));
        assert!(!binding_chose_profile(quick, quick, "AutoLoad/Game.txt", before));
    }
    #[test]
    fn steam_button_uses_the_home_telemetry_bit() {
        let device = json!({"status": {"buttons": 1u64 << 16}});
        assert!(pressed(&device, "HOME"));
        assert!(!pressed(&device, "MISC1"));
    }
    #[test]
    fn quick_access_is_not_guide_and_triggers_do_not_need_digital_buttons() {
        let device = json!({"status": {"buttons": 1u64 << 27, "triggers": {"left": 1.0}}});
        assert!(pressed(&device, "MISC1"));
        assert!(!pressed(&device, "HOME"));
        assert!(pressed(&device, "ZLF"));
        assert!(!pressed(&device, "ZR"));
    }
}
