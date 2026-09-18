#!/usr/bin/env python3
"""Pretend to be JoyShockMapper reporting a connected Steam Controller (2026).

JoyShockMapper publishes telemetry as one JSON datagram per sample to
127.0.0.1:8974, and Studio's UI is driven entirely by what arrives there
(src-tauri/src/services/telemetry.rs). Nothing else in the app asks the
operating system about controllers, so a script that sends well-formed packets
to that port is indistinguishable from the real backend as far as the UI is
concerned -- which makes it the only way to exercise the controller views on a
machine where JoyShockMapper cannot run at all, such as macOS.

    python3 scripts/mock-controller.py                 # connected, idle
    python3 scripts/mock-controller.py --scene demo    # exercise every input
    python3 scripts/mock-controller.py --hold LSL,PLUS # hold a chord down
    python3 scripts/mock-controller.py --drop-after 5  # go silent, expect UI to
                                                       # report it disconnected

Stop with Ctrl-C.
"""

from __future__ import annotations

import argparse
import json
import math
import socket
import sys
import time

# Mirrors Telemetry::kProtoVersion / kDefaultPort in include/Telemetry.h.
PROTO_VERSION = 3
DEFAULT_PORT = 8974

# JS_TYPE_STEAM_CONTROLLER_2026 and the USB ids from include/JslWrapper.h.
CONTROLLER_TYPE_STEAM_2026 = 24
VENDOR_VALVE = 0x28DE
PRODUCT_VALVE_STEAM_2026_USB = 0x1302
SPLIT_TYPE_FULL = 3

# Bit positions in the status.buttons mask. These are the raw JSL button
# indices, which are NOT the ButtonID enum order used in config files -- the UI
# decodes them via RAW_BUTTONS in src/utils/controllerStatus.ts, so that table
# is the one to match.
RAW_BUTTONS = {
    "UP": 0,
    "DOWN": 1,
    "LEFT": 2,
    "RIGHT": 3,
    "PLUS": 4,
    "MINUS": 5,
    "LCLICK": 6,
    "RCLICK": 7,
    "L": 8,
    "R": 9,
    "S": 12,
    "E": 13,
    "W": 14,
    "N": 15,
    "HOME": 16,
    "CAPTURE": 17,
    "MIC": 18,
    "SL": 19,
    "SR": 20,
    "FNL": 21,
    "FNR": 22,
    "LTOUCH": 23,
    "RTOUCH": 24,
    "LMINI": 25,
    "RMINI": 26,
    "MISC1": 27,
    "MISC2": 28,
    "MISC3": 29,
    "MISC4": 30,
    "MISC5": 31,
    "MISC6": 32,
}

# Matches the TelemetryDevice default: every bit the enum defines.
SUPPORTED_BUTTONS = (1 << 33) - 1

# The order the demo scene walks through, grouped so the highlight travels
# around the controller diagram in a way that is easy to follow by eye.
DEMO_BUTTON_ORDER = [
    "N", "E", "S", "W",
    "UP", "RIGHT", "DOWN", "LEFT",
    "L", "R", "LMINI", "RMINI",
    "MINUS", "HOME", "PLUS", "CAPTURE",
    "LCLICK", "RCLICK",
    "MISC1", "MISC2", "MISC3", "MISC4",
]

SCENES = ("idle", "demo", "buttons", "sticks", "triggers", "pads", "gyro", "grips")


def stick(x: float = 0.0, y: float = 0.0) -> dict:
    return {"x": x, "y": y}


def pad(x: float = 0.0, y: float = 0.0, touched: bool = False,
        pressure: float = 0.0, speed: float = 0.0) -> dict:
    return {"x": x, "y": y, "touched": touched, "pressure": pressure, "speed": speed}


def buttons_mask(names) -> int:
    mask = 0
    for name in names:
        try:
            mask |= 1 << RAW_BUTTONS[name]
        except KeyError:
            raise SystemExit(
                f"Unknown button {name!r}. Known: {', '.join(sorted(RAW_BUTTONS))}"
            )
    return mask


def build_status(scene: str, elapsed: float, held: list[str]) -> dict:
    """One frame of device state for the requested scene."""
    pressed = list(held)
    left_stick = stick()
    right_stick = stick()
    triggers = {"left": 0.0, "right": 0.0}
    gyro = {"x": 0.0, "y": 0.0, "z": 0.0}
    left_pad = pad()
    right_pad = pad()
    left_grip = False
    right_grip = False
    left_stick_touch = False
    right_stick_touch = False

    # A slow circle, reused by anything that wants a moving 2D value.
    angle = elapsed * 1.6
    circle_x = math.cos(angle)
    circle_y = math.sin(angle)
    # 0..1 and back, for triggers and pressure.
    ramp = (math.sin(elapsed * 1.2) + 1.0) / 2.0

    if scene in ("demo", "buttons"):
        # Light each button for a third of a second, in a loop.
        step = int(elapsed / 0.33) % len(DEMO_BUTTON_ORDER)
        pressed.append(DEMO_BUTTON_ORDER[step])

    if scene in ("demo", "sticks"):
        left_stick = stick(circle_x, circle_y)
        # Opposite phase so the two sticks are visually distinguishable.
        right_stick = stick(-circle_x, -circle_y)
        left_stick_touch = True
        right_stick_touch = ramp > 0.5

    if scene in ("demo", "triggers"):
        triggers = {"left": ramp, "right": 1.0 - ramp}

    if scene in ("demo", "pads"):
        left_pad = pad(circle_x * 0.8, circle_y * 0.8, touched=True,
                       pressure=ramp, speed=abs(circle_x) * 2.0)
        # Trails the left pad by a quarter turn, and lifts off periodically so
        # the "not touched" rendering gets exercised too.
        touching = ramp > 0.25
        right_pad = pad(circle_y * 0.8, -circle_x * 0.8, touched=touching,
                        pressure=ramp * 0.5 if touching else 0.0,
                        speed=abs(circle_y) * 2.0)

    if scene in ("demo", "gyro"):
        gyro = {
            "x": math.sin(elapsed * 0.9) * 180.0,
            "y": math.cos(elapsed * 1.3) * 120.0,
            "z": math.sin(elapsed * 0.4) * 60.0,
        }

    if scene in ("demo", "grips"):
        left_grip = math.sin(elapsed * 2.0) > 0.0
        right_grip = math.cos(elapsed * 2.0) > 0.0

    return {
        "buttons": buttons_mask(pressed),
        "leftStick": left_stick,
        "rightStick": right_stick,
        "triggers": triggers,
        "gyro": gyro,
        "leftPad": left_pad,
        "rightPad": right_pad,
        "leftGrip": {"pressed": left_grip},
        "rightGrip": {"pressed": right_grip},
        "leftStickTouch": left_stick_touch,
        "rightStickTouch": right_stick_touch,
    }


def build_packet(args, elapsed: float, rate_hz: float) -> dict:
    status = build_status(args.scene, elapsed, args.hold)
    gyro = status["gyro"]
    # The gyro readout wants a magnitude; derive it rather than invent one, so
    # the number on screen agrees with the axes next to it.
    omega = math.sqrt(gyro["x"] ** 2 + gyro["y"] ** 2 + gyro["z"] ** 2)

    # Drain slowly from the starting charge so the battery indicator visibly
    # changes without needing a second run.
    battery = max(0, args.battery - int(elapsed / 20.0))

    return {
        "protoVer": PROTO_VERSION,
        "ts": int(time.time() * 1000),
        "activeProfile": args.profile,
        "omega": omega,
        "t": min(1.0, omega / 360.0),
        "sensX": 1.0,
        "sensY": 1.0,
        "minThr": 0.0,
        "maxThr": 75.0,
        "SminX": 1.0,
        "SmaxX": 2.0,
        "SminY": 1.0,
        "SmaxY": 2.0,
        "curve": "LINEAR",
        "params": {},
        # ConsoleFeed::json() emits a single string, not a list of lines.
        "console": "mock-controller.py: synthetic telemetry, no device attached\\n",
        "sampleHz": rate_hz,
        "devices": [
            {
                "handle": 1,
                "type": CONTROLLER_TYPE_STEAM_2026,
                "supportedButtons": SUPPORTED_BUTTONS,
                "split": SPLIT_TYPE_FULL,
                "vid": VENDOR_VALVE,
                "pid": PRODUCT_VALVE_STEAM_2026_USB,
                "batteryPercent": battery,
                # 1 = on battery, matching SDL_PowerState.
                "batteryState": 1,
                "status": status,
            }
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Emulate a Steam Controller reporting to JSM Studio.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"scenes: {', '.join(SCENES)}",
    )
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--rate", type=float, default=60.0,
                        help="packets per second (default 60)")
    parser.add_argument("--scene", choices=SCENES, default="idle")
    parser.add_argument("--hold", default="",
                        help="comma-separated buttons to hold down for the whole run, "
                             "e.g. LSL,PLUS")
    parser.add_argument("--battery", type=int, default=87,
                        help="starting battery percent (default 87)")
    parser.add_argument("--profile", default="Test Chords.txt",
                        help="value reported as the active profile")
    parser.add_argument("--drop-after", type=float, default=0.0, metavar="SECONDS",
                        help="stop sending after this long, to test the "
                             "disconnected state (Studio treats telemetry as "
                             "stale after 1.5s)")
    args = parser.parse_args()

    args.hold = [name.strip().upper() for name in args.hold.split(",") if name.strip()]
    buttons_mask(args.hold)  # fail fast on a typo rather than 60 times a second

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    target = ("127.0.0.1", args.port)
    interval = 1.0 / args.rate
    started = time.monotonic()

    held_note = f", holding {'+'.join(args.hold)}" if args.hold else ""
    print(f"Sending {args.scene} telemetry to {target[0]}:{target[1]} "
          f"at {args.rate:g} Hz{held_note}. Ctrl-C to stop.")

    try:
        while True:
            elapsed = time.monotonic() - started
            if args.drop_after and elapsed >= args.drop_after:
                print(f"Stopped sending after {args.drop_after:g}s; "
                      "Studio should show the controller as disconnected.")
                # Hold the process open so the silence is clearly this script's
                # doing rather than it having exited.
                while True:
                    time.sleep(1.0)
            packet = build_packet(args, elapsed, args.rate)
            sock.sendto(json.dumps(packet).encode("utf-8"), target)
            time.sleep(interval)
    except KeyboardInterrupt:
        print("\nStopped.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
