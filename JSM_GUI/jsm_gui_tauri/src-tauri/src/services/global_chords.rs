use std::{thread, time::{Duration, Instant}};
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use crate::{runtime, services::{app_state::AppState, jsm_process, telemetry, config_layers, layer_activation::LayerActivation}};

// Run independently of WebView rendering and its background timer throttling.
// One worker serializes press/release commands, including very short holds.
/// The layers active right now, in stack order, for the Layers page's "Active
/// now" card: the live stack, not the one being edited.
static LAYER_STACK: std::sync::Mutex<Option<Value>> = std::sync::Mutex::new(None);

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

pub fn start(app: AppHandle, state: AppState) {
    thread::spawn(move || {
        let mut active: Option<String> = None;
        // If a binding inside a held global chord deliberately loads a normal
        // profile, do not immediately put the held chord back on top of it.
        // The chord is consumed until its trigger is released once.
        let mut global_cancelled_until_release = false;
        let mut chords = Vec::new();
        let mut layers = Vec::new();
        let mut activation = LayerActivation::default();
        let mut composed_ids = Vec::new();
        let mut composed_path = None;
        let mut source = String::new();
        let mut revision = config_layers::revision();
        let mut settling_until = Instant::now();
        let mut enabled = false;
        let mut reserved = false;
        let mut reserved_down: Vec<&'static str> = Vec::new();
        let mut next_reload = Instant::now();
        loop {
            let next_revision = config_layers::revision();
            if revision != next_revision {
                revision = next_revision;
                active = None;
                source.clear();
                layers.clear();
                activation.reset();
                composed_ids.clear();
                composed_path = None;
                settling_until = Instant::now() + Duration::from_millis(100);
            }
            if Instant::now() < settling_until {
                thread::sleep(Duration::from_millis(16));
                continue;
            }
            if Instant::now() >= next_reload {
                if let Ok(next) = runtime::read_global_chords(&app) { chords = next; }
                if let Ok(runtime_state) = runtime::read_runtime_mapping_state(&app) {
                    enabled = runtime_state.mapping_enabled;
                    reserved = runtime_state.reserved_chords;
                } else {
                    enabled = false;
                }
                next_reload = Instant::now() + Duration::from_millis(480);
            }
            let packet = telemetry::latest_packet(&state).ok().flatten();
            let devices = packet.as_ref().and_then(|p| p.get("devices")).and_then(Value::as_array);
            let held_global = global_profile(&chords, devices, enabled);
            let live = packet.as_ref().and_then(|p| p.get("activeProfile")).and_then(Value::as_str).unwrap_or("").replace('\\', "/");
            // A normal profile load cancels a held config in the mapper. Do not
            // restore over that new profile, or carry its predecessor's layers.
            if !live.is_empty() && !live.starts_with("profiles-library/.layers/") &&
                active.as_deref() != Some(live.as_str()) && (live != source || active.is_some()) {
                // A config-load binding inside the active global chord clears
                // the mapper's chord restore state. If its trigger is still
                // physically held, re-running STUDIO_CHORD_BEGIN here would
                // instantly overwrite the profile that binding just selected.
                if active.as_deref().is_some_and(|path| held_global.as_deref() == Some(path)) {
                    global_cancelled_until_release = true;
                }
                active = None;
                source = live;
                activation.reset();
                composed_ids.clear();
                composed_path = None;
                layers = config_layers::prepare(&app, &source).unwrap_or_else(|error| {
                    eprintln!("Could not prepare configuration layers for {source}: {error}");
                    Vec::new()
                });
            }
            if reserved {
                let now_down: Vec<&'static str> = RESERVED_CHORDS.iter()
                    .filter(|(_, buttons)| devices.is_some_and(|devices| devices.iter().any(|device| buttons.iter().all(|button| pressed(device, button)))))
                    .map(|(name, _)| *name).collect();
                for name in now_down.iter().filter(|name| !reserved_down.contains(name)) {
                    run_reserved_chord(&app, &state, name);
                    // The mapping state just changed under this loop; read it again.
                    next_reload = Instant::now();
                }
                reserved_down = now_down;
            } else {
                reserved_down.clear();
            }
            if !enabled { activation.reset(); }
            // No active chord to release and none to detect: avoid cloning a
            // full controller/console packet and waking 60 times per second.
            if active.is_none() && (!enabled || (chords.is_empty() && layers.is_empty())) {
                publish_layer_stack(&app, &source, &layers, &[]);
                // Reserved chords have to be heard with mapping off -- that is
                // how it gets turned back on.
                thread::sleep(Duration::from_millis(if reserved { 16 } else { 480 }));
                continue;
            }
            let global = eligible_global_profile(held_global, &mut global_cancelled_until_release);
            let ids = activation.update(&layers, devices.map(Vec::as_slice).unwrap_or(&[]), enabled, global.is_some());
            publish_layer_stack(&app, &source, &layers, &ids);
            if ids != composed_ids {
                match config_layers::compose(&app, &layers, &ids) {
                    Ok(path) => { composed_ids = ids; composed_path = path; }
                    Err(error) => { eprintln!("Could not compose configuration layers: {error}"); }
                }
            }
            let desired = global.or_else(|| composed_path.clone());
            if desired != active {
                let mut released = true;
                if active.is_some() {
                    released = jsm_process::inject_console_command(&app, &state, "STUDIO_CHORD_END").unwrap_or(false);
                    if released { active = None; }
                }
                if released {
                    if let Some(path) = desired {
                        let command = format!("STUDIO_CHORD_BEGIN {path}");
                        if jsm_process::inject_console_command(&app, &state, &command).unwrap_or(false) { active = Some(path); }
                    }
                }
                // Console injection completes before telemetry acknowledges the
                // new path. Do not mistake that old packet for a profile switch.
                settling_until = Instant::now() + Duration::from_millis(32);
            }
            thread::sleep(Duration::from_millis(16));
        }
    });
}

/// Studio's reserved chords: Quick Access (MISC1) with R5 (RSL) or R4 (RSR).
const RESERVED_CHORDS: [(&str, [&str; 2]); 2] = [("pause", ["MISC1", "RSL"]), ("calibrate", ["MISC1", "RSR"])];

fn run_reserved_chord(app: &AppHandle, state: &AppState, name: &str) {
    match name {
        "pause" => {
            let Ok(current) = runtime::read_runtime_mapping_state(app) else { return };
            if let Ok(next) = runtime::set_mapping_enabled(app, !current.mapping_enabled) {
                let _ = crate::commands::apply_runtime_mapping_state(app, state, &next);
                let _ = app.emit("runtime-mapping-state", &next);
            }
        }
        "calibrate" => {
            let _ = jsm_process::inject_console_command(app, state, runtime::CALIBRATION_COMMAND);
        }
        _ => {}
    }
}

fn global_profile(chords: &[runtime::GlobalChord], devices: Option<&Vec<Value>>, enabled: bool) -> Option<String> {
    if !enabled { return None; }
    chords.iter().find(|chord| !chord.buttons.is_empty() && devices.map(|devices|
        devices.iter().any(|device| chord.buttons.iter().all(|button| pressed(device, button)))
    ).unwrap_or(false)).map(|chord| chord.profile_path.clone())
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
        let chord = runtime::GlobalChord { id: "quick".into(), buttons: vec!["MISC1".into()], profile_path: "quick.txt".into() };
        let devices = vec![json!({"status": {"buttons": 1u64 << 27}})];
        assert_eq!(global_profile(&[chord.clone()], Some(&devices), true).as_deref(), Some("quick.txt"));
        assert_eq!(global_profile(&[chord.clone()], Some(&devices), false), None);
        assert_eq!(global_profile(&[chord], None, true), None);
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
