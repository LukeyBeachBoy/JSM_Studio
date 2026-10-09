# BIND notes (P3: Buttons list and the binding sheet)

Built 2026-10-07/08 by the BIND agent, against `designs/ButtonList`, `BindingSheet`, `BindingMore`,
`BindingWhileHolding`, `BindingFineTune`, `BindingDetails`, `Kit` and the binding rows of `Parity`.

## What was built, file by file

New, `src/components/keymap/binding/`:

| File | What it is |
|---|---|
| `model.ts` | The sheet's model. Activations (Press · Tap · Hold · Double-tap, and More's Let go · Turbo · Press together with… · Stick diagonal), `activationOf`, `commandsFor`, `sendKindOf` (a command → one of the 8 `SEND_KINDS`), `CHOOSE_LABEL` ("Choose key"…), `behaviourLimits`, `commandParameters`, `KIND_ICONS`, `nameSuggestions`, and `BindingApi`: everything the sheet and its pages read or call. The card (`ButtonBindingsCard`) still owns every write. |
| `BindingSheet.tsx` | `BindingSheetBody`: "When you…" as a **selector** (focus selects the tile; A opens the current kind's picker, or moves to the grid on an empty tile); More tile with count ("4 ▸", or the set kinds) that A expands to BindingMore's four cards; "<activation> sends" 8-kind grid (KindPicker, never ActionPicker); the "Sends" chips (several things on one press, "Also send", X removes one); the two fold rows (OpenRow): While holding another button… (None / "LB: Marker · +1") and Fine-tune (Default / summary). X Clear clears the selected activation; Y Rename (`requestValueEntry` with suggestions from the output). `renameInput()` is exported for the sheet header and the row menu. |
| `PairPicker.tsx` | Press together with… (press the other button on the pad — AddModeshiftSheet's telemetry pattern via `usePressedInput` — or pick it) and Stick diagonal (pick the other direction from D-pad / left stick / right stick). |
| `FineTunePage.tsx` | Full-screen `SubPage`: "How Space is sent" as `ModeCards variant="compare"` (Normal / Send once / Toggle on/off / Only when let go, flat timelines, unavailable-with-reason where a kind can't take one); Light while held on any binding (Configuration's own light, 9 presets, + any colour; Brightness while held ValueRow; While held / Keep after press SegmentedRow — converts heldLed ⇄ one-shot LIGHT_BAR); "Only for some actions" cards. Footer ◂ ▸ Compare · A Choose · X Try it (`jsm:start-test`) · Y Rename, copy, remove (menu: Name this action, Copy, Duplicate, Move to…, Remove). |
| `WhileHoldingPage.tsx` | Full-screen `SubPage`, 3 steps stepped by LT/RT: (1) press the button to hold (Listening pill; Back grips / Bumpers, triggers incl. LT full, RT full / Sticks / Trackpads / Everything else ▸); (2) the 8 kind tiles (unavailable "Press a button first" until step 1) + Held / Not held; (3) Left/Right stick + ModeCards No change / Moving / Looking around / Flick to turn / More… (every `STICK_MODE_VALUES`) writing `HELD,LEFT|RIGHT_STICK_MODE`. List state when changes exist (not drawn; same rows/menus): A changes one, Y Name / remove (and "Remove the stick change"), "+ Add another". "Every way of pressing, while held" opens the shifted input's own binding sheet (ShiftedBinding → the same BindingSheetBody), keeping per-activation shifts. |
| `inputGroups.ts`, `usePressedInput.ts`, `hooks.ts`, `art.tsx` | Hold/pair groups and cap names; the press-to-pick telemetry hook; `usePadButtons` (X/Y for a subtree), `useTurboDefault`, `requestTest`; flat timeline art for More and the compare cards. |
| `variantScope.ts` | `VariantScopeContext` (App provides: model, label, document text) + `useInputVariant` for "Only for Steam Controller. Other controllers use the shared layout."; `OPEN_BINDING_EVENT` / `requestOpenBinding` (`jsm:open-binding`, `{command, activation?}`) — opens a row's sheet from anywhere (Details' "Open in <mode>"; LAYOUT may use it too). |
| `sectionCounts.ts` | The Buttons rail counts store (`publishSectionCounts` from KeymapControls, `useSectionCounts` + `formatSectionCount` in App): "4", "1 of 4", "0". |
| `binding.module.css` | All of the above, plus the Sheet `lead` header rules. |

Changed:

- `ButtonMappingCard.tsx` — rewritten. The row: glyph, input name (+ the small origin marker), and on the right your name ("Jump") with the mono key ("Space"), "Not set", or "■ <mode> only". The focused row expands in place: Hold · not set, Double-tap · not set, other set activations, While holding changes, "■ Vehicles mode: Handbrake", and the variant line (or "From the FPS base…"). Hints `A:Change;X:Hold & double-tap;Y:Copy · clear · name;B:Back` (X is the row's `xAction` where one exists, e.g. "Test segment"). X opens the sheet at Hold. Y opens a menu: Copy, Paste, Clear, Rename, Details, Reset to inherited / Use shared layout. The sheet: 700px, glyph-48 lead, eyebrow "A button · Default mode" (or the mode), title = the input's name, Rename in the header, footer A Choose · X Clear · Y Rename · B Done, origin marker (with reset) as its description.
- `ButtonBindingsCard.tsx` — the write logic is untouched (writeCommand, updateCommand, removeCommand, paste, the tap/hold pair rule, `SPACE\ J\`). The lanes, Add command, Capture a key, trigger chips and Modeshifts lane are gone; the card builds a `BindingApi` instead. New: `clearCommands` (one write per config line), `addCommand` (several keys in one value = a combo, written as presses together), `captureInto` (listen for a key into a command or a new one on the selected activation).
- `BindingDetailsPopover.tsx` — now the centred Details modal (Dialog): Press sends; the "Where A gets its action · Top wins" stack (modes that change it → controller only → this configuration → its base → JoyShockMapper default, "used now" marked); Where it comes from (Base / Own / Default) and the controller layout row (Shared / Only here); the read-only profile-activation line; In each mode (A = Open in <mode>: selects the mode, then `jsm:open-binding`); Also on A (X/A = Every use → `jsm:input-uses`).
- `PressToFind.tsx` — now the right aside "Where it is on your controller" (`ControllerStatusSvg` with the focused row's input selected; a glyph fallback without a pad) plus the "Press it now" explainer card (A listens for any button; back buttons, grips and stick clicks still jump on their own — both behaviours of `nav/usePressToFind.ts` kept). `ButtonsPageLayout` lays out list + 340px aside (stacks away under 1024px). `PressToFind.module.css` is no longer used.
- `AddModeshiftSheet.tsx` — kept (GYRO's pages use it): `title=` → `data-caption`, `disabled` → `aria-disabled` + `data-reason`, vocabulary (While holding…, Half/Full press).
- `BindingCommandCard.tsx`, `BindingEditor.tsx` (CommandSettingsSheet) and `BindingEditor.module.css` — **deleted**. Nothing imported them once MODES removed `VirtualMenuActionEditor.tsx`; every field they carried has a home in Fine-tune (table below).
- `utils/bindingDescription.ts` (unowned util, small addition): `describeBinding` now reads a cycle as "Cycle: Space › E › Q" and a grip pulse as "Pulse both grips · Click" instead of raw token soup. Every surface that describes outputs benefits.
- `i18n zh-CN hints`: Chinese for the new footer labels (Rename, Change, Choose key…, Hold & double-tap, Copy · clear · name, Name, remove, Try it, Compare, Step…).
- `InputModeshiftPanel.tsx` — deleted (replaced by WhileHoldingPage; nothing else imported it).
- `KeymapControls.tsx` (buttons part only) — groups render in the page's order; counts published for the rail; "Tilt inputs" → `keymap.tiltGesturesTitle` "Tilt gestures", plus a "Tilt settings" row that opens Gyro and fires `jsm:gyro-tilt` (D6; **GYRO: please listen for `jsm:gyro-tilt` and open Fine-tune ▸ Direction ▸ Advanced ▸ Tilt**).
- `App.tsx` — `CONTROL_TAB_SECTIONS.buttons` / `SUB_NAV_GROUPS.buttons` in ButtonList order (Face, Bumpers, Menu buttons, D-pad, Back buttons, Grips, Tilt gestures) with `count`; `VariantScopeContext.Provider` + `ButtonsPageLayout` around KeymapControls; Buttons drops the page header (ButtonList has none — tests that waited on `.page-header__title === 'Buttons'` need the tab instead).
- `ui/Sheet.tsx` — new optional `lead` prop (backward compatible): a glyph left of the eyebrow/title; with it the eyebrow is sentence case.
- `triggerKinds.ts` — labels come from the renamed i18n values.
- i18n (`en.ts`, `zh-CN.ts`): new `bind.*` namespace; renamed values: Double-tap, Let go, Press together with…, Stick diagonal, While holding… (chord), Normal / Send once / Toggle on/off / Only when let go, "How it is sent", Back buttons, Stick while held, Half/Full press (hold groups), "While holding… · Step 1 of 2"; new Tilt gestures keys. Keys shared with P4's `InputModeshifts` (modeshiftsTitle, addModeshift…) were left for P4/SHELL's sweep.

## Every case the old lanes handled, and its home now (D5)

| Was | Now |
|---|---|
| Several Press tokens on one activation (`SPACE\ J\`) | The "Sends" chips under the grid; "Also send" adds another (picker, or X Listen in the key picker); X on a chip removes it |
| Key + modifier combo | PICK's combo picker returns several keys in one value; `addCommand` writes them as presses together |
| Capture a key / X on a row | The key picker's X "Listen for a key" (`onCapture` → `captureInto`) |
| Trigger chip (retarget Press ⇄ Hold ⇄ Double…) | Fine-tune ▸ Y ▸ Move to… |
| Release / Turbo / Simultaneous / Diagonal | More cards; existing ones listed under them ("Set on this button") |
| Turbo interval | More ▸ Turbo ◂ ▸ Repeat speed (Default = TURBO_PERIOD); also Fine-tune ▸ Turbo for a turbo activation |
| Condition input (simultaneous / diagonal) | PairPicker; Fine-tune ▸ Press together with ▸ change |
| Chord (`HELD,INPUT`) / Modeshifts lane / ModeshiftSheet (held button, held/released, name, commands, remove) | While holding page (steps + list + Y menu + "Every way of pressing, while held") |
| Chords on a card with no While holding page | Rows under the fold rows (A change, X remove) |
| heldLed row (colour, brightness, LED activation) | Fine-tune ▸ Light while held (any binding) |
| One-shot LIGHT_BAR (colour, brightness) | Fine-tune ▸ Light while held ▸ Keep after press |
| LED_BRIGHTNESS command | Fine-tune ▸ Light brightness |
| layerAction row (layer, verb, press/release) | Switch mode kind; Fine-tune ▸ Switch mode (mode, verb, Happens on Press / Let go) |
| stickShift row | Controller action ▸ Change a stick while held (picker); Fine-tune ▸ Stick while held (stick, mode over STICK_MODE_VALUES) |
| special (GYRO_OFF = A) profile activation | Read-only chip on Press (X removes, as before) + read-only line in Details |
| Output mode | Fine-tune compare cards |
| Cycle steps | Fine-tune ▸ Cycle through keys (n of 32, chain, + Step, Y reorder/remove) |
| Haptic pulse / rumble motors | Fine-tune ▸ Rumble (grip, pattern, strength; motors behind "Small and big motor strength") |
| Sound + volume + preview | Fine-tune ▸ Sound (◂ ▸ tune, Volume, X preview) |
| Configuration select | Load a config kind + Fine-tune ▸ Load a configuration ◂ ▸ |
| Edit action (raw / command) | The Command kind |
| Name (per command) | Fine-tune ▸ Y ▸ Name this action |
| Duplicate / Copy / Remove | Fine-tune ▸ Y menu; row Y menu (Copy, Paste, Clear) |
| Copy / Paste / Reset to inherited (cog) | Row Y menu |
| Details button | Row Y menu ▸ Details |
| SettingOrigin | Row marker, sheet description (with reset), Details |
| Notes (gyroAction, special, TURN_OFF_CONTROLLER) | Fine-tune under the compare cards |
| Virtual controller warning | Under the Sends chips |
| Trackball decay | Fine-tune ▸ Trackball |
| Menu item icon + label | IconPicker at the top of the sheet; label = Y Rename |

## Presets (D7)
None in BIND.

## Behaviours worth knowing

- **A mode switch lives on Press or Let go**, whichever tile it was chosen from; the sheet follows it there (More's Let go when it is `!X`). Layer actions have no Tap/Hold of their own.
- **Fine-tune follows a command that moves** (Y ▸ Move to… Hold): the page re-scopes to the new activation.
- **Y on a chip** (when an activation sends several things) fine-tunes that one command; the page's Y menu names, copies, duplicates, moves or removes it.
- **A key combo replaces the activation's key** (PICK's `onSelectCombo` → `addCommand(..., replace)` rebuilds the base line without the replaced token).
- **NONE** ("nothing, over a base") reads as "None" on a tile and has no chip.
- **Rename** passes `input` (glyph) and `where` to the on-screen keyboard (`nav/textEntry.ts`).
- **Press it now**: A on the aside card listens for any button (navigation pauses, as before); back buttons, grips and stick clicks still jump with no card. The passive jump and `data-pad-listening` behaviour in `nav/usePressToFind.ts` are untouched.
- **While holding** list state (A change, Y Name / remove, + Add another) and the "Every way of pressing, while held" sub-page were not drawn; they reuse the same rows, menus and the input's own `BindingSheetBody` (`ShiftedBinding`).

## Tests (updated to the new structure; each proves the behaviour it always proved)

Run against `http://127.0.0.1:1441` (a private Vite of this working tree) on 2026-10-08. All pass:

`binding_card_regression` (When you… selects; eight kinds; row Y menu; Move to…; picker add; X clears one activation), `binding_card_add_flows_regression` (Also send + Listen adds presses on the base line; one of several fine-tuned and named on its own; While holding named from Y and reopening on its held button; a pair listed under More), `shifted_binding_parity_regression`, `shifted_capture_isolation_regression`, `shifted_binding_imports_regression` (a shift is edited on the input's own sheet via While holding ▸ Every way of pressing; only its line is written), `released_bindings_regression` (not-held changes `!X,KEY` and let-go mode switches `!X = hold`), `turbo_binding_browser_regression` (per-command repeat speed, typed on the on-screen keyboard, Y resets), `binding_row_labels_regression`, `binding_clipboard_regression` (Copy / Paste in the row's Y menu), `binding_aliases_browser_regression`, `menu_item_card_regression`, `additional_configuration_browser_regression` (rumble motors, grip pulse incl. imported effects, configuration switch), `command_parameters_browser_regression`, `gyro_action_browser_regression`, `feedback_binding_polish_browser_regression` (the origin-marker alignment check is now conditional: Modes' Y no longer selects the mode, so an inherited marker is not always on screen), `parity_controls_browser_regression` (Cycle section rewritten; its stale final `!MISC6` assertion fixed to `!L`), `pickers_browser_regression` (PICK's, with `?mock`: still passes against my sheet), `config_imports_ui_regression` (selectors moved to `[data-chip-command]` / `[data-row-output]`; see below).

Edits to land in a controller's own layout when one is connected (V4) are read with a small `eff()` helper in the tests (`# @controller type-24 KEY = …` wins over `KEY = …`).

**Baseline comparison.** The baseline's original tests do not dismiss the first-connection sound prompt, so most fail on it before reaching a binding; those are pre-existing failures, not mine. Of the tests that pass on the baseline, none fails because of this work (`additional_configuration`, `feedback_binding_polish`, `editor_feedback`, `layers_browser`, `layers_ui_polish`, `modeshift`, `single_pad_modeshift`, `analog_modeshift`, `load_config_binding` all pass here).

**Still failing here, not caused by BIND:**
- `binding_card_review_regression`: 1 check, "every surface that enumerates layer slots covers all of them: `OverviewPage.module.css` has no rule for layer 2" (LAYOUT's CSS). The other 20+ checks pass.
- `config_imports_ui_regression` ("inherited binding is not marked") and `template_override_roundtrip_regression` (second half): with a controller connected the origin of a binding reads "Changed here" instead of "Inherited · Base". It fails the same way on the baseline once the sound prompt is dismissed (App's `SettingOrigins.own` is built from the controller projection, which already holds the resolved template). Needs the controller-fold owner.
- `feedback_browser_regression` ("preview shortcut did not focus N"): clicking Layout's SPACE callout lands on a different input's row than the one it names (the Layout callout → `navigateInput` path; LAYOUT). BIND's row focuses correctly when asked.
- `modeshift_trigger_overview`, `held_modeshift_status`, `overview_layout`, `usability_audit` (LAYOUT/SHELL structure), `stick_modeshift` (P4), `pad_modeshift_presentation` ("11 px", fails on the baseline too): no BIND selectors.

## Not done, and why

1. **"X Try it" scopes nothing to the input.** It starts the normal Test mode (`jsm:start-test`). The mapper has no "test only this input" switch; D13's text-override route would need the configuration folded per input. The binding keeps working live while you are on Fine-tune (D1), so this is a convenience, not a gap.
2. **Controller-variant fold quirk (not BIND's file).** With a controller connected, a mode switch is written `# @controller type-24 # @layer-action !N = toggle aim`, and flipping a While holding change back to Held can leave `# @controller type-24 MISC5,W = NONE` behind. The sheet reads both back correctly (verified), but the lines are odd. Owner: `utils/controllerLayouts.ts` / App's `setControllerDocument` (MODES).
3. **`jsm:gyro-tilt`** (Buttons ▸ Tilt gestures ▸ "Tilt settings") is fired after navigating to Gyro; GYRO needs to listen for it and open Fine-tune ▸ Direction ▸ Advanced ▸ Tilt (D6). Until then the row lands on the Gyro front.
4. **`jsm:open-binding`** (`{command, activation?}`) opens a row's sheet from anywhere; Details uses it. LAYOUT may use it for its "Change" / quick-menu flows.
5. **Stick diagonal's pair picker** offers the D-pad and both sticks' four directions as "the other direction"; on an input that is not a direction the card is still shown (the design draws it on A) and writes the pair, but JoyShockMapper only fires it for direction inputs.
6. **Press timing numbers** (D7) are not BIND's; Turbo's "Default" is `TURBO_PERIOD` read from the configuration.
7. **zh-CN** for the new `bind.*` strings is machine-quality; a native pass is worth doing.
8. **Housekeeping:** I accidentally stopped other agents' running `node tests/*_regression.cjs` processes once while clearing my own background runs. They only needed rerunning.
