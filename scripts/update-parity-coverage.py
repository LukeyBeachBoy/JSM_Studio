"""Record reviewed graphical ownership without pretending unverified UI is complete."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
contract_path = ROOT / 'docs/jsm-ui-coverage.json'
contract = json.loads(contract_path.read_text())
PREFIX = 'JSM_GUI/jsm_gui_tauri/src/'


def declare(keys, editor, reason, complete=False, tests=()):
    for key in keys:
        contract[key] = {'status': 'COMPLETE' if complete else 'PARTIAL', 'reason': reason,
                         'editors': [PREFIX + editor], 'verification': list(tests)}


declare(['VIRTUAL_MENU', 'VIRTUAL_MENUS', 'VIRTUAL_MENU_ACTION', 'VIRTUAL_MENU_SOURCE'],
        'components/keymap/VirtualMenuLibrary.tsx',
        'Reusable radial wheels with optional centre actions, touch-grid and pad/stick/D-pad/face-button hotbar definitions with independent activation/navigation/selection, labels/icons, placement, shared advanced command editor, native selection telemetry and ordinary layer overrides. Actual native Mapping/DigitalButton output and catalog replacement, browser save/reload and simulated controller navigation pass. Overlay/game transitions and physical validation remain.',
        tests=['tests/virtual_menus_regression.cjs', 'tests/virtual_menus_browser_regression.cjs', 'JoyShockMapper/tests/run_virtual_menu_harness.py', 'JoyShockMapper/tests/run_virtual_menu_catalog_harness.py', 'JoyShockMapper/tests/run_virtual_menu_runtime_harness.py'])
declare(['GYRO_OUTPUT', 'VIRTUAL_STICK_CALIBRATION', 'VIRTUAL_CONTROLLER'] +
        [f'{side}_STICK_{field}' for side in ['LEFT', 'RIGHT'] for field in ['UNDEADZONE_INNER', 'UNDEADZONE_OUTER', 'UNPOWER', 'VIRTUAL_SCALE', 'DEADZONE_PROBE']],
        'components/GyroVirtualStick.tsx',
        'Contextual gyro camera output, per-target correction, native output display and guided calibration. Controller-only gameplay and driver availability require physical verification.',
        True, ['tests/gyro_virtual_stick_regression.cjs', 'tests/gyro_virtual_stick_browser_regression.cjs'])
declare(['MOTION_STICK_MODE', 'MOTION_STICK_AXIS', 'MOTION_DEADZONE_INNER', 'MOTION_DEADZONE_OUTER', 'MOTION_RING_MODE', 'CONTROLLER_ORIENTATION', 'LEAN_THRESHOLD'],
        'components/MotionInputTuning.tsx', 'Dedicated tilt/steering section with degree-based geometry and all native mounting directions, including sideways paired Joy-Cons; motion directions/lean/ring use the shared binding editor. Physical steering/neutral validation remains.')
declare(['LEFT_STICK_DEADZONE_PROBE', 'RIGHT_STICK_DEADZONE_PROBE'],
        'components/VirtualStickProbe.tsx',
        'Explicit per-target idle calibration signal in gyro and virtual-stick source editors, including held shifts. ON preserves legacy imports; OFF gives zero idle output. The guide finishes with OFF. Native formula and graphical round-trip verification are separate from physical gameplay validation.',
        tests=['JoyShockMapper/tests/run_gyro_stick_harness.py', 'tests/gyro_virtual_stick_regression.cjs', 'tests/gyro_virtual_stick_browser_regression.cjs'])
declare(['SET_MOTION_STICK_NEUTRAL'], 'components/keymap/ActionPicker.tsx', 'Named recenter action in the ordinary picker; native macro remains authoritative. Physical recenter verification remains.')
declare(['GYRO_HAPTIC_INTENSITY', 'GYRO_HAPTIC_INTERVAL', 'GYRO_HAPTIC_EFFECT', 'GYRO_HAPTIC_SIDE'], 'components/GyroRotationFeedback.tsx',
        'Dedicated Steam Controller rotation feedback with angular spacing, strength, effect and left/right/both actuator selection. Native aim-axis travel is measured before sensitivity and trackball synthesis, with at most one pulse per poll. Held overrides use controller context; zero strength preserves legacy profiles. Physical pulse feel remains pending.',
        tests=['JoyShockMapper/tests/run_gyro_haptics_harness.py', 'tests/gyro_virtual_stick_browser_regression.cjs'])
declare(['ONE_EURO_MIN_CUTOFF', 'ONE_EURO_SPEED_COEFF'], 'components/NoiseSteadyingControls.tsx',
        'Readable adaptive gyro filter controls with held-input tuning, inherited base values and comment-preserving edits. Native gyro processing resolves both parameters through the active controller context and retains filter history across hold/release. The enable command remains configuration-global. Native recorded-boundary verification passes; physical slow-aim feel remains pending.',
        tests=['JoyShockMapper/tests/run_gyro_filter_harness.py', 'tests/gyro_virtual_stick_browser_regression.cjs'])
declare(['MOUSE_X_FROM_GYRO_AXIS', 'MOUSE_Y_FROM_GYRO_AXIS'], 'components/GyroPage.tsx', 'Local-space axis selector including additive masks; native mask names now accept combinations. Scoped runtime checks remain.')
declare(['ANGLE_TO_AXIS_DEADZONE_INNER', 'ANGLE_TO_AXIS_DEADZONE_OUTER', 'WIND_STICK_RANGE', 'WIND_STICK_POWER', 'UNWIND_RATE', 'MOUSELIKE_FACTOR', 'RETURN_DEADZONE_ANGLE', 'RETURN_DEADZONE_ANGLE_CUTOFF', 'RETURN_DEADZONE_IS_ACTIVE', 'EDGE_PUSH_IS_ACTIVE', 'ROTATE_SMOOTH_OVERRIDE', 'FLICK_STICK_OUTPUT', 'SCREEN_RESOLUTION_X', 'SCREEN_RESOLUTION_Y'],
        'components/SourceModeTuning.tsx', 'Curated controls appear for the relevant source modes, shared by ordinary sources and modeshifts. Coupled validation and independent FloatXY writes tested; complete source-mode browser/gameplay validation remains.')
declare(['MOUSE_RING_RADIUS', 'SCROLL_SENS'], 'hooks/useStickModeExtras.tsx', 'Existing source-specific cursor/scroll controls; mode dependency and import review remain.')
for side in ['LEFT', 'RIGHT']:
    declare([f'{side}_{name}' for name in ['GRID_SIZE', 'GRID_SHAPE', 'GRID_DEADZONE', 'GRID_REQUIRES_CLICK', 'TOUCHPAD_SENS', 'TOUCH_STICK_MODE', 'TOUCH_RING_MODE', 'TOUCH_DEADZONE_INNER', 'TOUCH_STICK_RADIUS', 'TOUCH_STICK_AXIS', 'TOUCHPAD_DUAL_STAGE_MODE']],
            'components/keymap/PadSection.tsx', 'Per-pad controls derive their keys from the physical source prefix; literal-key searches alone undercount these controls. Independent pad/shift runtime and physical review remain.')
    declare([f'{side}_{name}' for name in ['STICK_DEADZONE_INNER', 'STICK_DEADZONE_OUTER', 'STICK_MENU_SIZE', 'STICK_MENU_DEADZONE', 'RING_MODE']],
            'components/keymap/StickSection.tsx', 'Per-source stick controls and radial menu bindings. Derived keys are intentionally graphical, with menu/shift validation still under review.')
    declare([f'{side}_TOUCHPAD_AREA', f'{side}_TOUCHPAD_AREA_FIT'], 'components/keymap/PadSection.tsx', 'Concurrent mouse-region implementation detected by registry drift check and preserved; screen rectangle/fit controls require independent parity review.')
declare([f'{side}_TOUCHPAD_{field}' for side in ['LEFT', 'RIGHT'] for field in ['HAPTICS', 'HAPTIC_INTENSITY', 'HAPTIC_EFFECT', 'HAPTIC_INTERVAL', 'CLICK_HAPTIC_INTENSITY', 'CLICK_HAPTIC_EFFECT', 'RELEASE_HAPTIC_INTENSITY', 'RELEASE_HAPTIC_EFFECT']],
        'components/keymap/PadFeedbackRows.tsx', 'Independent pad feedback is opt-in, preserving legacy shared settings. Movement controls appear in Mouse mode; click/release work in every mode. Ordinary and held-input editors share typed strength/effect/spacing controls and explicit shared/custom policy. Production native selector/click-routing harness, unit preservation/scope tests and browser independent save/reload/held controls pass; physical actuator validation remains.',
        tests=['tests/pad_feedback_regression.cjs', 'tests/pad_feedback_browser_regression.cjs', 'JoyShockMapper/tests/run_pad_haptics_harness.py'])

declare(['TOUCHPAD_DUAL_STAGE_MODE', 'LEFT_TOUCHPAD_DUAL_STAGE_MODE', 'RIGHT_TOUCHPAD_DUAL_STAGE_MODE'],
        'components/keymap/PadSection.tsx', 'All seven native touch/click policies have friendly labels and contextual help for mouse, menu and other pad modes, including held-input overrides. Native routing now uses independent pad FSM slots and raw same-poll touch contacts; contact cannot count as click or inherit analog-trigger thresholds. Actual trigger FSM and simulated browser save/reload pass; physical pad validation remains.',
        tests=['tests/pad_dual_stage_browser_regression.cjs', 'JoyShockMapper/tests/run_trigger_modes_harness.py', 'JoyShockMapper/tests/run_virtual_menu_runtime_harness.py'])

declare(['TOUCHPAD_AREA', 'TOUCHPAD_AREA_FIT'], 'hooks/useMouseAreaConfig.ts', 'Concurrent single-pad mouse-region implementation preserved; complete end-to-end review remains.')
declare(['TOUCHPAD_ACCELERATION', 'TOUCHPAD_GRID_REQUIRES_CLICK'], 'components/keymap/MouseFeelSheet.tsx', 'Existing contextual mouse and grid controls; aliases and global-versus-source semantics require review.')
declare(['IGNORE_GYRO_DEVICES', 'CALCULATE_REAL_WORLD_CALIBRATION'], 'components/GyroBehaviorControls.tsx', 'Existing device exclusion and calibration workflow; the command aliases need full verification.')
declare(['BOOT_SOUND_LEVEL', 'CONNECT_SOUND', 'CONNECT_SOUND_FILE', 'SHUTDOWN_SOUND', 'SHUTDOWN_SOUND_FILE', 'SOUND_GAIN', 'SOUND_ACTUATORS', 'GYRO_CALIBRATION_TIME', 'GYRO_CALIBRATION_DELAY'],
        'components/ControllerPreferences.tsx', 'Native controller preferences/sound library own these settings with friendly controls. Per-profile command equivalence and hardware review remain.')
declare(['DISABLE_HARDWARE_GYRO_CALIBRATION'], 'components/ControllerPreferences.tsx', 'Dedicated Steam Controller firmware drift-correction switch in controller preferences, persisted through native runtime preferences. This is a device-global firmware setting; profile precedence and physical slow-motion checks remain.')
declare(['LEFT_TRIGGER_EFFECT', 'RIGHT_TRIGGER_EFFECT', 'LEFT_TRIGGER_OFFSET', 'RIGHT_TRIGGER_OFFSET', 'LEFT_TRIGGER_RANGE', 'RIGHT_TRIGGER_RANGE'],
        'components/AdaptiveTriggerEditor.tsx', 'Independent DualSense effects have parameter-specific controls, packet-correct units, coupled range validation, imported-value preservation and calibration rows. Physical resistance/pulse validation remains.')
declare(['TRIGGER_SKIP_DELAY', 'TRIGGER_THRESHOLD', 'TRIGGER_HYSTERESIS', 'ZL_MODE', 'ZR_MODE'], 'components/KeymapControls.tsx', 'Digital/hair/passthrough-dependent controls with percentage hysteresis covering the native range, real negative-threshold serialization, accurate responsive-soft semantics, either analogue output target and PlayStation alias preservation. DualSense explains adaptive resistance disabling hair detection and offers an explicit OFF control. Native trigger FSM/routing/dependency and renderer serialization pass; physical travel and resistance remain.', tests=['JoyShockMapper/tests/run_trigger_modes_harness.py', 'tests/parity_controls_browser_regression.cjs'])
declare(['LEFT_STICK_AXIS', 'RIGHT_STICK_AXIS'], 'components/SourceModeTuning.tsx', 'Independent horizontal/vertical source inversion in the shared source editor, including held shifts; source mode direction tests remain.')
declare(['AUTO_CALIBRATE_GYRO', 'JOYCON_GYRO_MASK', 'JOYCON_MOTION_MASK', 'TRACKBALL_DECAY'], 'components/GyroPage.tsx', 'Automatic native drift correction, paired Joy-Con source choices and native gyro trackball slowdown. Global versus chorded applicability is explicit; physical validation remains.')
declare(['TOUCHPAD_D_CUTOFF'], 'components/keymap/MouseFeelSheet.tsx', 'Dedicated velocity estimate filter row under advanced smoothing; ordinary profile setting, shared by mouse pads. Slow-orbit hardware check remains.')
declare(['IGNORE_OS_MOUSE_SPEED'], 'hooks/useStickConfig.ts', 'Mouse speed compensation toggle now emits explicit native ignore/reset when turned off and reads last command precedence. Calibration-preset/import verification remains.')
for key, reason, editor in [
    ('STICK_AXIS_X', 'Legacy all-source axis alias. Independent left/right stick and motion-axis controls replace it without discarding imported aliases.', 'components/SourceModeTuning.tsx'),
    ('STICK_AXIS_Y', 'Legacy all-source axis alias. Independent left/right stick and motion-axis controls replace it without discarding imported aliases.', 'components/SourceModeTuning.tsx'),
    ('NO_GYRO_BUTTON', 'Legacy gyro activation reset imported with native last-command precedence. Always on writes explicit GYRO_OFF = NONE, including layer/chord scopes, so inherited conditions are overridden.', 'components/GyroBehaviorControls.tsx'),
]:
    contract[key] = {'status': 'LEGACY', 'reason': reason, 'editors': [PREFIX + editor], 'verification': []}
contract['SLEEP'] = {'status': 'INTERNAL', 'reason': 'Operational config-loading/console pause (up to ten seconds), also used by calibration scripts. It is not an input timing setting or per-activator delay. Do not expose a blocking runtime pause as a gameplay activator.', 'editors': [], 'verification': []}
contract_path.write_text(json.dumps(dict(sorted(contract.items())), indent=2) + '\n')
print('Coverage declarations refreshed; unreviewed entries remain explicit gaps.')
