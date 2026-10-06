# UI/UX review — 1 October 2026

## Scope

Reviewed the editor pages and their shared controls, with a browser screenshot of Home and these 18 pages at 1440, 1024 and 760 pixels: Overview, Buttons, D-Pad, Triggers, Joysticks, Trackpads, Gyro, Layers, Configurations, Associations, Global chords, Press timing & polling, AI assistant, Device visibility, Appearance, Preferences, Documentation and Debug console. Desktop screenshots also cover the bottom of each page.

The review concentrated on layout, focus, text clarity, progressive disclosure, and parity between normal and alternate input configurations. Screenshot evidence is in `tmp/ui-ux-audit/`; the layout/accessibility results are in `report.json` there.

## Fixed

| Issue | Result |
| --- | --- |
| A stick configured as virtual joystick in its normal binding could switch to flick in a modeshift without offering its tuning controls. | Normal and shifted sticks share the same mode editor. Flick, aim, hybrid aim, cursor and scrolling controls follow the selected alternate mode. |
| Directions and radial settings depended on the base mode's filtered bindings. | Alternate editors use the complete hardware-supported input definition. Direction bindings, ring/deadzone controls and radial segments remain available. |
| Touch-stick shifts had less tuning than the normal editor. | Both use the shared tuning controls for their selected mode. |
| Shifted reset controls could point at the normal setting. | Setting keys follow the trigger context; clearing an alternate numeric value restores inheritance. |
| Removing or renaming a shift could leave tuning or radial assignments behind. | Cleanup includes the full setting set. Shared tuning is retained if another input uses the same trigger. |
| Snap strength could not be prepared while snapping was off. | It stays editable with a contextual explanation; explicit Off can override inherited snapping. |
| Unset tuning sliders showed zero instead of their real defaults. | Sliders and placeholders agree with mapper defaults. Stick power uses 1, and acceleration cap accommodates the mapper's default. |
| A zero radial deadzone was replaced by a fallback; an unset segment count could show zero beside an eight-segment preview. | Zero is preserved; the count and preview agree. |
| Pages appeared to fit the window while their grid track was wider and clipped right-side controls. | The shell grid can shrink, headers/actions wrap, and internal scroll-container bounds are checked. |
| Nested field/select labels could add another focus border; modeshift outlines could be clipped. | Focus styling avoids duplicate parent borders and uses an inset summary outline. |
| Reversing vertical navigation could select another control in the same row. | Returning through a multi-choice row preserves the control it came from. A nearer intervening row still takes precedence, including in the controller diagram. |
| Tuning rows and alternate-trigger fields had inconsistent spacing/width behavior. | Shared full-width tuning rows and shrinkable trigger fields align with the editor's existing controls. |
| Numeric controls repeated missing-description text and units, and some help was too generic. | Repetitive filler is removed, documentation has an accessible button, and mode-specific descriptions clarify units and behavior. |
| Unrecognised imported select values appeared empty. | The current value stays visible and can be replaced with a supported option. |

## Validation

- Production web build and focused ESLint checks pass. The React source review checked hook ordering/dependencies, shared component boundaries and listener cleanup.
- The page sweep checks document overflow, internal overflow, shell bounds, accessible names for visible buttons and renderer errors.
- Stick modeshift browser coverage exercises virtual joystick → flick, inherited tuning, shifted save/reload, clearing back to inheritance, editable snap strength, directions, radial controls, removal and touch-stick aim tuning.
- Modeshift utility tests cover scoped writes, cleanup, peer sharing and rename/remove behavior.
- Existing layer, released-binding, pad presentation, shifted capture and keyboard/controller focus regressions pass.
- The full controller-axis audit passes across 24 pages/views at two sizes: axis movement, form-row return paths, focus-ring placement, stable focus, menu-to-dialog transitions, page landing and radial segments.

These are source and browser-renderer checks using mock desktop services. Installed Tauri behavior, physical-controller input and gameplay are separate validation steps and were not performed in this review. The review does not claim exhaustive coverage of every configuration combination, native popup or overlay state. Existing unrelated working-tree changes were preserved.
