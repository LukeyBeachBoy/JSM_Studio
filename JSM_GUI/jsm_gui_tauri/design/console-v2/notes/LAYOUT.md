# LAYOUT notes (P3 Layout page, quick menu; P6 mode strip and mode indicator)

Built against `designs/Layout.dc.html`, `QuickMenu.dc.html`, Kit, Modes and ControllerLight, and the audits P3 §1, §13–15 and P6 §0.

## What I built, file by file

### `src/components/OverviewPage.tsx` (rewritten) and `OverviewPage.module.css` (rewritten)

**Page header.** The Layout page has no page header in the design, so the shell's header is visually hidden on this page only. A CSS `:has([data-layout-page])` rule in the module does it. The header stays in the DOM, so `.page-header__title` still reads "Layout" for screen readers and tests.

**Mode strip** (`role=group`, `aria-label="Showing mode"`, renamed from "Preview layer"):

- Reads "LT · Showing mode · Default · [swatch] Vehicles hold L4 · … · RT".
- Each pill carries its activation in quiet text, derived from the layer actions (`LayerUsageContext.actions`, so `# @layer-action` lines and the legacy fields both count):
  - The verb words are hold → "hold", toggle → "tap", apply → "turns on", remove → "turns off".
  - Inputs are named with `inputDisplayName(…, family)`, for example "hold L4".
  - A mode only an input removes reads "off only"; one with no input reads "no button".
- Each pill's `data-caption` is the full `describeLayerActivation` text.
- LT/RT step the strip through App's existing `stepSection`.
- While calibrating, the pills are `aria-disabled` with a reason (they were `disabled` before).
- With no modes, the strip shows "No modes yet · make one on the Modes tab".
- While the quick menu is filtering, a quiet "Showing … · Clear" note sits at the strip's right end. The old "Find & show" line used to say this.

**Hero.** The grid is 330px callouts · art + focus card · 330px callouts.

**Callouts.** Each is one 50px row: glyph · action · short output.

- Slots:
  - Left column: LT, LB, L4, View, LS, D, LP, L5, LG, then LMINI as an extra.
  - Right column: RT, RB, R4, R5, RG, Menu, ABXY, RS, RP, a shared touchpad (TP) on PlayStation, then Steam, QAM, MIC and RMINI as extras.
- **Groups.** These collapse into one callout each, with `data-overview-inputs` listing every member and `data-overview-input` set to the A target:
  - D-pad: "1 · 2 · up · down".
  - Face buttons: ABXY, drawn as a 4-glyph cluster.
  - LS/RS: the stick mode word, for example "Move · WASD", "Radial menu · 8 slices", "Aim · mouse", or the menu's name when a virtual menu holds the stick.
  - LP/RP: the pad mode, for example "Button pad · 4 zones" or "Look · 4 click zones · mouse".
- **Mode switches.** The title is tinted in the mode colour (`--callout-tint` from `layerHue`) and the output is the activation word. Examples: "Vehicles mode · hold", "Tactical map · tap · M", "Leave Tactical map · turns off".
- **Gyro activation** reads "Gyro aim on · while held".
- **Triggers** fold in their full press ("full · Left Shift"), plus the live pull meter.
- **Inputs with no binding of their own:**
  - A modifier reads "Changes Menu · while held" or "Changes 2 inputs · while held".
  - An input in a press-together reads "With RB · together".
  - An input reserved by Hold to swap reads "Hold to swap · reserved".
- **Unset slots.** An empty slot reads "Not set" at 55% opacity. Primary slots always show. Extras show only when they are set, when Show unused inputs is on, or while Find has a query.
- **Held modeshift.** The swap is kept: the title becomes the shifted action and the output reads "V · was Jump". The trigger's output reads "Held". The row never changes size.
- **Accessible name.** The full account stays in `aria-label`: the same labels as before, and every member's label for D/ABXY.
- **Glyphs and hints.** All glyphs pass `family`. The device's family wins, and `useShell().family` is used while no pad is connected.
- Callout hints: `A:Change;X:Try it;Y:More;LT/RT:Mode;LB/RB:Tabs;B:Home`.
- Callouts have **no** `data-caption`. The focus card is their caption, so the footer keeps showing "where" (and the mode).

**Art.** `ControllerStatusSvg` runs with `backView="focus"`: "Front" is captioned, and the back view appears beside it only while a back input has focus, captioned "Back · Right grip" (and so on). The battery stays at the top right.

**Live readings.** When Picture shows ◂ Live readings ▸, the art shows raw telemetry and a gyro-speed sparkline sits under it. This is the old Gyro tile's live half.

**Focus card.** It follows focus, or hover with the mouse, and falls back to the last-focused slot. It shows:

- The input glyph (accent) and its long name.
- "Same in every mode" (ok green), or "Changed in <mode>" (mode hue). This is computed from each mode's overrides, matching the input's keys, chords and modeshifts, plus a stick's or pad's setting prefixes.
- With no modes, it shows "From <template>" when the input is imported.
- A plain-words description, at most 3 sentences:
  - Mode actions: "Turns on Comms while you hold it. Let go to go back."
  - Gyro: "Turns gyro aiming on while you squeeze it. Let go to stop aiming."
  - Bindings, via `explainBinding`, with "When held: / On a double-tap: / While holding X: / Pressed together with X:" leads.
  - The full press.
  - Relations ("While held: Menu → Load Wardogs Menu").
  - D/ABXY list their members, and what each changes while held.
  - Sticks and pads explain their mode, menu reservation, zones and click.
- Inline A Change · X Try it · Y More. These are mouse-clickable but not focus stops.

**Pad buttons.**

- X → Try it. It calls `onTryIt` (App's `startTest`) and toasts "Testing · press Right grip to try it". When `tryItReason` is set ("Connect a controller to test"), it toasts the reason instead.
- Y → the quick menu.
- B → Home (App).

**Quick menu** (`Sheet`, 560 wide). The header chip shows the focused input's glyph and name.

- **Find.** "Find an input or action", with keyboard art and the caption "Type a button, an action or a key, like "reload" or "R". Or just press the real button."
  - While the field has focus, a fresh press of a non-navigation input (back buttons, grips, stick and pad clicks, triggers) closes the menu and focuses that input's callout. I reimplemented the idea locally; nav/usePressToFind.ts is untouched.
- **Rows** (`QuickRow`, with the design's icon art):
  - Show unused inputs · "n free" (a switch).
  - Show only this mode's changes · n (a switch). On Default it means what this configuration sets itself.
  - Changed while holding… ◂ Any button ▸.
  - Picture shows ◂ Actions / Live readings / No picture ▸.
  - Cycle rows answer ◂ ▸ (`data-arrows="horizontal"`), and A steps them too.
- **"<Input>" section:**
  - Copy this input.
  - Paste onto this input. This is the existing `bindingClipboard`; `requestPaste` is kept.
  - **Every use**, which dispatches `jsm:input-uses`.
  - For a group callout these rows are unavailable, with a reason.
- **Controller section:**
  - Only for this controller · "Off · you're editing the shared layout" or "On · n changes just for DualSense" · "Use shared layout ▸" or "Only for DualSense ▸". It dispatches `jsm:open-controller-layout`.
  - Controller light & sounds · "Light, jingle, your sounds, trackpad rotation ▸". It dispatches a cancelable `jsm:open-light-sounds`; see "Coordination" below.
  - Calibrate gyro.
  - Not on this controller · n ▸ (only when such bindings exist).
- **Footer:** A Choose · ◂ ▸ Change · B Close.

**Other sheets:**

- "Not on this controller": callouts for bindings on inputs the connected pad lacks.
- A fallback "Controller light & sounds" sheet holding `ControllerLightSettings` plus a link to Settings ▸ Controller. It opens only if nobody cancels `jsm:open-light-sounds`.

### `src/components/ControllerStatusSvg.tsx` + `.module.css`

- New, backward-compatible props: `backView?: 'always' | 'focus'` (default `'always'`, unchanged behaviour) and `backCaption?`.
- New export `isBackInput(device, command)`. On Steam, the back inputs are L4/L5/R4/R5, both grips and the triggers (the front art has no triggers). On model art it uses `backControls`.
- In `'focus'` mode:
  - The front sits in a `.frontView` column with a "Front" caption, at a fixed width (`min(460px, 100% - 216px)`), so it doesn't resize when the back appears.
  - `SteamBackView` takes `caption` and draws it instead of the legend (200px wide).

### `src/components/ModelControllerSvg.tsx` + `.module.css`

Not listed in the ownership table, but it is the back view for model art.

- The same `backView`, `frontCaption` and `backCaption` props, backward compatible.
- New export `modelBackInput(device, command)`.

### `src/App.tsx` (small Edits)

- OverviewPage gets:
  - `onTryIt={() => void startTest()}`
  - `tryItReason={testReason}`
  - `controllerScope={{ name, variant, changes }}`, using `controllerVariantLabel`, `hasControllerVariant` and `controllerOverrides` (now imported).
- `closeFloatingWindows`: on Layout, B/Esc goes Home.
- **Mode indicator (P6):** the footer's `where` appends "<Mode> mode" on every non-Studio page while a mode is selected, for example "Wardogs · Buttons · Face buttons · Vehicles mode".
- MODES' `jsm:open-light-sounds` listener now calls `event.preventDefault()`. That is the contract that suppresses Layout's fallback sheet.

### `src/i18n/resources/en.ts`

These keys are mine:

- `overview.usesNone` uses V8 words.
- `overview.reservedByChord` → "Hold to swap".
- `overview.softPullFullPull` / `fullPull` → "Half press · full press" / "Full press".

zh-CN is untouched; those strings were already generic. New Layout strings are English literals, as the old file's were. They need i18n keys if Layout is to be translated.

## Re-homed (D5): everything the old Overview drew that the design doesn't show

| Was on Layout | Now |
|---|---|
| Band of cards: left/right trackpad, left/right stick, D-pad, face buttons, shared trackpad, each with a mode line and per-input callouts | One grouped callout each (D, ABXY, LS, RS, LP, RP, TP) with the mode word, plus the focus card: members and what each does, the stick/pad mode in words, click, zones. Per-input editing is on the Buttons/Sticks/Trackpads tabs (A on the group goes there). |
| Stick "Reserved for menu" / "Menu navigation … temporarily replaces" notes | The LS/RS callout title is the menu's name; the focus card says "Reserved for <menu>…" or "<menu> takes it over while open". |
| Pad-region and stick-segment callouts (LT1, RM1…) | Counted on the LP/RP/LS/RS callout ("4 zones", "8 slices"), with the first names in the focus card. Each one is on the Trackpads/Sticks tab. |
| Quick-settings Gyro tile (activation, output, sensitivity, real-world cal., space, live speed sparkline) | Activation is the grip/button's callout and focus card. The values are on the Gyro tab (GYRO). The live speed is Quick menu ▸ Picture shows ◂ Live readings ▸ (a sparkline under the art). |
| Gyro invert tile | Gyro tab (GYRO). |
| Right pad tile (mode, trackball, origin) | The RP callout and focus card; the Trackpads tab. |
| Calibration tile (Recalibrate gyro) | Quick menu ▸ Controller ▸ Calibrate gyro. |
| Inline `ControllerLightSettings` row | Quick menu ▸ Controller light & sounds: MODES' surface, or Layout's fallback sheet with the same `ControllerLightSettings`. |
| "Find & show" button, and the "Showing … · Clear" line | Y ▸ quick menu ▸ Find; a quiet "Showing … · Clear" note at the end of the mode strip while filtering. |
| Filter "Inputs shown: All / Only changes / Only free inputs" | "Show only this mode's changes" (a switch); only free inputs = Find "not set"; Show unused inputs (a switch). |
| "Controller picture" toggle | Picture shows ◂ … · No picture ▸. |
| "Bindings for other controller inputs" `<details>` | Quick menu ▸ Not on this controller · n ▸ (a sheet of callouts, A edits). |
| X "Show uses" on callouts | Quick menu ▸ <input> ▸ Every use (`jsm:input-uses`, still the same event); BIND's Details ▸ X Every use. |
| Relation tiles and chips (Shifts n, Chord X, layer chips, command count) | The callout's one line ("Changes Menu · while held", "With RB · together", mode-tinted titles); the full text is in the focus card and `aria-label`. |
| Origin dots / LayerValueBadge | The focus card's "Changed in <mode>" / "From <template>". |
| "Global chord trigger" | "Hold to swap · reserved", and the focus card explains it. |

## For SHELL (title bar, hint capsule)

- **The mode strip is on Layout only.** The design draws no mode chip near the tabs on other tabs. The indicator is the footer `where` ("· Vehicles mode"). The left side of the footer shows a focus caption instead of `where` whenever the focused row has `data-caption`, so the mode can disappear while editing on Buttons and elsewhere.
  - Consider keeping the mode suffix with the caption ("Vehicles mode · <caption>"), or a small hue chip in `PageTabs`. `ShellContext.modeName` already exists.
  - Removing the title bar's "Editing layer" segment is safe for Layout: the strip and LT/RT select modes without it.
- **Footer differences on Layout.** The design's footer has no Menu/View hints ("A Change · X Try it · Y More · LT RT Mode · LB RB Tabs · B Home"). `withHome`/`withStepping` decide whether those are appended. In the screenshots they currently aren't.
- **"Tabs" label.** I declare `LB/RB:Tabs`, as in the design; the capsule's default is "Page". You may want "Tabs" globally.

## Coordination

- **MODES:** Layout dispatches `new CustomEvent('jsm:open-light-sounds', { cancelable: true })`. I added `event.preventDefault()` to your listener in App.tsx, so Layout's fallback sheet doesn't also open. Please keep it.
  - Your listener exists, but `lightSoundsOpen` was not yet rendered when I checked. Until it renders, the quick-menu row opens nothing.
  - `sheet_color`, `nested_back` and `feedback_binding_polish` now reach the light through Layout ▸ Y ▸ Controller light & sounds, then expect a `.summary-row` "Controller light" and a dialog named /Controller light/ (my fallback has both). When your surface lands, adjust those selectors if its names differ.
- **BIND:** I did not edit `nav/usePressToFind.ts`. Layout's Find duplicates its small NAVIGATION set. If you export it, Layout can import it.
- **Controller variant (MODES):** the quick-menu row only dispatches `jsm:open-controller-layout`. The state text comes from App's `controllerScope` prop.

## Tests

Updated to the new structure, proving the same behaviour:

| Test | Change |
|---|---|
| `keyboard_hints_regression` | Callout hints are A Change · X Try it · Y More. `data-has-uses` is kept. Y lands on "Find an input or action" and typing types. Every use opens the uses dialog. |
| `todo48_focus_ring_browser_regression` | Checks one ring on Layout's Find (Y ▸ quick menu); it was a skipped "Search bindings" check. |
| `overview_layout_regression` | Columns and groups by `data-overview-slot` / `data-overview-inputs`; the full press folded in; ABXY's `aria-label` carries "Hold R4: Squad push-to-talk" and no annotations; LSL relations; 50px rows with no overlap or overflow (1440/900/600); focus card under the art, with "Same in every mode" and "Changed in Comms"; back view only for RG; strip "Comms hold R4"; footer "Comms mode"; `]` steps the mode; A on ABXY → Buttons; offline. The removed title-bar "Editing layer" check is replaced by the strip. |
| `overview_binding_lines_regression` | A mode switch is one tinted line, "Comms mode hold"; a modifier is "Changes Menu while held"; the focus card has the full text; rows are 50px. |
| `modeshift_trigger_overview_regression` | The D callout includes LEFT; its focus card says "while held, changes Right trackpad" (not RT keys); LSL "Changes 2 inputs"; the inspector opens via `jsm:input-uses`. |
| `layers_browser_regression` (:246) | The callout names Comms and is `data-tinted`; the accessible name still says Hold/Turn on/Turn off Comms. |
| `usability_audit_regression` (:22–34, :48) | "Gyro aim on while held"; Every use → "Where Right grip is used"; only-free via Find "not set"; the RP callout "1 zone"; Back restores focus to the ABXY callout; the mode for editing is chosen on the strip (the title bar selector is gone). |
| `feedback_binding_polish_browser_regression` (:50–55) | No light row on the Layout page; Y ▸ Controller light & sounds opens a /Controller light/ dialog. |
| `nested_back_browser_regression`, `sheet_color_browser_regression` | Reach the light through the quick menu (see MODES above). |
| `stick_virtual_menus_browser_regression` | The LS callout names "Left stick wheel"; the focus card says "Reserved for Left stick wheel". |
| `held_modeshift_status_regression` | Unchanged. The in-place swap still works: "Melee · V · was Jump", trigger "Held", no size change. |

### Results

**Environment.** The shared dev server (1420) and the baseline (1425) were both down after the usage cut-off. I ran a private Vite on 1437 for verification and stopped it afterwards.

Most browser tests that use `window.electronAPI` mocks don't dismiss the Steam Controller's first-connection "power-on sound" dialog, so they time out at entry. This is pre-existing: the baseline fails the same way. I ran them through a scratch shim (`scratchpad/LAYOUT/shimrun.cjs`) that clicks "Keep them" after each `goto`/`reload`. With the shim, `SKIP=` comments out assertions in other areas that fail because of their in-flight work.

| Test | Result |
|---|---|
| `overview_layout_regression` | PASS |
| `overview_binding_lines_regression` | PASS |
| `modeshift_trigger_overview_regression` | PASS |
| `held_modeshift_status_regression` | PASS, unchanged |
| `keyboard_hints_regression` | The Layout section passes (X/Y hints, Find focus and typing, Every use dialog, M menu, Home). Two SHELL assertions had to be skipped to reach it: the `.home-chip` title, and the hint order "Tabs" before "Close". It then fails on Trackpads' `.summary-row` (P4). |
| `usability_audit_regression` | The Layout sections pass (gyro line, Every use dialog, Find "not set", RP "1 zone", Back restores focus). It then fails in BIND's binding card (`Choose action`). |
| `feedback_binding_polish_browser_regression` | The light section passes: MODES' `LightSounds` SubPage opens. It then fails on BIND's Buttons `details[data-input-command="L"]` keycap. |
| `todo48_focus_ring_browser_regression` | Fails before and at Layout: under `?mock` the mock telemetry's physical activity keeps flipping the input source to `controller`, so the "keyboard" source never sticks. Documentation/Preferences entries have also moved (SHELL). This is not Layout-specific: a Shift+Tab on Layout with no sheet shows the same. |
| `nested_back_browser_regression` | Fails earlier, at "Global chords" (SHELL). |
| `stick_virtual_menus_browser_regression` | Fails earlier, on the Sticks combobox (P4). |
| `sheet_color_browser_regression` | Needs MODES' surface to keep a "Controller light" summary row. `LightSounds` has a colour listbox instead, so MODES should update the rest of this test. |
| `layers_browser_regression` | Fails earlier, at Review changes (MODES). |
| `ui_ux_audit_browser_regression` | Layout reports overflow 0, inner 0, unnamed 0 at 1440, 1024 and 760. The failures are unnamed buttons on Sticks, Triggers and Trackpads (P4). |
| `controller_inputs_focus_browser_regression` | Fails on Settings ▸ Controller & startup "Light bar color" (MODES/SHELL), not Layout. |

On the baseline only `feedback_binding_polish`, `ui_ux_audit` and `controller_inputs_focus` passed. All three still pass through every Layout step, and fail later in other areas.

## Not done, and why

- **i18n.** The new Layout strings are English literals, like the old Overview's. zh-CN has no Layout keys.
- **D13 per-mode Try it.** X runs Test mode for the whole configuration. A mode's Try it (that mode folded into Default) is the Modes page's (MODES). Test mode has no per-input focus, so "for that input" is the toast ("press Right grip to try it").
- **SVG `<title>` children** in ControllerStatusSvg/ModelControllerSvg are SVG hover titles inside the art, not HTML `title=` attributes on focusable controls. I left them.
