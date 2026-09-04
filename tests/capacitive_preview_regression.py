#!/usr/bin/env python3
"""Guards how the preview shows capacitive contact.

The Steam Controller has three capacitive inputs -- pad touch, grip sense, and
thumbstick touch -- and they are the same kind of signal. Showing them in
different colours, or omitting one, made them look like unrelated features.

Also pins the back-button names. They are L4/L5/R4/R5 on the device and in Steam
Input; the generic "L B1" naming this inherited made them impossible to find.

Run: python3 tests/capacitive_preview_regression.py     (no dependencies)
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parents[1]
GUI = ROOT / 'JSM_GUI/jsm_gui_tauri/src'
SVG = (GUI / 'components/ControllerStatusSvg.tsx').read_text(encoding='utf-8')
CSS = (GUI / 'components/ControllerStatusSvg.module.css').read_text(encoding='utf-8')
TELEMETRY = (GUI / 'hooks/useTelemetry.ts').read_text(encoding='utf-8')
steam = SVG.split('viewBox="0 0 1117 750"', 1)[1].split('// --- Legacy layout', 1)[0]


def check(cond, msg):
    if not cond:
        raise AssertionError(msg)


def test_all_three_capacitive_inputs_share_one_style():
    check('.capSenseActive {' in CSS, 'no shared capacitive-contact style')
    # The pads light up inside the Steam layout; the grip zone and the stick are
    # shared components defined above it, so count across the whole file.
    check(SVG.count('styles.capSenseActive') >= 4,
          'pad touch, grip sense and stick touch must all use the capacitive style')
    check('touched && styles.capSenseActive' in SVG, 'stick touch must use the capacitive style')
    check('pressed && styles.capSenseActive' in SVG, 'grip sense must use the capacitive style')
    for pad in ('leftPad', 'rightPad'):
        check(f'{pad}?.touched && styles.capSenseActive' in steam,
              f'{pad} touch must use the capacitive style')


def test_thumbstick_touch_reaches_the_preview():
    """It travels telemetry-only: there is no MISC slot left to bind it to, but
    that is no reason for it not to be visible."""
    check('leftStickTouch?: boolean' in TELEMETRY, 'telemetry type is missing leftStickTouch')
    check('rightStickTouch?: boolean' in TELEMETRY, 'telemetry type is missing rightStickTouch')
    check('touched={device.status?.leftStickTouch}' in steam, 'left stick does not show touch')
    check('touched={device.status?.rightStickTouch}' in steam, 'right stick does not show touch')


def test_back_buttons_use_the_names_on_the_device():
    block = re.search(r'const STEAM_PADDLE_LABELS[^}]*}', SVG, re.S)
    check(block is not None, 'no Steam paddle label table')
    for name in ('L4', 'L5', 'R4', 'R5'):
        check(f"'{name}'" in block.group(0), f'{name} missing from the Steam paddle labels')
    check('getPaddleLabel(backInputMode, entry.command, true)' in steam,
          'the Steam layout must ask for the Steam labels')
    # Other controllers keep the generic naming: a DualSense Edge paddle is not L4.
    check("LSL: 'L B1'" in SVG, 'the generic paddle labels must survive for other controllers')


if __name__ == '__main__':
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith('test_'):
            try:
                fn()
                print(f'PASS {name}')
            except AssertionError as exc:
                failures += 1
                print(f'FAIL {name}: {exc}')
    sys.exit(1 if failures else 0)
