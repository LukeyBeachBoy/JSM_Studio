# MODES notes (P6: Modes, menus, review, light & sounds, sound library, variants)

Built against `Modes`, `ModeHow`, `ModeChanges`, `MenuEditor`, `MenuEditorMore`, `ReviewChanges`, `ControllerLight`, `SoundLibrary`, `ControllerVariant`, Kit (empty state) and the Parity rows, and `audit/P6.md`.

## 1. What was fixed first (P6 "bugs already in the code")

| Bug | Fix |
|---|---|
| Mojibake in `LayersPage.tsx:157` | The file is gone; the copy lives in `ModeHow` ("Pause holds while it's on", real apostrophes). |
| Menus saved into the selected mode (D16) | `useKeymapConfig` returns `defaultText` (Default, imports resolved) and `setDefaultConfigText`. `MenusPage` reads and writes only those, so the whole catalogue never lands in a mode's overrides. Covered by `virtual_menus_browser_regression` (edits a mode first, then checks the saved file). |
| Review changes showed `VIRTUAL_MENUS` as a HEX blob | `utils/configChanges.ts` decodes both sides and diffs per menu: name, shape, slice count, grid columns, centre dead zone, each slice's label and binding, centre action, look, position and reveal, and "Opened by". Each change has `kind: 'menu'`, `menuId`, `menuField` and reverts on its own. |
| Mode reordering was invisible | New `kind: 'order'` change ("Mode order · A · B → B · A"); reverts to the saved order. |
| `# @controller type-N` lines read as "Configuration note" | New `kind: 'controller'`, with `model`. They group as "Only for DualSense", and `# @layer` / `# @layer-action` / `VIRTUAL_MENUS` lines inside a variant are read as modes, what turns them on, and menus. `# @controller-pad` reads "Touchpad uses". |
| `unavailableControllerInputs` missed mode holds and menu openers | It now also reports `# @layer-action` inputs (`kind: 'mode'`, `layerId`) and a menu's pad and opener / confirm / cancel buttons (`kind: 'menu'`, `menuId`, `attachment`, `field`). Mode overrides are scanned per mode too (`layerId`). |
| Dead `LayerSelector`, `InputLayerActions`, `InputUseBadge`, `LayerBar` dialog, `LayerOverrideRows`, `LayersPage`, `DeleteLayerConfirm` | Deleted. `LayerBar.tsx` keeps only `LayerUsageContext`, `useInputUses`, `LayerIcon`, `LayerValueBadge` (BIND and others import them). `Layers.css` is down to the one badge rule. |
| `change_review_editor_regression.cjs:69-79` was already stale | Rewritten (see tests). |

## 2. Built, file by file

### Modes (`components/modes/`)
- `ModesPage.tsx`: Default card plus one card per mode, in a 4-column grid. Each card shows the hue swatch, name, "● on now" from the live stack, the activation line (`modeActivation()`), what it changes (input pills and names), and the suppress-holds note (with the conflict wording, "L4 won't hold Vehicles"). The focused card adds a 190px controller locator with the changed inputs filled in the mode's hue. "Add a mode": `+ Build`, `+ Photo` (D12: an empty mode with that name and the next colour, de-duplicated), `+ Empty` (names it on the on-screen keyboard). The page's status line carries the old "Active now · live" card: the stack, "Only Default is on", "Not running · the mapper is running X", "Mapper not running". A edits the mode on Layout (`selectLayer` then the Layout tab), X is ModeHow, Y is the mode menu. The callout "Two modes on at once? The one you turned on last wins." is in the page header.
- `ModeHow.tsx` (SubPage, LT/RT = "Move in order"): Holding / Tap to toggle / Turn on tiles (a mode with several buttons switches to one row per button, each with its own verb: ◂ ▸ changes it, A presses a new button, X takes it off). "With this button" (Press a new one to change it). Turned off by: Letting go / Tapping again (informational, as designed) / "Another button" (a `remove` action; the list of buttons it names; X clears). "Pause holds while it's on" (`suppressHolds`). "Advanced" goes to ModeChanges. The aside is the order stack with the mode's colour name and the six hue chips (A moves it there). X is Try it.
- `ModeChanges.tsx` (SubPage): one row per change with "Default: …" and "Use Default" (X); A goes to the input or setting in that mode. Settings overrides (not only buttons) are listed, with a colour chip for LED values. Advanced: "Act when you let go" (switches every action of the mode between `INPUT` and `!INPUT`), "More buttons · + Add" (press-to-capture or pick from the list), "Bring in old 'While holding' changes" (◂ ▸ over the inputs that have shifts, with their count; wraps `convertModeshifts`, keeping the mode's place in the order). Y menu: Rename (on-screen keyboard; "Default" and duplicates refused), How it turns on and off, Move in order (◂ ▸), Try it, and Delete, confirmed in place (red panel, "Keep it" focused, B is Keep it).
- `ButtonCapture.tsx`: "Press a button on your controller" (also the Menus opener / confirm / cancel and Layout's "Pick a button"). Listens to telemetry with the app's navigation paused (`body[data-binding-capture]`), counts a press let go within 600 ms, ignores the A that opened it, and falls back to a list of every button the connected controller has (hold B, or when no controller is connected). A button an owner can't take is focusable and says why.
- `modeText.ts`: words for what a mode changes (`modeChangeRows`, `describeValue`), spoken input names (`inputLong`, "Left back, upper").
- `ControllerMarks.tsx`: the controller's real flat art with chosen inputs filled in a colour (Steam from `STEAM_FRONT_ART` at the positions measured in `ControllerStatusSvg`; other models from `controllerModels.json`). Also used by the light page and the variant cards.
- `utils/layers.ts` additions: `reorderLayers`, `replaceLayerActions`, `modeActivation`, `overrideInput`, `onVerbs`, `layerHueName`, `ordinal`, `LAYER_HUE_NAMES`.

### Menus (`components/menus/`)
- `MenusPage.tsx`: rail (LT/RT steps menus through the shell's `jsm:section-step` claim) with the opener's mode tag ("■ Comms · right pad · 6"), "+ New menu", "3 of 16 · Each opener can own one menu at a time"; the big focused preview (flat art from `MenuPreview`, ◂ ▸ and either stick pick a slice at any angle, a wheel's centre is a slot you reach by letting the stick go back, A changes the action, Y icon and name, X Show in game); kind cards Wheel / Grid / Hotbar (a kind that cannot apply says why); the "Slices ◂ n ▸" stepper (and "Columns" for a grid); the slice panel; "Opened by"; Look (Size, Slice name size, Key size); Position on screen; More; X Show in game. Empty state = the Kit's four template cards (Weapon wheel, Quick wheel, Hotbar, Start empty); "+ New menu" opens the same cards. Rename on the keyboard (Y on a rail item, or More ▸ Menu name). Problems from `virtualMenuProblem` show as `role=alert`. "Saved layout preview" when there is no live telemetry. Virtual-output warnings keep "Use Xbox output".
- Slice actions use BIND's `BindingSheetBody` through `menuSlotApi.tsx` (a `BindingApi` over the slice's single expression; pairs and While holding don't apply to a slice and are not offered). The sheet is `inPlace` so the full-screen pickers it opens sit above it.
- `MenuDetails.tsx` (SubPage, LT/RT = Panel): preview and screen thumbnail; "Opened by" with the "Controls 1 of N" pager and "+ Another way to open it", Y removes these controls; "More" (names, sizes, Shows chips, centre action and dead zone, Appears, Position all menus, Delete in place). Dimmed-but-focusable rows say why ("Hold or toggle only", "Sticks only", "When it picks on a press only").
- `MenuPositionPage.tsx` / `keymap/VirtualMenuLibrary.tsx` (now only the position helpers): the screen preview, numeric across / down, Match position with, overlaps, hidden overlays.
- `menuText.ts`: player words for every enum (see "Labels" below).
- `keymap/VirtualMenuActionEditor.tsx` and the old `VirtualMenuLibrary` editor are gone. `MenuPreview` / `VirtualMenuPreview` props are unchanged.

### Review changes (`components/ChangeReview.tsx` + module CSS)
A SubPage (breadcrumb "Wardogs · Menu ▸ Review changes"). Groups: Buttons, Sticks, Triggers, Trackpads, Gyro, Menus, Modes, "<Mode> mode" (swatch), Only for <controller>, Timing, Labels & notes, Controller settings. Each row: glyph, name, "before → after" inline, X Revert. A goes to the input or setting (`goToModeChange`: a button opens its binding sheet in that mode; gyro keys go to Gyro via the shared route map; menus open the Menus tab; controller lines open the variant page). History aside: the edits since the save, newest first, each as a sentence ("Horn on RB in Vehicles"), "N more", "Saved 11 minutes ago"; Undo / Redo name what they do; "Save and make live" (☰); "Discard all N". Empty state "No pending changes" stays. `Ctrl Z` / `Ctrl Shift Z` still work app-wide. "Modeshift" is now "While holding" / "While let go of"; "Use Default layer" is "Same as Default".
- `hooks/useConfigHistory.ts`: steps carry timestamps; exposes `past`, `future`, `currentAt`.
- `hooks/useKeymapConfig.ts`: `savedAt` (`opened` or `saved`, set whenever the saved text changes), `historyPast/Future/At`, `defaultText`, `setDefaultConfigText`.
- `nav/useControllerNavigation.ts` (one targeted edit): with an overlay open, Menu is sent to it as a `jsm:pad` `MENU` event (so a SubPage can use ☰; the on-screen keyboard still handles it first) and the keyboard's `M` does the same. Nothing changes where no overlay listens.

### Controller light & sounds (`components/light/LightSounds.tsx`)
Opened by `jsm:open-light-sounds` (the listener calls `preventDefault()`, as LAYOUT asked) from Layout's quick menu. Left: the controller art with a ring on the Steam button and "Light · Purple · 100%"; the colour panel (wheel, the nine presets, a custom swatch opening `LightBarPopover`, a Default pill, "Saved: Default (White)"). ◂ ▸ previews each colour on the controller (D14: `LIGHT_BAR = xRRGGBB` through `desktopBridge.runCalibrationCommand`; the configuration's own value is sent back on leaving, on blur and on unmount), A keeps it, Y goes back to Default. Right: Brightness (`LED_BRIGHTNESS`, ValueRow hero), "Light while a mode is on" (one chip per mode, ◂ ▸ previews, A keeps, Y = Same: writes `LIGHT_BAR` into that mode's overrides), Power-on jingle (links to Settings ▸ Controller), Your sounds (opens the library), Trackpad rotation (Default / As mounted / Level / Custom; writes both `LEFT_TOUCHPAD_ROTATION` and `RIGHT_TOUCHPAD_ROTATION`, same keys as P4's "Turn the zones"; Custom shows a degree row per pad). `ControllerLightSettings.tsx` is unchanged and remains only as LAYOUT's fallback sheet.

### Sound library (`components/sounds/SoundLibraryPage.tsx`)
Rail of sounds (LT/RT), each with format, length and "ready" or "needs trimming" in amber; "+ Add MP3 or MIDI · Up to 25 MB"; "The controller plays" (connect / shutdown choices, built-ins plus yours; Settings keeps its own copy); the editor inline. Trim: a timeline (notes for MIDI, waveform for MP3, kept part lit, two markers), ◂ ▸ move the active marker, A switches start and end, holding (or Shift) gives the 0.01 s step, "Keeps 3.1 s". MIDI adds the "Track ◂ 2 · Lead ▸" stepper (with "Recommended") and "Move the selection" (the old window scrub; it keeps the selection's length against the end). Pitch Lower / Auto / Higher with "Auto moved it up 1 octave". "Volume on a button" (D15, below). Preview volume, Play on PC, X Preview on controller, ☰ Save sound (MP3: Convert and save), Y More (Rename on the keyboard, Delete in place). The strip says sound intensity and where sounds play with a link to Settings. Errors ("No clear melody…", "No notes in this selection", the 25 MB guard, a `.mid` that isn't MIDI) are kept. `SoundLibraryDialog.tsx` is now a thin wrapper (Settings ▸ Controller ▸ "Manage sounds…" still opens it); `SoundTrimEditor` and `MidiTrimEditor` are deleted (one editor body).
- **D15**: Rust `SoundMetadata` / `SoundEntry` gain `defaultGainDb` (omitted when 0), `sound_library_set_gain` (clamped to −30…0, rounded to 0.1) and a unit test. `desktopBridge.soundLibrarySetGain` plus the mock. `utils/controllerSounds.ts` `playSoundToken` uses a library sound's remembered `defaultGainDb` when a new binding gives no level; a binding's own level still wins. (`cargo test --lib sound_library`: 9 passed.)

### Controller variant (`components/ControllerLayoutScope.tsx` + CSS)
A page, opened by `jsm:open-controller-layout` (Layout's quick menu, the game chip). Two picture cards: "Use shared layout" and "Only for DualSense ✓ In use" (change count). "Touchpad uses" (◂ ▸), "Use regular gamepad", "Reset DualSense's layout" with the inline red panel (Keep them focused). Right panel "DualSense doesn't have · 5": modes, menus and bindings with the mode's hue and a qualifier, each "Pick a button ▸" (`ButtonCapture`, then `rebindForController`: the assignment moves to the button on this controller only; the shared layout is untouched). A "Controller" choice and a "Saved for controllers not connected" list keep disconnected variants reachable. The order of connected controllers is stable (the shell moves the edited one to the front of `devices`).

## 3. Re-homed settings (D5)

| Was | Now |
|---|---|
| Layers page: "Editing" select, "Active now" card | Mode strip on Layout and the Modes status line; A on a card |
| Manage layers dialog, "Create layer" | `+ Empty` (keyboard), `+ Build`, `+ Photo` |
| Layer rename field, "Delete layer" | Mode menu (Y): Rename, Delete in place |
| "Suppress holds while active" | ModeHow "Pause holds while it's on" |
| Override rows + "Use Default" | ModeChanges rows (X Use Default), now with "Default: …" |
| "Convert existing modeshifts to a layer" select + button | ModeChanges Advanced ▸ "Bring in old 'While holding' changes" |
| Suppress-holds conflict warning | The card's note and conflicts line |
| Menu library, "Create virtual menu" | The rail, "+ New menu", template cards |
| Menu name field | Rename (Y on the rail, More ▸ Menu name) |
| "Menu layout" select | Kind cards |
| "Number of actions", "Grid columns" | Slices / Zones stepper, Columns stepper (grid) |
| Menu width, Action label size, Output name size | Look: Size, Slice name size, Key size (also in More) |
| Action labels / Output names / Icons toggles | More ▸ Shows chips (Names, Keys, Icons) |
| "Show overlay" (reveal) | More ▸ Appears, and Position on screen |
| Position slider, x / y, Position all menus, Match position, overlaps | Position on screen page and Position all menus (unchanged helpers) |
| "Centre deadzone", "Centre action" | More ▸ Wheel centre; the centre is also a slot in the preview |
| "Navigation input / mode", "Menu activation", "Activation input", "Activation matches while", "Select action", "Confirm input", "Cancel input", hotbar / ABXY notes | Details ▸ Opened by (Navigate with, Stick moves, How it opens, Opener, Opener works when, When it picks, Confirm button, Cancel button, note) |
| "Add navigation controls", "Delete menu controls" | "+ Another way to open it", Y Remove these controls |
| Slice action editor, "Add command" | BIND's binding sheet through `menuSlotApi` (several commands per slice via "Also send") |
| Slice name and icon | Y on the preview |
| Delete this menu | More ▸ Delete this menu (in place) |
| `LIGHT_BAR` colour, `LED_BRIGHTNESS`, "Use default colour" | Light page (Default pill, Y, brightness ◂ ▸ / typed number / Y) |
| Per-mode LED (read-only line in the layer rows) | "Light while a mode is on" chips |
| Per-configuration trackpad rotation (no UI) | Light page, Trackpad rotation |
| `SoundLibraryDialog` rows: Trim, Rename, Preview on controller, Delete; Preview volume; MP3 / MIDI editors | Sound library page |
| Editing for / Touchpad fallback source / Use regular gamepad / Reset variant / unavailable-bindings details | Variant page |
| Review dialog: Undo, Redo, Revert all, Before / After | Review page: History, Undo, Redo, Discard all, inline before → after |
| Title-bar "Editing layer" menu, "Manage layers…" | Not mine (SHELL). App no longer mounts `LayerBar`; the Configuration menu item and the TitleBar segment are SHELL's to remove. |

## 4. Decisions made

- **+ Build / + Photo (D12)**: empty modes with that name; the name is made unique ("Build 2").
- **Try it / Show in game (D13)**: `tryConfiguration(text, note)` in App applies the text, enters Test mode, shows the note in the test banner, and puts back what was live on exit. Try it on a mode applies the configuration with that mode folded into Default (`projectLayer`). Show in game gives the menu an `ALWAYS` attachment on its first pad or stick, reveal "When opened", and takes that source from the other menus for the test. The same text can be sent to Test by `window.dispatchEvent(new CustomEvent('jsm:try-configuration', { detail: { text, note } }))`. Both are unavailable-with-reason when Test can't run (no controller, Studio doesn't have the pad…). Not exercised against a real mapper here.
- **LED live preview (D14)**: through `runCalibrationCommand("LIGHT_BAR = x…")`. Not verified on hardware. The mock reports `success: false`, which is ignored.
- **Mixed activation (ModeHow)**: one button, one verb shows the three tiles; two or more buttons show one row per button with its own verb. Tiles never show a "mixed" state.
- **Hue order (D17)**: the tokens' order (Purple, Green, Orange, Blue, Lime, Pink); the design's 5th / 6th (pink, yellow) differ from the tokens, so the tokens win.
- **Shared vs variant**: "Use shared layout" edits the shared layout and keeps the variant; Reset is its own action. Editing a different controller than the connected one is reachable through the "Controller" choice.
- **Opener labels** (player words): How it opens = From a button · While held · Tap to open and close · Always ready. When it picks = When you let go (When it closes for a toggle) · On a press · Stick returns / Lift your thumb · Holds while pointing. Stick moves = Straight to a slice · Like a cursor. Appears = When opened · While moving · On a slice · Never. Navigate with = Right pad · Left pad · Right stick · Left stick · D-pad · Face buttons.

## 5. Tests

Updated (all run with `JSM_TEST_URL=http://127.0.0.1:1420` unless noted; the `?mock` ones with `…/?mock`):

| Test | Result |
|---|---|
| `layers_browser_regression` (rewritten for Modes, ModeHow, ModeChanges, Review) | pass (baseline: fails, TypeError) |
| `layers_ui_polish_regression` (Add a mode card, Bring in row, one accent ring; the old touch-stick intro part removed: the Trackpads page it checked is gone) | pass (baseline: fails) |
| `layers_regression`, `config_changes_regression`, `controller_layouts_regression` (new assertions for order, replace actions, menus / controller-line diffs, mode and menu rebinding) | pass |
| `change_review_browser_regression` | pass (baseline: fails) |
| `change_review_editor_regression` (was already stale) | pass |
| `virtual_menus_browser_regression`, `virtual_menu_position_browser_regression`, `virtual_menu_preview_focus_browser_regression` | pass (baseline: failed / passed) |
| `stick_virtual_menus_browser_regression` | pass |
| `controller_sounds_browser_regression` (?mock), `midi_library_browser_regression` (?mock) | pass (baseline: fail, Keep them) |
| `controller_layouts_browser_regression` | pass |
| `sheet_color_browser_regression` (?mock; the Gyro "Noise & Steadying" sheet scroll part removed: that sheet became P5 sub-pages) | pass |
| `triton_customisation_regression` (stale Preferences assertions moved to `LightSounds.tsx`, "Your sounds play on") | pass (baseline: fails) |
| `feedback_binding_polish_browser_regression` (Modes part) | my part passes standalone; the full file stops earlier in BIND's Buttons part (bumper keycap) |
| `additional_configuration_browser_regression` (menu slice part, now: slice sheet ▸ Controller action ▸ Light brightness) | my part passes standalone; the full file stops earlier on BIND's `[data-command-row]` |
| `light_bar_picker_browser_regression` (?mock; unchanged, `LightBarPicker` is reused) | pass |
| `nested_back_browser_regression` (light page path updated: Layout ▸ Y ▸ Controller light & sounds) | The full file stops earlier in SHELL's Hold to swap section (`[data-nav-disclosure]`); the light-page Back behaviour was verified in isolation (B folds an inner `details`, then closes the page). |

`cargo test --lib sound_library`: 9 passed (`volume_on_a_button_is_kept_per_sound` is new). `npx tsc --noEmit -p .`: clean at the time of writing.

## 6. For other areas

- **SHELL**: the title-bar "Editing layer" segment and the Configuration menu item are already gone from App. `SummaryRow`'s "Changed in the X layer" and `SettingOrigin` / `settingOriginInfo`'s "Override · {layer}" should read "Changed in X" / "mode". `HomePage.tsx:114` "Editing {name} layer". Settings ▸ Controller should have a row "This configuration's light & sounds ▸" that dispatches `jsm:open-light-sounds` (the surface is reachable from Layout's quick menu today). The status chip's press is still `pressStateButton`; Review changes is ☰ ▸ Review changes.
- **GYRO**: Review changes uses `isGyroRouteKey` for grouping and App's `goToModeChange` goes to the Gyro tab for gyro keys; if you want it to land on the Fine-tune group, call `requestGyroRoute(gyroRouteForKey(key))` from `goToModeChange` in App.
- **BIND**: `OPEN_BINDING_EVENT` / `requestOpenBinding` is not used by me; `goToModeChange` selects the mode, goes to the input's page and opens its first control (`inputRequest.open`).
- **LAYOUT**: the fallback light sheet is never shown while App is mounted.

## 7. Not done, and why

- Live LED preview and Try it / Show in game could not be run against the real mapper or a physical pad in this session; they use the existing console-command bridge and Test mode, and are unavailable-with-reason when Test can't start.
- The in-game overlay's exact behaviour for `ALWAYS` attachments in Show in game was not checked in the running mapper.
- The Gyro route (landing on a Fine-tune group from Review) is not wired; it goes to the Gyro tab (see GYRO above).
- Review changes' status chip text and press target are SHELL's.
