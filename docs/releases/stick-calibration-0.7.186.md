# Natural direction calibration — 0.7.186

Independent forward/right/backward/left calibration is available in each stick's game layout and Global Cyborg stick defaults. Each direction has an angle adjustment and optional full-travel calibration. Recording angle and reach separately prevents a partial push from accidentally becoming maximum output. The preview displays physical and adjusted vectors, the calibrated outline and F/R/B/L anchors. Controller navigation is suppressed while the calibration panel is open; mouse, keyboard and the footer remain available.

The native mapping runs before deadzones, WASD direction selection and analog/mouse/flick modes, including telemetry. Four bounded anchors interpolate continuously around the circular seam. No smoothing, timing window, input queue or new polling loop is introduced. Calibration defaults off, preserving the previous geometry path exactly. Global defaults retain per-game and per-controller precedence.

See [Natural direction calibration](../stick-natural-directions.md) for setup and configuration keys.

## Verification

- Native C++ regression passed: existing rotation/ring behavior, independent anchors with 15° forward and 30° total right correction, calibrated WASD cardinals, analog magnitude, composed ring/reach scaling, 36,001-point monotonic angular sweep, zero/nonfinite inputs and disabled compatibility.
- Browser regression passed: capture, manual values, total-angle display, scoped persistence, Steam layout isolation, full-travel recording, toggle retention, reset, offline/centre guards, live vectors, 900×600 layout and Escape. Existing stick geometry browser regression also passed.
- Rust global-default round-trip/model-scope test passed; TypeScript checking and the full Windows installer build passed.
- Installed 0.7.186. The installed mapper returned `LEFT_STICK_CALIBRATION = OFF` and `LEFT_STICK_CALIBRATION_RIGHT_ANGLE = 0`. Opened the native global calibration panel and verified the retained 15° rotation, default-off setting, live Cyborg resting vector and disabled recording while centred.
- All 30 captured saved profile files (including slot snapshots), global stick preferences and StudioDefaults were unchanged. One app and its mapper remained running.

No personal direction angles were guessed or recorded. Physical four-direction calibration and gameplay feel remain for the user to exercise. No end-to-end input latency benchmark is claimed.

Installer: `JSM Evolved_0.7.186_x64-setup.exe`.

SHA-256: `740DCA8B4378D41BE84A926E2333E91FFB3F8D1B1331CFC81586AC847EF587B0`.
