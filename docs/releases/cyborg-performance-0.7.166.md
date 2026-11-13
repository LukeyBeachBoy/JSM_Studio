# Cyborg performance — 0.7.166

Built and installed locally on 27 October 2026. This changes the native input
path and settings lookup, without changing the user's mappings or stick geometry.

## Changes

- Replaced the native reader's 2 ms polling sleep with Windows overlapped HID
  waiting. The 10 ms read timeout is a maintenance/shutdown bound, not an input
  delay: the wait returns immediately when data is available. No busy-spin.
- Retained every button edge, including several messages within one HID report,
  in a fixed-capacity queue. The 1 ms mapper tick drains the batch in order;
  analog-only reports coalesce. Configuration contention leaves the queue intact.
- Disconnect/mode loss discards stale queued presses and supplies neutral input.
  Exceptional overflow releases held keys before resuming the current state.
- Moved vendor-app process enumeration to the recovery helper. Reduced steady
  state heartbeat signalling from every reader iteration to twice per second,
  preserving the three-second watchdog. Input threads use the same existing
  highest thread-priority class; no real-time priority was introduced.
- Removed heap allocation from controller-scope lookup while preserving model,
  physical-device, layer and shared fallback behaviour. Skipped unavailable
  touch and Steam hardware-settings callbacks for the Cyborg.
- Preserved background/hidden preview suppression. No smoothing, timing windows,
  restrictor scaling, rotation, user polling settings or bindings were changed.

## Measurements on this PC

Installed 0.7.165 versus installed 0.7.166, one Cyborg active, Steam asleep,
`AppNavigation.txt`, `TICK_TIME = 1`, editor unfocused. Each controlled run warms
for two seconds then samples for six seconds. Telemetry is temporarily redirected
to the probe and restored afterward, so these comparisons describe native
overhead, not GUI/WebView rendering cost. The load run uses eight CPU worker
processes on a machine with 16 logical processors.

| Measurement | 0.7.165 | 0.7.166 |
| --- | ---: | ---: |
| Mapper CPU, normal (ms per second) | 226.522 | 104.043 |
| Recovery CPU, normal (ms per second) | 0.000 | 10.404 |
| Mapper + recovery CPU, normal | 226.522 | 114.447 |
| Mapper + recovery CPU, eight workers | 239.227 | 98.862 |
| Median applied loop rate, normal | 1000.5 Hz | 1000.0 Hz |
| Median applied loop rate, eight workers | 1000.5 Hz | 999.5 Hz |

Native CPU fell approximately 49% in the normal comparison and 59% under this
load. These are short samples, not a universal CPU or latency guarantee. Every
captured Cyborg sample reported native control active, with no configuration
errors. The loaded update's rolling applied rate ranged from 989 to 1000 Hz;
this is not a per-event latency distribution or a hardware USB report rate.

A separate 12-second check with normal app telemetry restored measured mapper
CPU at 92.06 ms/second and GUI host CPU at 40.19 ms/second, compared with initial
values of 222.85 and 44.05. WebView child processes are not included in those
figures.

The optimized settings benchmark (one million lookups per case) changed inherited
lookup from 0.1679 to 0.0356 microseconds and isolated lookup from 0.0840 to 0.0411
microseconds. Allocations fell from roughly three million / one million to zero.
This measures the real scope resolver, not the whole mapper.

No physical switch-to-OS or button-to-screen latency was measured. Firmware
debounce, USB transport, OS scheduling, configured tap/hold/simultaneous-press
semantics and game sampling remain outside the removed polling delay.

## Verification

- Native protocol and queue tests: batched/rapid/chorded presses and releases,
  analog coalescing, mode loss/disconnect, bounded overflow, and 100,000 concurrent
  ordered button transitions.
- Native controller-context regression: identical-controller isolation, nested
  guards, dynamic isolation changes, profile clearing and identity reassignment.
- Frontend regressions: telemetry frame pacing/background suppression, Cyborg
  mappings/layouts, controller-layout serialization, native timing units, managed
  controller policy.
- Full native, frontend, Rust release and NSIS installer builds passed.
- Installed live probe: 261 correctly scoped rotation samples, native active,
  original profile restored, no configuration errors; only controller type 25.
- Forced GUI termination: recovery helper exited with code 0 (onboard-mode
  acknowledgement), completing in 47 ms; app restarted afterward.
- All 60 saved text profiles/defaults and Azeron settings files in the snapshot
  retained their SHA-256 hashes. Installed mapper and recovery hashes match the
  bundled files.

Evidence is in ignored `build-jsm-sdl/cyborg-perf-*.json`,
`controller-scope-before.txt`, `controller-scope-after.txt`,
`controller-instance-native-results.json`, and
`cyborg-performance-installer.log`. The opt-in installed-app probe is
`tests/azeron_runtime_performance.py`.

Installer SHA-256:
`847687127B77583EF64C2B0A55487B6D40DDF0EA2B8B08371E8C8A4CF02E07D1`.
