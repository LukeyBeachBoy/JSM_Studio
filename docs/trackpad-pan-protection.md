> **REVERTED 11 September 2026.** The changes below were backed out: they made
> the orbit-and-recenter test worse, not better. Do not rebuild from this
> document. See [trackpad-pan-protection-postmortem.md](trackpad-pan-protection-postmortem.md)
> for what went wrong and which parts are worth keeping.

# Slow-pan pressure protection and count precision — 11 September 2026

This follows the first Wardogs fix documented in `trackpad-wardogs-smoothness.md`.
That installed build was verified as SHA-256
`A2CD2EEE2141DF39C13D41865EB5A9A711887852CCEB528692F487BB5FF9CE3F` and the mapper
had restarted. The user still observed microstutter, improved by disabling
pressure protection. Their latest profile used 6 Hz / 0.6 smoothing, right-pad
sensitivity 1.5, movement threshold 0, click damping 1 at force 0.05, and lift
protection temporarily disabled. The user reported normal glide pressure
fluctuating between 0 and 0.001, a click around 0.12, and game sensitivity 0.73.

## Changes

- **Near-zero pressure:** a percentage drop is unreliable when normal readings
  repeatedly approach zero. Lift pressure ratios now require a reference above
  `max(1/512, click_damping_threshold * 0.05)`. Below that, light glides remain
  continuous; contact-up cancels buffered pan motion to suppress the terminal
  thumb roll. This also works without a useful force channel.
- **Recent pressure reference:** a 150 ms decaying reference replaces a lifetime
  gesture peak. Relaxing the thumb no longer leaves a sustained glide suppressed
  indefinitely. Analog lift suppression blends out across the configured speed
  threshold to 1.5 times that threshold, avoiding a hard gain switch.
- **Damping transitions:** partial protection attacks with a 4 ms time constant
  and recovers over 25 ms. Full clicks/unloads stop immediately. Acceleration
  follows undamped finger speed; damping is applied afterwards, so pressure no
  longer changes the acceleration gain as well as the displacement.
- **Final pan smoothing:** signed displacement is averaged over a finite window
  after sensitivity, acceleration, and pressure damping. This attenuates rapid
  stick-slip speed variation and pressure ripple. The slow window is
  `clamp(1/(pi * cutoff), 4 ms, 48 ms)`; a stable speed estimate reduces it toward
  8 ms as motion increases from 0.15 to 0.6 pad widths/s. Clear flicks at or above
  1.5 pad widths/s use the original 4 ms window immediately. Off remains 4 ms.
  Following raw report intervals directly was tested and rejected: it amplified
  delivery jitter at medium speeds.
- **Bounded delivery:** each queued packet keeps its own window and signed
  displacement. The fixed pool has 64 slots, sufficient for 1 kHz operation.
  Pan packets finish within 52 ms, clear flick packets within 8 ms. There is no
  extrapolated velocity or indefinite movement debt. Protected pan lifts cancel
  queued motion; unprotected release and clear flick policies retain their
  measured tail. Full clicks also clear position-filter lag so it cannot return
  after the click releases.
- **Final integer conversion:** round to the nearest whole count and retain the
  signed fractional remainder. Cumulative position error stays within half a
  count instead of nearly one count; reversing direction no longer inherits the
  old truncation bias. This final accumulator is shared by gyro and pad output;
  gyro filtering, gain, and acceleration algorithms are unchanged.

## Measurements

The new `touch_pan_quality_harness` compiles the real processing code. Baseline
source from the previously installed build is preserved locally in
`build-jsm-sdl/touch-diagnostics/pan-v1-source/` (the accumulator matches the
unchanged baseline Git version). Both versions use identical test inputs.
These are **synthetic pipeline measurements**, not recorded in-game results.

| Controlled case | Previous | Updated |
| --- | ---: | ---: |
| 18 Hz, 40% finger-speed ripple: output CV | 10.682% | 1.646% |
| 25 Hz pressure ripple within click ramp: output CV | 12.611% | 0.815% |
| Sustained lighter glide: mean counts/tick | 0.043783 | 0.130778 |
| Slow glide with force cycling 0 / 0.0005 / 0.001: mean counts/tick | 0.001448 | 0.130778 |
| Same near-zero-force case: output CV | 331.859% | 0.126% |
| Clear fast-flick output onset | 4 ms | 4 ms |

Friction frequencies were also swept rather than evaluating only one favorable
frequency. At 6/10/14/25/40 Hz, previous CV was
23.951/17.459/13.338/7.788/4.719%; updated CV is
20.828/11.581/5.445/1.236/0.225%. Mean pan speed stays within 3% of the constant
input across the sweep. Lower-frequency finger-speed changes are intentionally
not flattened into a forced constant camera velocity: the system cannot know
whether those changes are friction or deliberate user input.

With bunched wireless-report delivery, updated output CV at
0.12/0.24/0.40/0.60 pad widths/s is 0.060/1.163/4.201/4.919%.
The existing report-phase and 240 Hz frame-phase regressions also pass.

All eleven numeric harnesses pass, including signed variable-window conservation,
bounded tails, click/lift cancellation, re-touch, flicks, light pressure,
invalid-input recovery, and nearest-count cumulative error on reversing axes.
Source checks and GUI default-value checks pass. The native MSVC Release build
passes; its existing unrelated wchar_t-to-char compiler warning remains.

## Recommended Wardogs setup

Use the prepared **Wardogs Smooth Pan** profile with **in-game sensitivity 0.365**.
It retains the user's latest saved bindings and keeps the experimental Wardogs
profile separate. The key settings are:

| Setting | Value |
| --- | ---: |
| TOUCHPAD_MIN_CUTOFF / TOUCHPAD_SPEED_COEFF | 6 / 0.6 |
| TOUCHPAD_LIFT_SPEED | 140 |
| TOUCHPAD_CLICK_DAMPEN / GYRO_CLICK_DAMPEN | 1 / 1 |
| TOUCHPAD_CLICK_DAMPEN_THRESHOLD | 0.05 |
| TOUCHPAD_MOVEMENT_THRESHOLD | 0 |
| RIGHT_TOUCHPAD_SENS | 3 |
| TOUCHPAD_ACCEL_MAX_SPEED | 2560 |
| Acceleration gains / curve | 1–2.5 / LINEAR |
| REAL_WORLD_CALIBRATION | 35.856, unchanged |
| IN_GAME_SENS | 0.5 |

The click damping threshold remains below the reported 0.12 switch point so it
can suppress the shove before the click registers. The normal 0–0.001 force range
is far below the click ramp, which begins at 0.025.

The user's existing calibration uses JSM IN_GAME_SENS=1 at actual game
sensitivity 0.73. Halving the game value therefore requires JSM IN_GAME_SENS=0.5
to preserve that existing gyro calibration; entering 0.365 into JSM without
recalibrating would overcompensate. Pad sensitivity and its acceleration speed
range are both doubled so the pad's physical speed/gain relationship is retained.

The game then receives twice as many mouse counts with half the angle per count.
In the synthetic slow-pan test at 240 Hz, camera-equivalent frame variation falls
from 0.497990 to 0.142792 counts, with mean speed preserved. This improvement is
from count density and applies independently of the pressure fixes. Whole-count
quantization still exists; it is reduced, not eliminated.

The slow-pan averaging adds about 22 ms of delay relative to the old 4 ms window
at the recommended settings. It is not applied to clear fast flicks. This is a
deliberate smoothness/latency tradeoff, and is substantially less lag than the
earlier 0.3 Hz position filter. A protected lift discards the final buffered pan
instead of delivering it as a jump. Gameplay verification is still required.

## Reproduce

```powershell
python JoyShockMapper/tests/run_touch_harness.py
python JoyShockMapper/tests/run_touch_harness.py --only touch_pan_quality_harness --source-dir build-jsm-sdl/touch-diagnostics/pan-v1-source
python JoyShockMapper/tests/touch_pipeline_regression.py
python tests/touchpad_filter_defaults_regression.py
```

The baseline run deliberately fails the newly added regression assertions. No
new live controller capture was made in this pass; the tests use the pressure
range reported by the user and controlled motion/report patterns.

## Installed result

The tested Release executable was placed in both the repository bundle and
`%LOCALAPPDATA%\JSM Studio\bin\SDL\JoyShockMapper.exe`. Both hashes are
`A3674A18E160A4E528AFF318497C39EC81C2EDE717FC4683F0969677DE01A313`.
The previous executable/source marker remain beside it as
`JoyShockMapper-before-20260911-pan-protection.exe` and `.commit`.
The running old mapper was left undisturbed; a restart is needed to load the fix.

`Wardogs Smooth Pan.txt` was added to the runtime profile library. Its SHA-256 is
`826ABA3DE493E4986362360C48B0CEDB6E39F8C62DCE615CE64B515B1D8AE792`.
The user's original Wardogs profile and the currently applied preview were not
rewritten. Set the game to 0.365 and select/apply the new profile after restarting.
