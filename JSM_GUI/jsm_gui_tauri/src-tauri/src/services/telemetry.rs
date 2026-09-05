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

        loop {
            match socket.recv_from(&mut buffer) {
                Ok((size, _)) => match serde_json::from_slice::<Value>(&buffer[..size]) {
                    Ok(packet) => {
                        update_latest_packet(&state, packet.clone());
                        let _ = emit_telemetry_packet(&app, packet);
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
        }
    });
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

pub fn start_calibration_countdown(
    app: AppHandle,
    state: AppState,
    seconds: u32,
) -> Result<(), String> {
    if seconds == 0 {
        return stop_calibration_countdown(&app, &state);
    }

    let generation = state.calibration_generation.fetch_add(1, Ordering::SeqCst) + 1;
    emit_calibration_status(
        &app,
        CalibrationStatusPayload {
            calibrating: true,
            seconds: Some(seconds),
        },
    )?;

    thread::spawn(move || {
        let mut remaining = seconds;
        while remaining > 0 {
            thread::sleep(Duration::from_secs(1));
            if state.calibration_generation.load(Ordering::SeqCst) != generation {
                return;
            }
            remaining -= 1;
            if remaining > 0 {
                let _ = emit_calibration_status(
                    &app,
                    CalibrationStatusPayload {
                        calibrating: true,
                        seconds: Some(remaining),
                    },
                );
            } else {
                let _ = emit_calibration_status(
                    &app,
                    CalibrationStatusPayload {
                        calibrating: false,
                        seconds: None,
                    },
                );
            }
        }
    });

    Ok(())
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

    emit_telemetry_packet(app, packet)
}

fn emit_telemetry_packet(app: &AppHandle, packet: Value) -> Result<(), String> {
    app.emit("telemetry-sample", packet)
        .map_err(|error| format!("Failed to emit telemetry packet: {error}"))
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
        emit_telemetry_packet(app, packet)?;
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
