# Why the slow-pan smoothing made the orbit test worse — 11 September 2026

The changes described in [trackpad-pan-protection.md](trackpad-pan-protection.md)
and [trackpad-wardogs-smoothness.md](trackpad-wardogs-smoothness.md) have been
reverted. Both the installed backend and the repository bundle are back to the
committed baseline `e994dfe`, SHA-256
`E614E33A77DF36694A728662F0D9FA8FC54EF7B6F96F0C24F8B5F2E93EF45156`.

The reverted work is preserved as a diff outside the repo; nothing was deleted.

## The test that failed, and the test that was measured

The reported symptom: orbiting a static object while strafing, using the right
pad to keep the camera centred, was **less** smooth after the change.

That gesture is a closed correction loop. The hand continuously varies its speed
to hold a target under the crosshair, so pad speed sweeps up and down several
times a second, and the thumb plants and lifts repeatedly.

Every headline measurement in the report was taken at **constant input speed**
with friction ripple added on top. Coefficient of variation at a constant speed
is a fair measure of ripple rejection and a poor measure of tracking, and the new
code was tuned against it. Reproducing both resamplers and driving them with a
constant 0.3 pad widths/s gives **identical output for both versions** — the
benchmark cannot see the regression at all. Driving them with a sweeping speed
separates them immediately.

| Input | Version | Velocity error | Tick-to-tick jerk |
| --- | --- | ---: | ---: |
| Constant 0.3 pad widths/s | baseline | 0.00% | 0.00% |
| Constant 0.3 pad widths/s | changed | 0.00% | 0.00% |
| Orbit sweep 0.10–0.60 | baseline | 1.87% | 0.37% |
| Orbit sweep 0.10–0.60 | changed | 5.59% | 0.40% |
| Orbit sweep 0.10–1.80 | baseline | 2.33% | 0.47% |
| Orbit sweep 0.10–1.80 | changed | 7.53% | 2.52% |

## The actual defect: a variable delivery window reorders motion

The baseline resampler delays every displacement by a fixed 4 ms box. A fixed
window is a **pure delay** — align the output 5 ms later and it reproduces the
input velocity with **0.00% residual error**. It changes when motion arrives,
never the shape of it.

The change made the window a function of speed: `clamp(1/(pi*cutoff), 4ms, 48ms)`,
blended down toward 8 ms as a 30 ms speed estimate rises across 0.15–0.6 pad
widths/s, and switched hard to 4 ms above 1.5. At Wardogs' 6 Hz cutoff the slow
window is the full 48 ms. Each packet keeps the window it was queued with.

That is the bug. **Packets queued with different windows drain at different
rates, so newer motion overtakes older motion.** A 4 ms packet completes in 8 ms;
a 48 ms packet queued 10 ms earlier is still draining 40 ms later. Total
displacement is conserved — which is what the report's conservation tests check —
but the order it arrives in is not. In a four-second orbit sweep the window takes
**401 distinct values**, so the stream is continuously reshuffled.

After removing pure delay by optimal time alignment, the residual distortion is:

| Input | baseline | changed |
| --- | ---: | ---: |
| Orbit sweep 0.10–0.60 | 0.00% | 5.56% |
| Orbit sweep 0.10–1.80 | 0.00% | 7.36% |

No time shift makes the changed version match its own input. This is not lag.

The clearest demonstration is a single, strictly accelerating stroke through the
1.5 flick threshold. The baseline delivers a strictly accelerating output, and
its peak lands on the same millisecond as the input's. The changed version
produces **27 velocity reversals during a stroke that never once slows down**,
and delivers its peak **82 ms before** the input peaks. The mouse backs off while
the thumb is still speeding up. That is the microstutter.

Three compounding reasons it lands hardest on this gesture:

- `rawSpeed` drives the hard 1.5 switch, and it is a raw instantaneous ratio
  recomputed only when a coordinate changes, with no smoothing and no hysteresis.
  Bursty wireless delivery makes it dither across the threshold, and each
  crossing flips the window between 48 ms and 4 ms.
- The report identifies a hard speed boundary as a defect in the *lift guard*
  ("that hard boundary used to turn speed noise into gain jumps") and fixes it
  there with a smoothstep blend — then introduces exactly that pattern in the
  window selector.
- Following report intervals directly was tested and rejected for amplifying
  jitter. The right conclusion was that the window must not be modulated at all,
  not that it should be modulated by a different jittery signal.

## The second defect: every lift discards real motion

Release handling became:

```cpp
if (pipe.liftGuard.scale < 1.f ||
    (js->getSetting(SettingID::TOUCHPAD_LIFT_SPEED) > 0.f && pipe.output.hasSlowPackets()))
```

`hasSlowPackets()` is true whenever any packet with a window above 4 ms is still
draining, which at a 6 Hz cutoff is *the entire duration of any slow pan*. With
Wardogs' lift speed of 140, the second clause is effectively always true at the
end of a corrective stroke, so the guarded case has become the default case.

A 250 ms slow corrective stroke ending in a lift delivers **8.7% less camera
movement than the hand asked for**, where the baseline delivers 100%. The loss
scales with how much is in flight, so it varies stroke by stroke. Recentring
during an orbit is exactly a sequence of short strokes each ending in a lift:
every one falls short by a different amount, and the hand has to correct for a
mapper that is now unpredictably under-delivering.

Discarding a terminal thumb roll is a reasonable goal. Discarding the last 48 ms
of every deliberate pan is not, and the two are indistinguishable once the buffer
is long enough to hold the whole tail.

## What was *not* the problem

Checked rather than assumed:

- **`std::round` in `MouseMotionAccumulator`.** Round-with-remainder and
  truncate-with-remainder were compared on a steady sub-count pan that stops
  dead. Neither emits a count in the wrong direction, and neither emits movement
  after the finger stops. The change is harmless; it is also not an improvement
  worth the risk of touching an accumulator shared with gyro output.
- **Double-precision position filtering** (`TouchPositionFilter`). Sound, and the
  report is honest that the error it removes is far too small to explain visible
  jitter. Worth keeping in a future attempt.
- **The queue-clearing bug in partial lift suppression.** A genuine defect,
  genuinely fixed. Also worth keeping.

## Rules for the next attempt

1. **Never change the delivery window of an in-flight stream.** If a window is
   introduced at all it must be constant for the session, so the stage stays a
   pure delay. A speed-dependent window is a variable-group-delay filter, and
   variable group delay is the definition of the artefact being chased.
2. **Benchmark against varying input.** Constant-speed CV was satisfied by both
   versions and proved nothing. The acceptance test is lag-compensated residual
   distortion on a swept-speed input, which must stay at zero.
3. **A conservation test is not a smoothness test.** Sum-preserving reordering
   passes every conservation assertion in the suite and is precisely what the
   user felt.
4. **Never silently discard measured displacement.** Suppression belongs at the
   input, gated on evidence, not applied to a buffer after the fact.
5. **Verify in the game before installing.** Both passes installed a new backend
   on the strength of synthetic pipeline numbers. The report's own closing line
   asked for gameplay verification; it should have been a precondition.

## Reproducing this analysis

The simulations reimplement both resamplers exactly and run under Node, which
this machine has. They are kept with the preserved diff rather than in the repo,
since the code they compare no longer exists here.

Note that the `python` in the previous reports' **Reproduce** sections is not
available on this host — only the Microsoft Store stub is installed, so those
commands could not have been run as written from this environment.
