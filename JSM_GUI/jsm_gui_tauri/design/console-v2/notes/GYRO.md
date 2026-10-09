# GYRO notes (P5: the Gyro tab, Fine-tune, Advanced parts, Recalibrate, Match a full turn, When is gyro on?, While holding)

Built against `Gyro*.dc.html` and IMPLEMENTATION.md (D5, D6, D7, D13, D21). Everything is in `src/components/gyro/` plus `components/GyroPage.tsx`. The screens read and write config keys directly through `useGyro()` (`GyroContext.tsx`), so a held "While holding..." variant runs the very same screens on a projection (`projectModeshift` / `foldModeshift`).

## 1. Built, file by file

### Screens (`components/gyro/`)
- `GyroContext.tsx`: the environment (`text`, `setText`, `rootText`, `held`, `ownKeys`, `locked`, `family`, `sample`, `devices`, `callbacks`) and the shared rows: `KeyNumberRow`, `KeyChoiceRow`, `SwitchRow`, `KeySwitchRow`, `PadActions` (X/Y claimed per screen), `LiveTag`, `VisualTitle`, `Note`. Global keys (`GYRO_GLOBAL_KEYS`: VIRTUAL_CONTROLLER, ONE_EURO_FILTER, AUTO_CALIBRATE_GYRO, GYRO_CALIBRATION_DELAY/TIME, TICK_TIME, IGNORE_GYRO_DEVICES, COUNTER/IGNORE_OS_MOUSE_SPEED, REAL_WORLD_CALIBRATION, IN_GAME_SENS, ACCEL_CURVE_LINK) never become held chords. Explicit off/default values are written (not removed) in a held variant so an inherited value does not show through.
- `GyroFront.tsx`: the three questions. Q1 "When is gyro on?" (Always / While I hold... / Unless I hold... / Only while aiming / Off; Y on the held options picks the input), Q2 "How fast?" (hero Turn speed with the live wheel, Match a full turn), Q3 "Does it feel right?" (Small aim wobbles, Big turns feel slow, Aim drifts when still > Run, Up and down is reversed, Fine-tune >). LT/RT steps the questions (`GYRO_QUESTION_EVENT`).
- `GyroFineTune.tsx` + `groups.tsx`: the Fine-tune rail (Speed, Steadiness, Direction, Rumble) with status and "changed" dots. Each group has its live visual and an Advanced row.
- `SpeedAdvanced.tsx`: parts Speeds / Shape / Game & lean, the curve plot with draggable handles (a drag writes both axes proportionally).
- `SteadinessAdvanced.tsx`: parts Ignore jitter / Smoothing / Adaptive filter / Snap & brake, each with its filter-model visual.
- `DirectionAdvanced.tsx`: which rotation drives each axis, Tilt to move, update rate, Joy-Con halves, ignored controllers; entry to Tilt and Stick settings.
- `TiltSettings.tsx`: parts Behaviour / Angles / Tuning / Orientation / When tilt is on / While holding.
- `StickSettings.tsx`: the virtual stick (Setup, Deadzone & curve). Uses P4's `sticks/GameStickMatchGuide`.
- `WhenOn.tsx`: activation as inputs on the controller front/back (`ActivationEditor`, Any one / All of them, While I hold / Unless I hold), live "is gyro on right now", entry to While holding.
- `WhileHolding.tsx`: held variants list (gyro and tilt), "Add a button" and "Add a button to let go of" (`!X`), per-variant editor via `HeldScope` / `useHeldEnv`.
- `MatchFullTurn.tsx`: guided real-world calibration (replaces `RwcGuideModal`), X "Count again".
- `Recalibrate.tsx`: follows the mapper's `gyroCal` telemetry (waiting, measuring, done), ring and live movement, schedule rows (Wait before measuring, Measure for, Fix drift automatically), "Start over".
- `GyroMore.tsx`: Y "More" sheet on the front and in Fine-tune: Copy / Paste gyro tuning (was the page header's TuningClipboard), the other screens.
- `visuals.tsx`, `art.tsx`, `inputs.ts`, `usePointerSpeed.ts`, `Gyro.module.css`: live visuals, output art, pressed-input hooks, Windows pointer speed hook.
- `components/GyroPage.tsx`: rewritten. Builds the env, hosts all overlays, listens for `jsm:gyro-route`.

### Utilities (`src/utils/`)
- `gyroSpeed.ts` (turn speed over static or curve, speed-up presets, `setCurveType`), `gyroPresets.ts` (Steadiness, Rumble, toggles), `gyroSteadiness.ts` (TypeScript model of the filter chain, with wobble and delay statistics), `gyroRoutes.ts` (key to screen map, section 4).

### Elsewhere
- `AccelCurveView.tsx`: gyro side removed (LB/RB conflict with V1 gone). A gyro request re-dispatches to the Gyro page (Speed > Advanced). The trackpad half is unchanged.
- `ui/console/FineTune.tsx/.css`, `Rows.tsx`: additive props only (`railLabel`, `detail`, status, topmost-sub-page focus guard).
- `platform/desktopBridge.ts`, `types/global.d.ts`, `dev/mockDesktop.ts`: `getWindowsPointerSpeed`, mock pointer speed, `recalibrateGyro`, `onCalibrationStatus`, `gyroCal` telemetry.
- Rust: `src-tauri/src/commands.rs` `get_windows_pointer_speed` (SPI_GETMOUSESPEED + SPI_GETMOUSE, returns the 1-20 slider and the acceleration flag), registered in `lib.rs`. `cargo check` passes.
- `App.tsx` (small edits): gyro has no page header (Recalibrate and Copy/Paste moved into the screens); `jsm:accel-curve` gyro goes to Speed > Advanced; `jsm:gyro-tilt` (from BIND) opens Fine-tune > Direction > Advanced > Tilt; `navigateInput` and `goToModeChange` route gyro keys through `gyroRouteForKey`; LT/RT on the gyro tab sends `GYRO_QUESTION_EVENT`. The `RwcGuideModal` and `TuningClipboard` wiring is removed.
- Deleted: `GyroModeshifts`, `MotionInputTuning`, `TiltActivationControls`, `GyroActivationConditions`, `SensitivityControls`, `StaticSensForm`, `NoiseSteadyingControls`, `CurvePreview`, `SensitivityGraph`, `TelemetryBanner`, `GyroRotationFeedback`, `GyroVirtualStick(.module.css)`, `AccelSensForm`, `AccelCurveEditor(.module.css)`, `GyroBehaviorControls`, `GyroClipboard`, `GameStickGuide`, `RwcGuideModal`, `TuningClipboard`, and the old `Gyro/GyroPage/Telemetry/Graph` CSS modules.

## 2. Re-homed settings (D5)

| Setting(s) | Now lives in |
|---|---|
| GYRO_SENS, MIN/MAX_GYRO_SENS | Front Q2 and Fine-tune > Speed (hero); up/down pairs in Speed > Advanced > Speeds ("Separate up/down speeds") |
| MIN/MAX_GYRO_THRESHOLD | Speed > Advanced > Speeds (Slow until / Fast from) |
| ACCEL_CURVE and every ACCEL_* shape key | Speed > Advanced > Shape (curve cards, plot, per-shape rows) |
| ACCEL_CURVE_LINK, GYRO_USES_TOUCHPAD / TOUCHPAD_USES_GYRO | Speed > Advanced > Shape ("Curve source": Each has its own / Gyro uses trackpad's / Trackpads use gyro's) |
| REAL_WORLD_CALIBRATION, IN_GAME_SENS | Match a full turn (guided), and Speed > Advanced > Game & lean (typed) |
| COUNTER_OS_MOUSE_SPEED / IGNORE_OS_MOUSE_SPEED | Speed > Advanced > Game & lean ("Ignore Windows pointer speed"), with the live Windows pointer-speed readout (new Tauri command) |
| ROLL_CONTRIBUTION (Lean adds turn) | Speed > Advanced > Game & lean |
| GYRO_SPACE, GYRO_AXIS_X/Y | Fine-tune > Direction (space cards, invert switches; the front's Invert up/down) |
| GYRO_OUTPUT, VIRTUAL_CONTROLLER | Fine-tune > Direction (output cards, Virtual pad) |
| MOUSE_X/Y_FROM_GYRO_AXIS, TICK_TIME, IGNORE_GYRO_DEVICES, JOYCON_GYRO_MASK / JOYCON_MOTION_MASK | Direction > Advanced |
| GYRO_STICK_DEFLECTION, GYRO_DEFLECTION_RANGE / LOCK_EXTENTS, VIRTUAL_STICK_CALIBRATION, *_STICK_VIRTUAL_SCALE, UNDEADZONE_INNER/OUTER, UNPOWER, DEADZONE_PROBE | Stick settings (Direction > Advanced > Stick settings): Setup, Deadzone & curve |
| MOTION_STICK_MODE, MOTION_DEADZONE_*, LEAN_THRESHOLD, MOTION_RING_MODE, MOTION_STICK_AXIS, CONTROLLER_ORIENTATION, STICK_POWER, STICK_ACCELERATION_*, FLICK_*, MOUSE_RING_RADIUS, TILT_ON / TILT_OFF | Direction > Advanced > Tilt (parts Behaviour, Angles, Tuning, Orientation, When tilt is on) |
| Tilt held variants (chords with tilt-only keys) | Tilt > While holding... |
| GYRO_CUTOFF_SPEED / RECOVERY, GYRO_STEADYING_FLOOR | Steadiness > Advanced > Ignore jitter |
| GYRO_SMOOTH_THRESHOLD / TIME, GYRO_SMOOTHING_DECAY | Steadiness > Advanced > Smoothing |
| ONE_EURO_FILTER, ONE_EURO_MIN_CUTOFF, ONE_EURO_SPEED_COEFF | Steadiness > Advanced > Adaptive filter |
| GYRO_ANGLE_SNAP(_EASE), DECEL_BRAKE_*, GYRO_CLICK_DAMPEN, TRACKBALL_DECAY | Fine-tune > Steadiness switches (click, snap) and Advanced > Snap & brake |
| GYRO_HAPTIC_INTENSITY / INTERVAL / EFFECT / SIDE | Fine-tune > Rumble |
| GYRO_ON, GYRO_OFF, NO_GYRO_BUTTON | Front Q1 and When is gyro on? |
| Held variants of any gyro key (`BTN,KEY`) | When is gyro on? > While holding... (editor = the Fine-tune groups on a projection; "let go" `!X` supported) |
| AUTO_CALIBRATE_GYRO, GYRO_CALIBRATION_DELAY / TIME | Recalibrate |
| Copy / Paste gyro tuning | Y "More" on the front and Fine-tune |
| Real-world-calibration guide modal | Match a full turn |
| Legacy gyro page header (telemetry chip, Recalibrate) | Front Q3 > Run; Recalibrate shows live state |

## 3. Preset numbers (D7)

Steadiness (`GYRO_CUTOFF_SPEED` / `GYRO_CUTOFF_RECOVERY` / `GYRO_SMOOTH_THRESHOLD` °/s / `GYRO_SMOOTH_TIME` s). A configuration whose four numbers match none shows Custom. Off ignores the window length once the other three are 0.

| Preset | CUTOFF_SPEED | CUTOFF_RECOVERY | SMOOTH_THRESHOLD | SMOOTH_TIME | Modelled wobble cut / delay on slow aim |
|---|---|---|---|---|---|
| Off | 0 | 0 | 0 | 0.125 (default) | none |
| Light | 0 | 0 | 5 | 0.08 | about -50% / about 0 ms |
| Medium | 0.3 | 1 | 6 | 0.1 | about -71% / about 24 ms |
| Heavy | 0.5 | 2 | 10 | 0.15 | nearly all / about 75 ms |

Presets were chosen by running `utils/gyroSteadiness.ts` (tremor amplitude 2.5 °/s) over a still hand; real turns pass untouched. One Euro is global and never part of a preset. Off writes no lines (held variants write explicit defaults).

Other numbers:
- Speed up fast turns (multiplier on the slow speed, slow-until / fast-from in °/s): Gentle 1.5x, 5, 75; Strong 2.5x, 5, 50; Off = a single speed; anything else = Custom. Written as MIN/MAX_GYRO_SENS plus both thresholds, the static GYRO_SENS and curve keys removed.
- Rumble while aiming (`GYRO_HAPTIC_INTENSITY`): Off 0, Light 25, Medium 50, Strong 100; other = Custom.
- Steady while clicking: `GYRO_CLICK_DAMPEN` 0.75 on, 0 off. Snap to straight lines: `GYRO_ANGLE_SNAP` 6 degrees on, 0 off.
- Front "Small aim wobbles": applies the Medium steadiness preset. Front "Big turns feel slow": applies Gentle.

## 4. Route map (for MODES and others)

`utils/gyroRoutes.ts`: `gyroRouteForKey(key)` returns the screen that edits a key, `requestGyroRoute(route)` opens it (event `jsm:gyro-route` carrying the route; a request made before the lazy page mounts waits in `takeGyroRoute`). Chords (`L,GYRO_SENS`) go to While holding... with that trigger open; tilt-only chords go to Tilt > While holding.

| Key(s) | Route |
|---|---|
| GYRO_ON / GYRO_OFF / NO_GYRO_BUTTON | When is gyro on? |
| AUTO_CALIBRATE_GYRO, GYRO_CALIBRATION_DELAY/TIME | Recalibrate |
| GYRO_SENS, MIN/MAX_GYRO_SENS | Fine-tune > Speed |
| MIN/MAX_GYRO_THRESHOLD | Speed > Advanced > Speeds |
| ACCEL_* | Speed > Advanced > Shape |
| REAL_WORLD_CALIBRATION, IN_GAME_SENS, COUNTER/IGNORE_OS_MOUSE_SPEED, ROLL_CONTRIBUTION | Speed > Advanced > Game & lean |
| GYRO_CUTOFF_*, GYRO_STEADYING_FLOOR | Steadiness > Advanced > Ignore jitter |
| GYRO_SMOOTH_*, GYRO_SMOOTHING_DECAY | Steadiness > Advanced > Smoothing |
| ONE_EURO_* | Steadiness > Advanced > Adaptive filter |
| GYRO_ANGLE_SNAP*, DECEL_BRAKE_*, GYRO_CLICK_DAMPEN, TRACKBALL_DECAY | Steadiness > Advanced > Snap & brake |
| GYRO_OUTPUT, GYRO_SPACE, GYRO_AXIS_X/Y | Fine-tune > Direction |
| MOUSE_X/Y_FROM_GYRO_AXIS, TICK_TIME, IGNORE_GYRO_DEVICES, JOYCON_*_MASK | Direction > Advanced |
| VIRTUAL_CONTROLLER, GYRO_STICK_DEFLECTION, GYRO_DEFLECTION_*, VIRTUAL_STICK_CALIBRATION, *_STICK_VIRTUAL_SCALE | Direction > Advanced > Stick settings > Setup |
| *_STICK_UNDEADZONE_*, UNPOWER, DEADZONE_PROBE | Stick settings > Deadzone & curve |
| TILT_ON/OFF, MOTION_STICK_MODE, MOTION_DEADZONE_*, LEAN_THRESHOLD, MOTION_RING_MODE, MOTION_STICK_AXIS, CONTROLLER_ORIENTATION | Direction > Advanced > Tilt (matching part) |
| GYRO_HAPTIC_* | Fine-tune > Rumble |

Event hooks wired in `App.tsx`: `jsm:accel-curve` (gyro side) goes to Speed > Advanced; `jsm:gyro-tilt` goes to Tilt (D6).

## 5. Renames (D21) and wording
Gyro-page strings are inline in the new components. The old `gyroPage.*` i18n keys that `AccelCurveView` still reads were kept (`minSensitivity`, `maxSensitivity`, `shiftView*`, `sensitivityMode`, `mode*`, `curveTypeDesc`); the rest are unused and can be removed by whoever next edits `en.ts` / `zh-CN.ts`. "Modeshift" reads "While holding...", "RWC / Real world calibration" reads "Match a full turn", "Noise / jitter" reads "Steadiness", "Accel curve" reads "Speed up fast turns" with the curve under Advanced. No `title=` attributes are used.

## 6. Tests

Run against the shared dev server (`JSM_TEST_URL=http://127.0.0.1:1420` for tests that install their own `electronAPI`, `?mock` default for the rest).

New: `gyro_v2_helpers.cjs` (shared navigation and inherited/override checks), `gyro_v2_logic_regression` (speed, presets with Custom, steadiness model, route map), `gyro_navigation_browser_regression`, `gyro_routes_browser_regression`, `gyro_calibrate_browser_regression`, `gyro_template_inheritance_browser_regression`, `gyro_tilt_link_browser_regression`.

Rewritten for the new structure: `gyro_virtual_stick_`, `gyro_deflection_`, `gyro_steadying_floor_`, `gyro_steering_`, `gyro_tilt_tuning_`, `gyro_tilt_modeshift_`, `accel_curve_editor_regression`, `curve_scroll_browser_regression`. Gyro segments edited in `nested_back_`, `parity_controls_browser_`, `select_help_panel_fit_`, `template_override_roundtrip_`, `steam_workspace_`, `analog_modeshift_browser_`, `pad_axis_audit_regression` (22 gyro scenarios, `GYRO_RAIL` waives retrace on rail/parts screens).

Last run, all PASS: every `gyro_*` test (including the unchanged `gyro_action_*`, `gyro_deflection_regression`, `gyro_steadying_floor_regression`, `gyro_virtual_stick_regression`, `calibrate_gyro_action_regression`), `accel_curve_editor`, `curve_scroll`, `analog_modeshift`, `nested_back`, `parity_controls`, `select_help_panel_fit`. `pad_axis_audit_regression` with `JSM_TEST_SCENARIOS='^Gyro'`: no gyro problems at either size.

Failing for reasons outside GYRO (none were failing on the baseline, all come from other areas' redesigns; the gyro parts of each pass):
- `template_override_roundtrip_regression`: the gyro checks pass; it stops at the Sticks assertion `markerOf('LEFT_STICK_MODE')` (P4's rewritten Sticks page).
- `steam_workspace_regression`: stops in the Buttons action picker (BIND) before reaching Gyro. With the Buttons segment cut out in a scratch copy, the Gyro segment passes and the run later stops at the Modes "New layer name" step (MODES).
- `pad_axis_audit_regression`, `steals()` job only: "RT to Layout: focus landed 0 times" (Layout tab, another area).

`npx tsc --noEmit -p .` is clean at the time of writing. `cargo check` passes for the new command.

## 7. Not done, and why
- Recalibrate cannot be cancelled and cannot show drift found so far. The mapper has no cancel command and does not report a running estimate. The "Stop" control is present, disabled, and says so (`data-reason`); "Drift found so far" reads "Not reported". Needs a mapper change (submodule not touched).
- App still passes the legacy sensitivity props (`sensitivity`, `modeshiftSensitivity`, `onApply`...) to `GyroPage`; they are accepted and ignored. Removing them is an App.tsx cleanup other agents are also editing.
- With a controller connected, an inherited value can show a "Changed from..." origin tag because the page reads the controller projection that already holds the resolved template (pre-existing projection issue). Tag checks in tests run with no device or with `{origin:false}`; gyro_template_inheritance covers the tags.
- Unused `gyroPage.*` keys remain in `en.ts` / `zh-CN.ts` (shared files, left alone on purpose).
- Hardware: nothing here was checked against a real controller; all verification was the mock pad and Playwright screenshots.
