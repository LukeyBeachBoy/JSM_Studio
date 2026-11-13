//! Event-driven slot confirmation. No telemetry subscription, focus or input capture.
use std::{sync::Mutex, time::Duration};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

pub const LABEL: &str = "slot-toast";
const WIDTH: f64 = 360.0;
const HEIGHT: f64 = 112.0;
const MARGIN: f64 = 20.0;
#[derive(Clone, Serialize)]
#[serde(rename_all="camelCase")]
pub struct Payload { revision: u64, id: u8, name: String, profile_name: String }
#[derive(Default)]
struct ToastState { revision: u64, ready: bool, pending: Option<Payload> }
static STATE: Mutex<ToastState> = Mutex::new(ToastState { revision: 0, ready: false, pending: None });

fn ensure(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    if let Some(window) = app.get_webview_window(LABEL) { return Ok(window); }
    let window=WebviewWindowBuilder::new(app,LABEL,WebviewUrl::App("slottoast.html".into()))
        .title("JSM Evolved Slot Confirmation").transparent(true).decorations(false)
        .always_on_top(true).skip_taskbar(true).resizable(false).shadow(false)
        .focused(false).focusable(false).visible(false).inner_size(WIDTH,HEIGHT)
        .build().map_err(|error|error.to_string())?;
    let _=window.set_ignore_cursor_events(true);
    Ok(window)
}
fn present(app: &AppHandle, payload: &Payload) {
    let Some(window)=app.get_webview_window(LABEL) else { return };
    if let Some(monitor)=super::overlay::target_monitor(app,&window) {
        let scale=monitor.scale_factor();let area=monitor.work_area();
        let width=(WIDTH*scale).round() as u32;let height=(HEIGHT*scale).round() as u32;
        let margin=(MARGIN*scale).round() as i32;
        let position=tauri::PhysicalPosition::new(
            area.position.x+(area.size.width as i32-width as i32-margin).max(0),
            area.position.y+(area.size.height as i32-height as i32-margin).max(0));
        let _=window.set_position(position);
        let _=window.set_size(tauri::PhysicalSize::new(width,height));
        let _=window.set_position(position);
    }
    let _=app.emit_to(LABEL,"slot-confirmation",payload);
    let _=window.show();let _=window.set_ignore_cursor_events(true);
    super::overlay::refresh_stacking(app);
    let app=app.clone();let revision=payload.revision;
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(3));
        let owner=app.clone();
        let _=app.run_on_main_thread(move || {
            if let Ok(mut state)=STATE.lock() {
                // A newer switch owns the window; an older timeout cannot hide it.
                if state.revision==revision {
                    state.pending=None;
                    if let Some(window)=owner.get_webview_window(LABEL) {let _=window.hide();}
                }
            }
        });
    });
}
pub fn notify(app: &AppHandle, slot: &super::slots::Slot) {
    let app_for_ui=app.clone();let slot=slot.clone();
    let _=app.run_on_main_thread(move || {
        // The preference may have changed while this action was queued.
        let config=super::slots::get();
        if !config.enabled || !config.show_notifications {return;}
        let payload={
            let Ok(mut state)=STATE.lock() else {return};
            state.revision=state.revision.wrapping_add(1);
            let payload=Payload {revision:state.revision,id:slot.id,name:slot.name,profile_name:slot.profile_name.unwrap_or_default()};
            state.pending=Some(payload.clone());payload
        };
        if let Err(error)=ensure(&app_for_ui) {eprintln!("Slot confirmation: {error}");return;}
        if STATE.lock().is_ok_and(|state|state.ready) {present(&app_for_ui,&payload);}
    });
}
/// Called after the WebView subscribes: the first switch cannot lose its event.
pub fn ready(app: &AppHandle) -> Option<Payload> {
    let payload={let mut state=STATE.lock().ok()?;state.ready=true;state.pending.clone()};
    if let Some(payload)=payload.as_ref() {present(app,payload);}
    payload
}
pub fn dismiss(app: &AppHandle) {
    let owner=app.clone();
    let _=app.run_on_main_thread(move || {
        if let Ok(mut state)=STATE.lock() {state.revision=state.revision.wrapping_add(1);state.pending=None;}
        if let Some(window)=owner.get_webview_window(LABEL) {let _=window.hide();}
    });
}
