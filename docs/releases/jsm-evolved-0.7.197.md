# JSM Evolved 0.7.197

This build includes the completed UI spacing audit, missing gyro descriptions,
technical control terminology and Haptics labels, progressive Tilt controls with
Tilt off by default, corrected live graphs, shared Mode shift layout and live
trackpad Orientation preview. Explicit saved activation settings are preserved.
The orientation preview uses raw controller telemetry when available and avoids
applying rotation twice to older mapper output.

The source checkpoint also captures the accumulated controller isolation,
Azeron support, slots, calibration, configuration storage and input lifecycle
work already present in the local application. It does not modify user profiles
or grip thresholds. Machine-local diagnostic captures and installation helpers
are excluded from the source checkpoint.

## Artifact

- File: `JSM Evolved_0.7.197_x64-setup.exe`
- Size: 18,717,086 bytes
- Product/File version: `0.7.197`
- SHA-256: `2376106BD4C3722E0C9395530CCD3713237B41A7E1CB7764CD76AB5A16A6AA8F`
- Native source: `2724d4bbfe57a060de609a87c29d4fcaad112a01` (clean)
- Location: `JSM_GUI/jsm_gui_tauri/src-tauri/target/release/bundle/nsis/`

## Validation

The native, TypeScript/Vite, Rust and NSIS production build completed. All 344
installed dependency entries matched the lockfile versions and integrity values.
All 736 frozen source inputs remained unchanged through packaging. The mapper,
input DLL, SDL DLL and Azeron recovery executable match the rebuilt files by hash;
the generated NSIS recipe references these exact resources. The native source
stamp matches the pinned commit. All 38 generated JavaScript asset names occur
in the final Tauri application.

Final checks passed:

- P4 static setting coverage, including dynamically composed calibration keys.
- Mode shift scoped-write logic and shared pad/stick/trigger browser interactions.
- Mode shift design checks in dark/light at normal and minimum window sizes.
- Trackpad orientation: 225 frontend/native rotation and clamp parity cases,
  live configuration/controller changes, lift/disconnect and raw-unavailable states.
- Full P4 browser controls, presets, deadzones, trigger behavior and grip sheet.
- Gyro graph math and live gyro/input graph browser regressions.
- 1,008 native/frontend speed parity cases; gyro logic and activation parsing.
- Native Tilt production defaults/reset and output cleanup harness.
- Native grip thresholds, reconnect, boot sound, touch-gated calibration handoff,
  per-grip haptics, scoped settings, retry and locking harnesses.
- Managed controllers, controller layouts/navigation and binding provenance checks.

Existing compiler/deprecation, chunk-size and unused-function warnings remain.
Design reviews and representative normal/minimum dark/light browser checks are
recorded in the local audit reports. The installer was built and verified, not
executed or published. Installed-app and physical-controller behavior were not
validated by this packaging run.
