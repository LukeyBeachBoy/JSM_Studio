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

// TOPMOST is a band, not a promise to stay above every other topmost window.
// When a borderless-fullscreen game takes focus the shell promotes it to the
// top of that band, above the overlay and the calibration HUD, and it stays
// there until something raises them again. Tauri's set_always_on_top(true) is
// a no-op once the flag is set, so toggling the overlay never recovered it.
// Keep the repair native: a covered WebView throttles its JS, so it cannot
// reliably rescue itself.
pub fn start_stacking_guard(app: AppHandle) {
    #[cfg(target_os = "windows")]
    std::thread::spawn(move || loop {
        refresh_stacking(&app);
        std::thread::sleep(std::time::Duration::from_millis(250));
    });
    #[cfg(not(target_os = "windows"))]
    let _ = app;
}

/// Every window of ours that must stay above a game. Hidden ones are skipped
/// inside `repair`, so this is cheap while nothing is on screen.
const TOPMOST_LABELS: [&str; 3] = [OVERLAY_LABEL, crate::services::hud::HUD_LABEL, crate::services::virtual_keyboard::LABEL];

/// Raise any of our topmost windows that another window has climbed above.
/// Never shows a hidden window or moves keyboard focus; when nothing covers
/// them it only reads the z-order.
pub fn refresh_stacking(app: &AppHandle) {
    #[cfg(target_os = "windows")]
    for label in TOPMOST_LABELS {
        if let Some(window) = app.get_webview_window(label) {
            if let Ok(hwnd) = window.hwnd() {
                if let Err(error) = stacking::repair(hwnd.0 as _) {
                    eprintln!("Could not restore {label} stacking: {error}");
                }
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    let _ = app;
}

#[cfg(target_os = "windows")]
mod stacking {
    use windows_sys::Win32::{Foundation::{HWND, RECT}, UI::WindowsAndMessaging::{
        GetWindow, GetWindowLongPtrW, GetWindowRect, IsIconic, IsWindowVisible,
        SetWindowPos, GWL_EXSTYLE, GW_HWNDPREV, HWND_TOPMOST, SWP_NOACTIVATE,
        SWP_NOMOVE, SWP_NOSIZE, WS_EX_TOPMOST, WS_EX_TRANSPARENT,
    }};

    fn overlaps(a: RECT, b: RECT) -> bool {
        a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
    }

    pub(super) fn repair(hwnd: HWND) -> Result<bool, std::io::Error> {
        // HWNDs belong to live Tauri windows. Windows safely rejects a handle
        // destroyed between this check and SetWindowPos during app shutdown.
        unsafe {
            if IsWindowVisible(hwnd) == 0 || IsIconic(hwnd) != 0 { return Ok(false); }
            let mut bounds = std::mem::zeroed();
            if GetWindowRect(hwnd, &mut bounds) == 0 { return Err(std::io::Error::last_os_error()); }
            let mut covered = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32 & WS_EX_TOPMOST == 0;
            let mut above = GetWindow(hwnd, GW_HWNDPREV);
            // Bound the walk because other applications can rearrange windows
            // concurrently. Ignore click-through overlays (Discord etc.) so
            // two overlays do not endlessly fight over the topmost slot.
            for _ in 0..256 {
                if covered || above.is_null() { break; }
                let style = GetWindowLongPtrW(above, GWL_EXSTYLE) as u32;
                let mut other = std::mem::zeroed();
                if style & WS_EX_TRANSPARENT == 0 && IsWindowVisible(above) != 0
                    && IsIconic(above) == 0 && GetWindowRect(above, &mut other) != 0
                    && overlaps(bounds, other) {
                    covered = true;
                    break;
                }
                above = GetWindow(above, GW_HWNDPREV);
            }
            if !covered { return Ok(false); }
            if SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0,
                SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE) == 0 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(true)
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            CreateWindowExW, DestroyWindow, GetForegroundWindow, ShowWindow,
            SW_HIDE, WS_POPUP, SWP_SHOWWINDOW,
        };

        // Real Win32 windows: re-create the game's promotion into the topmost
        // band, then prove repair preserves focus and leaves hidden overlays off.
        #[test]
        fn restores_overlay_above_topmost_game_without_taking_focus() {
            struct Window(HWND);
            impl Drop for Window { fn drop(&mut self) { unsafe { DestroyWindow(self.0); } } }
            unsafe {
                let class: Vec<u16> = "STATIC\0".encode_utf16().collect();
                let make = |extra| {
                    let h = CreateWindowExW(WS_EX_TOPMOST | extra, class.as_ptr(), class.as_ptr(),
                        WS_POPUP, -30000, -30000, 80, 80,
                        std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null());
                    assert!(!h.is_null());
                    // Show without activating, off screen.
                    SetWindowPos(h, HWND_TOPMOST, 0, 0, 0, 0,
                        SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
                    Window(h)
                };
                let overlay = make(WS_EX_TRANSPARENT);
                let game = make(0);
                let focus = GetForegroundWindow();
                for _ in 0..5 {
                    assert_ne!(SetWindowPos(game.0, HWND_TOPMOST, 0, 0, 0, 0,
                        SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE), 0);
                    assert!(repair(overlay.0).unwrap());
                    assert!(!repair(overlay.0).unwrap(), "no repeated raises when already above the game");
                    assert_eq!(GetForegroundWindow(), focus);
                }
                let other_overlay = make(WS_EX_TRANSPARENT);
                assert!(!repair(overlay.0).unwrap(), "click-through overlays must not cause a z-order fight");
                drop(other_overlay);
                ShowWindow(overlay.0, SW_HIDE);
                assert!(!repair(overlay.0).unwrap());
                assert_eq!(IsWindowVisible(overlay.0), 0);
            }
        }
    }
}

fn build(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    WebviewWindowBuilder::new(app, OVERLAY_LABEL, WebviewUrl::App("overlay.html".into()))
        .title("JSM Evolved Overlay")
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
        let _ = window.set_ignore_cursor_events(true);
        // set_always_on_top(true) would be a no-op here: the flag never went
        // away. What can have changed is the z-order under it.
        refresh_stacking(app);
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
