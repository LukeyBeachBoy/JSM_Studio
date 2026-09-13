//! The trackpad overlay window.
//!
//! A transparent, click-through, always-on-top window that draws the active
//! trackpad menu while a thumb is on the pad. It is a plain top-level OS window:
//! it does not attach to, hook, or inject anything into the game. The only data
//! it consumes is the controller telemetry JoyShockMapper already broadcasts on
//! loopback UDP, so from the game's point of view nothing exists at all. The
//! cost of that choice is that Windows will not composite an always-on-top
//! window over a game in EXCLUSIVE fullscreen -- borderless windowed is
//! required. Drawing over exclusive fullscreen means hooking the game's
//! present chain, which is exactly the thing worth avoiding.

use std::sync::atomic::Ordering;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::services::app_state::{AppState, DEFAULT_OVERLAY_INTERVAL_US};

pub const OVERLAY_LABEL: &str = "overlay";

/// Clamped so a bogus report cannot either spin the emitter at megahertz or
/// throttle the overlay below what a 60 Hz panel needs.
const MIN_HZ: u32 = 30;
const MAX_HZ: u32 = 1000;

fn build(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    WebviewWindowBuilder::new(app, OVERLAY_LABEL, WebviewUrl::App("overlay.html".into()))
        .title("JSM Studio Overlay")
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .focused(false)
        .visible(false)
        .inner_size(520.0, 520.0)
        .build()
        .map_err(|error| format!("Failed to create the overlay window: {error}"))
}

/// Idempotent: returns the existing overlay window if one is already open.
pub fn ensure(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        return Ok(window);
    }
    let window = build(app)?;
    // Never take a click away from the game underneath. The overlay is read,
    // not operated: selection happens on the trackpad itself.
    let _ = window.set_ignore_cursor_events(true);
    // `.visible(false)` on the builder is not enough: Tauri presents the window
    // once its webview finishes loading, which left a topmost window sitting
    // over everything from startup. Harmless in practice -- click-through, and
    // its content is fully transparent until a menu is active -- but an
    // always-on-top window nobody asked for is exactly the kind of thing that
    // surprises screen capture and fullscreen detection. Hide it explicitly.
    let _ = window.hide();
    Ok(window)
}

pub fn set_enabled(app: &AppHandle, state: &AppState, enabled: bool) -> Result<(), String> {
    if enabled {
        let window = ensure(app)?;
        let _ = window.show();
        // Re-assert after showing: some window managers drop the flag when a
        // hidden window is first presented.
        let _ = window.set_always_on_top(true);
        let _ = window.set_ignore_cursor_events(true);
    } else {
        if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
            let _ = window.hide();
        }
        // Drop the measured rate with the window. If the overlay comes back on a
        // different monitor, a stale 240 from the old one would either waste
        // emits or, on a faster panel, cap it below what it can show.
        reset_refresh(state);
    }
    state.overlay_active.store(enabled, Ordering::Relaxed);
    Ok(())
}

/// The overlay measures its own display's refresh rate and reports it, so the
/// emitter matches the panel instead of the 60 Hz the main UI is capped to.
pub fn set_refresh_hz(state: &AppState, hz: u32) {
    let hz = hz.clamp(MIN_HZ, MAX_HZ);
    state
        .overlay_interval_us
        .store((1_000_000 / hz as u64).max(1), Ordering::Relaxed);
}

pub fn reset_refresh(state: &AppState) {
    state
        .overlay_interval_us
        .store(DEFAULT_OVERLAY_INTERVAL_US, Ordering::Relaxed);
}

/// Position and size in physical screen pixels, so a config can pin each pad's
/// menu wherever the user wants it rather than assuming one blob in the middle.
pub fn set_bounds(app: &AppHandle, x: i32, y: i32, width: u32, height: u32) -> Result<(), String> {
    let window = ensure(app)?;
    window
        .set_position(tauri::PhysicalPosition::new(x, y))
        .map_err(|error| format!("Failed to move the overlay: {error}"))?;
    window
        .set_size(tauri::PhysicalSize::new(width.max(64), height.max(64)))
        .map_err(|error| format!("Failed to resize the overlay: {error}"))?;
    Ok(())
}

/// The work area of the monitor the overlay is on, so the frontend can turn the
/// fractional positions a config stores into real pixels.
pub fn workarea(app: &AppHandle) -> Result<(i32, i32, u32, u32), String> {
    let window = ensure(app)?;
    let monitor = window
        .current_monitor()
        .map_err(|error| format!("Failed to read the monitor: {error}"))?
        .or_else(|| window.primary_monitor().ok().flatten())
        .ok_or_else(|| "No monitor reported for the overlay.".to_string())?;
    let position = monitor.position();
    let size = monitor.size();
    Ok((position.x, position.y, size.width, size.height))
}
