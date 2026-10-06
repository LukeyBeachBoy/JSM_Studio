# Additional configuration sweep — 3 October 2026

This sweep follows the missing per-action turbo interval. It reviews whether choices with parameters have reachable editors, whether selecting them exposes those parameters, and whether ordinary, alternate and synthetic-menu action editors share controls. Evidence comes from the current GUI code, native Mapping/key parsing and the existing native setting inventories. Their partial classifications remain in place where runtime or hardware verification is outstanding.

## Repaired

| Finding | Result | Owner |
| --- | --- | --- |
| Haptic action cog had no actuator, effect or gain controls; those were only in Custom. | The shared settings sheet reuses the typed haptic editor. Imported Noise/Script effects stay visible without being offered as new choices. | `BindingEditor.tsx`, `HapticOutputPicker.tsx` |
| Small/big rumble actions had no amplitude editor. | Independent motor percentages serialize the native Rhhhh token. SMALL_RUMBLE starts at small=128/big=0; BIG_RUMBLE at small=0/big=255, matching the native aliases and Mapping's byte order. | `bindingParameters.ts`, `BindingEditor.tsx` |
| A configuration-load action had no target field in its cog. | Settings list available library configurations and visibly retain an unavailable imported target. | `BindingEditor.tsx`, `BindingCommandCard.tsx` |
| Raw/custom actions could reach settings with no way to edit their expression or command. | Edit action opens the existing Custom picker from the cog. | `BindingEditor.tsx`, `BindingCommandCard.tsx` |
| Existing-action replacements did not open settings for LED, sound or cycle. Add handling used a separate, narrower detector. | One detector drives add and replace behavior for LED, sound, cycle, haptic, rumble and configuration targets. | `bindingParameters.ts`, `BindingCommandCard.tsx`, `ButtonBindingsCard.tsx` |
| Synthetic menu-item additions did not open parameter sheets. | Newly added parameter-bearing menu commands open the shared settings sheet. | `VirtualMenuActionEditor.tsx` |

The prior turbo fix remains in the shared sheet. Output edits preserve turbo intervals and sibling bindings; these fields do not change global defaults.

## Other configuration-dependent choices reviewed

| Surface / choice | Additional configuration and entry point | Review result |
| --- | --- | --- |
| Press / tap / hold / double / simultaneous | Buttons: Configuration timing; shared defaults on Press timing & polling. Chord/simultaneous/diagonal settings choose the other input. | Reachable. Hold/double/simultaneous timing remains configuration/held-context timing, unlike the new per-action turbo override. Per-action delay/interruption behavior remains a separate native capability gap. |
| LED / sound / cycle / layer actions | Cog: colour/brightness/press-vs-hold; sound/volume/preview; sequence steps; layer/verb/press-vs-release. | Typed fields retained; replacement discovery fixed. |
| Joysticks and touch sticks | Mode tuning: aim/flick sensitivity, acceleration, snapping/smoothing; cursor radius, scroll sensitivity, hybrid return/edge controls, angular/winding response and virtual output correction. | Shared `useStickModeExtras` and `SourceModeTuning` serve normal and alternate modes. Direction/ring/deadzone editors remain reachable. |
| Trackpad modes | Mode sheet: grid shape/count/deadzone. Main rows: screen area/pad fit, touch/click policy, feedback, sensitivity and Trackpad feel. | Contextual editors exist; mouse area uses the screen-area workflow. |
| Trigger policies / adaptive effects | Threshold & release; per-side adaptive-effect rows reveal selected effect parameters and profile-level resistance calibration. | Independent sides and hardware prerequisites are explicit. |
| Gyro mouse / virtual stick / deflection | Fine-tuning sheets; virtual-stick guide/correction; angular range/limit fields; activation editor. | Contextual editors and virtual-controller prerequisites exist. |
| Tilt / steering / motion directions | MotionInputTuning, source-mode tuning, neutral/recenter actions and separate tilt activation controls. | Contextual tuning exists; physical feel and neutral behavior require hardware checks. |
| Acceleration curves | Curve editor reveals selected curve parameters and a preview. | Existing editor entry remains reachable. |
| Virtual menus | Menu controls: navigation/activation/selection and dependent inputs; action editor; advanced appearance/overlay editor. | Existing parameter editors plus repaired action-sheet discovery. |
| Layers / configuration library | Layer override editor, configuration dialogs and template inheritance/origins. | Existing configuration paths retained. |
| Associations / global chords | Rule target/fallback selectors; expanded chord button/OR groups and configuration editor. | Target and activation editors exist. |
| Preferences / controller sounds / keyboard | Sound files/levels, calibration delay/duration, light/orientation; layout-specific grouping, press threshold and shortcuts. | Parameters belong to preferences rather than individual binding actions. |
| Appearance / visibility / AI / documentation / credits / console / Overview / Home | Page surfaces and action links reviewed. | No further binding-parameter gap identified. Diagnostic and hardware-setup flows remain distinct from gameplay tuning. |

This is a contextual-editor sweep, not certification of every native command or every combination of modes. Native coverage inventories still describe broader limitations, including compound cycle steps and per-activator delay/interruption semantics. Raw editing is retained for expert/custom commands; it does not substitute for typed controls for the known parameters above.

## Validation

- `tests/additional_configuration_regression.cjs`: native rumble layout/aliases, parameter detection and output edits retaining turbo/sibling actions.
- `tests/additional_configuration_browser_regression.cjs`: rumble, haptic, configuration and custom cog edits; saving; imported-effect visibility; LED settings opening on replacement and menu-item addition.
- `tests/command_parameters_browser_regression.cjs` and `tests/turbo_binding_browser_regression.cjs`: existing LED, sound, layer and turbo flows.
- `tests/ui_ux_audit_browser_regression.cjs`: Home plus all 20 editor/Studio pages. Editor/Studio pages pass at 1440, 1024 and 760 px without horizontal clipping, unnamed visible buttons or renderer errors. Virtual menus and Credits were added to the older sweep. Evidence: `tmp/ui-ux-audit/report.json` and screenshots.
- Production web build and focused ESLint for edited React components and the helper.

Browser checks use mock desktop services and disposable profiles. They establish GUI access, serialization and layout, not installed Tauri behavior, native overlays, drivers or physical-controller output. No installer was produced or installed.
