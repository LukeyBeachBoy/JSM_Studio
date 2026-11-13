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
//!
//! Streaming (Steam Remote Play, Sunshine/Moonlight) captures one display, the
//! one the game is on -- often a virtual display the host created for the
//! client, or the TV rather than the desk monitor. So the overlay follows the
//! foreground window's display every time it is placed, instead of staying on
//! whichever monitor it happened to be created on.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::services::app_state::{AppState, DEFAULT_OVERLAY_INTERVAL_US};

pub const OVERLAY_LABEL: &str = "overlay";

/// Clamped so a bogus report cannot either spin the emitter at megahertz or
/// throttle the overlay below what a 60 Hz panel needs.
const MIN_HZ: u32 = 30;
const MAX_HZ: u32 = 1000;
static DISPLAY_SETTLING: AtomicBool = AtomicBool::new(false);

#[cfg(target_os = "windows")]
mod display_layout {
    use std::time::{Duration, Instant};
    use windows_sys::Win32::{
        Foundation::{HWND, LPARAM, RECT},
        Graphics::Gdi::{EnumDisplayMonitors, HDC, HMONITOR},
        UI::WindowsAndMessaging::{ShowWindowAsync, SW_HIDE, SW_SHOWNOACTIVATE},
    };

    type Layout = Vec<(i32, i32, i32, i32)>;
    #[derive(Default)]
    pub(super) struct Settling { last: Option<Layout>, changed_at: Option<Instant> }
    impl Settling {
        // A burst of monitor changes is one transition. The initial snapshot
        // does not show a disabled overlay or disturb its startup placement.
        pub(super) fn observe(&mut self, next: Layout, now: Instant) -> Option<bool> {
            if self.last.as_ref() != Some(&next) {
                let initial = self.last.is_none();
                self.last = Some(next);
                if initial { return None; }
                let began = self.changed_at.is_none();
                self.changed_at = Some(now);
                return began.then_some(false);
            }
            if self.changed_at.is_some_and(|at| now.duration_since(at) >= Duration::from_millis(750)) {
                self.changed_at = None;
                return Some(true);
            }
            None
        }
    }
    pub(super) fn snapshot() -> Option<Layout> {
        unsafe extern "system" fn visit(_: HMONITOR, _: HDC, rect: *mut RECT, data: LPARAM) -> i32 {
            let rect = unsafe { *rect };
            unsafe { &mut *(data as *mut Layout) }.push((rect.left, rect.top, rect.right, rect.bottom));
            1
        }
        let mut layout = Layout::new();
        // GDI rectangles only: no WebView monitor enumeration, display-mode
        // queries, device reconnection, or controller locks in this path.
        if unsafe { EnumDisplayMonitors(std::ptr::null_mut(), std::ptr::null(), Some(visit), &mut layout as *mut _ as LPARAM) } == 0 {
            return None;
        }
        layout.sort_unstable();
        Some(layout)
    }
    pub(super) fn show(hwnd: HWND, visible: bool) {
        unsafe { ShowWindowAsync(hwnd, if visible { SW_SHOWNOACTIVATE } else { SW_HIDE }); }
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        #[test]
        fn hdmi_burst_hides_once_and_recovers_only_after_settling() {
            let mut state = Settling::default();
            let now = Instant::now();
            let desk = vec![(0, 0, 2560, 1440)];
            let tv = vec![(0, 0, 2560, 1440), (2560, 0, 6400, 2160)];
            assert_eq!(state.observe(desk.clone(), now), None);
            assert_eq!(state.observe(tv, now + Duration::from_millis(250)), Some(false));
            assert_eq!(state.observe(desk.clone(), now + Duration::from_millis(500)), None);
            assert_eq!(state.observe(desk.clone(), now + Duration::from_millis(1000)), None);
            assert_eq!(state.observe(desk.clone(), now + Duration::from_millis(1250)), Some(true));
            assert_eq!(state.observe(desk, now + Duration::from_secs(3)), None);
        }
    }
}

/// Watch actual profile writes, including imported files edited outside Studio.
/// The blocking directory read belongs to its own thread, never the WebView or
/// the mapper. Non-config writes (calibration, icons, diagnostics) are ignored.
pub fn start_config_watch(app: AppHandle) {
    #[cfg(target_os = "windows")]
    std::thread::spawn(move || {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::{
            Foundation::{CloseHandle, INVALID_HANDLE_VALUE},
            Storage::FileSystem::{CreateFileW, ReadDirectoryChangesW, FILE_FLAG_BACKUP_SEMANTICS,
                FILE_LIST_DIRECTORY, FILE_NOTIFY_CHANGE_FILE_NAME, FILE_NOTIFY_CHANGE_LAST_WRITE,
                FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING},
        };
        let Ok(root) = crate::runtime::runtime_dir(&app) else { return };
        let path: Vec<u16> = root.as_os_str().encode_wide().chain(Some(0)).collect();
        unsafe {
            let directory = CreateFileW(path.as_ptr(), FILE_LIST_DIRECTORY,
                FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, std::ptr::null(),
                OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS, std::ptr::null_mut());
            if directory == INVALID_HANDLE_VALUE { eprintln!("Could not watch overlay configurations: {}", std::io::Error::last_os_error()); return; }
            let mut buffer = [0u32; 4096];
            loop {
                let mut bytes = 0;
                if ReadDirectoryChangesW(directory, buffer.as_mut_ptr().cast(), std::mem::size_of_val(&buffer) as u32,
                    1, FILE_NOTIFY_CHANGE_FILE_NAME | FILE_NOTIFY_CHANGE_LAST_WRITE,
                    &mut bytes, std::ptr::null_mut(), None) == 0 { break; }
                let notifications = std::slice::from_raw_parts(buffer.as_ptr().cast::<u8>(), bytes as usize);
                if config_notifications(notifications) {
                    let _ = app.emit_to(OVERLAY_LABEL, "overlay-config-changed", ());
                }
            }
            CloseHandle(directory);
        }
    });
    #[cfg(not(target_os = "windows"))]
    let _ = app;
}

#[cfg(any(target_os = "windows", test))]
fn config_notifications(bytes: &[u8]) -> bool {
    // An overflow has no records: invalidate once rather than miss a change.
    if bytes.is_empty() { return true; }
    let mut offset = 0;
    while let Some(header) = bytes.get(offset..offset + 12) {
        let next = u32::from_le_bytes(header[0..4].try_into().unwrap()) as usize;
        let length = u32::from_le_bytes(header[8..12].try_into().unwrap()) as usize;
        let Some(name) = bytes.get(offset + 12..offset + 12 + length) else { return true };
        let name: Vec<u16> = name.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
        if String::from_utf16_lossy(&name).to_ascii_lowercase().ends_with(".txt") { return true; }
        if next == 0 { break; }
        if next < 12 { return true; }
        offset += next;
    }
    false
}

#[cfg(test)]
mod config_watch_tests {
    use super::config_notifications;
    #[test]
    fn refreshes_imports_but_ignores_runtime_diagnostics() {
        let record = |name: &str| {
            let name: Vec<u8> = name.encode_utf16().flat_map(u16::to_le_bytes).collect();
            let mut bytes = vec![0; 12];
            bytes[8..12].copy_from_slice(&(name.len() as u32).to_le_bytes());
            bytes.extend(name);
            bytes
        };
        assert!(config_notifications(&record("bases\\Shared.TXT")));
        assert!(!config_notifications(&record("window-icons.json")));
        assert!(!config_notifications(&record("GyroCalibration.dat")));
        assert!(config_notifications(&[]));
    }
}

// TOPMOST is a band, not a promise to stay above every other topmost window.
// When a borderless-fullscreen game takes focus the shell promotes it to the
// top of that band, above the overlay and the calibration HUD, and it stays
// there until something raises them again. Tauri's set_always_on_top(true) is
// a no-op once the flag is set, so toggling the overlay never recovered it.
// Keep the repair native: a covered WebView throttles its JS, so it cannot
// reliably rescue itself.
pub fn start_stacking_guard(app: AppHandle) {
    #[cfg(target_os = "windows")]
    std::thread::spawn(move || {
        let mut layout = display_layout::Settling::default();
        loop {
            if let Some(monitors) = display_layout::snapshot() {
                if let Some(ready) = layout.observe(monitors, std::time::Instant::now()) {
                    DISPLAY_SETTLING.store(!ready, Ordering::Relaxed);
                    reset_refresh(&app.state::<AppState>());
                    // Never wait on the WebView's UI thread from this guard or
                    // the foreground hook. HDMI/DPI transitions can stall it.
                    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
                        if let Ok(hwnd) = window.hwnd() {
                            let enabled = app.state::<AppState>().overlay_active.load(Ordering::Relaxed);
                            display_layout::show(hwnd.0 as _, ready && enabled);
                        }
                    }
                    let _ = app.emit_to(OVERLAY_LABEL, "overlay-display-ready", ready);
                }
            }
            refresh_stacking(&app);
            std::thread::sleep(std::time::Duration::from_millis(250));
        }
    });
    #[cfg(not(target_os = "windows"))]
    let _ = app;
}

/// Every window of ours that must stay above a game. Hidden ones are skipped
/// inside `repair`, so this is cheap while nothing is on screen.
const TOPMOST_LABELS: [&str; 4] = [OVERLAY_LABEL, crate::services::hud::HUD_LABEL, crate::services::virtual_keyboard::LABEL, crate::services::slot_toast::LABEL];

/// Raise any of our topmost windows that another window has climbed above.
/// Never shows a hidden window or moves keyboard focus; when nothing covers
/// them it only reads the z-order.
pub fn refresh_stacking(app: &AppHandle) {
    if DISPLAY_SETTLING.load(Ordering::Relaxed) { return; }
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
        SetWindowPos, GWL_EXSTYLE, GW_HWNDPREV, HWND_TOPMOST, SWP_ASYNCWINDOWPOS, SWP_NOACTIVATE,
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
                SWP_ASYNCWINDOWPOS | SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE) == 0 {
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
        // Explicitly capturable: the whole point is that a stream or a
        // recording shows the menu too.
        .content_protected(false)
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
        if !DISPLAY_SETTLING.load(Ordering::Relaxed) { let _ = window.show(); }
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
    if DISPLAY_SETTLING.load(Ordering::Relaxed) { return Err("Display layout is changing".into()); }
    let window = app.get_webview_window(OVERLAY_LABEL).ok_or("Overlay is not prepared")?;
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{SetWindowPos, SWP_ASYNCWINDOWPOS,
            SWP_NOACTIVATE, SWP_NOOWNERZORDER, SWP_NOZORDER};
        let hwnd = window.hwnd().map_err(|error| error.to_string())?;
        // One asynchronous move+resize, not three synchronous cross-thread
        // requests while Windows is negotiating the new HDMI mode and DPI.
        let ok = unsafe { SetWindowPos(hwnd.0 as _, std::ptr::null_mut(), x, y,
            width.clamp(64, i32::MAX as u32) as i32, height.clamp(64, i32::MAX as u32) as i32,
            SWP_ASYNCWINDOWPOS | SWP_NOACTIVATE | SWP_NOZORDER | SWP_NOOWNERZORDER) };
        return if ok != 0 { Ok(()) } else { Err(std::io::Error::last_os_error().to_string()) };
    }
    #[cfg(not(target_os = "windows"))]
    {
    let position = tauri::PhysicalPosition::new(x, y);
    window
        .set_position(position)
        .map_err(|error| format!("Failed to move the overlay: {error}"))?;
    window
        .set_size(tauri::PhysicalSize::new(width.max(64), height.max(64)))
        .map_err(|error| format!("Failed to resize the overlay: {error}"))?;
    // Moving onto a display with a different scale makes Windows resize and
    // nudge the window to its suggested rect for the new DPI. The size above
    // already overrides that; this puts the position back too.
    let _ = window.set_position(position);
    Ok(())
    }
}

/// The display the player is looking at: the one holding the foreground window
/// (the game), falling back to the overlay's own display and then the primary.
/// Physical pixels, plus the display's scale factor so the caller can size a
/// menu for the display it is about to land on rather than the one it left.
pub fn workarea(app: &AppHandle) -> Result<(i32, i32, u32, u32, f64), String> {
    if DISPLAY_SETTLING.load(Ordering::Relaxed) { return Err("Display layout is changing".into()); }
    let window = app.get_webview_window(OVERLAY_LABEL).ok_or("Overlay is not prepared")?;
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::{Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow,
            MONITORINFO, MONITOR_DEFAULTTONEAREST}, UI::{HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI},
            WindowsAndMessaging::GetForegroundWindow}};
        let hwnd = window.hwnd().map_err(|error| error.to_string())?;
        let foreground = unsafe { GetForegroundWindow() };
        let target = if foreground.is_null() { hwnd.0 as _ } else { foreground };
        let monitor = unsafe { MonitorFromWindow(target, MONITOR_DEFAULTTONEAREST) };
        let mut info: MONITORINFO = unsafe { std::mem::zeroed() };
        info.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        if unsafe { GetMonitorInfoW(monitor, &mut info) } == 0 { return Err(std::io::Error::last_os_error().to_string()); }
        let (mut dpi_x, mut dpi_y) = (96, 96);
        unsafe { GetDpiForMonitor(monitor, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y); }
        let bounds = info.rcMonitor;
        return Ok((bounds.left, bounds.top, (bounds.right - bounds.left).max(1) as u32,
            (bounds.bottom - bounds.top).max(1) as u32, dpi_x as f64 / 96.0));
    }
    #[cfg(not(target_os = "windows"))]
    {
    let monitor = target_monitor(app, &window)
        .ok_or_else(|| "No monitor reported for the overlay.".to_string())?;
    let position = monitor.position();
    let size = monitor.size();
    Ok((
        position.x,
        position.y,
        size.width,
        size.height,
        monitor.scale_factor(),
    ))
    }
}

/// Shared with the calibration HUD, which wants the same display.
pub fn target_monitor(app: &AppHandle, window: &tauri::WebviewWindow) -> Option<tauri::Monitor> {
    foreground_monitor(app)
        .or_else(|| window.current_monitor().ok().flatten())
        .or_else(|| window.primary_monitor().ok().flatten())
}

#[cfg(target_os = "windows")]
fn foreground_monitor(app: &AppHandle) -> Option<tauri::Monitor> {
    use windows_sys::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONULL,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

    let foreground = unsafe { GetForegroundWindow() };
    if foreground.is_null() {
        return None;
    }
    let handle = unsafe { MonitorFromWindow(foreground, MONITOR_DEFAULTTONULL) };
    if handle.is_null() {
        return None;
    }
    let mut info: MONITORINFO = unsafe { std::mem::zeroed() };
    info.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
    if unsafe { GetMonitorInfoW(handle, &mut info) } == 0 {
        return None;
    }
    // Tauri reports monitors by their top-left corner in the same virtual
    // screen coordinates, which is enough to match one up.
    let (left, top) = (info.rcMonitor.left, info.rcMonitor.top);
    app.available_monitors()
        .ok()?
        .into_iter()
        .find(|monitor| monitor.position().x == left && monitor.position().y == top)
}

#[cfg(not(target_os = "windows"))]
fn foreground_monitor(_app: &AppHandle) -> Option<tauri::Monitor> {
    None
}
