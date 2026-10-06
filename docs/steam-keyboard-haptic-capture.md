# Steam keyboard puck capture — 4 October 2026

Recorded only USBPcap2 device address 5, the Valve wireless puck (VID 28DE / PID 1304), for 100.164 seconds. Steam was running and JoyShockMapper was not detected. The capture has 54,603 packets and 142 outgoing haptic reports. The original pcap and decoded haptics/input-edge CSV files are in `tmp/steam-keyboard-capture/`.

| Observed action | Raw output report | Count | Interpretation |
|---|---|---:|---|
| Left-pad key crossings | `82 00 01 01` | 54 | Tick, +1 dB, left pad |
| Right-pad key crossings | `82 01 01 01` | 42 | Tick, +1 dB, right pad |
| Five left-pad presses and releases | `82 00 01 05` | 10 | Tick, +5 dB, left pad; one on press and one on release |
| Five right-pad presses and releases | `82 01 01 05` | 10 | Tick, +5 dB, right pad; one on press and one on release |
| Touch / trigger / opening or closing feedback | `81 00 90 01 00 00 01 00` | 12 | Right-pad pulse: 400 us on, 0 us off, one repeat |
| Touch / trigger feedback | `81 01 90 01 00 00 01 00` | 6 | Left-pad pulse: 400 us on, 0 us off, one repeat |
| Keyboard mode transitions | `81 00/01 00 00 00 00 00 00` | 8 | Zero-length pulse / stop reports; not typing effects |

The input report decoding follows SDL's packed `TritonMTUFull_t` layout: report 0x42, sequence byte, uint32 buttons, triggers, sticks, left pad x/y/pressure, right pad x/y/pressure, IMU. The haptic reports are correlated with this input, rather than relying solely on the requested action sequence.

Strong press ticks occur at left-pad pressures 2746–2889 and right-pad pressures 2749–2799; the matching release ticks occur at pressures 1267–1368 and 1229–1378. This identifies the ten +5 dB packets per pad as five press/release pairs. The capture does not establish the controller's exact pressure threshold or hysteresis.

Left touch begins/releases at 32.369/36.203 and 39.431/45.229 seconds and correlates with pulse target 1. Right touch begins/releases at 48.651/53.048 and 56.232/60.668 seconds and correlates with pulse target 0. Left-trigger feedback occurs at 64.622/67.014 seconds, target 1; right-trigger feedback at 70.540/70.686 seconds, target 0. Trigger feedback starts before the hardware full-click bit, so it follows an analog threshold.

Y/Space was pressed at 67.898 and 68.650 seconds; L3/Caps at 77.400 and 78.946 seconds. No haptic output was captured around those presses. The only X press was at 29.795 seconds during keyboard opening: this is not clean evidence for Backspace. A later B press closed the keyboard. Therefore Backspace and a dedicated Enter binding need a separate labelled capture if their exact Steam behavior is required.

## Routing correction and implementation

The two report types have DIFFERENT target schemes. Command report 0x82 uses left=0/right=1. Pulse report 0x81 uses left=1/right=0. Both pads require two reports. The previous code copied the logical 1-left/2-right bitmask directly into the command target, causing wrong actuator routing; right-pad pulse routing was also incorrect.

Adaptive keyboard feedback is now labelled **Steam keyboard** and uses the captured Tick +1/+5 dB values at the default 35% setting, including pad release ticks, plus the exact eight-byte 400 us touch/shortcut pulse. Intensity changes apply a logarithmic gain adjustment to ticks; this pulse has no gain field and fixed strength. Off and zero intensity suppress feedback. Existing explicit effect selections remain available.

Shortcut feedback is retained using the captured short pulse, including Space/Caps: this is an intentional extension to the captured Steam behavior, reflecting the earlier request for feedback on shortcuts. Default routing uses the left pad for Shift/Caps and right pad for other shortcuts. Configurable shortcut hardware parity and exact analog trigger thresholds are not established by this capture.

Validation: production SDL encoder harness reproduces the captured packets byte for byte; feedback parser tests pass; 25 native Rust keyboard tests pass. Installed-app and perceived hardware matching remain unverified. Raw capture SHA256: `f2ac18f39a88057a4073cf4be52af5883cc991a30aa79e349d3319282915e48e`.

Protocol reference: https://github.com/libsdl-org/SDL/blob/main/src/joystick/hidapi/steam/controller_structs.h . The observed target numbering above comes from this hardware capture, not the generic command-side comment in SDL.
