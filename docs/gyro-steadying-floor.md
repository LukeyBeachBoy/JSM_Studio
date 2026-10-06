# Gyro Steadying Floor implementation

Configuration: `GYRO_STEADYING_FLOOR = X [Y]`, in RWS, default `0 0`.
A single value sets both axes. Negative and non-finite values are rejected by
the native setting filter. Floors are capped independently at the current curve
sensitivity. Existing native assignment, chord, layer and reset mechanisms are
used; no separate preset or persistence format is introduced.

## Engine and compatibility

`JoyShockMapper/JoyShockMapper/src/main.cpp` registers the FloatXY setting and
composes it with all six native acceleration curves. `include/GyroSteadying.h`
contains stateless recovery/blend helpers. `include/JoyShockMapper.h` declares
the setting identifier. There are no allocations or new smoothing stages.

The original pipeline projects the gyro axes, applies smoothing and optional
One Euro filtering, then applies cutoff/recovery to velocity. Gating, trackball
coasting and angle snapping precede acceleration. Sensitivity multiplication,
braking/click damping, calibration and output conversion follow. Originally,
recovery also reduced the speed seen by acceleration.

Both floors zero retain the original velocity-attenuation branch unchanged.
For positive floors, that attenuation is replaced by a per-axis sensitivity
blend after evaluating the normal curve at the unattenuated speed:

`factor = clamp((speed - cutoff) / (recovery - cutoff), 0, 1)`

`effective = cappedFloor + factor * (baseSensitivity - cappedFloor)`

At/above recovery the helper returns the base value directly, preserving exact
output rather than introducing rounding from the blend. Without a valid recovery
interval, the floor is inactive. Positive cutoffs still produce zero output under
the same cutoff boundary conventions. With cutoff zero, zero velocity stays
stationary even though effective sensitivity approaches the floor. Angular
position/deflection output retains its legacy path and setting-read timing.
Existing suppression, braking and click damping can still reduce movement.

## UI, preview and telemetry

Independent localized X/Y Steadying Floor controls follow Steadying in the
Noise & Steadying sheet. Cutoff and smoothing live alongside them; Dampening
contains deceleration braking and button-press suppression. They are disabled when recovery
is inactive while retaining their values. Base and held-input editors use the
same controls and preserve the other axis, including inherited values.

Parsing, key classification, import/export grouping and profile/layer copying
recognize the new assignment. The shared accelCurve utility models both legacy
velocity attenuation and the new sensitivity blend. Curve editor, hover/live
calculation, separate Y curve, sparkline and diagnostic preview use it. Static
sensitivity is supported. Native telemetry reports effective sensitivity before
braking/click damping, and reports pre-recovery input speed for the legacy path.
Synthetic trackball motion can differ from an IMU-only static graph.

Quadratic and JUMP already use MAX as an adjusted-speed cap. Consequently, with
MIN threshold 10 and MAX threshold 80, Quadratic reaches its maximum at speed 90.
The preview matches this backend convention; it was not changed to MAX - MIN.

For the requested 5-to-21 RWS Quadratic example, thresholds 0/80, recovery 5,
floor 2, the native tests verify 1 deg/s = 2.6005 RWS and 3 deg/s = 3.8135 RWS;
20/40/60/80 deg/s remain 6/9/14/21 RWS respectively.

## Verification

- Native floor harness: production curve files/evaluator, parser/filter, recovery,
  clamping, cutoff, static and asymmetric sensitivity pass.
- Frontend/config regression: 504 native/frontend parity samples across all six
  curves, legacy behavior, serialization, missing keys and mode shifts pass.
- Existing production smoothing and One Euro filter harnesses pass. The smoothing
  harness setting stub now supports the additional typed floor/output reads.
- 45 non-browser regression scripts passed.
- New browser regression: independent edit/save, disabled-value retention, held
  inheritance and curve rendering pass; controls and Quadratic graph inspected.
- Focused lint on feature components/hooks/utilities passes.
- TypeScript, native mapper, production web and Tauri/NSIS installer builds pass.
  Windows PowerShell needs its standard PSModulePath restored for Get-FileHash in
  the prebuild driver-verification script; no script source workaround was added.

Repository-wide lint remains blocked by an existing mockDesktop.ts extra
semicolon and 34 unrelated warnings. The coverage contract has existing missing
TILT_ON/TILT_OFF declarations; the floor has a COMPLETE entry. The existing
accel_curve_editor_regression.cjs browser script times out looking for a
button.summary-row labeled Curve; the current editor uses a different control.
The new floor browser test passes against the current rendered editor.

No physical-controller feel, installed-app or game testing was performed. The
installer was built, not installed, and the user's running mapper was not stopped.


## Build artifact

Installer: `JSM_GUI/jsm_gui_tauri/src-tauri/target/release/bundle/nsis/JSM Evolved_0.7.124_x64-setup.exe`

SHA-256: `d38323f7e6aafd781a5770a6d24ff46e40c287f63cc7f61396f01b52d19f1818`

Re-run the feature checks with:

```text
python JoyShockMapper/tests/run_gyro_steadying_harness.py
node tests/gyro_steadying_floor_regression.cjs
python JoyShockMapper/tests/run_gyro_smoothing_harness.py
python JoyShockMapper/tests/run_gyro_filter_harness.py
```

Browser check uses `JSM_TEST_URL` for a local built preview and the existing
`scripts/playwright-regression-fixture.cjs` preload to dismiss onboarding.


UI grouping correction: Noise & Steadying now owns cutoff, the Steadying region,
X/Y Steadying Floors, smoothing, filtering and angle snapping. Dampening owns
contextual braking and press suppression, with its existing trackball slowdown.
Both base and held-input editors use the same grouping. The browser regression
verifies the floor is absent from Dampening, editing preserves the other axis,
and inactive Steadying retains the stored floor. Rendered sections were inspected;
focused lint, type checking and the updated installer build pass.

The additional sheet_color_browser_regression.cjs controller-scroll run is blocked before reaching the gyro UI: its expected onboarding button 'Keep them' is absent. The dedicated current-renderer placement/save regression passes.
