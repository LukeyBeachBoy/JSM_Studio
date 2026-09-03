#!/usr/bin/env python3
"""Guards the GUI's touchpad filter default fallbacks against drifting from
the backend and from each other.

Caught in manual testing: after the backend's TOUCHPAD_MIN_CUTOFF/
TOUCHPAD_SPEED_COEFF defaults were retuned (0.8/0.015 -> 6.0/0.6, see
JoyShockMapper's own regression suite), the GUI kept showing the OLD values
as its "not set in config" display fallback in two separate places (the
useTouchpadConfig hook and the sensor section's number inputs) --
correct behaviour, wrong number shown, which is worse than showing nothing.

Run: python3 tests/touchpad_filter_defaults_regression.py (no dependencies)
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parents[1]
HOOK = (ROOT / 'JSM_GUI/jsm_gui_tauri/src/hooks/useTouchpadConfig.ts').read_text(encoding='utf-8')
SECTION = (ROOT / 'JSM_GUI/jsm_gui_tauri/src/components/keymap/TouchpadSensorSection.tsx').read_text(encoding='utf-8')

EXPECTED_MIN_CUTOFF = 6.0
EXPECTED_SPEED_COEFF = 0.6


def check(cond, msg):
    if not cond:
        raise AssertionError(msg)


def test_hook_fallback_matches_shipped_backend_default():
    m = re.search(r"globalNum\(keyName\.TOUCHPAD_MIN_CUTOFF,\s*([\d.]+)\)", HOOK)
    check(m is not None, 'TOUCHPAD_MIN_CUTOFF fallback not found in useTouchpadConfig.ts')
    check(float(m.group(1)) == EXPECTED_MIN_CUTOFF,
          f'hook fallback is {m.group(1)}, backend default is {EXPECTED_MIN_CUTOFF}')

    m = re.search(r"globalNum\(keyName\.TOUCHPAD_SPEED_COEFF,\s*([\d.]+)\)", HOOK)
    check(m is not None, 'TOUCHPAD_SPEED_COEFF fallback not found in useTouchpadConfig.ts')
    check(float(m.group(1)) == EXPECTED_SPEED_COEFF,
          f'hook fallback is {m.group(1)}, backend default is {EXPECTED_SPEED_COEFF}')


def test_displayed_placeholder_matches_shipped_backend_default():
    m = re.search(r"touchpadMinCutoff\s*\?\?\s*([\d.]+)", SECTION)
    check(m is not None, 'touchpadMinCutoff display fallback not found')
    check(float(m.group(1)) == EXPECTED_MIN_CUTOFF,
          f'displayed fallback is {m.group(1)}, backend default is {EXPECTED_MIN_CUTOFF}')

    m = re.search(r"touchpadSpeedCoeff\s*\?\?\s*([\d.]+)", SECTION)
    check(m is not None, 'touchpadSpeedCoeff display fallback not found')
    check(float(m.group(1)) == EXPECTED_SPEED_COEFF,
          f'displayed fallback is {m.group(1)}, backend default is {EXPECTED_SPEED_COEFF}')


def test_balanced_preset_is_the_shipped_default():
    """The named smoothing presets are a third place the same two numbers live.
    Balanced is presented as "default", so it has to actually be the default, or
    picking it would silently change behaviour."""
    block = re.search(r"\{ id: 'balanced', cutoff: ([\d.]+), speed: ([\d.]+) \}", SECTION)
    check(block is not None, "no 'balanced' entry in SMOOTHING_PRESETS")
    check(float(block.group(1)) == EXPECTED_MIN_CUTOFF,
          f'balanced cutoff is {block.group(1)}, backend default is {EXPECTED_MIN_CUTOFF}')
    check(float(block.group(2)) == EXPECTED_SPEED_COEFF,
          f'balanced speed is {block.group(2)}, backend default is {EXPECTED_SPEED_COEFF}')


def test_preset_labels_quote_the_values_they_set():
    """A preset named only "Balanced" tells the reader nothing about what it did,
    and the pair is what the config file and the backend actually talk about."""
    for preset, cutoff, speed in (('smoothingLight', '10', '0.8'),
                                  ('smoothingBalanced', '6', '0.6'),
                                  ('smoothingHeavy', '2.5', '0.35')):
        label = re.search(rf"'keymap\.{preset}', '([^']+)'", SECTION)
        check(label is not None, f'{preset} label not found')
        check(f'({cutoff} / {speed})' in label.group(1),
              f'{preset} label does not quote ({cutoff} / {speed}): {label.group(1)!r}')


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
