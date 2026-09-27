//! Whether Studio is the app in front, from Windows' own foreground events.
//!
//! Studio sends the UI live telemetry, and takes the controller for its own
//! navigation, only while it is in front (`telemetry_ui_active`,
//! `commands::studio_focus_changed`). That used to follow the window's
//! Focused event, which tao raises from the top-level window's keyboard focus
//! -- and the page lives in WebView2's child window. Clicking into the page, or
//! a launch that never gave the top-level window focus, reported Studio as not
//! in front while it plainly was: the UI stopped receiving telemetry, so a
//! controller switched on did not appear until a trip to another app and back
//! raised Focused(true) again.
//!
//! Windows says when the foreground window changes (EVENT_SYSTEM_FOREGROUND),
//! and the foreground window's process is the plain answer to "is Studio in
//! front". The overlay and the calibration HUD are ours too, but they are
//! click-through and never become the foreground window.

use std::sync::atomic::{AtomicBool, Ordering::Relaxed};
use std::sync::OnceLock;
use tauri::{AppHandle, Manager};

use crate::services::app_state::AppState;

static APP: OnceLock<AppHandle> = OnceLock::new();
static IN_FRONT: AtomicBool = AtomicBool::new(false);
static KNOWN: AtomicBool = AtomicBool::new(false);

/// A change of foreground: record it and hand the controller over. The first
/// answer counts as a change, so a launch straight into Studio is handled
/// without waiting for anything else to move.
fn settle(app: &AppHandle, in_front: bool) {
    let known = KNOWN.swap(true, Relaxed);
    if known && IN_FRONT.swap(in_front, Relaxed) == in_front {
        return;
    }
    IN_FRONT.store(in_front, Relaxed);
    app.state::<AppState>().telemetry_ui_active.store(in_front, Relaxed);
    let handle = app.clone();
    std::thread::spawn(move || crate::commands::studio_focus_changed(&handle, in_front));
}

#[cfg(target_os = "windows")]
mod win {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::Accessibility::{SetWinEventHook, HWINEVENTHOOK};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        DispatchMessageW, GetForegroundWindow, GetMessageW, GetWindowThreadProcessId, TranslateMessage,
        EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_MINIMIZEEND, EVENT_SYSTEM_MINIMIZESTART, MSG, WINEVENT_OUTOFCONTEXT,
    };

    pub fn is_ours(window: HWND) -> bool {
        if window.is_null() {
            return false;
        }
        let mut pid = 0u32;
        unsafe { GetWindowThreadProcessId(window, &mut pid) };
        pid == std::process::id()
    }

    pub fn foreground_is_ours() -> bool {
        is_ours(unsafe { GetForegroundWindow() })
    }

    unsafe extern "system" fn on_event(_hook: HWINEVENTHOOK, _event: u32, _window: HWND, _object: i32, _child: i32, _thread: u32, _time: u32) {
        // Minimising Studio does not always change the foreground window, so
        // every one of these asks the same question afresh.
        if let Some(app) = super::APP.get() {
            // Every transition matters, including game -> desktop -> game:
            // both are "not Studio", but a topmost game can cover the overlay.
            crate::services::overlay::refresh_stacking(app);
            super::settle(app, foreground_is_ours());
        }
    }

    /// Out-of-context hooks are delivered through this thread's message
    /// queue, so it pumps one for the life of the app. It sleeps in
    /// GetMessage between events.
    pub fn run() {
        unsafe {
            let foreground = SetWinEventHook(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND, std::ptr::null_mut(), Some(on_event), 0, 0, WINEVENT_OUTOFCONTEXT);
            let minimize = SetWinEventHook(EVENT_SYSTEM_MINIMIZESTART, EVENT_SYSTEM_MINIMIZEEND, std::ptr::null_mut(), Some(on_event), 0, 0, WINEVENT_OUTOFCONTEXT);
            if foreground.is_null() && minimize.is_null() {
                eprintln!("Could not watch the foreground window; Studio will not know when it is in front.");
                return;
            }
            // Ask again now the hooks exist. start() asked before the main
            // window was shown, and a window that came to the front between
            // that and these hooks raised its event before anyone listened --
            // leaving a launch straight into Studio marked as "not in front"
            // until the next trip to another app and back.
            if let Some(app) = super::APP.get() {
                super::settle(app, foreground_is_ours());
            }
            let mut message: MSG = std::mem::zeroed();
            while GetMessageW(&mut message, std::ptr::null_mut(), 0, 0) > 0 {
                TranslateMessage(&message);
                DispatchMessageW(&message);
            }
        }
    }
}

/// Starts following the foreground window: the answer now, then every change.
#[cfg(target_os = "windows")]
pub fn start(app: AppHandle) {
    if APP.set(app.clone()).is_err() {
        return;
    }
    settle(&app, win::foreground_is_ours());
    std::thread::spawn(win::run);
}

/// Elsewhere the window's Focused event is all there is (lib.rs).
#[cfg(not(target_os = "windows"))]
pub fn start(_app: AppHandle) {}

/// Whether the window event should drive the in-front state: only where this
/// watcher cannot.
pub const FOLLOW_WINDOW_EVENTS: bool = !cfg!(target_os = "windows");
