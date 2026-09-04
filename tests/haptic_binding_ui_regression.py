#!/usr/bin/env python3
"""Keeps the GUI's haptic binding grammar in step with JoyShockMapper's.

The controller's actuators are addressed by name -- HAPTIC_<side>_<effect>
[_<gain>] -- and both sides of the app have to spell that identically. The
backend parses it in parseHapticName (PlatformDefinitions.cpp) and encodes the
effect as an INDEX into its own list, so reordering the effect names on either
side silently binds the wrong effect rather than failing. This checks that the
lists match, in order, and that every one of them is actually offered and
labelled in the UI.

The backend cross-check runs whenever the JoyShockMapper source is reachable
(the submodule, or a sibling checkout); the GUI-only checks always run.

Run: python3 tests/haptic_binding_ui_regression.py (no dependencies)
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parents[1]
GUI = ROOT / 'JSM_GUI/jsm_gui_tauri/src'
HAPTICS = (GUI / 'utils/hapticBindings.ts').read_text(encoding='utf-8')
PICKER = (GUI / 'components/keymap/HapticOutputPicker.tsx').read_text(encoding='utf-8')
COMPOSER = (GUI / 'components/keymap/BindingQuickComposer.tsx').read_text(encoding='utf-8')
COMMANDS = (GUI / 'utils/bindingCommands.ts').read_text(encoding='utf-8')
EN = (GUI / 'i18n/resources/en.ts').read_text(encoding='utf-8')
ZH = (GUI / 'i18n/resources/zh-CN.ts').read_text(encoding='utf-8')


def check(cond, msg):
    if not cond:
        raise AssertionError(msg)


def gui_effects():
    m = re.search(r"HAPTIC_EFFECTS = \[([^\]]*)\]", HAPTICS)
    check(m is not None, 'HAPTIC_EFFECTS not found in hapticBindings.ts')
    return re.findall(r"'([A-Z]+)'", m.group(1))


def gui_sides():
    m = re.search(r"HAPTIC_SIDES: HapticSide\[\] = \[([^\]]*)\]", HAPTICS)
    check(m is not None, 'HAPTIC_SIDES not found in hapticBindings.ts')
    return re.findall(r"'([A-Z]+)'", m.group(1))


def backend_file(relative):
    # The submodule when it is checked out, or a sibling clone. The repo nests
    # its sources one level down, so glob rather than hard-code the depth.
    for base in (ROOT / 'JoyShockMapper', ROOT.parent / 'JoyShockMapper'):
        if not base.is_dir():
            continue
        for candidate in sorted(base.glob(f'**/{relative}')):
            return candidate.read_text(encoding='utf-8')
    return None


def backend_source():
    return backend_file('src/win32/PlatformDefinitions.cpp')


def test_effect_order_matches_the_backend():
    header = backend_file('include/JoyShockMapper.h')
    if header is None:
        print('SKIP test_effect_order_matches_the_backend (JoyShockMapper source not checked out)')
        return
    m = re.search(r'enum class HapticEffect\s*\{(.*?)\};', header, re.S)
    check(m is not None, 'the HapticEffect enum is gone from JoyShockMapper.h')
    backend = [name for name in re.findall(r'^\t([A-Z]+),', m.group(1), re.M) if name != 'INVALID']
    check(backend == gui_effects(),
          f'effect order differs: backend {backend}, GUI {gui_effects()}. '
          'The ordinal is what goes on the wire, so order is meaning.')

    # One list, used by both the binding names and the grip setting.
    cpp = backend_source()
    if cpp is not None:
        check('magic_enum::enum_cast<HapticEffect>' in cpp,
              'parseHapticName keeps its own copy of the effect names again, which can '
              'drift from the enum the GRIP_HAPTIC_EFFECT setting uses')


def test_the_grip_pulse_can_choose_its_effect():
    header = backend_file('include/JoyShockMapper.h')
    main = backend_file('src/main.cpp')
    sdl = backend_file('src/SDLWrapper.cpp')
    if header is None or main is None or sdl is None:
        print('SKIP test_the_grip_pulse_can_choose_its_effect (JoyShockMapper source not checked out)')
        return
    check('GRIP_HAPTIC_EFFECT' in header, 'the GRIP_HAPTIC_EFFECT setting is gone')
    check('JSMSetting<HapticEffect>(SettingID::GRIP_HAPTIC_EFFECT, HapticEffect::CLICK)' in main,
          'GRIP_HAPTIC_EFFECT no longer defaults to CLICK, the tap Steam Input calibrates with')
    check('SettingID::GRIP_HAPTIC_EFFECT' in sdl,
          'the grip pulse ignores the configured effect and plays a hardcoded one')
    check('TRITON_HAPTIC_CLICK' not in sdl,
          'the hardcoded click constant is back alongside the setting')

    check("keyName.GRIP_HAPTIC_EFFECT" in (GUI / 'hooks/useGripConfig.ts').read_text(encoding='utf-8'),
          'the GUI cannot read or write GRIP_HAPTIC_EFFECT')
    section = (GUI / 'components/keymap/GripSettingsSection.tsx').read_text(encoding='utf-8')
    check('HAPTIC_EFFECTS' in section,
          'the grip page builds its own effect list instead of the shared one')
    check("effect !== 'OFF'" in section,
          'the grip effect picker offers OFF, which is what the intensity slider is for')


def test_side_tokens_match_the_backend():
    cpp = backend_source()
    if cpp is None:
        print('SKIP test_side_tokens_match_the_backend (JoyShockMapper source not checked out)')
        return
    body = re.search(r"std::string parseHapticName.*?\n\}", cpp, re.S)
    check(body is not None, 'parseHapticName not found')
    body = body.group(0)
    for side, token in (('BOTH', 'BOTH_'), ('L', 'L_'), ('R', 'R_')):
        check(f'"{token}"' in body, f'backend does not accept the {side} side token {token!r}')
    check(gui_sides() == ['L', 'R', 'BOTH'],
          f'GUI offers sides {gui_sides()}, expected L, R and BOTH')


def test_prefix_matches_the_backend():
    cpp = backend_source()
    if cpp is None:
        print('SKIP test_prefix_matches_the_backend (JoyShockMapper source not checked out)')
        return
    m = re.search(r'constexpr std::string_view prefix = "([A-Z_]+)"', cpp)
    check(m is not None, 'haptic prefix not found in parseHapticName')
    gui = re.search(r"HAPTIC_PREFIX = '([A-Z_]+)'", HAPTICS)
    check(gui is not None, 'HAPTIC_PREFIX not found in hapticBindings.ts')
    check(m.group(1) == gui.group(1),
          f'prefix differs: backend {m.group(1)!r}, GUI {gui.group(1)!r}')


def test_gain_clamp_matches_the_backend():
    cpp = backend_source()
    if cpp is None:
        print('SKIP test_gain_clamp_matches_the_backend (JoyShockMapper source not checked out)')
        return
    check('gain > 127' in cpp, 'backend no longer clamps gain at 127; the GUI still does')
    check("HAPTIC_GAIN_MAX = 127" in HAPTICS, 'GUI gain ceiling drifted from the backend clamp')
    check("HAPTIC_GAIN_MIN = -127" in HAPTICS, 'GUI gain floor drifted from the backend clamp')


def test_negative_gain_uses_the_letter_n():
    # A leading '-' in a config token is already the release-only action
    # modifier, so a negative gain has to travel as N.
    check("`N${-gain}`" in HAPTICS,
          'negative gains must serialise as N<digits>, not -<digits>')
    cpp = backend_source()
    if cpp is not None:
        check("gainText.front() == 'N'" in cpp, 'backend no longer accepts an N-prefixed gain')


def test_every_effect_and_side_is_labelled():
    for locale, name in ((EN, 'en'), (ZH, 'zh-CN')):
        for effect in gui_effects():
            check(f'hapticEffect_{effect}:' in locale,
                  f'{name} has no label for haptic effect {effect}')
        for side in gui_sides():
            check(f'hapticSide_{side}:' in locale,
                  f'{name} has no label for haptic side {side}')
        for key in ('commandOutputHaptic', 'hapticSide', 'hapticEffect', 'hapticGain', 'hapticHint'):
            check(f'{key}:' in locale, f'{name} is missing the {key} string')


def test_haptics_are_offered_as_an_output_kind():
    check("{ value: 'haptic'" in COMPOSER,
          'the composer does not offer haptics as an output kind')
    check("'haptic'," in COMMANDS and "| 'haptic'" in COMMANDS,
          'BindingOutputKind does not include haptic')
    check('isHapticBindingValue' in COMMANDS,
          'an existing HAPTIC_ binding would not be recognised when a config is loaded')
    check("case 'haptic':" in COMMANDS,
          'a haptic command would not serialise back as a plain input token')


def test_the_picker_edits_all_three_fields():
    for field in ('hapticSide', 'hapticEffect', 'hapticGain'):
        check(f"t('keymap.{field}')" in PICKER, f'the picker does not expose {field}')
    check('formatHapticBinding' in PICKER and 'parseHapticBinding' in PICKER,
          'the picker must round-trip through the shared grammar, not build strings itself')


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
