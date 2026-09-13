# Controller-first redesign — remark tracking

Every remark from `1-JSM-Studio-remarks.pdf`, what was built for it, and what
proves it. Started by Codex (0.7.23–0.7.33), finished in 0.7.34.

Evidence is either a **test** that fails without the change, a **file** where
the behaviour lives, or a **screenshot** under `tmp/visual/` from the sweep in
"Visual review" below. Anything not verified says so; nothing here is marked
done on the strength of having been written.

---

## Navigation, appearance, and overview

| Remark | Built | Evidence |
| --- | --- | --- |
| Simplify navigation into Overview / Inputs / Tuning / Settings | `NAV_SECTIONS` in [App.tsx:244](../JSM_GUI/jsm_gui_tauri/src/App.tsx#L244): three labelled groups, Overview leading. Diagnostics (Debug Console, Global Chords, Device Visibility) sit under Settings. | `sidebar_regression.cjs`; every `tmp/visual/*` shot |
| Replace document-order controller navigation with explicit regions and directional movement | `directionalTarget` in [useKeyboardNav.ts:234](../JSM_GUI/jsm_gui_tauri/src/hooks/useKeyboardNav.ts#L234) picks by geometry, not DOM order. Focus is remembered per page (`pageFocus`), trapped in dialogs, and restored on close. | `controller_redesign_regression.cjs`; the prompt bar in every screenshot |
| Controller-operable numeric controls | Selecting a slider enters adjustment mode; arrows change the value, Back leaves it ([Slider.tsx:21](../JSM_GUI/jsm_gui_tauri/src/components/ui/Slider.tsx#L21)). Fine/coarse toggle per field ([NumberField.tsx](../JSM_GUI/jsm_gui_tauri/src/components/NumberField.tsx)). | `tmp/visual/default-dark-Gyro.png` (FINE toggles) |
| Fix the footer | Language, Theme, Start With Windows, Controller Navigation and Overlay all moved to Settings → App Preferences. The rail footer is one small Settings button. | `controller_redesign_regression.cjs` asserts "Navigate with controller" is **absent** from the rail and **present** in Settings; `tmp/visual/default-dark-Settings.png` |
| Shared styling: spacing, control heights, focus, flat rows | `App.css` "Shared interaction surfaces" block; nested bordered panels replaced by flat rows with dividers. | Visual sweep found no clipped text and no horizontal overflow at 1024×720 or 1440×900, in both themes |
| Standardize capitalization | Title Case for headings, labels, options and actions; sentence case for prose. | Screenshots |
| Replace ambiguous icons | Vector glyph system in [InputGlyph.tsx](../JSM_GUI/jsm_gui_tauri/src/components/glyphs/InputGlyph.tsx), with family-specific face buttons, sticks, pad clicks, paddles and sensors. **0.7.34** added pattern glyphs for the pads, their numbered regions, stick-wheel segments and stick directions — these had been falling through to a lettered disc showing the first two characters of the token, so a left pad region read "LT" and the left pad itself read "LE". | `tmp/probe-output.png` (numbered pad tiles in the callouts) |
| Rebuild Overview | Controller centred, callouts around it carrying glyph + action label + concise output. No "Triangle / Y". Live stick, trigger, pad and grip feedback retained. **0.7.34** put the raw sensor numbers behind a **Details** toggle — the pads were permanently captioned `p=0.0000`, which read as an instrument rather than a picture of the controller. Selecting a callout opens that binding. | `feedback_browser_regression.cjs` (a callout selects and focuses its input); `tmp/visual/default-dark-Overview.png` |
| Applied profile clickable | The "Currently applied" chip resolves the real source name (never `applied-preview`), routes through the guarded switch, and says so when the source file is gone. | `applied_profile_regression.cjs` |
| Shrink virtual output controls | **0.7.34**: one compact profile-wide Output control in the header, now a menu of Disabled / Xbox / DualShock 4 with **Bind Whole Controller** below a separator as a separate action, disabled while output is Disabled. The duplicate copy on the Settings page became a pointer to it. | `tmp/probe-output.png`; `quick_bind_regression.cjs` |

## Binding editors, modeshifts, and help

| Remark | Built | Evidence |
| --- | --- | --- |
| Progressive disclosure | Inputs are compact rows — glyph, action label, output, modeshift count — opening one at a time into a detail panel. Timing, extra commands and rare trigger kinds live under Advanced. **0.7.34** added the keycap output and the modeshift count to the row, and surfaced **Paste** there so a copied binding still shows every input it can land on. | `shifted_binding_parity_regression.cjs`; `binding_clipboard_regression.cjs` |
| Unify normal and shifted editors | **0.7.34**, the largest remaining piece. `ShiftedBinding` was a reduced re-implementation: no activation kinds beyond what was already written, no output-kind picker, no advanced options, no capture, a bare "Add Another Trigger". It now projects the shift onto an ordinary configuration (`projectModeshift`) and renders the same `ButtonBindingsCard` the unshifted input uses, folding edits back into `TRIGGER,KEY` lines (`foldModeshift`). Chords are the one exclusion — the format has no second condition to hang them on — so the card's pickers and its add menu both drop them. | `shifted_binding_parity_regression.cjs` |
| Keep modeshifts compact | A shift shows its trigger and mode in a summary row and expands only when selected; normal and shifted versions of an input are now literally the same component. | `editor_feedback_regression.cjs`; `tmp/probe-shift-open.png` |
| Preserve configuration scope | Reads resolve through imports, writes land only in the selected profile/input/shift. `foldModeshift` diffs against the **import-resolved** projection, so reading an inherited value cannot mint an override for it. Rename and removal stay scoped to the group. Multi-command bindings survive editing one command. | `modeshift_regression.cjs`; `shifted_binding_parity_regression.cjs` asserts an untouched inherited binding is not written, and that neither the normal binding nor another shift moves |
| Restrict custom icons | Icon assignment is offered only for virtual-menu regions, shifted menus included; action labels stay available everywhere. Existing `# @icon` annotations are preserved whether or not a control is shown. | `controller_redesign_regression.cjs` (ordinary inputs offer no icon control); `annotation_roundtrip_regression.cjs` |
| Repair clearing centrally | Shared selects carry an explicit clear/reset; "Use Default/Inherited" is distinct from a real "None", and removing an override reveals its fallback. | `controller_redesign_regression.cjs` (clearing a pad mode writes nothing) |
| Explain dropdown choices | `utils/optionHelp.ts`, shown beside the open list while navigating it. | `select_help_panel.cjs` |
| Complete gyro help | Real World Calibration, in-game sensitivity, gyro sensitivity, smoothing, filter cutoff, deadzones and calibration all answered from `utils/settingHelp.ts`, which `NumberField` consults by label. **0.7.34** turned the three remaining persistent paragraphs (Gyro Activation, Activation Button, Gyro Output) into contextual Help buttons. | `tmp/visual/default-dark-Gyro.png` |
| Restructure Grip Sensors | Live left/right status, activation bindings and tuning separated; calibration and filtering under Advanced; the two sides stay independent. | `grip_calibration_regression.cjs`, `grip_haptics_regression.cjs`; `tmp/visual/default-dark-Gripsensors.png` |
| Clarify Device Visibility | Opens by explaining duplicate physical/virtual input and when hiding helps. Visibility ("Hidden") is shown separately from connection ("Connected"); "Present" and "Partially Hidden" are gone. HidHide and device-interface detail sit under Advanced. | `feedback_browser_regression.cjs`; `tmp/visual/default-dark-DeviceVisibility.png` |
| Correct touchpad sections | Shared Touch/Click controls kept for single-pad devices with their purpose explained; a Steam Controller's per-pad click lives inside that pad's editor; touch-stick directions moved into the stick section; unsupported bindings remain reachable under "Bindings From Other Controller Types". | `tmp/visual/default-light-Trackpads.png` ("Left pad click · Misc 3" inside the left pad card) |

## Virtual menus and polling

| Remark | Built | Evidence |
| --- | --- | --- |
| Both menu-layout entry points | Tuning → Menu Layout, and an **Appearance & Position** action beside every virtual menu. Both open the same editor with that stick/pad and modeshift already selected. | `controller_redesign_regression.cjs` |
| Menu-specific behaviour stays nearby | Reveal timing (`show ring\|touch`) sits with the menu's activation settings; size, position, typography and label/key visibility live in the shared appearance editor. | `overlay_reveal_regression.cjs` |
| Synchronize previews | One renderer and one resolved appearance model for the input editor, the layout editor and the live overlay. Text is laid out at the configured logical size and the whole preview is then scaled. | `overlay_layout_regression.cjs`, `overlay_radial_geometry_regression.cjs`; `grid_geometry_regression.cjs` measures the real rendered cells against the hit test |
| Preserve existing metadata | `@overlay`, `@label` and `@icon` keep their identities and round-trip; appearance edits go through the same draft and Save/Apply. | `annotation_roundtrip_regression.cjs` |
| Move polling out of Gyro | Settings → Controller Polling, described as JoyShockMapper's controller-reading interval rather than a gyro or hardware rate. | `controller_redesign_regression.cjs`; `tmp/visual/default-dark-Settings.png` |
| Global polling default, 3 ms | Persisted in the runtime state (`default_polling_ms`, [runtime.rs:80](../JSM_GUI/jsm_gui_tauri/src-tauri/src/runtime.rs#L80)) and written to `StudioDefaults.txt`. | `PollingSettings.tsx`; Rust default |
| Profile override under Tuning → Timing | Optional override showing the effective value and where it came from — this profile, an import, or the global default. Clearing it restores inheritance, and the global value is never written into profile text. | `PollingSettings.tsx` |
| Apply polling consistently | The backend loads `StudioDefaults.txt` on every `RESET_MAPPINGS` and at each outer profile boundary ([CmdRegistry.cpp](../JoyShockMapper/JoyShockMapper/src/CmdRegistry.cpp), `do_RESET_MAPPINGS`), so a profile with no override cannot inherit the previous profile's tick time. Studio refreshes the file from `ensure_required_files`, which runs at startup and on every profile write or Apply. | **Rebuilt backend in 0.7.34** — the bundled `JoyShockMapper.exe` predated this change and did not contain the string at all. Verified present in the shipped binary. |

---

## Follow-up from the 0.7.34 review (0.7.35)

Eight things reported against 0.7.34, recorded in full as TODO-14. Three were
one problem: the binding rows spoke the configuration file's vocabulary rather
than the reader's -- "Triangle / Y" on a Steam Controller, "X_Y" as an output,
and trigger pickers naming both families at once. Labels now take the connected
controller's family, and a written virtual output is named from its own token,
so it reads as what the game will receive.

Two were real bugs. The virtual-menu preview drew a live-touch dot that only the
overlay moves, so the editor got a green blob parked in its corner. And the
selected menu region was a panel repeating the card it wrapped -- an expandable
inside an expandable, three frames around one binding.

The rest were layout: the output keycap floated mid-row because it and the
chevron each took `margin-left: auto`; the modeshift card did not match the list
it lives in; the gyro help buttons I added in 0.7.34 landed on their own line;
and Noise & Steadying had fields with no help at all, decel brake among them.

Guarded by `tests/binding_row_labels_regression.cjs`, verified to fail on both
the old output naming and the old row layout.

## Delivery

**Automated checks.** All 24 Node regression tests pass (`tests/*.cjs`), including
two new files, `shifted_binding_parity_regression.cjs` and
`binding_row_labels_regression.cjs`. Six had been left failing
by the redesign and were repaired against the new UI rather than deleted:
`binding_card_regression`, `binding_clipboard_regression`,
`config_imports_ui_regression`, `feedback_browser_regression`,
`grid_geometry_regression`, `select_help_panel`. Two of those failures were real
bugs, not stale selectors — see below. TypeScript compiles clean; the Rust and
web builds produce a 0.7.34 installer.

The Python tests (`per_pad_grid_regression.py` and the other four) **were not
run**: this machine has only the Microsoft Store Python stub.

**Two bugs the stale tests were actually reporting**

- Escape stopped clearing the binding clipboard. Controller navigation had
  claimed Escape as "close this open row" and consumed it, so holding a copied
  binding became a mode you could not leave. The clipboard now claims Escape
  first, in the capture phase, standing down while a dialog or dropdown is up
  (`escapeIsClaimed`).
- The add-trigger menu still offered **Chord** on pages where chord rows are
  filtered out of the card. A chord made there was written to a line the card
  never shows and lost at the next edit. The menu now follows the same rule the
  rows do.

**Visual review.** Eight pages × two themes × 1024×720 and 1440×900, checked for
clipped text, overflowing rows and horizontal scroll: none found, no page
errors. Screenshots in `tmp/visual/`.

**Not verified — needs hardware.** Everything below is renderer-level only; no
controller was available.

- The controller workflow end to end (Overview → binding → hold action →
  modeshift → value → Help → menu appearance → Save/Apply) with no mouse.
- That focus restoration and input capture do not fight on a real pad.
- Polling across a real restart, and switching between profiles with different
  polling policies.
- Device coverage: Steam Controller, single-pad PlayStation, an unsupported
  device, and the disconnected state; independent grip indicators.
- Menu fidelity between the editor and the live overlay at several display
  scaling levels.
