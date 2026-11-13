# Azeron stick fit and live vectors — 0.7.163

Joysticks now includes a Restrictor ring toggle and adjustable Ring travel for
the Cyborg. Shorter physical travel is expanded to full input, with a preserved
custom travel value when disabled. Defaults are Off and 70% travel; the percentage
is adjustable, not a hardware measurement. Stick rotation supports -180° to
+180° and 0.1° fine adjustment. Hold forward and choose Use current direction as
up for a measured angular offset.

These settings are saved in the game's controller layout, with layer/modeshift
support. The mapper applies geometry before deadzones and modes, including
keyboard movement, virtual steering, flicks and menu selection. Legacy input is
unchanged when rotation is zero and the ring is off. Radial saturation preserves
diagonal direction after rotation/scaling. No onboard calibration is written.

The Cyborg graphic uses the app's flat artwork and live-feedback colors: buttons
light green when pressed, with dashed physical and solid adjusted stick vectors.
The joystick page includes a larger cardinal compass and live magnitude/heading.
Both depict input before deadzones and mode output. Status text, legends, focus
states and responsive layout use the existing UI tokens and controls.

## Verification — 27 October 2026

- Native Release and frontend production builds passed.
- Native geometry tests passed for clockwise/anticlockwise rotation, ring on/off,
  half travel, diagonal saturation, neutral and invalid input, and default behavior.
- Browser checks passed for the controls, retained custom travel, 0.1° adjustment,
  aligning forward, live vectors/button feedback, offline editing, and narrow
  layout without horizontal overflow. Wide and narrow screenshots were inspected.
- Save/reload and per-controller isolation tests passed, including an explicit Off
  override of inherited ring settings. Existing Azeron and multi-controller UI
  regressions passed. Rust: 185 passed, 1 ignored.
- Live native Cyborg telemetry matched rotation plus ring scaling, unrestricted
  input after a profile switch, and rotation alone, with outputs disabled. This
  check used resting sensor input; it does not establish gameplay behavior. The
  Steam Controller was unavailable during this check; isolation was tested in
  the configuration/browser regressions.

Local evidence: `build-jsm-sdl/azeron-protocol-reference/geometry-native-results.json`
and `build-jsm-sdl/azeron-acceptance/stick-geometry-{wide,narrow}.png`.
