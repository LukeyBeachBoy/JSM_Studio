# Stick preferences and resets — 0.7.188

Cyberpunk's saved Cyborg layout and Slot 1 contained old 12% inner / 2% outer
deadzones. Desktop and Slot 2 inherited the user's global 35% / 0% values.
Native, device-scoped queries confirmed the same mismatch in the running mapper.
Rotation (15 degrees), restrictor ring, cardinal width (65 degrees), and natural
direction calibration already inherited correctly. Driving changes the output
mode to an analog gamepad stick; it does not replace these geometry settings.

The two Cyberpunk deadzone lines were removed from the real source and Slot 1,
with backups and byte-preservation checks. The active Cyborg's two values were
updated without restarting the mapper and read back as 0.35 / 0. All other
profile content, Desktop, Slot 2, slot assignments and global preferences were
preserved. Local evidence is in ignored `build-jsm-sdl/stick-inheritance/`.

## Editor corrections

- Setting ownership now distinguishes a shared game layout, controller model,
  individual device, imported layout, and selected layer. A flattened preview
  is no longer mistaken for assignments owned by the selected device.
- A device inheriting a model setting offers **Edit source layout**. A reset
  removes an assignment only from the selected scope, revealing its fallback.
  This prevents no-op resets and accidental changes to another identical pad.
- Reset chips keep their dimensions when hovered. Row focus occurs after the
  click, so controller navigation cannot scroll the target away between
  mouse-down and mouse-up.
- The Sticks page exposes inner and outer deadzones, physical setup, and (in
  keyboard movement mode) cardinal width, stability, activation and release
  margin. The single-stick Cyborg no longer offers a two-stick deadzone scope.
- Inherited global values have compact provenance labels. Restrictor-ring copy
  no longer claims every displayed value is a game override.
- New Cyberpunk presets and imports no longer insert arbitrary hardware-feel
  values. The importer retains explicit existing per-game choices.

## Validation

Passed browser checks: full-app controller selection and source-layout reset;
model/device/global inheritance; changing global values after a reset;
two-identical-controller isolation; imported-layout provenance; ring and
rotation; natural calibration; mouse capture; Escape; normal desktop and
900x600 layouts. Rendered screenshots were inspected. Pure Cyborg layout and
reWASD conversion regressions passed, as did TypeScript and production web build.
The native/Rust release build and Windows NSIS installer also completed.
Installer SHA-256: `1FFC164989997353956681321CCB165EF45827A7BB25CE7424C7362F0B31960C`.

The local installer is prepared separately from the live configuration repair.
Installation is deferred while Cyberpunk is running. Physical movement feel
still needs the user's assessment; native settings readback is not a gameplay
test.
