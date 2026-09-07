# Trackpad timing investigation — 6 September 2026

The position filter was running on coordinate changes rather than on the output
clock. On an unchanged poll it did nothing; on the next change it processed all
the elapsed time at once. Its differentiated output consequently contained
catch-up steps whose size depended on wireless delivery timing. The subsequent
velocity/debt queue only partly concealed this, and a newer sample could alter
how quickly older displacement was delivered.

The correction evaluates the One Euro position filter on every output poll
until the existing 16 ms stationary-stop threshold is reached. Unfiltered mode
still skips unchanged coordinates. A finite resampler replaces the debt queue:
it reconstructs each computed displacement over a 1–4 ms interval, delays that
interval by 4 ms and averages over another 4 ms. Each packet is fully delivered
within 8 ms of being queued, regardless of subsequent packets. Both axes share
its timing. It uses fixed storage and integrates fractional output before the
existing shared integer mouse accumulator.

The resampler conserves **computed** signed displacement. This does not mean the
whole pipeline conserves raw finger displacement: the existing policy still
cancels uncomputed position-filter lag after a stationary hold or release.
Release flushes the resampler once, then stops unless trackball coast is enabled.
A confirmed hold now clears stale coast velocity. Legacy touch acceleration is
normalized to its original nominal 3 ms interval so evaluating filtered motion
more often does not reduce its gain.

No preset, game profile, gyro, flick-stick, polling timer, or Windows injection
setting was changed.

## Hardware capture

The user made a 20-second capture with a Steam Controller 2026 and wireless puck.
The diagnostic helper read SDL coordinates without injecting mouse input. It
recorded 19,994 polls, including 17,708 contact polls and 4,384 coordinate changes.
Median observed coordinate-change spacing was about 4 ms, with frequent 2 ms
intervals and 8 ms gaps. These are **host observations**, not hardware sample
timestamps. The capture also contains noise while the finger is resting.

The exact Finals settings were replayed: sensitivity 5.6, Heavy (2.5 / 3),
derivative cutoff 15 Hz, and the captured poll intervals (approximately 1 ms).
The baseline is submodule revision `663925c`; both replays compile the actual
`processTouchMouse` and pipeline definitions and consume integer mouse counts.

For the slow swipe from seconds 1–6, frame counts were grouped at 240 Hz.
Short-term variation is the RMS residual from a Gaussian local trend with a
25 ms standard deviation. It includes finger variation and integer quantization;
it is not a measurement of camera pixels or ground-truth sensor error.

| Metric | Previous | Corrected |
| --- | ---: | ---: |
| Horizontal residual, counts/frame | 0.817 | 0.543 |
| Vertical residual, counts/frame | 0.442 | 0.456 |
| Combined residual, counts/frame | 0.929 | 0.709 |
| Frames with no integer movement on either axis | 5.50% | 3.34% |

The combined residual improves about 24%; horizontal variation improves about
34%. Vertical variation is slightly higher. These figures should not be
represented as eliminating all jitter or proving that game reconstruction
artifacts are gone.

## Controlled regression

The cadence harness uses 250/300/333 Hz coordinate streams, three report phases,
twelve frame phases, and a bunched 8/2/2/4 ms delivery pattern with steady physical
motion. It tests the actual pipeline and integer accumulator at 1 kHz output and
240 Hz frames, with 12 expected mouse counts per frame.

| Preset | Previous worst frame CV | Corrected worst frame CV |
| --- | ---: | ---: |
| Off | 68.36% | 52.73% |
| Light | 46.38% | 13.22% |
| Balanced | 44.17% | 11.80% |
| Heavy | 43.41% | 11.80% |

Off intentionally retains position noise and is not equivalent to the enabled
smoothing presets. Its finite resampler reduces bursts but cannot infer a clean
finger trajectory. Even ideal constant motion at 1 kHz produces unequal counts
across unsynchronized 240 Hz frames; integer count resolution adds another floor.

Additional numeric checks cover signed displacement conservation, reversals,
fractional release, re-touch, invalid input, pool overflow, acceleration across
poll intervals, and stationary coast cancellation. In a modeled 90 ms flick,
output begins within 4 ms of the first changed coordinate for every preset.
Pacing alone ends within 8 ms of its last packet. With enabled position smoothing,
a held-still finger can settle for less than 16 ms plus the resampler's 8 ms.
These are algorithmic bounds, not measured end-to-end game latency; OS scheduling
and the user's existing One Euro parameters also matter.

## Reproduce

From the repository root, using Python and a C++ compiler:

```powershell
python JoyShockMapper/tests/run_touch_harness.py
python JoyShockMapper/tests/touch_pipeline_regression.py
python tests/touchpad_filter_defaults_regression.py
```

The local capture and replay files are kept in
`build-jsm-sdl/touch-diagnostics/` (ignored build output). A new capture requires
HidHide to allow the helper; restore filtering after recording.

```powershell
python JoyShockMapper/tests/capture_touch.py --dll JSM_GUI/jsm_gui_tauri/src-tauri/bin/SDL/SDL3.dll --output capture.csv --seconds 20
python JoyShockMapper/tests/run_touch_harness.py --only touch_cadence_harness --source-ref 663925c --replay capture.csv --output before.csv
python JoyShockMapper/tests/run_touch_harness.py --only touch_cadence_harness --replay capture.csv --output after.csv
python JoyShockMapper/tests/analyze_touch_replay.py before.csv after.csv --start 1 --end 6
```

The Windows Release backend built successfully with MSVC. The harnesses and
source checks passed. In-game verification on the user's 240 Hz display remains
necessary: repeat the same slow orbit and flicks with the same profile before
retuning any sensitivity or smoothing setting.
