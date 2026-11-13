# Natural direction calibration

Open **Sticks → Natural direction calibration** in a controller's game layout, or **Settings → Controller → Global Cyborg stick defaults → Natural direction calibration** to reuse a comfortable setup across games. Explicit game values take precedence over Cyborg defaults.

1. Align the existing **Stick rotation** with your comfortable forward movement.
2. Open Natural direction calibration and enable **Use natural directions**.
3. Select Forward, Right, Backward or Left. Hold the stick comfortably in that direction and click **Record … direction**. Repeat for the other directions. Mouse and keyboard operate this panel; physical controller navigation is paused while it is open.
4. Fine-tune each adjustment if needed. The caption shows the total correction, including the common rotation. For example, a 15° rotation and a +15° right adjustment give a 30° total right correction.
5. Optionally push to a comfortable maximum and use **Record … full travel**. Angle and travel are recorded separately so a partial push during angle calibration cannot accidentally become full speed.

The live preview draws physical input, corrected input, and the calibrated physical outline. F/R/B/L mark the input anchors mapped to forward/right/backward/left. With travel left at 100%, the correction preserves stick magnitude. Smaller travel values expand the reachable range. Restrictor-ring scaling is applied first, so recorded travel is relative to the selected ring setting.

The native mapper performs a continuous, circular piecewise-linear angle mapping before deadzones and all stick modes. WASD direction selection, analog gamepad sticks, mouse/flick modes and telemetry use the same corrected input. Keyboard cardinal width/stability are still applied afterwards; analog output remains continuous. Each correction is bounded to ±40° relative to the common rotation, guaranteeing at least 10° separation between neighbouring anchors. Captures outside this range or below 25% physical travel are rejected; align the common rotation first if necessary.

The transform uses fixed-size stack data and constant bounded work per input sample, with no timers, smoothing, buffering or new input polling. The existing path is preserved when calibration is off. New and existing profiles default off. Toggling off retains the recorded calibration; Reset returns adjustments to zero and travel to 100% without changing common rotation or ring settings.

## Configuration keys

For each stick, use `LEFT_STICK_` or `RIGHT_STICK_` followed by:

- `CALIBRATION = ON` or `OFF` (default).
- `CALIBRATION_{UP|RIGHT|DOWN|LEFT}_ANGLE = -40..40` (default 0), a clockwise correction after common rotation.
- `CALIBRATION_{UP|RIGHT|DOWN|LEFT}_RANGE = 0.1..1` (default 1), reachable radius after ring scaling.

These settings support controller/model/instance scopes and layers through the existing configuration system.
