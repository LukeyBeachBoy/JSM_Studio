#!/usr/bin/env python3
"""Guards the per-control page structure.

Everything bindable used to live on one page, under one Global Controls panel
repeated above it. Steam Input splits the controller up -- Buttons, D-Pad,
Triggers, Joysticks, Trackpads, Gyro -- and shows only what belongs to the
control you picked. These pin the two things that made that possible, both of
which are easy to undo by accident:

  * a page can focus SEVERAL button groups (only one was possible before, which
    is why "Buttons" could not mean face + bumpers + centre + paddles together)
  * config-wide panels appear on their own page, not above every control

Run: python3 tests/nav_hierarchy_regression.py     (no dependencies)
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parents[1]
GUI = ROOT / 'JSM_GUI/jsm_gui_tauri/src'
APP = (GUI / 'App.tsx').read_text(encoding='utf-8')
KEYMAP = (GUI / 'components/KeymapControls.tsx').read_text(encoding='utf-8')


def test_every_control_page_maps_to_real_button_groups():
    block = re.search(r'const CONTROL_TAB_SECTIONS[^=]*= \{(.*?)\n\}', APP, re.S)
    assert block is not None, 'no CONTROL_TAB_SECTIONS map'
    declared = set(re.findall(r"'([a-zA-Z]+)'", block.group(1)))
    groups = re.search(r'const MAPPING_BUTTON_GROUPS[^=]*= \{(.*?)\n\}', KEYMAP, re.S)
    assert groups is not None, 'no MAPPING_BUTTON_GROUPS'
    known = set(re.findall(r'^  ([a-zA-Z]+):', groups.group(1), re.M))
    tabs = {'buttons', 'dpad', 'triggers', 'joysticks'}
    referenced = declared - tabs
    unknown = referenced - known
    assert not unknown, f'control pages reference groups that do not exist: {sorted(unknown)}'


def test_a_page_can_focus_more_than_one_group():
    """The single-group limit is what forced everything onto one page."""
    assert 'focusedMappingGroups' in KEYMAP
    body = KEYMAP.split('const visualMappingGroups', 1)[1].split('}, [', 1)[0]
    assert 'focusedMappingGroups.includes(key)' in body, \
        'group focus must filter by membership, not by picking a single entry'
    # The list layout has to agree with the visual one, or the jump bar offers
    # sections the page does not render.
    assert 'listMappingGroups' in KEYMAP
    assert KEYMAP.count('listMappingGroups.map') >= 2


def test_config_wide_panels_do_not_repeat_on_every_control_page():
    assert 'showConfigWidePanels' in KEYMAP
    body = KEYMAP.split('const showConfigWidePanels', 1)[1].split('\n', 1)[0]
    assert "includes('global')" in body
    # And the mapping layouts must NOT be gated on it, or a control page renders
    # nothing at all -- which is exactly what happened the first time.
    for layout in ('showListMappingLayout', 'showVisualMappingLayout'):
        assert f'{{{layout} && (' in KEYMAP, layout
    visual_at = KEYMAP.index('{showVisualMappingLayout && (')
    reopened = KEYMAP.index('{showMappedLayout && (\n        <>')
    assert reopened < visual_at, 'the mapping layouts must sit inside a showMappedLayout block'


def test_the_config_wide_settings_still_have_a_home():
    assert "primaryTab === 'timing'" in APP
    assert "visibleSections={['global']}" in APP


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
