use std::{
    net::UdpSocket,
    sync::atomic::Ordering,
    thread,
    time::{Duration, Instant},
};

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

use crate::services::app_state::AppState;

const TELEMETRY_PORT: u16 = 8974;
const TELEMETRY_STALE_MS: u64 = 1500;
const TELEMETRY_HEALTH_CHECK_MS: u64 = 500;
const TELEMETRY_REBIND_DELAY_MS: u64 = 1000;

// Windows reports ICMP "port unreachable" from an earlier datagram as
// WSAECONNRESET on a *later* recv against a bound UDP socket -- so JoyShockMapper
// exiting, or any transient loopback hiccup, could surface as a read error on
// this receiving socket even though nothing is wrong with it. Turning
// SIO_UDP_CONNRESET off is the documented fix; the error simply stops being
// reported. The read loop below also treats it as recoverable, so a platform
// that reports it anyway still cannot kill telemetry.
#[cfg(target_os = "windows")]
fn silence_udp_connection_reset(socket: &UdpSocket) {
    use std::os::windows::io::AsRawSocket;
    use windows_sys::Win32::Networking::WinSock::{WSAIoctl, SIO_UDP_CONNRESET, SOCKET};

    let handle = socket.as_raw_socket() as SOCKET;
    let mut disabled: u32 = 0;
    let mut returned: u32 = 0;
    // Safety: `handle` is a live socket owned by `socket`, and both buffers
    // outlive the call.
    let result = unsafe {
        WSAIoctl(
            handle,
            SIO_UDP_CONNRESET,
            &mut disabled as *mut u32 as *mut core::ffi::c_void,
            std::mem::size_of::<u32>() as u32,
            std::ptr::null_mut(),
            0,
            &mut returned,
            std::ptr::null_mut(),
            None,
        )
    };
    if result != 0 {
        eprintln!("Could not disable UDP connection-reset reporting on the telemetry socket.");
    }
}

#[cfg(not(target_os = "windows"))]
fn silence_udp_connection_reset(_socket: &UdpSocket) {}

/// Errors that say nothing about the socket's health: nothing arrived in time,
/// the call was interrupted, or the OS surfaced an ICMP error from a peer that
/// has gone away. None of them mean telemetry should stop.
fn is_recoverable(error: &std::io::Error) -> bool {
    use std::io::ErrorKind::*;
    matches!(
        error.kind(),
        WouldBlock | TimedOut | Interrupted | ConnectionReset | ConnectionAborted | ConnectionRefused
    )
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalibrationStatusPayload {
    pub calibrating: bool,
    pub seconds: Option<u32>,
}

pub fn start(app: AppHandle, state: AppState) {
    let _ = emit_calibration_status(
        &app,
        CalibrationStatusPayload {
            calibrating: false,
            seconds: None,
        },
    );

    // This thread is started once, at app setup, and nothing else can restart
    // it -- so it must not be able to end. It used to break out of the read loop
    // on any error other than a timeout, which left the controller permanently
    // missing from the UI while JoyShockMapper carried on mapping happily, and
    // no amount of pressing Reconnect could bring it back: that only restarts
    // JoyShockMapper, and the listener was already gone.
    thread::spawn(move || loop {
        let socket = match UdpSocket::bind(("127.0.0.1", TELEMETRY_PORT)) {
            Ok(socket) => socket,
            Err(error) => {
                eprintln!("Failed to bind telemetry socket, retrying: {error}");
                thread::sleep(Duration::from_millis(TELEMETRY_REBIND_DELAY_MS));
                continue;
            }
        };

        silence_udp_connection_reset(&socket);
        let _ = socket.set_read_timeout(Some(Duration::from_millis(TELEMETRY_HEALTH_CHECK_MS)));
        let mut buffer = [0_u8; 65535];
        // "A second ago", so the first packet is emitted at once. Subtracting
        // from an Instant panics when the clock has not been up that long.
        let a_second_ago = Instant::now().checked_sub(Duration::from_secs(1)).unwrap_or_else(Instant::now);
        let mut last_ui_emit = a_second_ago;
        let mut last_overlay_emit = a_second_ago;
        let mut last_came_up: Option<Instant> = None;
        let mut presses = PressLatch::default();

        loop {
            match socket.recv_from(&mut buffer) {
                Ok((size, _)) => match serde_json::from_slice::<Value>(&buffer[..size]) {
                    Ok(mut packet) => {
                        presses.observe(&packet);
                        // Global chords and connection health still receive every
                        // packet. Only the expensive WebView IPC/rendering stops
                        // when another app (such as a game) has focus.
                        if state.telemetry_ui_active.load(Ordering::Relaxed)
                            && last_ui_emit.elapsed()
                                >= Duration::from_micros(
                                    state.ui_interval_us.load(Ordering::Relaxed).max(1_000),
                                )
                        {
                            presses.stamp(&mut packet);
                            let _ = emit_telemetry_packet(&app, &packet);
                            last_ui_emit = Instant::now();
                        }
                        // The overlay runs on its own clock, at the refresh rate
                        // of the display showing it, and is NOT gated on the main
                        // UI being focused: it is read while a game is focused.
                        if state.overlay_active.load(Ordering::Relaxed) {
                            let interval = Duration::from_micros(
                                state.overlay_interval_us.load(Ordering::Relaxed).max(1_000),
                            );
                            if last_overlay_emit.elapsed() >= interval {
                                let _ = emit_overlay_packet(&app, &packet);
                                last_overlay_emit = Instant::now();
                            }
                        }
                        // Every packet, not throttled: the HUD decides for itself
                        // how often to redraw, and a run must not be missed.
                        crate::services::hud::on_packet(&app, &state, &packet);
                        // The mapper sends at least a heartbeat every 0.5 s, so a
                        // first packet or one after 3 s of silence means it has
                        // just started (or restarted). Rate-limited so a mapper
                        // that keeps dropping telemetry cannot loop this.
                        let came_up = state
                            .telemetry
                            .lock()
                            .map(|telemetry| telemetry.latest_received_at.map_or(true, |at| at.elapsed() > Duration::from_secs(3)))
                            .unwrap_or(false);
                        if came_up && last_came_up.map_or(true, |at: Instant| at.elapsed() > Duration::from_secs(10)) {
                            last_came_up = Some(Instant::now());
                            let app = app.clone();
                            thread::spawn(move || crate::commands::mapper_came_up(&app));
                        }
                        update_latest_packet(&state, packet);
                    }
                    Err(error) => {
                        eprintln!("Failed to parse telemetry packet: {error}");
                    }
                },
                Err(error) if is_recoverable(&error) => {}
                Err(error) => {
                    // The socket itself looks unusable. Drop it and rebind
                    // rather than leaving the app blind until it is restarted.
                    eprintln!("Telemetry socket error, rebinding: {error}");
                    let _ = handle_health(&app, &state);
                    thread::sleep(Duration::from_millis(TELEMETRY_REBIND_DELAY_MS));
                    break;
                }
            }

            let _ = handle_health(&app, &state);
            crate::services::jsm_process::report_unexpected_exit(&app, &state);
        }
    });
}

/// Called by the main window once it has measured its display, so the UI is
/// drawn at the panel's rate rather than a fixed 60 Hz. Clamped: below 30 the
/// preview stutters, and above 1000 it would outrun the mapper's own tick.
pub fn set_ui_refresh_hz(state: &AppState, hz: u32) {
    let hz = hz.clamp(30, 1_000);
    state
        .ui_interval_us
        .store((1_000_000 / hz as u64).max(1), Ordering::Relaxed);
}

pub fn latest_packet(state: &AppState) -> Result<Option<Value>, String> {
    let telemetry_state = state
        .telemetry
        .lock()
        .map_err(|_| "Telemetry state lock poisoned.".to_string())?;
    Ok(telemetry_state.latest_packet.clone())
}

pub fn emit_calibration_status(
    app: &AppHandle,
    payload: CalibrationStatusPayload,
) -> Result<(), String> {
    app.emit("calibration-status", payload)
        .map_err(|error| format!("Failed to emit calibration status: {error}"))
}

pub fn stop_calibration_countdown(app: &AppHandle, state: &AppState) -> Result<(), String> {
    state.calibration_generation.fetch_add(1, Ordering::SeqCst);
    emit_calibration_status(
        app,
        CalibrationStatusPayload {
            calibrating: false,
            seconds: None,
        },
    )
}

pub fn broadcast_empty_devices(app: &AppHandle, state: &AppState) -> Result<(), String> {
    let packet = {
        let mut telemetry_state = state
            .telemetry
            .lock()
            .map_err(|_| "Telemetry state lock poisoned.".to_string())?;
        let cleared = clear_devices(
            telemetry_state
                .latest_packet
                .clone()
                .unwrap_or_else(|| json!({ "devices": [] })),
        );
        telemetry_state.latest_packet = Some(cleared.clone());
        telemetry_state.latest_received_at = None;
        telemetry_state.stale_devices_cleared = true;
        cleared
    };

    emit_telemetry_packet(app, &packet)
}

/// Buttons pressed since the UI was last sent a packet. The UI gets packets at
/// the display rate, not the mapper's, so a tap that goes down and up between
/// two of them never appears in either -- and a D-pad hammered quickly loses
/// presses. Each device's `status.pressedSince` carries every button that went
/// down in that gap (bits as in `status.buttons`), whether or not it is still
/// held, so the pad navigator can count every press.
#[derive(Default)]
struct PressLatch {
    previous: std::collections::HashMap<i64, u64>,
    pending: std::collections::HashMap<i64, u64>,
}

impl PressLatch {
    fn devices(packet: &Value) -> impl Iterator<Item = (i64, u64)> + '_ {
        packet.get("devices").and_then(Value::as_array).into_iter().flatten().filter_map(|device| {
            let handle = device.get("handle").and_then(Value::as_i64).unwrap_or(0);
            let buttons = device.get("status")?.get("buttons")?.as_u64()?;
            Some((handle, buttons))
        })
    }

    fn observe(&mut self, packet: &Value) {
        for (handle, buttons) in Self::devices(packet) {
            let before = self.previous.insert(handle, buttons).unwrap_or(buttons);
            *self.pending.entry(handle).or_default() |= buttons & !before;
        }
    }

    fn stamp(&mut self, packet: &mut Value) {
        let Some(devices) = packet.get_mut("devices").and_then(Value::as_array_mut) else { return };
        for device in devices {
            let handle = device.get("handle").and_then(Value::as_i64).unwrap_or(0);
            let pressed = self.pending.remove(&handle).unwrap_or(0);
            if let Some(status) = device.get_mut("status").and_then(Value::as_object_mut) {
                status.insert("pressedSince".into(), json!(pressed));
            }
        }
    }
}

fn emit_telemetry_packet(app: &AppHandle, packet: &Value) -> Result<(), String> {
    app.emit("telemetry-sample", packet)
        .map_err(|error| format!("Failed to emit telemetry packet: {error}"))
}

/// The overlay needs three things: where each thumb is, whether it is touching,
/// and which buttons are held (so it can pick the layer whose menu is live).
/// Everything else in a packet -- gyro, sticks, triggers, battery, device
/// metadata -- is dead weight to serialize several hundred times a second, so
/// this trims rather than forwarding the packet wholesale. Emitted only to the
/// overlay window, so the main WebView is not woken at the overlay's rate.
fn emit_overlay_packet(app: &AppHandle, packet: &Value) -> Result<(), String> {
    let device = packet
        .get("devices")
        .and_then(Value::as_array)
        .and_then(|devices| devices.iter().find(|device| device.get("status").is_some()));
    let Some(device) = device else { return Ok(()) };
    let Some(status) = device.get("status") else { return Ok(()) };
    // Static per device, but carried per packet rather than emitted once: a
    // controller can be unplugged and replaced by one with a differently shaped
    // pad, and two integers are nothing beside the floats already here.
    let dimension = |name: &str| device.get(name).and_then(Value::as_i64).unwrap_or(0);

    let pad = |name: &str| {
        status.get(name).map(|pad| {
            json!({
                "x": pad.get("x").and_then(Value::as_f64).unwrap_or(0.0),
                "y": pad.get("y").and_then(Value::as_f64).unwrap_or(0.0),
                "touched": pad.get("touched").and_then(Value::as_bool).unwrap_or(false),
            })
        })
    };
    // A stick can drive a radial menu too. It has no "touched" of its own that
    // means the same thing, so the overlay decides a stick menu is live from
    // deflection against the menu's deadzone -- which is also how the backend
    // decides, so the two agree about when a wheel is up.
    let stick = |name: &str| {
        status.get(name).map(|stick| {
            json!({
                "x": stick.get("x").and_then(Value::as_f64).unwrap_or(0.0),
                "y": stick.get("y").and_then(Value::as_f64).unwrap_or(0.0),
            })
        })
    };

    app.emit_to(
        "overlay",
        "overlay-telemetry",
        json!({
            "buttons": status.get("buttons").and_then(Value::as_u64).unwrap_or(0),
            "leftPad": pad("leftPad"),
            "rightPad": pad("rightPad"),
            "leftStick": stick("leftStick"),
            "rightStick": stick("rightStick"),
            "touchpadWidth": dimension("touchpadWidth"),
            "touchpadHeight": dimension("touchpadHeight"),
            // Which configuration the mapper is actually running. A binding can
            // load another one without Studio knowing, and until the overlay
            // hears about it, it keeps drawing the menus of the profile that is
            // no longer loaded.
            "activeProfile": packet.get("activeProfile").cloned().unwrap_or(Value::Null),
        }),
    )
    .map_err(|error| format!("Failed to emit overlay packet: {error}"))
}

fn update_latest_packet(state: &AppState, packet: Value) {
    if let Ok(mut telemetry_state) = state.telemetry.lock() {
        telemetry_state.latest_packet = Some(packet);
        telemetry_state.latest_received_at = Some(Instant::now());
        telemetry_state.stale_devices_cleared = false;
        if telemetry_state
            .latest_packet
            .as_ref()
            .map(packet_has_devices)
            .unwrap_or(false)
        {
            telemetry_state.last_reconnect_attempt = None;
        }
    }
}

fn handle_health(app: &AppHandle, state: &AppState) -> Result<(), String> {
    let mut stale_packet_to_emit = None;

    {
        let mut telemetry_state = state
            .telemetry
            .lock()
            .map_err(|_| "Telemetry state lock poisoned.".to_string())?;

        let has_devices = telemetry_state
            .latest_packet
            .as_ref()
            .map(packet_has_devices)
            .unwrap_or(false);
        let has_fresh_telemetry = telemetry_state
            .latest_received_at
            .map(|received_at| received_at.elapsed() <= Duration::from_millis(TELEMETRY_STALE_MS))
            .unwrap_or(false);

        if has_devices && !has_fresh_telemetry && !telemetry_state.stale_devices_cleared {
            let cleared = clear_devices(
                telemetry_state
                    .latest_packet
                    .clone()
                    .unwrap_or_else(|| json!({ "devices": [] })),
            );
            telemetry_state.latest_packet = Some(cleared.clone());
            telemetry_state.stale_devices_cleared = true;
            stale_packet_to_emit = Some(cleared);
        }

        if has_devices && has_fresh_telemetry {
            telemetry_state.last_reconnect_attempt = None;
        }
    }

    if let Some(packet) = stale_packet_to_emit {
        emit_telemetry_packet(app, &packet)?;
    }

    Ok(())
}

fn packet_has_devices(packet: &Value) -> bool {
    packet
        .get("devices")
        .and_then(Value::as_array)
        .map(|devices| !devices.is_empty())
        .unwrap_or(false)
}

fn clear_devices(packet: Value) -> Value {
    match packet {
        Value::Object(mut map) => {
            map.insert("devices".to_string(), Value::Array(Vec::new()));
            Value::Object(map)
        }
        _ => json!({ "devices": [] }),
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn a_tap_between_ui_packets_is_still_reported() {
        let packet = |buttons: u64| json!({ "devices": [{ "handle": 1, "status": { "buttons": buttons } }] });
        let mut latch = super::PressLatch::default();
        latch.observe(&packet(0));
        latch.observe(&packet(0b10)); // DOWN goes down...
        latch.observe(&packet(0)); // ...and up again before the UI hears of it
        let mut ui = packet(0);
        latch.stamp(&mut ui);
        assert_eq!(ui["devices"][0]["status"]["pressedSince"], 0b10);
        let mut next = packet(0);
        latch.stamp(&mut next);
        assert_eq!(next["devices"][0]["status"]["pressedSince"], 0, "reported once");
    }

    use super::*;
    use crate::services::app_state::DEFAULT_UI_INTERVAL_US;

    #[test]
    fn the_ui_emit_rate_follows_the_reported_display_and_is_clamped() {
        let state = AppState::default();
        // Until the window reports, the emitter stays at the 60 Hz this was
        // previously fixed at.
        assert_eq!(
            state.ui_interval_us.load(Ordering::Relaxed),
            DEFAULT_UI_INTERVAL_US
        );

        // A high-refresh panel gets its own rate, not 60.
        set_ui_refresh_hz(&state, 144);
        assert_eq!(state.ui_interval_us.load(Ordering::Relaxed), 6_944);
        set_ui_refresh_hz(&state, 240);
        assert_eq!(state.ui_interval_us.load(Ordering::Relaxed), 4_166);
        set_ui_refresh_hz(&state, 60);
        assert_eq!(state.ui_interval_us.load(Ordering::Relaxed), 16_666);

        // A nonsense measurement cannot stall the preview or spin the emitter:
        // 0 would divide by zero, and a huge value would outrun the mapper.
        set_ui_refresh_hz(&state, 0);
        assert_eq!(state.ui_interval_us.load(Ordering::Relaxed), 33_333);
        set_ui_refresh_hz(&state, 100_000);
        assert_eq!(state.ui_interval_us.load(Ordering::Relaxed), 1_000);
    }
}
