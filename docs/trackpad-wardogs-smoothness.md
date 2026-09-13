> **REVERTED 11 September 2026.** Backed out together with the follow-up pass.
> See [trackpad-pan-protection-postmortem.md](trackpad-pan-protection-postmortem.md).
> The queue-clearing and double-precision filter fixes described here are sound
> and worth reapplying; the installed backend is back at baseline `e994dfe`.

# Wardogs slow-pan investigation — 11 September 2026

The subsequent pressure, friction, and count-precision update is documented in
[trackpad-pan-protection.md](trackpad-pan-protection.md). The measurements and
installed hash below describe the first fix, before that follow-up.

The installed backend matched the repository bundle before this change:
`E614E33A77DF36694A728662F0D9FA8FC54EF7B6F96F0C24F8B5F2E93EF45156`.
The active-profile metadata names Wardogs. Wardogs includes FPS Template, then
overrides its mouse settings. Relevant effective settings are 1 ms polling,
right-pad sensitivity 1.5, position cutoff 0.3 Hz, speed coefficient 0.95,
derivative cutoff 15 Hz, lift protection 140, click damping 1 at pressure 0.05,
and linear acceleration gain 1–2.5 across 0–1280 counts/s.

The saved Wardogs file has movement threshold 0; the applied-preview file has 3.
This is a saved/applied discrepancy, not proof of the exact in-memory setting.
Save and apply the desired Wardogs settings before comparing gameplay.

## Confirmed code defects and corrections

1. Partial lift suppression reset every queued resampler packet on every poll.
   At 1 kHz, that can erase a packet before its delayed delivery even starts.
   Partial suppression now scales new displacement while allowing previous
   packets to complete. Full suppression still cancels the queue, and lift
   suppression still prevents a trackball launch.
2. Every 16 ms coordinate repeat silently snapped away position-filter lag.
   With strong smoothing, repeated coordinates or short delivery gaps could
   continually discard nearly all motion. The held-coordinate stop window now
   follows roughly one quarter of the current filter time constant, bounded to
   16–250 ms. The shipped presets retain their 16 ms stop. Wardogs can settle for
   about 125–133 ms during a slow held-contact stop, plus the existing 8 ms
   resampler deadline. Actual release still ends the gesture with the existing
   measured-tail policy; this does not introduce post-release coasting.
3. Differentiating single-precision filtered absolute positions introduced tiny
   rounding steps, even on an unchanged perpendicular coordinate. Touch filtering
   now uses a double-precision error recurrence and subtraction, then converts
   the displacement to float. Gyro filtering is unchanged. The reproduced
   perpendicular error was very small; this is not claimed to explain visible
   game jitter by itself.

## Controlled reproduction

`touch_slow_pan_harness.cpp` compiles the real pipeline and mouse-processing code.
The isolated tests use Wardogs smoothing and sensitivity with acceleration
disabled to separate pressure/filter errors from changing gain.

| Case | Before | After |
| --- | ---: | ---: |
| Partial pressure drop, expected gain 97.826%, at 1 kHz | 0% | 97.826% |
| Same at 333 Hz | 16.304% | 97.826% |
| Slow pan with coordinates repeating for 24 ms: delivered gain | 3.185% | 99.974% |
| Same: float output coefficient of variation | 61.003% | 4.061% |
| Same: zero-output polls in the 5-second steady window | 835 | 0 |
| Constant perpendicular coordinate: largest output, pad widths | 7.45e-9 | 0 |

The 24 ms pattern is a controlled stress case, not a claim that Wardogs hardware
currently reports at that interval. Strong-smoothing held stops and actual
release are tested separately. All ten numeric harnesses and the source checks
pass, including flick onset, sign conservation, default stop deadlines, click
damping, re-touch, pressure lift, coast cancellation, and acceleration timing.
The GUI defaults test was updated to check the current compact selector and
numeric disclosure; its old assertion expected labels removed by earlier UI work.

## Existing hardware replay

The September 6 wireless capture was replayed through the baseline `e994dfe` and
the corrected code using `--wardogs`. The fixture covers the effective linear
acceleration and saved movement threshold 0. This capture has no useful pressure
channel, so it cannot validate the pressure fix or establish today's root cause.

For the previously identified slow swipe, seconds 1–6 at 240 Hz:

| Metric | Before | After |
| --- | ---: | ---: |
| Horizontal residual, counts/frame | 0.2817 | 0.2699 |
| Vertical residual, counts/frame | 0.1787 | 0.1810 |
| Combined residual, counts/frame | 0.3336 | 0.3250 |
| Frames without integer mouse movement | 70.81% | 68.89% |

The combined residual improvement is modest, about 2.6%; vertical residual is
slightly higher. At this sensitivity the swipe averages well under one mouse
count per display frame. Integer relative mouse injection cannot deliver a
fraction of a count; smoothing cannot eliminate that quantization floor.
These measurements are input timing diagnostics, not game-rendering validation.

## Reproduce

```powershell
python JoyShockMapper/tests/run_touch_harness.py
python JoyShockMapper/tests/touch_pipeline_regression.py
python tests/touchpad_filter_defaults_regression.py
python JoyShockMapper/tests/run_touch_harness.py --only touch_cadence_harness --source-ref e994dfe --replay build-jsm-sdl/touch-diagnostics/touch-puck-capture.csv --output before.csv --wardogs
python JoyShockMapper/tests/run_touch_harness.py --only touch_cadence_harness --replay build-jsm-sdl/touch-diagnostics/touch-puck-capture.csv --output after.csv --wardogs
python JoyShockMapper/tests/analyze_touch_replay.py before.csv after.csv --start 1 --end 6 --hz 240
```

The MSVC Release backend builds successfully. The tested binary SHA-256 is
`A2CD2EEE2141DF39C13D41865EB5A9A711887852CCEB528692F487BB5FF9CE3F`.
It was copied into both the repository bundle and the installed
`%LOCALAPPDATA%\JSM Studio\bin\SDL\JoyShockMapper.exe`; installed hashes match.
The previous installed executable and source marker were retained beside it as
`JoyShockMapper-before-20260911-smoothness.exe` and `.commit`. The existing mapper
process was left running with its old executable; restart the mapper to load the
fix. The saved/applied profiles were not rewritten during installation.
Builds require normalized environment-key casing on this host to avoid the
existing MSBuild `Path`/`PATH` collision. In-game orbit and peripheral-edge
verification remains necessary; do not interpret the controlled-test improvement
as a percentage improvement in visible game smoothness.
