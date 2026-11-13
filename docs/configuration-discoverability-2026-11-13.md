# Configuration discoverability follow-up — 13 November 2026

Focused follow-up to `ux-audit-2026-11-13.md`, including source ownership checks and rendered editor inspection. These changes reorganize existing editors; they do not migrate or reinterpret saved configuration values.

## Implemented

| Setting or task | Previous location | Current location | Reason |
| --- | --- | --- | --- |
| Roll contribution | Gyro → Fine-tune → Sensitivity → Advanced → Calibration & roll | Gyro → Fine-tune → Direction, immediately after Gyro space | The native `YAW_PLUS_ROLL` calculation reads `ROLL_CONTRIBUTION` to combine yaw and roll. It belongs beside the space that enables it. Imported values, −100…100 range, negative reversal and disabled explanation outside that space are preserved. |
| Pad rotation | Trackpads → Fine-tune → Zones → Layout, labelled “Turn the zones” | Trackpads → Fine-tune → Orientation, labelled “Pad rotation” | The pad coordinate rotation affects mouse, mouse area, zones and touch-stick modes. The previous location disappeared on mouse-only pads. The new group is available in every pad mode, with the original one-pad unsupported explanation and non-shiftable guard. |
| Mouse-area pad fit | Duplicated in Mouse area and Click | Mouse area; the front's contextual Mouse area control also remains | Aspect-ratio mapping belongs with the screen area, not click damping or lift-off protection. The same key and callback remain. |
| Pad touch/click bindings and mode shifts | Generic “More” fine-tune group | “Bindings & shifts” (“Bindings” inside a shift) | Names the tasks contained in the group. The stable `more` group id, touch/click editors, direction bindings and mode-shift behavior remain. |
| Match a full turn (360°) | Sticks → Fine-tune → Speed → Advanced → Exact curve | Directly under Speed; also under Flick → Turning output when sending mouse movement | This calibrates mouse turns to a game, rather than defining a stick curve. Existing wizard/state is reused; closing it returns to the caller. Exact curve and smoothing remain progressively disclosed. |

Gyro key-to-editor routes, changed-status ownership, front-page hints, contextual help and searchable page descriptions follow the new locations. Calibration no longer claims to contain roll or controller polling.

Review changes routes a pad rotation key to the same Orientation editor. Controller-scoped base rotation changes select their recorded controller model and Default layer before opening the editor, rather than sending them to global preferences or leaving an unrelated editing layer selected. Global controller rotation defaults in Settings remain available in their original scope.

## Intentionally retained

- **Ignore Windows pointer speed** remains beside mouse calibration. It is a configuration command that compensates mouse-output calibration, not a control that changes Windows' global pointer-speed setting. Moving it into global Controller preferences would imply the wrong ownership.
- **Touch and click interaction** remains beside zone layout and beside mouse Click tuning where it explains the current mode's behavior. Those are contextual entry points to the same behavior, unlike the unrelated pad-fit duplicate.
- **Advanced curve/filter/output details** remain progressively disclosed. This pass does not flatten all fine-tune screens or replace descriptive groups with generic menus.
- **Controller polling** was handled separately in the parent audit: shared default under Settings → Controller and per-configuration override under Buttons → Configuration timing.

## Verification

The focused browser regression covers imported roll/rotation values, unchanged key writes and other-pad/unrelated-binding preservation, all four pad-mode entry points, removed Click duplication, descriptive bindings group, Review changes routing, non-shiftable rotation, full-turn wizard return state, and light/dark geometry at 1440×900 and 900×600. Captures are under `tmp/configuration-discoverability/`; baseline captures are under `tmp/discoverability/`.

Passed checks:

- `npm run build:web` (TypeScript and production Vite build; existing chunk-size/mixed-import warnings remain).
- `configuration_discoverability_browser_regression.cjs`, including Review from Vehicles (60°) to controller Default (25°), the non-shiftable guard, keyboard focus bounds and 20 settled theme/size captures.
- `gyro_routes_browser_regression.cjs`, `console_v2_p4_browser_regression.cjs`, `curve_scroll_browser_regression.cjs`, `gyro_v2_logic_regression.cjs`, and `mouse_area_regression.cjs`.
- Changed-file ESLint reports no errors. The gyro/trackpad fine-tune/routes/page metadata subset also passes `--max-warnings 0`; App and mixed component/helper exports retain existing hook/fast-refresh warnings.
- Changed-file Web Interface Guidelines and React review, plus screenshot inspection at both sizes. Existing shared components retain settings semantics, keyboard/controller focus and design tokens; no new CSS or component framework was introduced.

This is source/browser evidence, not native installation, physical-controller or real-gameplay validation. The one-pad rotation guard is preserved in source; this pass's rendered interaction fixtures use the mock two-pad Steam Controller.
