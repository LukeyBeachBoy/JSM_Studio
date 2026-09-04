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
    pads = re.search(r'const touchpadGridPads = useMemo\(.*?\n  \}, \[', CONTROLS, re.S)
    check(pads is not None, 'touchpadGridPads is gone; the pads would share one grid')
    body = pads.group(0)
    check("buildCells('LT'" in body and "buildCells('RT'" in body,
          'the per-pad grids no longer use their own LT/RT commands')
    check('leftGridColumns' in body and 'rightGridColumns' in body,
          'the per-pad grids no longer read their own sizes')
    check("buildCells('T'" in body,
          'the shared grid fallback is gone; single-pad controllers would show nothing')
    # The shared grid is the fallback, not an extra section alongside the pads.
    check('if (perPad.length > 0) return perPad' in body,
          'the shared grid would render alongside the per-pad ones, offering the same cells twice')


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
