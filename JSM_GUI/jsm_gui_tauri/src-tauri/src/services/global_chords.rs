use std::{thread, time::{Duration, Instant}};
use serde_json::Value;
use tauri::AppHandle;
use crate::{runtime, services::{app_state::AppState, jsm_process, telemetry}};

// Run independently of WebView rendering and its background timer throttling.
// One worker serializes press/release commands, including very short holds.
pub fn start(app: AppHandle, state: AppState) {
    thread::spawn(move || {
        let mut active: Option<String> = None;
        let mut chords = Vec::new();
        let mut enabled = false;
        let mut next_reload = Instant::now();
        loop {
            if Instant::now() >= next_reload {
                if let Ok(next) = runtime::read_global_chords(&app) { chords = next; }
                enabled = runtime::read_runtime_mapping_state(&app).map(|s| s.mapping_enabled).unwrap_or(false);
                next_reload = Instant::now() + Duration::from_millis(480);
            }
            // No active chord to release and none to detect: avoid cloning a
            // full controller/console packet and waking 60 times per second.
            if active.is_none() && (!enabled || chords.is_empty()) {
                thread::sleep(Duration::from_millis(480));
                continue;
            }
            let packet = telemetry::latest_packet(&state).ok().flatten();
            let devices = packet.as_ref().and_then(|p| p.get("devices")).and_then(Value::as_array);
            let desired = if enabled {
                chords.iter().find(|chord| !chord.buttons.is_empty() && devices.map(|devices|
                    devices.iter().any(|device| chord.buttons.iter().all(|button| pressed(device, button)))
                ).unwrap_or(false)).map(|chord| chord.profile_path.clone())
            } else { None };
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
            }
            thread::sleep(Duration::from_millis(16));
        }
    });
}

fn pressed(device: &Value, button: &str) -> bool {
    let status = &device["status"];
    let bit = match button {
        "UP" => 0, "DOWN" => 1, "LEFT" => 2, "RIGHT" => 3,
        "+" => 4, "-" => 5, "L3" => 6, "R3" => 7, "L" => 8, "R" => 9,
        "S" => 12, "E" => 13, "W" => 14, "N" => 15, "HOME" => 16,
        "CAPTURE" => 17, "MIC" => 18, "LSL" => 19, "RSR" => 20,
        "LSR" => 21, "RSL" => 22, "LTOUCH" => 23, "RTOUCH" => 24,
        "LMINI" => 25, "RMINI" => 26, "MISC1" => 27, "MISC2" => 28,
        "MISC3" => 29, "MISC4" => 30, "MISC5" => 31, "MISC6" => 32,
        "ZL" | "ZLF" | "ZR" | "ZRF" => {
            let side = if button.starts_with("ZL") { "left" } else { "right" };
            return status["triggers"][side].as_f64().unwrap_or(0.0) >= if button.ends_with('F') { 0.99 } else { 0.5 };
        },
        _ => return false,
    };
    status["buttons"].as_u64().unwrap_or(0) & (1u64 << bit) != 0
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn quick_access_is_not_guide_and_triggers_do_not_need_digital_buttons() {
        let device = json!({"status": {"buttons": 1u64 << 27, "triggers": {"left": 1.0}}});
        assert!(pressed(&device, "MISC1"));
        assert!(!pressed(&device, "HOME"));
        assert!(pressed(&device, "ZLF"));
        assert!(!pressed(&device, "ZR"));
    }
}
