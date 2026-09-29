//! The calibration HUD: a small always-on-top, click-through window that shows
//! CALIBRATE_GYRO's countdown and progress over whatever is on screen, games
//! included (borderless windowed -- see overlay.rs for why exclusive fullscreen
//! is out of reach without hooking the game).
//!
//! It is its own window rather than part of the trackpad overlay because that
//! window is sized and placed per menu and hidden while the overlay is off, and
//! calibration has to be visible either way. It is driven entirely by the
//! `gyroCal` block JoyShockMapper puts in every telemetry packet, so it shows
//! the same thing whatever started the run: the Studio button, a chord or a
//! binding.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::services::app_state::AppState;
use crate::services::telemetry::{emit_calibration_status, CalibrationStatusPayload};

pub const HUD_LABEL: &str = "hud";

const WIDTH: f64 = 380.0;
const HEIGHT: f64 = 150.0;
const TOP_MARGIN: f64 = 48.0;
/// The widget's own frame rate while a run is on screen; the progress bar is
/// eased in CSS, so this only has to keep the numbers honest.
const EMIT_INTERVAL: Duration = Duration::from_millis(33);
/// How long "Calibrated" stays up once the run finishes.
const LINGER: Duration = Duration::from_millis(1600);

#[derive(Default)]
struct HudState {
    phase: i64,
    second: Option<i64>,
    visible: bool,
    last_emit: Option<Instant>,
    finished_at: Option<Instant>,
}

static HUD: Mutex<Option<HudState>> = Mutex::new(None);

fn build(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    WebviewWindowBuilder::new(app, HUD_LABEL, WebviewUrl::App("hud.html".into()))
        .title("JSM Evolved Calibration")
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .focused(false)
        .visible(false)
        .inner_size(WIDTH, HEIGHT)
        .build()
        .map_err(|error| format!("Failed to create the calibration HUD: {error}"))
}

/// Idempotent. Created hidden at startup so the first calibration does not pay
/// for creating a WebView, for the same reason the overlay is.
pub fn ensure(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    if let Some(window) = app.get_webview_window(HUD_LABEL) {
        return Ok(window);
    }
    let window = build(app)?;
    let _ = window.set_ignore_cursor_events(true);
    let _ = window.hide();
    Ok(window)
}

fn show(app: &AppHandle) {
    // Preferences can turn the HUD off; the run and Studio's countdown go on.
    if crate::runtime::read_runtime_mapping_state(app).is_ok_and(|state| !state.calibration_hud_enabled) {
        return;
    }
    let Ok(window) = ensure(app) else { return };
    // Top centre of the primary display: where a notification would be, and
    // clear of the middle of the screen the player is aiming at.
    if let Ok(Some(monitor)) = window.primary_monitor() {
        let scale = monitor.scale_factor();
        let width = (WIDTH * scale).round() as i32;
        let x = monitor.position().x + (monitor.size().width as i32 - width) / 2;
        let y = monitor.position().y + (TOP_MARGIN * scale).round() as i32;
        let _ = window.set_size(tauri::LogicalSize::new(WIDTH, HEIGHT));
        let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
    }
    let _ = window.show();
    let _ = window.set_ignore_cursor_events(true);
    // A fullscreen game may have climbed above us since the last run
    // (overlay.rs, start_stacking_guard).
    crate::services::overlay::refresh_stacking(app);
}

fn hide(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(HUD_LABEL) {
        let _ = window.hide();
    }
}

/// Called for every telemetry packet. Cheap when nothing is calibrating: one
/// lookup and a comparison.
pub fn on_packet(app: &AppHandle, state: &AppState, packet: &Value) {
    let calibration = packet.get("gyroCal");
    let phase = calibration
        .and_then(|value| value.get("phase"))
        .and_then(Value::as_i64)
        .unwrap_or(0);
    let remaining_ms = calibration
        .and_then(|value| value.get("remainingMs"))
        .and_then(Value::as_i64)
        .unwrap_or(0);
    let total_ms = calibration
        .and_then(|value| value.get("totalMs"))
        .and_then(Value::as_i64)
        .unwrap_or(0);
    // Phase 3: the controller moved and the run was thrown away.
    let reached = calibration
        .and_then(|value| value.get("reached"))
        .and_then(Value::as_i64)
        .unwrap_or(0);

    let Ok(mut guard) = HUD.lock() else { return };
    let hud = guard.get_or_insert_with(HudState::default);
    let now = Instant::now();

    if phase != 0 {
        hud.finished_at = None;
        if !hud.visible {
            show(app);
            hud.visible = true;
        }
        let phase_changed = phase != hud.phase;
        hud.phase = phase;
        if phase_changed || hud.last_emit.map_or(true, |at| now.saturating_duration_since(at) >= EMIT_INTERVAL) {
            let _ = app.emit_to(
                HUD_LABEL,
                "hud-calibration",
                json!({ "phase": phase, "remainingMs": remaining_ms, "totalMs": total_ms, "reached": reached }),
            );
            hud.last_emit = Some(now);
        }
        if phase_changed && phase == 3 {
            let _ = app.emit("gyro-calibration-result", json!({ "ok": false, "reason": "moved", "reached": reached }));
        }
        // The in-app countdown pill, once a second rather than at frame rate.
        // A cancelled run has nothing left to count down.
        if phase == 3 {
            if phase_changed {
                hud.second = None;
                let _ = crate::services::telemetry::stop_calibration_countdown(app, state);
            }
            return;
        }
        // The packet's number is whatever the mapper sent; do not let an odd
        // one overflow here.
        let second = remaining_ms.saturating_add(999) / 1000;
        if phase_changed || hud.second != Some(second) {
            hud.second = Some(second);
            let _ = emit_calibration_status(
                app,
                CalibrationStatusPayload {
                    calibrating: true,
                    seconds: Some(second.max(0) as u32),
                },
            );
        }
        return;
    }

    if hud.phase != 0 {
        // Only a run that reached the calibrating phase finished; one cancelled
        // during its countdown just goes away.
        let completed = hud.phase == 2;
        hud.phase = 0;
        hud.second = None;
        hud.finished_at = Some(now);
        let _ = app.emit_to(HUD_LABEL, "hud-calibration", json!({ "phase": 0, "done": completed }));
        if completed {
            let _ = app.emit("gyro-calibration-result", json!({ "ok": true }));
        }
        let _ = crate::services::telemetry::stop_calibration_countdown(app, state);
    }
    if hud.visible && hud.finished_at.map_or(true, |at| now.saturating_duration_since(at) >= LINGER) {
        hide(app);
        hud.visible = false;
    }
}
