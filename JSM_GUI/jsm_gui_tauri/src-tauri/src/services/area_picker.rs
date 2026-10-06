//! The mouse-area picker: a window the size of one monitor, over whatever is
//! on it (a borderless game included -- see overlay.rs for why exclusive
//! fullscreen is out of reach), on which the user drags the rectangle a
//! MOUSE_AREA trackpad should drive the cursor inside. Studio's "draw it on
//! the screen" answer to Steam Input's mouse-region sliders.
//!
//! Unlike the overlay and the HUD this window TAKES input: it is not
//! click-through and it is focused, because drawing is done with the mouse
//! and Esc/Enter have to reach it. It is modal in spirit -- open, draw, done
//! -- and the main window is minimised for the duration so the game, not
//! Studio, is what shows through the glass.
//!
//! The result goes back as FRACTIONS of the monitor (left, top, width,
//! height, each 0..1), never pixels: that is what the mapper stores in
//! TOUCHPAD_AREA, so one profile lands on the same part of a 1080p monitor
//! and a 4K TV.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Monitor, WebviewUrl, WebviewWindowBuilder};

pub const AREA_PICKER_LABEL: &str = "areapicker";
const MAIN_LABEL: &str = "main";
const OPEN_EVENT: &str = "area-picker-open";
const PICKED_EVENT: &str = "mouse-area-picked";

/// A rectangle as fractions of a monitor.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct AreaRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// What the editor asked the picker to do: which pad the area is for, the
/// area it already has (so it can be adjusted rather than redrawn), how the
/// pad is laid over it, and the pad's shape for the UNIFORM ghost.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AreaRequest {
    pub pad: String,
    pub area: Option<AreaRect>,
    #[serde(default)]
    pub fit: String,
    #[serde(default = "default_pad_aspect")]
    pub pad_aspect: f64,
}

fn default_pad_aspect() -> f64 {
    1.0
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PickerMonitor {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale: f64,
    pub index: usize,
    pub count: usize,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PickerState {
    pub request: AreaRequest,
    pub monitor: PickerMonitor,
}

/// What the main window receives when the picker finishes. `area` is None
/// when the user cancelled, so the editor can stop any "picking…" state.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PickedPayload {
    pub pad: String,
    pub area: Option<AreaRect>,
}

struct Session {
    request: AreaRequest,
    monitor_index: usize,
    /// Whether Studio's window was minimised by us, so closing puts it back
    /// only when it has somewhere to come back from.
    minimised_main: bool,
}

static SESSION: Mutex<Option<Session>> = Mutex::new(None);

fn build(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    WebviewWindowBuilder::new(app, AREA_PICKER_LABEL, WebviewUrl::App("areapicker.html".into()))
        .title("JSM Evolved Mouse Area")
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .visible(false)
        .inner_size(640.0, 480.0)
        .build()
        .map_err(|error| format!("Failed to create the mouse area picker: {error}"))
}

fn ensure(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    if let Some(window) = app.get_webview_window(AREA_PICKER_LABEL) {
        return Ok(window);
    }
    build(app)
}

fn monitors(app: &AppHandle) -> Vec<Monitor> {
    app.available_monitors().unwrap_or_default()
}

/// The monitor to open on: the one under the mouse, which is where the user
/// is working, falling back to the primary.
fn monitor_under_cursor(app: &AppHandle, list: &[Monitor]) -> usize {
    if let Ok(point) = app.cursor_position() {
        if let Ok(Some(monitor)) = app.monitor_from_point(point.x, point.y) {
            if let Some(index) = list.iter().position(|candidate| candidate.position() == monitor.position()) {
                return index;
            }
        }
    }
    if let Ok(Some(primary)) = app.primary_monitor() {
        if let Some(index) = list.iter().position(|candidate| candidate.position() == primary.position()) {
            return index;
        }
    }
    0
}

fn describe(monitor: &Monitor, index: usize, count: usize) -> PickerMonitor {
    PickerMonitor {
        x: monitor.position().x,
        y: monitor.position().y,
        width: monitor.size().width,
        height: monitor.size().height,
        scale: monitor.scale_factor(),
        index,
        count,
    }
}

/// Covers exactly one monitor, in physical pixels.
fn cover(window: &tauri::WebviewWindow, monitor: &Monitor) -> Result<(), String> {
    window
        .set_position(tauri::PhysicalPosition::new(monitor.position().x, monitor.position().y))
        .map_err(|error| format!("Failed to place the mouse area picker: {error}"))?;
    window
        .set_size(tauri::PhysicalSize::new(monitor.size().width.max(64), monitor.size().height.max(64)))
        .map_err(|error| format!("Failed to size the mouse area picker: {error}"))?;
    Ok(())
}

fn current_state(app: &AppHandle) -> Option<PickerState> {
    let session = SESSION.lock().ok()?;
    let session = session.as_ref()?;
    let list = monitors(app);
    let monitor = list.get(session.monitor_index)?;
    Some(PickerState { request: session.request.clone(), monitor: describe(monitor, session.monitor_index, list.len()) })
}

/// Opens the picker for `request`. Idempotent for a picker already open: the
/// request is replaced and the window re-announced.
pub fn open(app: &AppHandle, request: AreaRequest) -> Result<PickerState, String> {
    let list = monitors(app);
    if list.is_empty() {
        return Err("No monitor reported; cannot draw a mouse area.".to_string());
    }
    let index = monitor_under_cursor(app, &list);
    let window = ensure(app)?;
    cover(&window, &list[index])?;

    let mut minimised_main = false;
    if let Some(main) = app.get_webview_window(MAIN_LABEL) {
        // Studio out of the way, so what shows through the glass is the game.
        // Only when it is actually showing: a Studio already in the tray has
        // nothing to be minimised from and nothing to be restored to.
        if main.is_visible().unwrap_or(false) && !main.is_minimized().unwrap_or(false) {
            minimised_main = main.minimize().is_ok();
        }
    }

    if let Ok(mut session) = SESSION.lock() {
        *session = Some(Session { request: request.clone(), monitor_index: index, minimised_main });
    }

    let _ = window.set_ignore_cursor_events(false);
    let _ = window.show();
    let _ = window.set_focus();
    let state = PickerState { request, monitor: describe(&list[index], index, list.len()) };
    // A picker that already exists is listening; one just built asks for the
    // state itself once it has loaded (area_picker_state), so missing this
    // emit costs nothing.
    let _ = app.emit_to(AREA_PICKER_LABEL, OPEN_EVENT, state.clone());
    Ok(state)
}

/// What the picker should be showing right now. None when it is not open.
pub fn state(app: &AppHandle) -> Option<PickerState> {
    current_state(app)
}

/// Moves the picker to the next monitor along, for a game on a screen other
/// than the one the mouse was on.
pub fn next_monitor(app: &AppHandle) -> Result<Option<PickerState>, String> {
    let list = monitors(app);
    if list.len() < 2 {
        return Ok(current_state(app));
    }
    let next = {
        let mut session = SESSION.lock().map_err(|_| "Picker state is poisoned.".to_string())?;
        let Some(session) = session.as_mut() else { return Ok(None) };
        session.monitor_index = (session.monitor_index + 1) % list.len();
        session.monitor_index
    };
    let window = ensure(app)?;
    cover(&window, &list[next])?;
    let _ = window.set_focus();
    let state = current_state(app);
    if let Some(state) = &state {
        let _ = app.emit_to(AREA_PICKER_LABEL, OPEN_EVENT, state.clone());
    }
    Ok(state)
}

/// Closes the picker. `area` is the rectangle kept, or None for a cancel;
/// either way the main window learns the outcome and comes back.
pub fn close(app: &AppHandle, area: Option<AreaRect>) -> Result<(), String> {
    let session = SESSION.lock().ok().and_then(|mut session| session.take());
    if let Some(window) = app.get_webview_window(AREA_PICKER_LABEL) {
        let _ = window.hide();
    }
    let Some(session) = session else { return Ok(()) };
    let payload = PickedPayload { pad: session.request.pad.clone(), area: area.map(sanitize) };
    if session.minimised_main {
        crate::show_main_window(app);
    } else if let Some(main) = app.get_webview_window(MAIN_LABEL) {
        let _ = main.set_focus();
    }
    let _ = app.emit_to(MAIN_LABEL, PICKED_EVENT, payload);
    Ok(())
}

/// A rectangle entirely on its monitor and no smaller than a few pixels, in
/// the same spirit as the mapper's own touch_area::sanitize.
fn sanitize(rect: AreaRect) -> AreaRect {
    const MIN: f64 = 0.005;
    let clamp = |v: f64| if v.is_finite() { v.clamp(0.0, 1.0) } else { 0.0 };
    let x = clamp(rect.x);
    let y = clamp(rect.y);
    let w = clamp(rect.w).max(MIN).min(1.0 - x).max(MIN);
    let h = clamp(rect.h).max(MIN).min(1.0 - y).max(MIN);
    let x = x.min(1.0 - w);
    let y = y.min(1.0 - h);
    AreaRect { x, y, w, h }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_keeps_a_rect_on_screen() {
        let r = sanitize(AreaRect { x: 0.9, y: -0.5, w: 0.5, h: 0.3 });
        assert!((r.x - 0.9).abs() < 1e-9 && r.y == 0.0 && (r.w - 0.1).abs() < 1e-9 && (r.h - 0.3).abs() < 1e-9);
        let r = sanitize(AreaRect { x: 1.0, y: 1.0, w: 0.0, h: 0.0 });
        assert!(r.w > 0.0 && r.h > 0.0 && r.x + r.w <= 1.0 + 1e-9 && r.y + r.h <= 1.0 + 1e-9);
        let r = sanitize(AreaRect { x: f64::NAN, y: 0.0, w: 1.0, h: 1.0 });
        assert_eq!(r, AreaRect { x: 0.0, y: 0.0, w: 1.0, h: 1.0 });
    }
}
