#!/usr/bin/env python3
"""Each trackpad's grid must address its own cells.

The Steam Controller 2026 has two pads, and both of them used to drive the same
T1..Tn bindings: setting the left pad's grid also set the right pad's, and a
cell on one fired whatever the other's matching cell was bound to. JoyShockMapper
now gives each pad its own button IDs (LT1.., RT1..) and the GUI has to build,
bind and preview against those -- one grid section per pad, each with its own
size and its own live touch.

A single-pad controller, and a two-pad controller configured only through the
shared TOUCHPAD_MODE, still get the one shared T1.. grid.

Run: python3 tests/per_pad_grid_regression.py (no dependencies)
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parents[1]
GUI = ROOT / 'JSM_GUI/jsm_gui_tauri/src'
SCHEMA = (GUI / 'keymap/schema.ts').read_text(encoding='utf-8')
CONTROLS = (GUI / 'components/KeymapControls.tsx').read_text(encoding='utf-8')
SECTION = (GUI / 'components/keymap/TouchpadGridSection.tsx').read_text(encoding='utf-8')
MODIFIERS = (GUI / 'utils/modifierOptions.ts').read_text(encoding='utf-8')
GRIDS = (GUI / 'utils/touchpadGrids.ts').read_text(encoding='utf-8')
APP = (GUI / 'App.tsx').read_text(encoding='utf-8')
GYRO = (GUI / 'components/GyroBehaviorControls.tsx').read_text(encoding='utf-8')
EN = (GUI / 'i18n/resources/en.ts').read_text(encoding='utf-8')
ZH = (GUI / 'i18n/resources/zh-CN.ts').read_text(encoding='utf-8')


def check(cond, msg):
    if not cond:
        raise AssertionError(msg)


def test_grid_cells_can_be_named_per_pad():
    check("export type TouchpadGridPrefix = 'T' | 'LT' | 'RT'" in SCHEMA,
          'the grid button builder no longer distinguishes the pads')
    check('`${prefix}${index}`' in SCHEMA,
          'buildTouchpadGridButton hardcodes a command prefix again')


def test_a_pad_in_grid_mode_gets_its_own_grid():
    check("pad('left', 'LT'" in GRIDS and "pad('right', 'RT'" in GRIDS,
          'the per-pad grids no longer use their own LT/RT commands')
    check('leftColumns' in GRIDS and 'rightColumns' in GRIDS,
          'the per-pad grids no longer read their own sizes')
    check("pad('shared', 'T'" in GRIDS,
          'the shared grid fallback is gone; single-pad controllers would show nothing')
    # The shared grid is the fallback, not an extra grid alongside the pads.
    check('if (perPad.length > 0) return perPad' in GRIDS,
          'the shared grid would come back alongside the per-pad ones, offering the same cells twice')
    check('Math.min(25,' in GRIDS,
          'a grid could exceed the 25 cells the backend caps it at, binding nothing')


def test_everything_that_needs_grid_cells_asks_the_same_place():
    """The Trackpads page and the gyro activation list must agree about which
    cells exist. The gyro page used to derive them from the shared TOUCHPAD_MODE,
    so a Steam Controller with per-pad grids was offered no cells at all."""
    check('resolveTouchpadGrids' in CONTROLS,
          'the Trackpads page builds its own grid list again')
    check('resolveTouchpadGrids' in APP and 'touchpadGridCommands' in APP,
          'the gyro activation list no longer reads the real grid cells')
    check('touchpadGridCommands' in GYRO,
          'the gyro page cannot be given the cells that actually exist')
    check("touchpadMode === 'GRID_AND_STICK' ||" in GYRO,
          'the gyro page decides on the shared mode alone again, which is unset on a '
          'controller configured per pad')


def test_each_grid_shows_only_its_own_finger():
    check('livePadTouches' in CONTROLS,
          'the pads share one live touch again, so a finger on one lights up the other')
    check('pad.side === \'left\'' in CONTROLS and 'livePadTouches.left' in CONTROLS,
          "the left grid does not read the left pad's touch")
    check('livePadTouches.right' in CONTROLS,
          "the right grid does not read the right pad's touch")


def test_each_grid_section_says_which_pad_it_is():
    check("side?: 'left' | 'right' | 'shared'" in SECTION,
          'the grid section no longer knows which pad it belongs to')
    for key in ('touchpadGridTitleLeft', 'touchpadGridTitleRight'):
        check(f'{key}:' in EN, f'en is missing {key}')
        check(f'{key}:' in ZH, f'zh-CN is missing {key}')


def test_per_pad_cells_can_be_used_as_chord_conditions():
    check('gridCommands?: string[]' in MODIFIERS,
          'the modifier list cannot be given per-pad commands, so a chord could only name T1..')
    check("'modifiers.touchGridRegionLeft'" in MODIFIERS and "'modifiers.touchGridRegionRight'" in MODIFIERS,
          'per-pad chord conditions have no labels of their own')
    for key in ('touchGridRegionLeft', 'touchGridRegionRight'):
        check(f'{key}:' in EN, f'en is missing modifiers.{key}')
        check(f'{key}:' in ZH, f'zh-CN is missing modifiers.{key}')
    check('touchpadGridCommands' in CONTROLS,
          'KeymapControls no longer passes the real grid commands to the modifier list')


def test_only_a_two_pad_controller_is_offered_two_pads():
    check('controllerHasTwoTrackpads' in CONTROLS,
          'the pad settings no longer ask whether the controller has two pads, so a '
          'DualSense is shown a "Left touchpad" and a "Right touchpad" it does not have')
    check('showPerPadTouchpads' in CONTROLS, 'the per-pad visibility rule is gone')
    gate = re.search(r'const showPerPadTouchpads = useMemo\(.*?\n  \}, \[', CONTROLS, re.S)
    check(gate is not None, 'showPerPadTouchpads is no longer derived')
    body = gate.group(0)
    check('if (hasPerPadSettings) return true' in body,
          'a config that already sets per-pad values would lose its per-pad UI')
    check('if (!devices || devices.length === 0) return true' in body,
          'with nothing connected the per-pad settings must still be offered, or a '
          'Steam Controller owner cannot set them up offline')

    per_pad = re.search(r'const hasPerPadSettings = useMemo\(.*?\n  \)', CONTROLS, re.S)
    check(per_pad is not None, 'hasPerPadSettings is no longer derived')
    check('configText' in per_pad.group(0),
          'hasPerPadSettings reads resolved values again; the per-pad grid size falls '
          'back to 2x1 whether or not the config sets it, so it always looked set')


def test_the_shared_touch_bindings_say_they_are_shared():
    check("t('keymap.touchButtonsDescriptionShared')" in CONTROLS,
          'a two-pad controller is not told that Touch and Click are shared, which now '
          'reads as an inconsistency next to the per-pad grids')
    for locale, name in ((EN, 'en'), (ZH, 'zh-CN')):
        check('touchButtonsDescriptionShared:' in locale,
              f'{name} is missing touchButtonsDescriptionShared')


def main():
    tests = [value for name, value in sorted(globals().items()) if name.startswith('test_')]
    failures = 0
    for test in tests:
        try:
            test()
        except AssertionError as exc:
            print(f'FAIL {test.__name__}: {exc}')
            failures += 1
        else:
            print(f'PASS {test.__name__}')
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
