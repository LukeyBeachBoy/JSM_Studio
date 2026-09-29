//! The one tray icon, for Studio and the mapper both.
//!
//! JoyShockMapper used to put up its own icon beside Studio's. Studio now
//! launches it with `--no-tray` and carries the actions worth having here
//! instead, so there is one icon: left-click opens Studio, right-click opens
//! this menu.
//!
//! The menu is a WebView window rather than a Win32 popup menu so it can look
//! like the rest of Studio (a Steam-style card, not a grey system menu). It is
//! built hidden at startup -- a WebView costs around 100ms to create, which a
//! right-click should not wait on -- and hides again the moment it loses focus,
//! which is how a native menu dismisses.
//!
//! Opening is a two-step handshake: the icon's click tells the page to refresh
//! (`tray-menu-open`), the page measures itself and calls `tray_menu_place`
//! with its size, and only then is the window placed beside the cursor and
//! shown. Placing it before the page has laid out would flash the old size.

use std::sync::Mutex;

use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder,
};

pub const TRAY_MENU_LABEL: &str = "traymenu";

/// Where the last right-click happened, in physical pixels; the menu grows up
/// and to the left of it, as the taskbar's own menus do.
static ANCHOR: Mutex<Option<(f64, f64)>> = Mutex::new(None);

fn build(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    WebviewWindowBuilder::new(app, TRAY_MENU_LABEL, WebviewUrl::App("traymenu.html".into()))
        .title("JSM Evolved")
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .visible(false)
        .inner_size(300.0, 420.0)
        .build()
        .map_err(|error| format!("Failed to create the tray menu: {error}"))
}

pub fn ensure(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    if let Some(window) = app.get_webview_window(TRAY_MENU_LABEL) {
        return Ok(window);
    }
    build(app)
}

/// The icon itself. Called once from setup.
pub fn install(app: &AppHandle) -> tauri::Result<()> {
    if let Err(error) = ensure(app) {
        eprintln!("{error}");
    }
    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().cloned().expect("bundled tray icon"))
        .tooltip("JSM Evolved")
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            // Act on release, as Windows' own icons do: opening on press lets
            // the release land on the freshly shown menu.
            if let TrayIconEvent::Click { button, button_state: MouseButtonState::Up, position, .. } = event {
                let app = tray.app_handle();
                match button {
                    MouseButton::Left => {
                        hide(app);
                        crate::show_main_window(app);
                    }
                    MouseButton::Right => open(app, position.x, position.y),
                    _ => {}
                }
            }
        })
        .build(app)?;
    Ok(())
}

fn open(app: &AppHandle, x: f64, y: f64) {
    if let Ok(mut anchor) = ANCHOR.lock() {
        *anchor = Some((x, y));
    }
    match ensure(app) {
        Ok(window) => {
            let _ = window.emit("tray-menu-open", ());
        }
        Err(error) => eprintln!("{error}"),
    }
}

pub fn hide(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(TRAY_MENU_LABEL) {
        let _ = window.hide();
    }
}

/// Sizes the menu to its content (CSS pixels), places it beside the cursor,
/// kept inside the work area of the display the cursor is on, and shows it.
pub fn place(app: &AppHandle, width: f64, height: f64) -> Result<(), String> {
    let window = ensure(app)?;
    let (x, y) = ANCHOR.lock().ok().and_then(|anchor| *anchor).unwrap_or((0.0, 0.0));
    let monitor = app
        .monitor_from_point(x, y)
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());
    let scale = monitor.as_ref().map(|m| m.scale_factor()).unwrap_or(1.0);
    window
        .set_size(LogicalSize::new(width, height))
        .map_err(|error| error.to_string())?;
    let (w, h) = ((width * scale).round() as i32, (height * scale).round() as i32);
    let (mut left, mut top) = (x.round() as i32 - w, y.round() as i32 - h);
    if let Some(monitor) = monitor {
        let area = monitor.work_area();
        let (min_x, min_y) = (area.position.x, area.position.y);
        let (max_x, max_y) = (min_x + area.size.width as i32, min_y + area.size.height as i32);
        // Flip to the right of the cursor when there is no room on the left
        // (a taskbar docked on the left edge), and below it for one on top.
        if left < min_x {
            left = x.round() as i32;
        }
        if top < min_y {
            top = y.round() as i32;
        }
        left = left.clamp(min_x, (max_x - w).max(min_x));
        top = top.clamp(min_y, (max_y - h).max(min_y));
    }
    window
        .set_position(PhysicalPosition::new(left, top))
        .map_err(|error| error.to_string())?;
    window.show().map_err(|error| error.to_string())?;
    // Focus is what lets the blur below dismiss it; Windows only hands focus
    // to a background app's window this soon after a click on its icon.
    let _ = window.set_focus();
    Ok(())
}
