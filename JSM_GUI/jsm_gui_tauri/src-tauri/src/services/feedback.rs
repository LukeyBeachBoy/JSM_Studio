use std::{net::UdpSocket, sync::Mutex};

/// The mapper's loopback feedback port (JoyShockMapper's StudioFeedback.h):
/// the reverse of telemetry. One datagram per effect, played from the
/// controller's own poll within a few milliseconds.
const FEEDBACK_PORT: u16 = 8976;

static SOCKET: Mutex<Option<UdpSocket>> = Mutex::new(None);

/// The datagram for one effect, clamped to what the mapper accepts.
pub(crate) fn datagram(effect: u8, intensity: f32, side: u8, rumble_ms: u32, rumble: f32) -> Option<String> {
    if !(1..=9).contains(&effect) || !(1..=3).contains(&side) || !intensity.is_finite() || !rumble.is_finite() {
        return None;
    }
    Some(format!("FEEDBACK {effect} {:.0} {side} {} {:.0}", intensity.clamp(0.0, 100.0), rumble_ms.min(250), rumble.clamp(0.0, 100.0)))
}

/// Ask the mapper to play a UI feedback effect. Fire and forget: nothing
/// listening (no mapper, an older one) costs one dropped datagram.
pub fn send(effect: u8, intensity: f32, side: u8, rumble_ms: u32, rumble: f32) {
    let Some(message) = datagram(effect, intensity, side, rumble_ms, rumble) else { return };
    let Ok(mut socket) = SOCKET.lock() else { return };
    if socket.is_none() {
        *socket = UdpSocket::bind(("127.0.0.1", 0)).ok();
    }
    if let Some(open) = socket.as_ref() {
        if open.send_to(message.as_bytes(), ("127.0.0.1", FEEDBACK_PORT)).is_err() {
            // Windows can report an earlier datagram's "port unreachable" on a
            // later send; start again with a fresh socket next time.
            *socket = None;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::datagram;

    #[test]
    fn datagrams_match_what_the_mapper_parses() {
        assert_eq!(datagram(2, 65.0, 2, 30, 32.0).as_deref(), Some("FEEDBACK 2 65 2 30 32"));
        assert_eq!(datagram(1, 180.0, 3, 999, -5.0).as_deref(), Some("FEEDBACK 1 100 3 250 0"), "clamped");
        assert_eq!(datagram(0, 50.0, 1, 0, 0.0), None, "OFF is not an effect");
        assert_eq!(datagram(2, 50.0, 4, 0, 0.0), None, "no fourth side");
    }
}
