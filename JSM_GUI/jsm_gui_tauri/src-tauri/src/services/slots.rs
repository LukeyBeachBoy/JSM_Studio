//! Persistent application-wide configuration slots. Hotkeys observe physical
//! inputs; their prefixes do not replace a configuration or claim its buttons.
use std::{collections::HashSet, sync::{atomic::{AtomicBool, AtomicU64, Ordering::Relaxed}, Mutex, mpsc}, time::{Duration, Instant}};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use crate::{runtime, services::{app_state::AppState, config_layers, global_chords, jsm_process}};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all="camelCase")]
pub struct Slot {
    pub id: u8,
    pub name: String,
    pub profile_name: Option<String>,
    #[serde(default)] pub buttons: Vec<String>,
    #[serde(default)] pub controller_model: Option<String>,
    #[serde(default, skip_serializing_if="Vec::is_empty")] pub additional_hotkeys: Vec<SlotHotkey>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all="camelCase")]
pub struct SlotHotkey {
    pub buttons: Vec<String>,
    #[serde(default)] pub controller_model: Option<String>,
}
fn slot_hotkeys(slot: &Slot) -> impl Iterator<Item=(&[String], Option<&str>)> {
    std::iter::once((slot.buttons.as_slice(), slot.controller_model.as_deref()))
        .chain(slot.additional_hotkeys.iter().map(|hotkey| (hotkey.buttons.as_slice(), hotkey.controller_model.as_deref())))
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all="camelCase")]
pub struct Slots {
    pub enabled: bool,
    pub active_slot: u8,
    #[serde(default = "notifications_default")] pub show_notifications: bool,
    pub slots: Vec<Slot>,
}
fn notifications_default() -> bool { true }
impl Default for Slots {
    fn default() -> Self { Self { enabled:false, active_slot:1, show_notifications:true, slots:(1..=4).map(|id| Slot {
        id, name:format!("Slot {id}"), profile_name:None, buttons:vec![], controller_model:None, additional_hotkeys:vec![],
    }).collect() } }
}
static ENABLED: AtomicBool = AtomicBool::new(false);
static CONFIG: Mutex<Option<Slots>> = Mutex::new(None);
static EDIT: Mutex<()> = Mutex::new(());
static REQUESTS: Mutex<Vec<(u8, mpsc::Sender<Result<Slots,String>>)>> = Mutex::new(Vec::new());
static RULES_REVISION: AtomicU64 = AtomicU64::new(0);
pub fn enabled() -> bool { ENABLED.load(Relaxed) }
pub fn invalidate_rules() { RULES_REVISION.fetch_add(1,Relaxed); }
fn file(app:&AppHandle) -> Result<std::path::PathBuf,String> { Ok(runtime::app_data_dir(app)?.join("slots.json")) }
fn snapshot(id:u8) -> String { format!("profiles-library/.slots/slot-{id}.txt") }
fn source(name:&str) -> String { format!("profiles-library/{}.txt",runtime::sanitize_profile_name(name)) }
pub fn get() -> Slots { CONFIG.lock().ok().and_then(|config| config.clone()).unwrap_or_default() }
fn persist(app:&AppHandle,config:&Slots) -> Result<(),String> {
    validate(config)?;
    runtime::write_file_atomically(file(app)?,serde_json::to_string_pretty(config).map_err(|e|e.to_string())?)?;
    *CONFIG.lock().map_err(|_|"Slots state is unavailable")?=Some(config.clone());
    ENABLED.store(config.enabled,Relaxed);
    let _=app.emit("slots-changed",config);
    Ok(())
}
pub fn initialize(app:&AppHandle) -> Result<(),String> {
    let path=file(app)?;
    let config=if path.exists() {serde_json::from_str(&std::fs::read_to_string(path).map_err(|e|e.to_string())?).map_err(|e|format!("Cannot read slots: {e}"))?} else {Slots::default()};
    validate(&config)?;
    ENABLED.store(config.enabled,Relaxed);
    *CONFIG.lock().map_err(|_|"Slots state is unavailable")?=Some(config);
    // Rebuild Startup.txt after learning whether the native AutoLoad worker
    // must yield to slot-aware foreground routing.
    runtime::ensure_required_files(app)
}
fn validate(config:&Slots) -> Result<(),String> {
    if config.slots.len()!=4 || !(1..=4).contains(&config.active_slot) {return Err("Choose one of four slots".into());}
    let mut ids=HashSet::new(); let mut hotkeys=HashSet::new();
    for (index,slot) in config.slots.iter().enumerate() {
        if slot.id as usize!=index+1 {return Err("Keep slots in numbered order".into());}
        if !(1..=4).contains(&slot.id) || !ids.insert(slot.id) || slot.name.trim().is_empty() || slot.name.len()>80 {return Err("Invalid slot name or number".into());}
        if slot.additional_hotkeys.len()>32 {return Err("Too many controller hotkeys for one slot".into());}
        for (inputs, model) in slot_hotkeys(slot) {
            if inputs.len()>4 || inputs.iter().any(|b| !valid_button(b)) || inputs.iter().collect::<HashSet<_>>().len()!=inputs.len() {return Err("Choose up to four different physical inputs for each hotkey".into());}
            let mut buttons=inputs.to_vec();buttons.sort();
            if !buttons.is_empty() && !hotkeys.insert((model.map(str::to_owned),buttons)) {return Err("Two slots cannot use the same hotkey".into());}
        }
        if slot.profile_name.as_ref().is_some_and(|name| name != &runtime::sanitize_profile_name(name)) {return Err("Invalid slot configuration name".into());}
    }
    Ok(())
}
fn valid_button(button:&str)->bool {
    ["MOUSE_BACK","MOUSE_FORWARD","UP","DOWN","LEFT","RIGHT","+","-","L3","R3","L","R","S","E","W","N","HOME","CAPTURE","MIC","LSL","RSR","LSR","RSL","LTOUCH","RTOUCH","LMINI","RMINI","TOUCH","ZL","ZR","ZLF","ZRF"].contains(&button)
        || button.strip_prefix("JOY").and_then(|n|n.parse::<u8>().ok()).is_some_and(|n|(1..=32).contains(&n))
        || button.strip_prefix("MISC").and_then(|n|n.parse::<u8>().ok()).is_some_and(|n|(1..=6).contains(&n))
}
fn write_snapshot(app:&AppHandle,id:u8,path:&str)->Result<(),String> {
    let text=std::fs::read_to_string(runtime::absolute_profile_path(app,path)?).map_err(|e|format!("Cannot load slot configuration: {e}"))?;
    runtime::write_file_atomically(runtime::absolute_profile_path(app,&snapshot(id))?,text)
}
pub fn refresh_snapshot(app:&AppHandle,id:u8)->Result<(),String> {
    let _edit=EDIT.lock().map_err(|_|"Slots are busy")?;
    let config=get();let slot=config.slots.iter().find(|s|s.id==id).ok_or("Slot not found")?;
    let name=slot.profile_name.as_deref().ok_or("No configuration assigned")?;
    write_snapshot(app,id,&source(name))
}
pub fn rename_profile(app:&AppHandle,old:&str,new:&str)->Result<(),String> {
    let _edit=EDIT.lock().map_err(|_|"Slots are busy")?;
    let mut config=get();let mut changed=false;
    for slot in &mut config.slots {if slot.profile_name.as_deref().is_some_and(|name|name.eq_ignore_ascii_case(old)) {slot.profile_name=Some(new.into());changed=true;}}
    if changed {persist(app,&config)?;} Ok(())
}
pub fn configure(app:&AppHandle,mut next:Slots)->Result<Slots,String> {
    let _edit=EDIT.lock().map_err(|_|"Slots are busy")?;
    validate(&next)?;
    let before=get();
    let mut captured_live=false;
    if next.enabled && !before.enabled {
        let state=runtime::read_runtime_mapping_state(app)?;
        let current_name=runtime::profile_name_from_relative_path(&state.active_profile_path);
        if next.slots[0].profile_name.is_none() || next.slots[0].profile_name.as_deref()==Some(&current_name) {
            next.slots[0].profile_name=Some(current_name);
            write_snapshot(app,1,&runtime::effective_profile_for_state(&state))?;
            captured_live=true;
        }
        if next.slots[1].profile_name.is_none() && runtime::absolute_profile_path(app,&source("Desktop"))?.exists() {next.slots[1].profile_name=Some("Desktop".into());}
    }
    validate(&next)?;
    for slot in &next.slots {
        let old=before.slots.iter().find(|old|old.id==slot.id);
        if let Some(name)=&slot.profile_name {
            if old.and_then(|s|s.profile_name.as_ref())!=Some(name) || !runtime::absolute_profile_path(app,&snapshot(slot.id))?.exists() {
                // The first slot's just-captured live preview takes precedence
                // over the saved source when enabling slots for the first time.
                if !(captured_live && slot.id==1) { write_snapshot(app,slot.id,&source(name))?; }
            }
        }
    }
    if next.enabled && next.slots.iter().find(|s|s.id==next.active_slot).and_then(|s|s.profile_name.as_ref()).is_none() {return Err("Assign a configuration to the active slot before enabling it".into());}
    persist(app,&next)?;
    runtime::ensure_required_files(app)?;
    invalidate_rules();
    if !next.enabled || !next.show_notifications { super::slot_toast::dismiss(app); }
    Ok(next)
}
pub fn request(id:u8)->Result<Slots,String> {
    if id>4 {return Err("Invalid slot".into());}
    let (send,receive)=mpsc::channel();
    let mut queue=REQUESTS.lock().map_err(|_|"Slot switch queue is unavailable")?;
    if queue.len()>=16 {return Err("A slot switch is already pending".into());}
    queue.push((id,send));drop(queue);
    receive.recv_timeout(Duration::from_secs(10)).map_err(|_|"The mapper did not process the slot switch".to_string())?
}
pub fn record_manual_apply(app:&AppHandle,path:&str)->Result<(),String> {
    if !enabled() {return Ok(());}
    let _edit=EDIT.lock().map_err(|_|"Slots are busy")?;
    let mut config=get();
    let state=runtime::read_runtime_mapping_state(app)?;
    let active=config.active_slot;
    write_snapshot(app,active,path)?;
    if let Some(slot)=config.slots.iter_mut().find(|slot|slot.id==active) {slot.profile_name=Some(runtime::profile_name_from_relative_path(&state.active_profile_path));}
    persist(app,&config)
}
fn activate(app:&AppHandle,state:&AppState,id:u8)->Result<Slots,String> {
    let _edit=EDIT.lock().map_err(|_|"Slots are busy")?;
    let mut config=get();
    if !config.enabled {return Err("Turn on configuration slots first".into());}
    let slot=config.slots.iter().find(|s|s.id==id).ok_or("Slot not found")?;
    let name=slot.profile_name.clone().ok_or("Assign a configuration to this slot first")?;
    let source=source(&name);
    if !runtime::absolute_profile_path(app,&source)?.exists() {return Err(format!("The configuration in Slot {id} is missing: {name}"));}
    let target=snapshot(id);
    if !runtime::absolute_profile_path(app,&target)?.exists() {write_snapshot(app,id,&source)?;}
    let previous=runtime::read_runtime_mapping_state(app)?;
    let changed_slot = runtime::effective_profile_for_state(&previous) != target;
    // The native slot transaction discards temporary configurations and loads
    // the final slot together, without restoring the old profile in between.
    global_chords::consume_until_release();
    let next=runtime::set_slot_profile(app,&source,&target)?;
    config_layers::prepare(app,&target)?;
    if let Err(error)=crate::commands::apply_slot_mapping_state(app,state,&next) {
        let _=runtime::restore_mapping_state(app,&previous);
        let _=crate::commands::apply_slot_mapping_state(app,state,&previous);
        return Err(error);
    }
    config.active_slot=id;persist(app,&config)?;
    config_layers::applied();
    let _=app.emit("runtime-mapping-state",&next);
    let content=std::fs::read_to_string(runtime::absolute_profile_path(app,&target)?).map_err(|e|e.to_string())?;
    let _=app.emit("applied-profile-changed",serde_json::json!({"name":name,"path":source,"content":content}));
    if changed_slot && config.show_notifications {
        if let Some(slot) = config.slots.iter().find(|s| s.id == id) { super::slot_toast::notify(app, slot); }
    }
    Ok(config)
}
fn hotkey_scope_matches(model:Option<&str>,device:&Value)->bool {
    model.is_none_or(|model| model==super::controller_layouts::model(device) || model==super::controller_layouts::target(device))
}
fn replace_assignment(config:&mut Slots,id:u8,name:String)->Result<bool,String> {
    let slot=config.slots.iter_mut().find(|s|s.id==id).ok_or("Slot not found")?;
    slot.profile_name=Some(name);Ok(config.active_slot==id)
}
fn apply_foreground(app:&AppHandle,id:u8,name:&str)->Result<bool,String> {
    let _edit=EDIT.lock().map_err(|_|"Slots are busy")?;
    let mut next=get();
    let active=replace_assignment(&mut next,id,name.into())?;
    write_snapshot(app,id,&source(name))?;
    persist(app,&next)?;Ok(active)
}
#[derive(Default)]
pub struct Worker {
    held:HashSet<(u8,i64)>, next_foreground:Option<Instant>, foreground:Option<(u32,String,u64)>,
    filter_signature:String,
}
fn native_mask(device:&Value,button:&str)->Option<u64> {
    let bit=if device["type"].as_i64()==Some(25) {
        button.strip_prefix("JOY").and_then(|n|n.parse::<u32>().ok()).filter(|n|(1..=32).contains(n)).map(|n|n-1)
            .or(match button {"UP"=>Some(32),"RIGHT"=>Some(33),"DOWN"=>Some(34),"LEFT"=>Some(35),_=>None})
    } else {match button {
        "UP"=>Some(0),"DOWN"=>Some(1),"LEFT"=>Some(2),"RIGHT"=>Some(3),"+"=>Some(4),"-"=>Some(5),"L3"=>Some(6),"R3"=>Some(7),"L"=>Some(8),"R"=>Some(9),
        "S"=>Some(12),"E"=>Some(13),"W"=>Some(14),"N"=>Some(15),"HOME"=>Some(16),"CAPTURE"=>Some(17),"MIC"=>Some(18),"LSL"=>Some(19),"RSR"=>Some(20),"LSR"=>Some(21),"RSL"=>Some(22),
        "LTOUCH"=>Some(23),"RTOUCH"=>Some(24),"LMINI"=>Some(25),"RMINI"=>Some(26),"MISC1"=>Some(27),"MISC2"=>Some(28),"MISC3"=>Some(29),"MISC4"=>Some(30),"MISC5"=>Some(31),"MISC6"=>Some(32),_=>None,
    }};
    bit.map(|bit|1u64<<bit)
}
fn native_filters(config:&Slots,devices:&[Value])->String {
    let mut rules=Vec::new();
    if config.enabled {for slot in &config.slots {if slot.profile_name.is_some() {for (buttons,model) in slot_hotkeys(slot).filter(|(buttons,_)|!buttons.is_empty()) {for device in devices {if hotkey_scope_matches(model,device) {
        let mut mouse=0u8;let mut mask=Some(0u64);
        for button in buttons {
            match button.as_str() {"MOUSE_BACK"=>mouse|=1,"MOUSE_FORWARD"=>mouse|=2,_=>mask=mask.zip(native_mask(device,button)).map(|(a,b)|a|b)}
        }
        if let (Some(handle),Some(mask))=(device["handle"].as_i64(),mask) {if mask!=0 {rules.push(format!("{handle} {mask} {mouse}"));}}
    }}}}}}
    rules.join(";")
}
impl Worker {
    fn hotkeys(&mut self,config:&Slots,devices:&[Value],mouse:&[String])->Option<u8> {
        let mut down=HashSet::new();let mut selected=None;
        if config.enabled {
            // Prefer the most specific full combination when hotkeys overlap.
            let mut hotkeys:Vec<_>=config.slots.iter().filter(|slot|slot.profile_name.is_some()).flat_map(|slot|slot_hotkeys(slot).filter(|(buttons,_)|!buttons.is_empty()).map(move |(buttons,model)|(slot.id,buttons,model))).collect();
            hotkeys.sort_by_key(|(_,buttons,_)|std::cmp::Reverse(buttons.len()));
            for (id,buttons,model) in hotkeys {for device in devices {
                if hotkey_scope_matches(model,device) && buttons.iter().all(|button| if button.starts_with("MOUSE_") {mouse.contains(button)} else {global_chords::pressed(device,button)}) {
                    let key=(id,device["handle"].as_i64().unwrap_or(0));
                    down.insert(key); if !self.held.contains(&key) && selected.is_none() {selected=Some(id);}
                }
            }}
        }
        self.held=down;selected
    }
    pub fn tick(&mut self,app:&AppHandle,state:&AppState,devices:&[Value],mapping:bool)->bool {
        let requests=REQUESTS.lock().map(|mut q|std::mem::take(&mut *q)).unwrap_or_default();
        let mut switched=false;
        for (id,reply) in requests {
            let result=if id==0 && !enabled() {
                runtime::read_runtime_mapping_state(app).and_then(|runtime|crate::commands::apply_runtime_mapping_state(app,state,&runtime)).map(|_|get())
            } else {activate(app,state,if id==0 {get().active_slot} else {id})};
            switched|=result.is_ok(); let _=reply.send(result);
        }
        let config=get();
        let filters=if mapping {native_filters(&config,devices)} else {String::new()};
        let pid=state.process.lock().ok().and_then(|process|process.child.as_ref().map(|child|child.id()));
        let signature=format!("{pid:?}:{filters}");
        if signature!=self.filter_signature && pid.is_some() {
            if jsm_process::inject_console_command(app,state,&format!("STUDIO_SLOT_FILTER {filters}")).unwrap_or(false) {self.filter_signature=signature;}
        }
        if !config.enabled {self.held.clear();self.foreground=None;return switched;}
        let fresh=state.telemetry.lock().ok().is_some_and(|t| t.latest_received_at.is_some_and(|at|at.elapsed()<Duration::from_millis(500)));
        let hotkey=self.hotkeys(&config,if fresh && mapping {devices} else {&[]},&global_chords::mouse_side_buttons());
        if let Some(id)=hotkey {
            if id==config.active_slot {global_chords::consume_until_release();return switched;}
            match activate(app,state,id) {Ok(_)=>switched=true,Err(error)=>{let _=app.emit("slot-error",error);}}
            // The same tick must never let foreground routing undo a hotkey.
            return switched;
        }
        if self.next_foreground.is_some_and(|at|Instant::now()<at) {return switched;}
        self.next_foreground=Some(Instant::now()+Duration::from_millis(200));
        if state.telemetry_ui_active.load(Relaxed) || super::virtual_keyboard::requested() {return switched;}
        let Ok(runtime)=runtime::read_runtime_mapping_state(app) else {return switched};
        if !runtime.mapping_enabled || !runtime.autoload_enabled {return switched;}
        let Some((pid,process))=jsm_process::foreground_process() else {return switched};
        let current=(pid,process.clone(),RULES_REVISION.load(Relaxed));
        if self.foreground.as_ref()==Some(&current) {return switched;}
        self.foreground=Some(current);
        if let Ok(rules)=runtime::list_autoload_rules(app) {
            if let Some(rule)=rules.iter().find(|r|!r.paused && !r.built_in && r.process_name.eq_ignore_ascii_case(&process) && !r.missing_profile && r.profile_name.is_some()) {
                let id=rule.slot.unwrap_or(1);
                match apply_foreground(app,id,rule.profile_name.as_deref().unwrap()) {
                    Ok(active)=>{let _=runtime::record_autoload_match(app,&process);if active {match activate(app,state,id) {Ok(_)=>switched=true,Err(error)=>{let _=app.emit("slot-error",error);}}}},
                    Err(error)=>{let _=app.emit("slot-error",error);}
                }
            }
        }
        switched
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn notification_preference_defaults_on_for_existing_files_and_round_trips_off() {
        let mut value=serde_json::to_value(Slots::default()).unwrap();
        value.as_object_mut().unwrap().remove("showNotifications");
        assert!(serde_json::from_value::<Slots>(value.clone()).unwrap().show_notifications);
        value["showNotifications"]=Value::Bool(false);
        let off=serde_json::from_value::<Slots>(value).unwrap();
        assert!(!serde_json::from_str::<Slots>(&serde_json::to_string(&off).unwrap()).unwrap().show_notifications);
    }
    fn config()->Slots {let mut c=Slots::default();c.enabled=true;c.slots[0].profile_name=Some("Game".into());c.slots[0].buttons=vec!["MOUSE_BACK".into(),"UP".into()];c.slots[0].controller_model=Some("type-25".into());c}
    fn device(up:bool,handle:i64)->Value {serde_json::json!({"handle":handle,"type":25,"status":{"buttons":if up {1u64<<32} else {0}}})}
    #[test]
    fn any_press_order_root_alone_is_inert_and_full_hotkey_fires_once() {
        let c=config();let mut w=Worker::default();let mouse=vec!["MOUSE_BACK".into()];
        assert_eq!(w.hotkeys(&c,&[device(false,1)],&mouse),None);
        assert_eq!(w.hotkeys(&c,&[device(true,1)],&mouse),Some(1));
        for _ in 0..100 {assert_eq!(w.hotkeys(&c,&[device(true,1)],&mouse),None);}
        assert_eq!(w.hotkeys(&c,&[device(false,1)],&mouse),None);
        assert_eq!(w.hotkeys(&c,&[device(true,1)],&mouse),Some(1));
        assert_eq!(w.hotkeys(&c,&[device(true,1)],&[]),None);
        assert_eq!(w.hotkeys(&c,&[device(true,1)],&mouse),Some(1));
    }
    #[test]
    fn scopes_disconnects_and_disabled_slots_do_not_trigger() {
        let c=config();let mut w=Worker::default();let mouse=vec!["MOUSE_BACK".into()];
        let mut other=device(true,1);other["type"]=Value::from(24);
        assert_eq!(w.hotkeys(&c,&[other],&mouse),None);
        assert_eq!(w.hotkeys(&c,&[],&mouse),None);
        let mut disabled=c.clone();disabled.enabled=false;
        assert_eq!(w.hotkeys(&disabled,&[device(true,1)],&mouse),None);
    }
    #[test]
    fn profiles_and_active_selection_round_trip_and_duplicate_hotkeys_rejected() {
        let c=config();let serialized=serde_json::to_string(&c).unwrap();assert_eq!(serde_json::from_str::<Slots>(&serialized).unwrap(),c);
        let mut invalid=c.clone();invalid.slots[1].buttons=c.slots[0].buttons.clone();invalid.slots[1].controller_model=c.slots[0].controller_model.clone();assert!(validate(&invalid).is_err());
        invalid.slots[1].buttons.clear();invalid.active_slot=5;assert!(validate(&invalid).is_err());
    }
    #[test]
    fn foreground_assignment_retains_desktop_and_remembers_the_last_game() {
        let mut c=config();c.slots[1].profile_name=Some("Desktop".into());c.active_slot=2;
        assert!(!replace_assignment(&mut c,1,"Next game".into()).unwrap());
        assert_eq!(c.active_slot,2);assert_eq!(c.slots[1].profile_name.as_deref(),Some("Desktop"));
        assert_eq!(c.slots[0].profile_name.as_deref(),Some("Next game"));
        c.active_slot=1;assert!(replace_assignment(&mut c,1,"Another game".into()).unwrap());
        assert_eq!(c.slots[1].profile_name.as_deref(),Some("Desktop"));
    }
    #[test]
    fn native_filters_use_raw_physical_bits_and_only_the_selected_controller() {
        let c=config();assert_eq!(native_filters(&c,&[device(true,25)]),"25 4294967296 1");
        let mut other=device(true,24);other["type"]=Value::from(24);
        assert_eq!(native_filters(&c,&[other]),"");
        let mut off=c;off.enabled=false;assert_eq!(native_filters(&off,&[device(true,25)]),"");
    }
    #[test]
    fn cyborg_and_steam_shortcuts_share_slots_without_sharing_inputs() {
        let mut c=config();
        c.slots[0].additional_hotkeys.push(SlotHotkey {controller_model:Some("type-24".into()),buttons:vec!["MISC1".into(),"UP".into()]});
        c.slots[1].profile_name=Some("Desktop".into());
        c.slots[1].additional_hotkeys.push(SlotHotkey {controller_model:Some("type-24".into()),buttons:vec!["MISC1".into(),"DOWN".into()]});
        validate(&c).unwrap();
        let steam=|buttons|serde_json::json!({"handle":24,"type":24,"status":{"buttons":buttons}});
        let mut worker=Worker::default();
        assert_eq!(worker.hotkeys(&c,&[steam(1u64<<27)],&[]),None,"Quick Access alone remains available to Hold to swap");
        assert_eq!(worker.hotkeys(&c,&[steam((1u64<<27)|1)],&[]),Some(1));
        assert_eq!(worker.hotkeys(&c,&[steam((1u64<<27)|1)],&[]),None,"hold fires only once");
        assert_eq!(worker.hotkeys(&c,&[steam((1u64<<27)|2)],&[]),Some(2));
        assert_eq!(worker.hotkeys(&c,&[steam(1u64<<27),device(true,25)],&[]),None,"inputs cannot be combined across controllers");
        assert_eq!(worker.hotkeys(&c,&[device(true,25)],&["MOUSE_BACK".into()]),Some(1),"the original Cyborg shortcut is retained");
        let filters=native_filters(&c,&[device(false,25),steam(0u64)]);
        assert!(filters.contains("25 4294967296 1"));
        assert!(filters.contains("24 134217729 0"));
        assert!(filters.contains("24 134217730 0"));
        assert_eq!(serde_json::from_str::<Slots>(&serde_json::to_string(&c).unwrap()).unwrap(),c);
        let mut duplicate=c.clone();duplicate.slots[1].additional_hotkeys=c.slots[0].additional_hotkeys.clone();
        assert!(validate(&duplicate).is_err());
        let legacy=serde_json::to_value(config()).unwrap();
        assert!(legacy["slots"][0].get("additionalHotkeys").is_none());
        assert!(serde_json::from_value::<Slots>(legacy).unwrap().slots[0].additional_hotkeys.is_empty());
    }
}
