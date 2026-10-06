# Controller layout compatibility and edit preservation

Investigation dated 4 October 2026. A Steam Controller layout must remain usable when its owner temporarily connects a DualSense or Xbox controller. Adaptation must preserve the original layout, expose unavailable actions, and give edits a clear destination. Controller variants, single-pad adaptation, controller-scoped native settings and per-device chord/layer routing are now implemented. The broader assignment and physical validation work below remains a roadmap.

## Current behavior and immediate repair

`useControllerNavigation.ts` used trusted keyboard and pointer events to select keyboard/mouse hints. Windows controller output can arrive as trusted input too. Physical telemetry was checked only after navigation ownership, so a held global chord's controller input could never reclaim the hint family.

The immediate repair observes physical activity before the navigation gates, across every reported controller. While a physical button, trigger, stick or touchpad is active, hints stay on controller input. A 120 ms tail covers release/event ordering. Navigation still respects ownership so a mapped input does not also execute a Studio navigation action.

This is an activity heuristic, not native input provenance: real keyboard/mouse use during a held controller gesture also retains controller hints until the gesture ends. A future native input-source service should distinguish injected output from physical keyboard/mouse events, including input from other remappers, without suppressing either device's actions.

The frontend currently keeps left/right pad editors visible whenever the loaded text contains per-pad settings (`KeymapControls.tsx`, `hasPerPadSettings`). This preserves source data but presents unavailable hardware as usable hardware. Simply hiding those editors would not make the underlying config compatible.

The default built-in chord now includes `TOUCHPAD_MODE = MOUSE`. That only repairs the built-in config. It does not adapt existing personal Steam Controller profiles or translate their per-pad grids, modeshifts, clicks and menus.

## What Steam Input evidence supports

Valve documents configurations per controller type, automatic selection of the corresponding developer layout, and browsing other controller types. It cautions that using a layout intended for different hardware may not work well. See [Browsing Configurations](https://partner.steamgames.com/doc/features/steam_controller/browse_configs).

Read-only inspection of local Steam Controller Configs found separate `configset_controller_xbox360.vdf`, `configset_controller_ps5.vdf`, and `configset_controller_triton.vdf` selection files. A local saved DualSense layout contained `controller_type`, `controller_caps`, a `progenitor` template reference, its own autosave URL, and active/inactive input-source groups.

These observations support controller-specific selections and preserving input-source information. They do not establish Steam's current cross-controller conversion rules or prove that changes made on an Xbox controller merge back into the Steam Controller source. That exact behavior would require a controlled import/edit/reconnect experiment with temporary layouts. Existing Steam layouts were not modified in this investigation.

## Proposed saved layout model

One library layout has an immutable imported/source snapshot, an editable common base, and optional variants keyed by controller model and capabilities. Physical device assignments choose a layout, its variant, and whether that device is managed. A model variant can be reused by two identical controllers; instance overrides are optional and identified separately.

The runtime compiles base + compatibility adaptation + model overrides + instance overrides + active layers/chords. The editor retains original source assignments and metadata. Compiled files are disposable runtime output and must never become the saved base through Save, Apply, autosave, binding-loaded configs, or reconnect.

When a different model first opens a layout, its compatibility view is derived without writing the base. The first edit creates that model's variant. All edits in this view, including ordinary face buttons, default to the variant. Changing common behavior is an explicit action with an affected-controller preview. Returning to Steam Controller selects its own existing variant or base, with its two pads and additional bindings unchanged.

Overrides need explicit deletion/`NONE` values; absence means inherit. Each override records the source key and base revision. Later common edits propagate only to unoverridden values. Conflicting changes are shown for resolution, with both values retained. Export supports the full layout family or a compiled single-controller JSM profile, labeled distinctly.

## Fallback policy

| Source feature | DualSense | Xbox or controller without that feature |
| --- | --- | --- |
| Face buttons, D-pad, shoulders, stick clicks | Match physical position; show PlayStation labels | Match physical position; show connected-controller labels |
| Two Steam trackpads | One physical touchpad uses right pad by default when no explicit single-pad layout exists; show the chosen source and allow left instead | Preserve both pad layouts as unavailable; do not overwrite occupied sticks |
| Explicit shared touchpad config | Takes precedence over derived right-pad fallback | Preserve as unavailable |
| Pad grid, touch stick, menu, sensitivity, click and feedback | Translate the chosen source as a complete unit, including activators, cell IDs and modeshifts | Offer a user-chosen free stick/menu activation when feasible; otherwise show affected actions for manual assignment |
| Second pad behavior | Preserve as unavailable; offer an explicit modeshift to reach it | Preserve as unavailable |
| Extra paddles, mini shoulders and grips | Map only verified hardware equivalents; stock DualSense has none | Map only equivalents actually reported by the controller |
| Gyro and touch activators | Retain gyro; adapt an absent activation input only with a reviewed choice | Preserve gyro settings and report gyro actions unavailable where there is no gyro |
| Device-specific output such as PS touchpad output | Check selected virtual output capabilities separately | Preserve unsupported outputs with manual guidance; input fallback must not silently change output semantics |

The proposed right-pad default is a JSM product choice, not a verified Steam rule. It is suitable for mouse/aiming layouts, but left-pad menus may be more important in some profiles. Explicit choices persist in the controller variant. Never merge two conflicting pad layouts into one or silently assign missing actions to occupied inputs.

Compatibility analysis must inspect effective imported text, active layers, modeshifts and global chords, not just local assignments. It must enumerate each affected binding, distinguish a safe equivalent from an ambiguous choice, and retain unknown commands. A summary should say, for example, “DualSense adaptation: touchpad uses Steam right pad; 6 bindings need another input.”

## Editor behavior

Show “Editing for DualSense” beside the layout name, with a model selector and clear Base/Variant status. The active hardware view shows one Touchpad card. Source-only inputs remain reachable in an Unavailable inputs section with their saved behavior and adaptation options. Selecting source view makes it clear that the editor is displaying Steam Controller hardware rather than pretending those inputs exist on the DualSense.

Changing the adapted touchpad edits the DualSense override of the translated settings. It must not write through to `RIGHT_TOUCHPAD_*` in the Steam base. Offer per-change revert to inherited behavior and preserve the existing change review and undo infrastructure. Explicit common edits show which controller variants inherit the change and which keep overrides.

Global chord activation is scoped separately by controller model/device. A DualSense Create activation must not also make an Xbox View activation implicit just because both use `-` internally. Detect all buttons in an AND group on the same physical device. Chord behavior belongs to that device's runtime context and must not reset another player's mappings.

## Runtime prerequisites and implementation order

1. Introduce a shared controller-capability model using actual supported inputs, pad count, gyro, and model identity. Stock DualSense and Edge must be distinguishable. Avoid choosing hardware by arbitrary `devices[0]` ordering.
2. Add compatibility analysis and saved controller variants with a versioned format. Preserve imports, layers, unknown settings, labels, and intentional `NONE` overrides. Exercise save/export round trips before automatic adaptation is enabled.
3. Replace the mapper's global settings context with per-device configuration contexts. `SettingsManager` currently stores settings in a static map; `CmdRegistry` keeps one active profile and one chord restore stack. Separate profile loading, virtual-controller ownership, chord/layer state, calibration and output cleanup by device.
4. Compile safe input adaptations through one shared pipeline used by ordinary Apply, AutoLoad, global chords, layer composition, binding-loaded profiles and reconnect. A frontend-only conversion would miss most of these paths.
5. Connect editor capability views and variant saves to the same compiler, then add reviewed remapping for ambiguous cases. Keep compatibility diagnostics accessible before Apply.
6. Validate with physical DualSense Bluetooth, Steam Controller and Xbox devices, including two simultaneous players and one unmanaged controller.

Saved model identity must not use transient telemetry handles. Use model/capability identity for reusable variants and a stable hardware identifier where available for physical assignments. If identical devices cannot be uniquely identified, surface a reconnect/player-assignment choice rather than guessing. Controller player order and virtual-gamepad slot selection also belong to device assignments.

## Required validation

- Load a two-pad mouse/grid Steam layout on DualSense; activate a personal global chord, not only the built-in default; verify single-pad mouse motion and complete menu/click/modeshift behavior.
- Make DualSense edits, save/restart, reconnect Steam Controller; verify original pad, grip, paddle and common-button assignments remain unchanged. Export and reimport both a family and a single-controller variant.
- Repeat on Xbox with no pad or gyro. Verify unavailable actions remain saved, reviewable and reachable through explicit remapping, with no silent stick reassignment.
- Test imported source overrides, empty assignments, released activators, multiple layers, changed base revisions, deletions and duplicate controller models.
- Connect Steam Controller and DualSense together. Activate/release/disconnect a chord on either device and verify the other player's mappings, virtual slot, and held outputs remain intact. Unmanaged devices must remain untouched.
- Test real keyboard/mouse input and controller-generated keyboard/mouse output separately. Holding Create or Options must not switch hints to keyboard, while idle controllers must allow real keyboard/mouse use to select its hints.

## Verification in this investigation

The web build and a DualSense browser fixture passed after the activity-detection repair. The fixture sends trusted keyboard events during raw Create and Options holds with a non-navigation profile active, then verifies keyboard hints can return after release. The older `keyboard_hints_regression.cjs` stopped before its hint assertions because its `.profile-chip` Desktop selector no longer matched the current UI; that harness did not verify this change. Saved controller variants, single-pad fallback, regular-gamepad variants, controller model selection for chords, and per-device native settings/chord/layer state are now implemented. Source profiles retain unsupported inputs; selected-controller edits are stored as `# @controller type-N <assignment or metadata>` and pad selection as `# @controller-pad type-N left|right`. The parser retains both through save/export. Stock DualSense and Edge use different model keys. Native commands queued by a binding retain their originating handle.

The web editor has an Editing for selector and a resettable variant. Use regular gamepad creates standard Xbox output bindings, analog sticks and triggers, clears custom inputs/layers/menus for that model, and leaves other models intact. A single-pad model derives the selected Steam pad without silently repurposing an existing stick. Native loader and layer worker use matching token translations, including click-required grids and layer activators. Process-wide infrastructure such as telemetry, AutoLoad and working directory remains process-wide.

Validation now includes JS save/reload and source preservation tests, a compiled native model/device-isolation and release test, the Rust suite, and a two-controller browser fixture that saves a DualSense pad choice, switches back to Steam, verifies single-pad UI while both are connected, and creates a regular-gamepad variant. Physical Bluetooth, virtual-gamepad multiplayer behavior, hotplug/player-slot order and the installed app have not been validated. Stable physical-device assignments across reconnect, an unmanaged/bypass mode, and a complete controller-specific Studio preference model are not included in this implementation.
