# Handoff: JSM Studio — console refinement (phase 2)

Implementation target: `JSM_GUI/jsm_gui_tauri` (React + TypeScript + Vite + Tauri, CSS modules, tokens in `src/styles/tokens.css`).
Design reference: `designs/Console Refinement.dc.html`. Open it in Chrome or Edge from this folder; it's a pan-and-zoom canvas. **Turn 2 (2a–2f) is the spec.** Turn 1 (1a–1e) is history: 1a and 1b were rejected, and 1d and 1e are the patterns Turn 2 builds on.

The HTML files are design references, not production code. Rebuild them with the codebase's existing components and patterns. Fidelity is **high**: colours, type, spacing and copy are final and use existing tokens (`designs/tokens/tokens.css`, same names as the app).

---

## 1. Why this phase exists

After the first redesign pass, the app still didn't *feel* like a console UI:

1. **Too many small and inline buttons.** Rows carry Reset, Help, Copy, "Position on screen" and "Save Default" buttons, `button--sm` controls and `<details>` accordions. On a controller, every small target is another stop for the focus ring, and the row's purpose gets lost.
2. **Tuning and Studio are hidden.** Tuning is a dropdown at the end of the page tabs, and Studio is reached by clicking the app logo (`TitleBar` → `onOpenStudio`). Both lead to settings people use often, so they need to be loud and obvious.
3. **The scope of tuning is unclear.** Grip sensors and Trackpad tuning are saved in the configuration, while Press timing & polling and the AI assistant act globally or as tools. The current grouping mixes the two.
4. **"Trackpad tuning" doesn't say what it tunes.** It only applies to pads in **Mouse** mode (the `TOUCHPAD_*` smoothing, lift, click-damping, trackball and haptics keys), not menus or touch sticks.
5. **Menu layout is a separate page** you're sent to from a menu's "Position on screen" button (`jsm:menu-layout` event). Appearance and position are split across two places.

Goal: sleek and modern, with progressive disclosure, while staying readable and friendly, and everything reachable with large controller-sized targets.

---

## 2. Decisions

| # | Decision | Frame |
|---|---|---|
| D1 | **Home screen** replaces the logo shortcut and the Tuning menu. It has two clearly bounded areas: **This configuration** (Wardogs card) and **Studio · Applies to every configuration**. | 2a |
| D2 | **"Tuning" stops being a category.** Each tuning surface lives next to the control it tunes and opens as a sheet (D4). Home shows config-scoped tuning as shortcuts *inside* the configuration card. | 2a, 2b, 2c, 2e |
| D3 | **Trackpad tuning → "Mouse feel"**, a summary row under any pad whose mode is Mouse. The sheet has a strip showing which pads use it right now. | 2b, 2c |
| D4 | **Summary row → detail sheet** (from 1d). A row is one focus target: label, one-line summary, value, chevron. A opens a right-side sheet (640px) over a scrim; B closes it and returns focus to the row. Secondary actions go on face buttons, never inline. | 1d, 2c, 2e |
| D5 | **One state button + Configuration menu** (from 1e). Undo, Redo and Save leave the title bar. One large button says what it will do. ☰ opens the Configuration menu. Keyboard shortcuts stay the same. | 1e, 2b |
| D6 | **Menu layout page removed.** Every pad or stick-wheel menu gets an **On-screen menu** row that opens a full-window **On-screen menus** view. It draws all of the configuration's menus (every layer), with the origin menu selected, and edits look and position together. | 2b, 2d |
| D7 | **Grip sensors** become a sheet opened from a row at the foot of Buttons › Grips. Binding rows stay on Buttons. | 2e |
| D8 | **Press timing & polling** and **AI assistant** move into Studio. Timing gets a **global configuration store shared by all profiles** (no per-profile overrides). The AI assistant gets a **configuration picker** (default: the one being edited). | 2f |
| D9 | **Studio pages save on change.** There's no configuration chip and no Apply button; the title bar says "Studio · Applies to every configuration". | 2f |
| D11 | **Controller button art, never names.** Every hint, badge and inline reference uses the glyph SVG for the button (`glyphs/steam/*.svg`, named by JSM input id, via the existing `InputGlyph`), so you can look down at the pad and find it. Never write "View", "Menu", "LT" and so on as text. Mapping: View = `MINUS`, Menu = `PLUS`, A/B/X/Y = `S`/`E`/`W`/`N`, LB/RB = `L`/`R`, LT/RT = `ZL`/`ZR`. Follow the connected controller's family (xbox/ps/nin sets) when it isn't a Steam Controller. | all |
| D12 | **Home tiles are never hidden.** The controller may be disconnected, or the user may be curious about what they could tune. A tile whose feature isn't in use says so in its status line (e.g. Mouse feel: "No pad set to Mouse yet"), and still opens its sheet. | 2a |
| D10 | **Button map:** **View = Home** from anywhere (previously: jump to title bar; Up still reaches the title bar). **☰ = Configuration menu.** LT/RT = page, LB/RB = section (or menu, in 2d). A = select/adjust, B = back/close, Y = Use Default, X = What's this? (in sheets) or the page's contextual action. | all |

---

## 3. Information architecture

### Before (`src/shell/pages.ts`)
- `CONTROL_PAGES`: overview, buttons, dpad, triggers, joysticks, touchpad, gyro, layers
- `TUNING_PAGES`: gripSensors, sensors, **menuLayout**, timing, ai (behind a dropdown tab)
- `STUDIO_PAGES`: configurations, associations, globalChords, deviceVisibility, debugConsole, settings, help (reached from the logo)

### After
- **Home** (new, `PrimaryTab = 'home'`, the default landing page)
- `CONTROL_PAGES`: unchanged (8 pages). LT/RT walk only these.
- `STUDIO_PAGES`, in tab order: configurations, associations, globalChords, **timing**, **ai**, deviceVisibility, settings (Preferences), help (Documentation), debugConsole
- Removed as pages: `gripSensors` → sheet on Buttons › Grips; `sensors` → Mouse feel sheet on Trackpads; `menuLayout` → On-screen menus view
- Delete `PageGroup 'tuning'`, `TUNING_PAGES` and `isTuningPage`, and the Tuning `<Menu>` in `PageTabs.tsx`
- The eyebrow in `App.tsx` (`… · Tuning`) goes away

### Where each old tuning page goes

| Old page | New home | Entry points |
|---|---|---|
| Grip sensors (`GripSettingsSection`) | Sheet: *Buttons · Grips · {config}* | Row "Grip sensors" at the foot of Buttons › Grips; Home tile |
| Trackpad tuning (`TouchpadSensorSection`, haptics) | Sheet: *Mouse feel* | Row "Mouse feel" under each pad in Mouse mode on Trackpads; Home tile |
| Menu layout (`OverlayLayoutSection`) | Full-window view: *On-screen menus* | Row "On-screen menu" in every pad-menu (`PadSection`) and stick-wheel (`StickSection`) block |
| Press timing & polling | Studio page | Studio tabs; Home tile |
| AI assistant (`AiMappingPage`) | Studio page | Studio tabs; Home tile |

---

## 4. Frames

### 2a — Home (1440 × 900)
- **Title bar (56px):** app mark and name (static, not clickable), spacer, controller status ("Steam Controller · 82%"), mapping plate, window controls. There's no Apply button here; it lives inside the card.
- **Layer on Home:** the card's sub-line shows a layer pill (layer-soft fill, layer dot, "Editing {layer} layer") only when a non-Default layer is selected, followed by the unsaved count. With Default selected, the sub-line shows only the unsaved count (or "Saved").
- **Left, "THIS CONFIGURATION"** plus a caption with the file name ("Saved in Wardogs.txt"). The card is `--surface-nav`, radius 18, with an inset `--line-2` hairline.
  - Header: config name at 28/34, 600 weight, with an "Applied" pill (`--ok-soft` / `--ok`), plus a sub-line with the layer and unsaved count. A **Switch** button (44px) on the right opens the Configuration library.
  - The Controller Live art fills the middle (`--surface-sunken` well).
  - Primary actions: **Continue editing** (56px, accent, default focus, A glyph) and **Test** (56px, row surface).
  - **"TUNE WARDOGS"**: 3 tiles (84px): Gyro, Mouse feel, Grip sensors. The second line says *where it opens*, e.g. "Trackpads · right pad", "Buttons › Grips", "Gyro page · 2.40×". **Never hide these tiles** (D12). Use the status line instead: "No pad set to Mouse yet", "This controller has no grip sensors", "Controller not connected".
- **Right, "STUDIO · Applies to every configuration"**: a 2-column grid of 76px tiles, each with an icon, label and a one-line live status (e.g. "Hold 0.15 s · 3 ms polling"). The nine tiles, in order: Configurations, Associations, Global chords, Press timing & polling, AI assistant, Device visibility, Preferences, Documentation, Debug console.
- **Hint capsule:** A Open · B Resume editing · View Home from anywhere.
- B on Home returns to the last editing page, section and focused row.

### 2b — Editing shell · Trackpads
- **Title bar:** a **Home** chip (40px, app mark, "Home" and a View glyph badge), divider, config name with the unsaved dot and chevron (opens the config switcher), Layer chip, spacer, mapping plate, **state button** (D5), window controls.
- **Page tabs (56px):** LT, the 8 control tabs (icon and label, 40px; selected = `--surface-selected` with a 2px accent underline), RT, controller status.
- **No section list** on this page: the two pads sit side by side in columns (on a DualSense, a single "Touchpad" column).
- Each pad column has an eyebrow ("LEFT PAD · Menu · 4 regions"), a 200px preview well, then **60px summary rows**:
  - **Menu pad:** Mode · Region N (selected) · Click required · **On-screen menu** ("Shown on touch · bottom left · 320 px", value "Arrange").
  - **Mouse pad:** Mode · Sensitivity · Click · **Mouse feel** (summary of the preset, glide and haptics).
- Columns, rows and centre deadzone move into the **Mode** sheet, since they're only needed when changing the layout. Dual-stage mode moves into the Click row's sheet.
- **Capsule:** A (contextual, e.g. Arrange) · X Next region · B Back · ☰ Configuration · View Home.

### 2c — Mouse feel sheet (640px, right edge, over scrim)
- Eyebrow "TRACKPADS · {CONFIG}", title "Mouse feel", description *"How a pad feels when it moves the mouse. Shared by every pad set to Mouse in this configuration."*
- **Scope strip:** one 48px tile per pad. A pad in Mouse mode gets an accent-soft fill with an accent hairline and "✓ Right pad · Mouse · uses this"; any other pad is neutral: "– Left pad · Menu · not affected". This is how the scope is made explicit.
- **Rows (56px)**, grouped under eyebrows:
  - MOTION: Smoothing (Off / Light / Balanced / Heavy / Custom), Minimum movement
  - PRESS & RELEASE: Lift-off protection, Click damping (Damping pressure only appears once damping > 0)
  - GLIDE: Trackball glide (On · decay); Minimum flick speed sits inside the adjust state
  - HAPTICS: Movement ticks, Click and release
- The row's second line is its hint, *or* its origin when it isn't Default: "Changed in {config}" (accent) or "From {template}" (text-3). This replaces the separate origin markers.
- The live pad pressure readout appears only while adjusting Click damping (small inline meter), not as a permanent paragraph.
- **Footer:** A Adjust · Y Use Default · X What's this? · B Close. X opens the help text that `HelpButton` currently shows inline.
- The Smoothing cutoff and flick responsiveness numbers appear when Smoothing is "Custom", as extra rows (not an `AdvancedDisclosure`).

### 2d — On-screen menus (full window, inset 40px, radius 18)
- Header: eyebrow with the config name, title "On-screen menus", and on the right the **menu chips** (LB · Left pad Default · Right stick wheel Default · Right pad *Comms* · RB). Layer menus take the layer's colour (`--layer-n`).
- **Left:** a 16:9 screen preview using the monitor's aspect (as in `OverlayLayoutSection`), labelled "Your screen · W × H". Every menu is drawn where it sits. The selected one has a 2px `--focus-controller` ring plus an 8px accent-soft halo and a resize handle; others show a `--line-2` ring, and layer menus a `--layer-n` ring. Draw with the existing `MenuPreview` renderer.
- Below the preview: *"A picks up the selected menu. Move it with the left stick and resize it with the right stick, then A to drop or B to put it back."* This is the existing adjust mode, with the two sticks mapped.
- **Right (400px):** the selected menu's name and "Default layer · 4 regions", then 56px rows: Position · Width · Text size · Shows (names/keys/icons) · Appears (on touch / once a region is selected). These are the `MenuAppearance` fields plus position.
- Footer: A Pick up · Y Reset position · B Done. B returns focus to the On-screen menu row that opened it.
- Opened with the origin's `menuKey` (`RIGHT`, `RIGHT:MISC2`, `RSTICK`…), the same key `jsm:menu-layout` carries today.

### 2e — Grip sensors sheet (640px)
- Eyebrow "BUTTONS · GRIPS · {CONFIG}", title "Grip sensors", description *"How the capacitive grips on the back detect your hand."*
- Two live contact tiles (Left and Right grip): telemetry-soft fill and dot when touching, hollow ring when not.
- Rows: SENSOR: Touch sensitivity (shared, "firmware limit"), Flicker guard, Release delay (per-side in the adjust state). HAPTICS: On touch, On release. The effect picker (Tick, Click, Tone…) opens as a sub-list on A, replacing the always-visible tile row.
- Keep the TODO-17 note (Steam Controller 2026 left grip) as the X "What's this?" text.

### 2f — Studio shell · Press timing & polling
- **Title bar:** Home chip, divider, "**Studio** · Applies to every configuration", spacer, mapping plate, window controls. There's **no state button**: Studio settings save on change and confirm with a toast.
- **Tabs:** LT, the 9 Studio tabs as text only (40px), RT.
- Title "Press timing & polling" with purpose *"Shared by every configuration."*
- Rows (64px): PRESS TIMING: Hold time, Double-press window, Simultaneous-press window, Turbo rate. POLLING: Polling interval ("3 ms · 333 Hz"). Hints describe the setting; there are no per-configuration overrides.
- **"STILL SET IN A FILE" panel (right, 400px):** lists older profile files that still contain `HOLD_PRESS_TIME`, `DBL_PRESS_WINDOW`, `SIM_PRESS_WINDOW`, `TURBO_PERIOD` or `TICK_TIME`. Their line replaces the shared value while that file is applied, so it's surfaced. A offers "Move to shared" or "Remove from file". Once no files set these values, the panel says "Every configuration uses these values."
- Capsule: A Adjust · Y JSM default · B Home · LT/RT Page (all as glyph art).

### 1d / 1e (carried forward)
- **1d:** the sheet pattern. Values show a progress bar under the row; origin text follows the 2c rule.
- **1e state button labels:** "Apply N changes" (accent: unsaved edits, saves and applies), "Apply {config}" (control surface: saved but not running), "✓ Applied" (row surface: saved and running, still focusable), "Return to Studio" (telemetry-soft: Test mode).
- **1e Configuration menu (☰):** a centred sheet, 520px, 52px rows: Undo (with what it undoes), Redo, Save without applying (Ctrl+S), Save as copy…, Discard N changes, Test while editing, Values & inheritance.

---

## 5. Shared component rules

- **Summary row:** height 56 in sheets, 60 on pages, 64 for settings pages (and 72 for two-column fine-tuning tiles); radius `--r-row`; padding 0 18–20px. Label 15/600, hint 13 `--text-2`, value 15/500 on the right (Geist Mono for numbers), chevron 18px `--text-3` when it opens something. **One focusable element per row.** No nested buttons, checkboxes or selects inside a row; toggles flip on A.
- **Focus (controller):** fill `--surface-selected` plus `0 0 0 2px var(--focus-controller)`. Keyboard and mouse styles stay as they are.
- **Eyebrows:** 11px, `.12em` tracking, 600 weight, `--text-3`, uppercase.
- **Sheets:** `position:absolute; right:0; width:640px`; `--surface-nav`; `--shadow-menu`; scrim `--surface-scrim`; header eyebrow `{PAGE} · {CONFIG}`; footer hints inside the sheet (the global capsule hides while a sheet is open). Enter with `--dur-3 --ease-emphasis`, slide 24px plus fade.
- **Home and hub tiles:** radius 12, `--surface-row`, icon 20–22px, label 15/600, status 13 `--text-2`.
- **Remove:** inline `button--sm` inside rows, `HelpButton` "?" icons in rows (their text moves to X), `AdvancedDisclosure` in sheets (use conditional rows), `SectionActions` Save/Cancel per section (the state button owns it), "Save Default" in `PollingSettings` (saves on change), and "Position on screen" in `MenuAppearance`.
- Minimum target 44px, text ≥ 13px, contrast ≥ 4.5:1 (all tokens already meet this).

---

## 6. Code map

| Area | Files | Change |
|---|---|---|
| Page registry | `src/shell/pages.ts` | Add `home`; remove the tuning group; move `timing` and `ai` into `STUDIO_PAGES` in the order in §3; `pageOrder` walks only CONTROL or STUDIO |
| Page tabs | `src/shell/PageTabs.tsx` | Remove the Tuning `<Menu>` and the back chip (Home replaces it) |
| Title bar | `src/shell/TitleBar.tsx` | Brand → Home chip (focusable, first item). Remove Undo/Redo/Save; merge Save and Apply into the state button; add a Studio variant (no config/layer chips, no state button) |
| Configuration menu | new `src/shell/ConfigurationMenu.tsx` (reuse `components/ui/Menu`) | 1e items; opened by ☰ / Menu pad button and from the config chip |
| Home | new `src/components/HomePage.tsx` + module CSS | 2a; reuse `ControllerStatusSvg` / Controller Live art; tiles read live values (sensitivity, timing defaults, library count) |
| Sheets | new `src/components/ui/Sheet.tsx` | Focus trap, B closes and restores focus, hides the capsule, footer hints slot |
| Summary row | new `src/components/ui/SummaryRow.tsx` | label, hint/origin, value, chevron, `onActivate`; use `useSettingOriginInfo` for the origin line |
| Mouse feel | `keymap/TouchpadSensorSection.tsx`, `TouchpadHapticSection.tsx`, `TouchpadAccelSection.tsx` | Render inside a Sheet; add the scope strip from left/right `TOUCHPAD_MODE` |
| Trackpads | `keymap/PadSection.tsx`, `TouchpadSettingsSection.tsx`, `App.tsx` (touchpad branch) | Summary rows; Mouse feel row when mode = MOUSE; On-screen menu row when grid; drop `onOpenTuning → 'sensors'` |
| Grip sensors | `keymap/GripSettingsSection.tsx`, Buttons page | Sheet; "Grip sensors" row at the foot of the Grips section |
| On-screen menus | `keymap/OverlayLayoutSection.tsx`, `MenuAppearance.tsx`, `StickSection.tsx`, `PadSection.tsx` | Turn the section into a full-window modal opened with `menuKey`; fold MenuAppearance fields into its right panel; keep adjust mode; `jsm:menu-layout` opens the modal instead of `setPrimaryTab('menuLayout')` (`App.tsx` ~l.352, ~l.1502) |
| Timing | `App.tsx` timing branch, `PollingSettings.tsx`, `hooks/useKeymapConfig.ts`, `platform/preferenceStore.ts`, `src-tauri` | New **global configuration store** shared by all profiles, holding hold time, double and simultaneous windows, turbo rate and polling. Persist it app-side, write it to the mapper before every profile applies (and on change while mapping). Stop writing these keys into profiles; the timing controls on config pages are removed. Scan the library for files that still set them (the 2f panel). Extend the existing `setDefaultPollingMs` bridge rather than adding a parallel path |
| AI assistant | `AiMappingPage.tsx` | Studio page; add a "Working on" configuration picker at the top (default: the one being edited; lists the library) |
| Glyphs | `components/glyphs/InputGlyph.tsx`, `shell/HintCapsule.tsx`, all `data-hints` consumers | Render hints and badges with `InputGlyph` by JSM id (D11); remove text keycaps like "View", "☰", "LT" |
| Nav | `src/nav/useControllerNavigation.ts`, `padNavigator.ts`, `HintCapsule.tsx` | View → Home; ☰ → Configuration menu; sheet and modal focus scopes; LB/RB step menus in 2d |
| i18n | `src/i18n/resources/en.ts`, `zh-CN.ts` | New strings (§7); remove `app.nav.menuLayout`, rename `app.nav.sensors` → "Mouse feel" |

---

## 7. Copy (use verbatim)

- Home: "THIS CONFIGURATION", "Saved in {file}", "Applied", "Continue editing", "Test", "Switch", "TUNE {CONFIG}", "STUDIO", "Applies to every configuration", "Resume editing", "Home from anywhere"
- Home tile subtitles: "Gyro page · {sens}×", "Trackpads · {pad}", "Buttons › Grips"
- Mouse feel: "Mouse feel", "How a pad feels when it moves the mouse. Shared by every pad set to Mouse in this configuration.", "{Pad} · Mouse · uses this", "{Pad} · {Mode} · not affected"
- Origin line: "Changed in {config}", "From {template}"
- Trackpads rows: "On-screen menu" (value "Arrange"), "Mouse feel"
- On-screen menus: "On-screen menus", "Your screen · {w} × {h}", "Pick up", "Reset position", "Done", "Position", "Width", "Text size", "Shows", "Appears", "As soon as it's touched", "Once a region is selected"
- Grip sensors: "Grip sensors", "How the capacitive grips on the back detect your hand.", "Touching", "Not touching", "Touch sensitivity", "Flicker guard", "Release delay", "On touch", "On release"
- Timing: "Press timing & polling", "Shared by every configuration.", "STILL SET IN A FILE", "These files set their own value, which replaces the shared one while they're applied. A removes the line from the file.", "Move to shared", "Remove from file", "Every configuration uses these values.", "JSM default"
- Home tile empty states: "No pad set to Mouse yet", "This controller has no grip sensors", "Controller not connected"
- AI assistant picker: "Working on" + configuration name
- State button: "Apply {n} changes", "Apply {config}", "✓ Applied", "Return to Studio"
- Configuration menu: "Undo", "Redo", "Save without applying", "Save as copy…", "Discard {n} changes", "Test while editing", "Values & inheritance"

---

## 8. Acceptance checklist

- [ ] The app opens on Home. View opens Home from any page, sheet or modal (closing it first). B on Home restores the last page, layer, section and focus.
- [ ] No page has a Tuning dropdown, and the logo isn't clickable. Studio is reachable in one press from Home and in one press (View) from anywhere.
- [ ] Home visually separates config-scoped items (inside the Wardogs card) from global ones (Studio column, labelled).
- [ ] Trackpads: a pad in Mouse mode shows a Mouse feel row; a Menu pad shows an On-screen menu row; neither shows the other's.
- [ ] Mouse feel's scope strip reflects live pad modes, including a DualSense's single touchpad.
- [ ] `menuLayout` is gone from `pages.ts`, tabs and LT/RT order. Every pad-menu and stick-wheel block opens On-screen menus with its own menu selected, and all of the configuration's menus (all layers) are drawn.
- [ ] The title bar has no Undo, Redo or Save buttons; Ctrl+Z, Ctrl+Shift+Z, Ctrl+S and Ctrl+Shift+A still work; ☰ opens the Configuration menu.
- [ ] No row contains more than one focusable element. The `button--sm`, `HelpButton` and `AdvancedDisclosure` usages listed in §5 are removed from the affected pages.
- [ ] Studio pages have no Apply button, and changes save immediately with a toast.
- [ ] Timing values come from one global store shared by every profile; changing one takes effect for whichever profile is applied. Files that still set them are listed, and can be migrated or cleaned.
- [ ] The AI assistant shows a "Working on" picker, defaulting to the configuration being edited.
- [ ] Home tiles are always visible; the status line explains any that don't currently apply.
- [ ] No button is ever named in text in hints, badges or copy. Every one renders as controller glyph art and follows the connected controller's family.
- [ ] Controller, keyboard and mouse focus styles still differ as before (HANDOFF phase 1, "Focus model").

## 9. Suggested order (one PR each)

1. `SummaryRow`, `Sheet`, the state button, `ConfigurationMenu`, and glyph-art hints everywhere (D11), with no IA change yet.
2. `pages.ts` and `PageTabs` / `TitleBar`: Home chip, the Studio variant, and moving timing and ai into Studio. Add a basic Home.
3. Home (2a) at full fidelity, with live tile values.
4. Trackpads (2b) and the Mouse feel sheet (2c); remove the `sensors` page.
5. On-screen menus (2d); remove the `menuLayout` page and `MenuAppearance`'s footer.
6. Grip sensors sheet (2e); remove the `gripSensors` page.
7. The global timing store, the Timing Studio page (2f) and the AI "Working on" picker.
8. Sweep the remaining pages (Gyro, Buttons, Triggers, Joysticks) to summary rows and sheets, following 1d.

## 10. Resolved decisions (from review)

- **Timing:** a global configuration store shared by all profiles (D8, 2f, §6).
- **AI assistant:** gets a configuration picker (D8).
- **Home tiles:** never hidden; they explain themselves (D12).
- **Layer on Home:** a pill in the card's sub-line, shown only for a non-Default layer (2a).
- **Button references:** always controller glyph art, never names (D11).

---

## Files

- `designs/Console Refinement.dc.html`: all frames (Turn 2 is the spec)
- `designs/support.js`: runtime for opening the design file only; don't import it into the app
- `designs/tokens/`: tokens (same names as `src/styles/tokens.css`)
- `designs/icons/ui/`: the SVG icons referenced by the frames
- `designs/glyphs/steam/`: controller button art used in every hint (D11)
- `designs/JSM Shell.dc.html`, `Shell Titlebar.dc.html`, `Page Tabs.dc.html`: phase 1 shell, for comparison

## Prompt for Claude Code

> Read `design/console-refinement/README.md` in full, then open `design/console-refinement/designs/Console Refinement.dc.html` in a browser as the visual reference (Turn 2, frames 2a–2f, is the spec; 1d and 1e define shared patterns). Implement it in `JSM_GUI/jsm_gui_tauri` following §9, one PR-sized step at a time, using existing tokens and components. Use the §6 code map to find what to change and the §8 checklist to verify each step. Keep copy verbatim from §7. §10 lists decisions already made; treat them as final.
