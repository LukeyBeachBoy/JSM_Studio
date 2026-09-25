# JSM Studio — design handoff

Status: full design pass complete for the Steam Controller, dark theme. Shell direction **1c (console page tabs)** approved. Light theme values exist in `tokens.css`; light screens were deliberately skipped. Other controllers' hero art is deferred (owner only uses the Steam Controller).

## Files
Open any `.dc.html` directly in a browser (they are self-contained design components). Design previews load Geist from Google Fonts for convenience only; the app must bundle the fonts locally.

| File | What it is |
|---|---|
| `tokens/tokens.css`, `tokens/tokens.json` | Every token, dark + light, reduced-motion overrides |
| `Foundations.dc.html` | Colour, type, spacing, radius, elevation, motion tokens + 8 live motion demos |
| `Icons and Glyphs.dc.html` | Drawing grammar, size ramp, 55 UI icons, 35 mode/category icons, 41 Steam glyphs, Xbox/PS/Nintendo families, states |
| `icons/ui`, `icons/modes`, `icons/app`, `glyphs/*` | Every icon/glyph as an optimised SVG (Steam glyphs named by JSM id; small cuts in `glyphs/steam/small`) |
| `App Icon.dc.html` | App icon (JoyShockMapper homage), 16px cut, in context |
| `Controller Art.dc.html` | Three renderings of the approved Steam Controller geometry; 9c Tonal body approved; states |
| `Controller Live.dc.html` | The live, hotspot-addressable controller (front + mirrored back) used on Overview |
| `Components.dc.html` | Component library, every state |
| `Shell Directions.dc.html` | Turns 1–2: three shells, title bar focus scope and menus |
| `JSM Shell.dc.html` | Turns 3–4: 1c at 1440 / 1024 / drawer, context states, focus model, native navigation + Test mode |
| `Overview.dc.html` | Overview page |
| `Gyro.dc.html` | Settings-page template (Gyro), slider adjust mode, missing-help pattern |
| `Binding Editor.dc.html` | Binding row → editor → action picker |
| `Configuration Pages.dc.html` | Triggers, Joysticks, Trackpads, D-Pad, Layers |
| `Tuning and Studio Pages.dc.html` | Grip sensors, Trackpad tuning, Menu layout, Press timing, AI assistant; Associations, Global chords, Device visibility, Debug console, Preferences, Documentation |
| `Studio Home.dc.html` | Configurations library |
| `System States.dc.html` | No controller, connecting, mapper stopped, first run, load error, long operation, destructive confirm, toasts + banner |
| `Overlay.dc.html` | In-game overlay: grid, 4-way, 8-way, radial over dark and bright scenes |
| `Calibration HUD.dc.html` | The signature HUD with all phases, failure and reduced motion |
| `Prototype.dc.html` | Keyboard-driven walkthrough (see below) |
| `Shell Titlebar`, `Page Tabs`, `Buttons Content` (.dc.html) | Shared parts used by the pages above |
| `reference/Current UI - Buttons.dc.html` | Today's screen for side-by-side |

## Prototype
`Prototype.dc.html` — focus the page and use: arrows move · Enter = A · Esc = B · Tab / Shift+Tab = RB / LB · PgDn / PgUp = RT / LT · Space = X.
Flow: Overview (RB focused) → Enter opens the RB editor → Enter on a command opens the action picker (Keyboard, arrows move a gliding focus; Tab switches category) → Enter chooses and returns to the same command with the new value popping in + a self-drawing check toast → Esc back to Overview with RB still focused. PgDn → Gyro: Enter enters adjust mode, ←/→ change, Space fine/coarse, Enter keeps, Esc reverts. The footer capsule changes with every context.

## Shell decisions
- Frameless title bar (44px, `decorations: false`) merges window chrome and context: Editing · Layer · Applied · Mapping plate · Undo · Redo · Save · Apply. Native-chrome fallback: same bar without window controls, below the OS caption.
- Page tabs (52px) with icons, stepped by LT/RT. At < 1280px tabs show icons only except the selected tab. At < 1060px tabs + section list fold into a drawer button (`page · section`).
- In-page section list (216px; 184px at 1024) stepped by LB/RB.
- Floating hint capsule (44px, inset 16px from bottom) instead of a full-width footer.
- Studio pages sit behind the app mark / drawer "Studio" row; they swap the page tabs for Studio tabs with a back chip to the configuration.

## Focus model (summary)
Scopes: 1 Title bar · 2 Page tabs · 3 Sections · 4 Page · overlays (menu, dialog, picker, drawer — trap focus).
- Up from page tabs enters the title bar at the nearest item; Left/Right walk items 1→8; Down returns to the remembered tab, then row.
- A activates / opens; X on the mapping plate toggles mapping; X on Editing jumps to the applied config (through the unsaved guard); B closes innermost, then retraces.
- Brand mark and window controls are mouse-only.
- Undo/Redo skipped when empty; Save / Apply stay focusable and explain why they are idle.
- Rings: hover = fill step only; keyboard `:focus-visible` = 2px outline, 2px offset, no fill; controller = selected fill + 2px ring + 1px lift, one shared highlight that glides (`--dur-3`, `--ease-emphasis`).

## Architecture proposal (owner): native controller navigation
Studio reads raw SDL input for navigation instead of receiving the pad as keyboard/mouse.
- While Studio's window is focused, the applied profile is **paused** and the pad drives Studio directly. On blur, the profile resumes.
- **Global chords still work** when held (e.g. a Steam-style chord layout for keyboard/mouse, the Quick Access chord). Every other standard button is free for navigation.
- Consequences for the design:
  - Controller focus and keyboard focus-visible are now truly distinguishable (resolves the old “which ring?” question).
  - The View → title bar shortcut needs no key mapping; it's a native binding.
  - Capture mode reads the physical input directly, so any button, paddle, grip or pad region can be captured. The guaranteed escape stays keyboard Esc / mouse, plus **hold B for 1.5 s** on the pad.
  - The mapping plate gets a new state: **Paused · Studio has the controller**.
- Proposed native map: D-pad / left stick = move (stick with repeat acceleration) · A select · B back · X toggle/secondary · Y details/options · LB/RB section · LT/RT page · View = title bar · Menu = page actions · right stick = scroll, or fine adjust in adjust mode · right pad = pointer (Studio's own cursor) · L3/R3, paddles, grips = unused by navigation · Steam and Quick Access reserved globally.
- Affected code: `hooks/useKeyboardNav.ts` becomes an input-source-agnostic focus engine fed by a new Tauri SDL event stream. The current pad-as-keyboard mapping is retired.

## Decisions (owner)
- **Pause scope:** the applied profile pauses only while Studio's window has focus. Overlay and HUD windows do not pause it.
- **Test mode:** title bar item 5, beside the mapping plate (`.button--test`). While testing, the profile runs, pad navigation is suspended, the focus ring hides, and a green `.test-banner` (40px) sits under the title bar. Exit: hold View + Menu (600 ms), keyboard Esc, or click Return to Studio. On exit, focus returns to the element that was focused before the test started.
- **Live telemetry is independent of navigation.** Overview and meter components keep drawing pad touches, trigger pulls, stick vectors, grip contact and gyro in every mode (Studio navigation, Test, mapping off). Navigation consumes button events. The preview consumes the raw state stream. Neither blocks the other.
- **Title bar focus order** is now 1 Editing · 2 Layer · 3 Applied · 4 Mapping · 5 Test · 6 Undo · 7 Redo · 8 Save · 9 Apply.
- **Mapping plate states:** `studio` (default while focused; hollow green ring, "paused in Studio") · `testing` · `off` · `disconnected`. X on the plate toggles mapping on/off.

## Controller art (owner decision)
- **Tonal body (Controller Art 9c)** is the approved rendering for the Steam Controller. Geometry untouched (1117 × 750 viewBox, same paths). Layers: silhouette fill `--art-body` + top light gradient → recessed wells (pads, stick rings) `--art-well` → caps (sticks, face buttons, D-pad, Steam) `--art-cap` → shell line `--art-line` (stroke 1.0 in authored units) → detail lines `--art-detail` (stroke 0.3). Faint top rim `--art-rim`.
- Used live in `Controller Live.dc.html` (Overview hero). Implementation: replace the `<img>` in `ControllerStatusSvg.tsx` with the inline group so the art tokens theme it.

## Icons and glyphs (Icons and Glyphs.dc.html)
- 24px grid, 2px padding, keylines circle Ø20 / square 18 r4.5 / portrait 16×19 / landscape 19×16.
- Optical stroke per rendered size (user units in a 24 viewBox): 16px → 2.25, 20 → 2.1, 24 → 2, 36 → 1.67, 48 → 1.5. Implement as a `size` prop on `<Icon>` that sets stroke-width.
- Solid badge = front input, outline = back/passive input. Knocked-out labels use `--glyph-ink` (= `--surface-frame`).
- Glyph labels are `<text>` in Geist Bold for now; outline them to paths before shipping so they don't depend on the font.
- Files: `icons/ui/*.svg`, `icons/modes/*.svg`, `glyphs/{steam,xbox,ps,nin}/*.svg` (Steam files named by JSM id). Replaces `NavIcons.tsx`, `glyphs/InputGlyph.tsx`, `inputMarks.tsx` and the footer glyphs.
- The Steam button glyph is a neutral ring mark, not the Valve logo.

## Calibration HUD (Calibration HUD.dc.html)
- 380 × 150, radius 28, glass: rgba(10,14,19,.78) + backdrop-filter blur(18) saturate(1.3) (fine here: the HUD is its own window and isn't a telemetry meter). Demo switch mirrors `hud.html?demo=waiting|calibrating|done|failed`, plus loop.
- Ring: 60 segments (2.6 stroke, round caps). Waiting drains with the countdown; calibrating fills with progress = 1 − remaining/total, **interpolated every rAF frame** between the ~30 Hz updates (lerp toward the target at 12/s); done cross-fades segments into one solid ring, then the check draws (dashoffset 60→0, 400ms, --ease-emphasis) with one bloom.
- Choreography: waiting → calibrating = ring rotates 90° over 400ms, controller lifts 4px, shadow shrinks, sweep arc starts (1.6s/turn), dots drift inward. Done lingers 1.6s, exits with fade + 6px rise over 600ms.
- Failed/cancelled: one 360ms damped shake, amber ring at the progress reached, "Controller moved". Engine doesn't report this yet (open question).
- Reduced motion: no spin, lift, sweep, dots, bloom or shake. Phases cross-fade and the ring still fills.

## Measurements (dark, 100% scale)
- Title bar 44 · page tabs 52 (tab padding 0 12, icon 18, gap 8) · section list 216 (184 at 1024), items 40 · content max 1040 (settings) / 1360 (Overview), page padding 40.
- Page header: eyebrow 11/14 +.12em 600 · title 28/34 −.015em 600 · purpose 14/20. Section heading 17/24 600.
- Setting row: padding 16 (compact 10 16, tall 20 16), radius 10, gap 12; value pill 28 high, radius 999, min-width 56, 13/600 tabular. Slider track 6, thumb 20 (24 + 6px halo when adjusting), ticks 21 at 30px below track.
- Binding row 56, radius 10, padding 0 14 0 12, glyph 28, keycap pill 28 radius 6 with inset −2px line. Callout (Overview) 48.
- Buttons 36 (title bar 28), radius 8, padding 0 16. Toggle 52×30 (compact 44×26). Segmented 36 with 3px inset.
- Hint capsule 44, radius 999, bottom 16, gap 20, glyph 22. Menu radius 14, items 36–48. Dialog 440–480 wide, padding 24.
- Focus: controller = --surface-selected + 2px --focus-controller ring + --shadow-lift + translateY(−1px); keyboard = 2px outline --focus-keyboard, offset 2; title-bar items use a 2px gap ring so it reads on the frame.

## Motion spec
Tokens in Foundations 12d. Rules: transform/opacity/stroke only; no layout animation; no backdrop-filter on anything repainted by telemetry. Focus glide = one shared highlight per scope, transform over --dur-3 --ease-emphasis. Page change = fade + 16px slide in the direction of travel (--dur-3). Picker/dialog = scale .96→1 + fade from origin (--dur-3). Values: fill scaleX --dur-2, numbers tick via rAF. Saved/applied = self-drawing check (--dur-4). Hardware: press = telemetry fill + ring 1→1.6 fade (--dur-3); pad/stick trail = 3–5 fading dots; trigger fill has a soft leading edge (gradient mask); grip contact fill scaleY. Ambient (searching, capture waiting, unsaved) = opacity .5↔1 over --dur-ambient; loops pause on `document.hidden`. Reduced motion per Foundations.

## Token migration
| New | Replaces | Note |
|---|---|---|
| --surface-frame | --bg-1, --topbar-bg | #111820 → #0d1217 |
| --surface-canvas | --bg-0 | #1b2027 → #131920 |
| --surface-nav | --bg-1-5, --sidebar-bg | section list / drawer |
| --surface-row | --bg-2 | #292f38 → #1f2730 |
| --surface-row-hover | new | hover fill step |
| --surface-control / -hover | --bg-btn / --bg-btn-hover | |
| --surface-sunken | --bg-input, --touchpad-grid-bg | wells, fields, meters |
| --surface-raised | new | menus, dialogs, capsule |
| --surface-selected | --state-selected, --state-focused | #35536b → #2a4a63 |
| --text-1 … --text-4 | --text-strong / -mid / -muted / -dim | |
| --accent / --accent-strong | --accent / --accent-primary, --bg-btn-primary | primary button is now solid accent |
| --focus-controller / --focus-keyboard | --focus-ring | split by input source |
| --line-1 / --line-2 | --border-1 / --border-strong | |
| --ok, --warn, --error (+ -soft) | --pill-*, --toast-*, --danger-* | one semantic set |
| --telemetry (+ -soft) | --telemetry-green | |
| --origin-inherited / -override | new | |
| --layer-1…3 (+ -soft) | new | oklch, equal L/C |
| --art-* | new | controller art |
| --fs-* / --lh-* | --font-page-title / -section-title / -label / -hint | 26/16/14/12 → 28/17/15/13 + display, body, eyebrow |
| --sp-1…10 | --space-1…6 | same 4px base, extended |
| --r-xs…pill | --radius-card / -control / -pill | card 12 → 14, row 10 new |
| --titlebar-h / --footer-h / --capsule-h | --header-height / --top-bar-height / --footer-height | |
| --row-h(-compact/-tall), --control-h(-sm/-lg) | --row-height, --control-height | |
| --dur-1…4, --dur-ambient, --ease-*, --stagger | --transition-fast | |
| --z-* | new | |
Old names can stay as aliases (`--bg-2: var(--surface-row)` etc.).

## Component → React file map
| Design | Current owner |
|---|---|
| Title bar (context segments, mapping plate, Test, Save/Apply) | `App.tsx` utility bar, `TopBar.module.css`, `LayerBar.tsx` (layer segment), `BatteryIndicator.tsx` → page-tab status |
| Page tabs, section list, drawer, Studio tabs | `App.tsx` `PrimaryNav`, `SideNav.module.css` (replace sidebar) |
| Hint capsule | `ControllerGlyphBar.tsx` |
| Overview hero + callouts + band + quick settings | `OverviewPage.tsx`, `ControllerStatusSvg.tsx` (→ Controller Live), `BindingLabelLegend.tsx` |
| Binding row, editor, commands | `KeymapControls.tsx`, `KeymapSection.tsx`, `ButtonMappingCard.tsx`, `ButtonBindingsCard.tsx`, `BindingCommandCard.tsx`, `BindingRow.tsx`, `BindingEditor.tsx`, `AdvancedBindingEditor.tsx`, `InputModeshifts.tsx` |
| Action picker, keyboard, icon picker, haptic picker | `ActionPicker.tsx`, `KeyboardBindingModal.tsx`, `IconPicker.tsx`, `HapticOutputPicker.tsx` |
| Origin marker / Use inherited | `InheritedBadge.tsx`, `SettingOrigin.tsx`, `ConfigScope.tsx` |
| Sticks, pads, grips, menu layout | `StickSettingsCard.tsx`, `TouchpadSettingsSection.tsx` (+ Grid/Stick/Sensor/Accel/Haptic sections), `GripSettingsSection.tsx`, `MenuPreview.tsx`, `OverlayLayoutSection.tsx` |
| Gyro template, curve editor, telemetry | `GyroBehaviorControls.tsx`, `SensitivityControls.tsx`, `NoiseSteadyingControls.tsx`, `AccelCurveEditor.tsx`, `SensitivityGraph.tsx`, `CurvePreview.tsx`, `TelemetryBanner.tsx`, `RwcGuideModal.tsx` |
| Setting row, slider, stepper, select + icon list, disclosure, help | `NumberField.tsx`, `ui/Slider.tsx`, `ui/Select.tsx`, `ui/AppSelect.tsx` (placement rule below), `ui/Menu.tsx`, `AdvancedDisclosure.tsx`, `HelpButton.tsx`, `Card.tsx` |
| Glyph badges, icons | `glyphs/InputGlyph.tsx`, `inputMarks.tsx`, `NavIcons.tsx` |
| Studio pages | `ProfileManager.tsx`, `AutoloadManager.tsx`, `GlobalChordsPage.tsx`, `HidHidePage.tsx`, `MappingDebugPage.tsx`, `PollingSettings.tsx`, `HelpDocsPage.tsx`, `AiMappingPage.tsx`, `ConfigEditor.tsx` |
| Toasts, banner, theme | `ToastHost.tsx`, `UpdateBanner.tsx`, `ThemeToggle.tsx` |
| Focus engine | `hooks/useKeyboardNav.ts` (becomes input-agnostic, fed by SDL), `hooks/useSectionScrollSpy.ts` |
| Overlay | `overlay.html`, `src/overlay/` — keep CSS self-contained |
| Calibration HUD | `hud.html`, `src/hud/CalibrationHud.tsx`, `Hud.module.css` — self-contained |

**Dropdown help placement rule (fixes the 8px overflow):** the explanation panel sits beside the list only when `viewport − (list right edge) ≥ panel width (320) + 16`; otherwise it docks below the list inside the same surface. The whole surface is clamped to the viewport with 16px margins; never positioned relative to the trigger alone.

**Help that degrades:** every setting row has a description slot. When the description is missing, the row shows a muted "No description yet · RAW_NAME · Y opens documentation" instead of a blank gap.

## Copy deck (Title Case for headings, labels, options, actions; sentence case for prose)
Page purposes: Overview "Everything this configuration does, on the controller. Select an input to edit it." · Buttons "Face buttons, bumpers, menu buttons, back paddles and grips." · Triggers "Soft and full pull for each trigger, and how the two combine." · Joysticks "Stick mode, deadzones and the bindings each mode sends." · Trackpads "Each pad has its own mode, click, touch and regions. Select a region on the preview to bind it." · Gyro "How tilting the controller moves your aim, and when." · Layers "Layers stack in order; the last applied wins a conflict. Editing a layer never activates it."
States: "Mapping · paused in Studio" · "Testing Wardogs" · "Return to Studio" · "No controller" · "Press a key… Esc to cancel" · "Hold View + Menu or press Esc to return".
Guards: "Unsaved changes in Wardogs" / "Discard and Switch" / "Keep Draft and Switch" / "Cancel". HUD: "Set it down" · "Hold still" · "Calibrated" · "Controller moved".

## §4 / §12 checklist
- [x] Mapping on/off (plate, X toggles) — JSM Shell 4a · [x] Editing picker (grouped, searchable) — Shell Directions 2b · [x] Applied ≠ editing, composed name — JSM Shell 3d · [x] Output device + Bind Whole Controller (disabled while Disabled) — Shell Directions 2d · [x] Undo/Redo/Save/Apply + unsaved — title bar · [x] Config tools: source editor, folder, autoload, recalibrate — Studio Home detail, System States 17e, Global chords, Overview quick settings · [x] Layer context: editing selector, Manage layers, active readout — 2c, 15e · [x] Battery/connection/identity, update banner, toasts — page tabs status, 17h
- [x] Overview (callouts, live state, filters, unbound, Details, quick settings) — Overview · [x] Buttons (all row states) — Components 13.6, Buttons Content · [x] D-Pad — 15d · [x] Triggers (modes, soft/full, tuning, live bar, calibration) — 15a · [x] Joysticks (mode, deadzones, radial editor, live plot) — 15b · [x] Trackpads (mode, click gate, shapes, region editor, touch dot, other controllers) — 15c · [x] Gyro (sections, adjust mode, missing help) — Gyro · [x] Layers (stack, suppress holds) — 15e
- [x] Binding model: commands/activation/output, modeshifts, layer actions, label, origin + Use inherited, copy/paste, advanced — Binding Editor · [x] Action picker (categories, capture, custom/raw, keyboard focus) — 7b, Prototype
- [x] Trackpad tuning 16b · [x] Grip sensors (shared range "both grips", release delay, left-grip warning, Pulse fixed) 16a · [x] Menu layout with overlay-identical preview 16c · [x] Press timing + polling source 16d · [x] AI assistant 16e
- [x] Studio: library, associations, preferences, chords, device visibility, debug, docs — Studio Home, 16f–16k
- [x] Dialogs/transients: unsaved guard, destructive confirm, long operation, toasts, banner — Components 13.13, System States
- [x] Overlay (grid/4/8/radial, hot region, touch dot) — Overlay · [x] Calibration HUD (all phases, fail, reduced motion) — Calibration HUD · [x] System states — System States
- [x] TODO-24/25 haptic picker — 16a · [x] TODO-26 sounds — 16j · [x] TODO-27 LED brightness output — **to add** as a JSM output in the action picker (0–100 stepper, no colour) · [x] TODO-28 calibrate chord + HUD prefs — 16g, 16j · [x] TODO-17/29 grips — 16a · [x] Layer suppresses holds — 15e · [ ] TODO-6 Cursor-visible pseudo-input and [ ] TODO-7 icon import — not yet drawn (see open questions)
- Deferred by owner: light-theme screens, other controllers' hero art.

## Open questions
1. **View button → title bar.** *Owner approved.* With native navigation this is a direct binding: View jumps to the title bar scope from anywhere, and View again returns to the page.
2. ~~Testing a profile from inside Studio.~~ **Decided:** Test mode (see below).
   Original proposal — Tuning gyro, pads or triggers needs the profile running. Proposal: a **Test** mode on the mapping plate (and on relevant pages) hands the pad back to the profile, with a visible banner; exit with hold View + Menu, keyboard Esc, or the mouse. Live telemetry keeps drawing in both modes.
3. ~~Pause scope.~~ **Decided:** pause only while the Studio window has focus.
4. **Calibration failure/cancel** is not reported by the engine yet (HUD sad path is designed ahead of it).
5. **Cursor-visible pseudo-input (TODO-6)** and **Import icons (TODO-7)** still need screens: proposed as a "Cursor visible (heuristic)" row in the modeshift/layer trigger list with an on/off toggle and debounce stepper, and an "Imported" tab beside lucide and game-icons in the icon picker.
6. **Region icons** on the overlay and right pad are drawn as placeholder squares; wire to the bundled lucide / game-icons sets.
7. **Glyph text** must be outlined to paths before shipping (currently Geist Bold `<text>`).
8. **Fonts:** bundle `Geist[wght].woff2` and `GeistMono[wght].woff2` locally; remove the Google Fonts links used by the design previews.
