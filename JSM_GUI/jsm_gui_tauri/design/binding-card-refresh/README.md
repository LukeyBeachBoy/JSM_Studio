# Handoff: Binding Card Refresh (JSM Studio)

## Overview
Redesign of the binding editing experience in JSM Studio (Tauri + React, `JSM_GUI/jsm_gui_tauri/src`). It covers:

1. A consistent **concept identity** (colour + mark) for Commands, Modeshifts and Layers, applied app-wide.
2. A new **collapsed binding row** with aligned Extras / Output columns.
3. A new **open binding card** ("lanes of game rows") — the approved direction is **Turn 3 (3b–3f)**.
4. The **menu item card** (virtual/on-screen menu slots) rebuilt from the same parts.
5. **Add flows**: Add command, Add modeshift ("Hold which button?"), Add layer action.
6. System keys moved out of Advanced into the action picker.
7. Icon picker as a centred full-screen modal.
8. Hint capsule de-duplication bug fix.
9. Motion spec for expand/collapse/add/remove.
10. Layout-stability rules (no UI shift when holding chord/modeshift buttons).

**Approved:** Turn 3 (3a–3f) + from Turn 2: 2a (app-wide marks), 2f (motion), 2g (stability) + from Turn 1: 1f (System & media picker category), 1g (icon modal, grid left-aligned), 1h (capsule fix).
**Superseded, do not build:** 1b, 1c, 1e, 2b, 2c, 2d, 2e (explorations that 3b–3f merge). 1d was dropped.

## About the Design Files
The file in `designs/` is a **design reference created in HTML** — a canvas of mockups showing intended look and behaviour, not production code. Recreate these designs in the existing JSM Studio React codebase using its established patterns (CSS modules, `tokens.css` variables, `ButtonGlyph`, `Icon`, `Sheet`, `SummaryRow`, `data-hints`, etc.). Do not ship the HTML.

Open `designs/Binding Card Refresh.dc.html` in a browser (needs sibling `support.js`, `tokens/`, `glyphs/`, `icons/` which are included). Sections are labelled with ids (`#3c`, `#2f` …); newest turn at the top.

## Fidelity
**High-fidelity.** Colours, sizes, radii and type are final. Mockups use Xbox glyph art; production must render via `ButtonGlyph` in the connected controller's family (Steam / Xbox / PlayStation / Nintendo), as today.

---

## 1. Concept identity (3a, 2a)

| Concept | Mark | Colour | Soft fill | Ink (text on soft) |
|---|---|---|---|---|
| Command | Keycap with bolt | `#6EC3F4` (= `--accent`) | `rgba(110,195,244,.14)` | `#E8EEF4` |
| Modeshift | Hexagon with two up-chevrons | **`#FF4368` (crimson)** | `rgba(255,67,104,.14)` | `#FFC4D0` |
| Layer n | Stacked sheets, top filled | existing `--layer-n` (`oklch(76% .11 H)`) | `--layer-n-soft` | `oklch(86% .07 H)` |

Add tokens to `tokens.css` (dark; derive light theme equivalents at the same hue, L≈52%):
```css
--command: var(--accent);
--command-soft: rgba(110,195,244,.14);
--shift: #ff4368;
--shift-soft: rgba(255,67,104,.14);
--shift-line: rgba(255,67,104,.35);
--shift-ink: #ffc4d0;
--shift-glow: 0 0 18px rgba(255,67,104,.25);
```
Rules
- Modeshift is the only thing that glows. Error (`#EF8A8F`) never glows and never uses the hex mark.
- Commands keep the app blue: blue continues to mean "primary / focused" and "fires an output".
- Every surface that mentions a modeshift or layer uses its chip/tile (Overview callouts, context header layer segment, binding rows/cards, Layers page, page tabs, gyro modeshift sensitivity, pad/grip modeshifts). Never a second pink/red.

Icons (16×16 viewBox, stroke 1.4–1.6, `currentColor`) — add to `components/icons/iconData.ts`:
```
command:   <rect x="2" y="2.5" width="12" height="11" rx="2.5"/><path d="M8.9 4.4 6.3 8h2.2l-.9 2.6L10.2 7H8z" fill="currentColor" stroke="none"/>
modeshift: <path d="M8 1.3 13.8 4.6v6.8L8 14.7 2.2 11.4V4.6z"/><path d="M5.3 8.1 8 5.5l2.7 2.6"/><path d="M5.3 10.9 8 8.3l2.7 2.6"/>   (round caps/joins)
layer:     <path d="M8 2 14 5.3 8 8.6 2 5.3z" fill="currentColor" fill-opacity=".25"/><path d="M2 8.4 8 11.7l6-3.3"/><path d="M2 11.1 8 14.4l6-3.3" stroke-opacity=".55"/>
cog:       Lucide "settings" (24 viewBox, stroke 1.8) — used for every per-row / per-card settings button.
```
Remove the `reorder` icon usage (see §3).

### Overview page (2a, 2g)
`OverviewPage.tsx` currently joins name + every relation line with ` · ` into one label (e.g. "Jump · While held, changes A, B, X and 3 more · Pressed together with RB"). Replace with a **fixed two-line callout**:
- Height 56, radius 10, bg `--surface-row`, grid `28px | minmax(0,1fr) | auto`, gap 12, padding 0 12.
- Line 1: name, 14/600, ellipsis. Line 2: chips (height 18, radius 999, 11/600, icon 11px) — command count chip (blue), modeshift chip ("Shifts 3", crimson), layer chip (layer hue). Max 2 chips + "+n".
- Right: value pill, min-width 56, height 26, radius 6, `--surface-control`, inset bottom bevel `inset 0 -2px 0 --line-2`, 12/600.
- Full relation prose moves to the inspector/details panel only.
- **While a modeshift button is held (live):** affected callouts swap name + value in place (90ms crossfade), name turns `--shift-ink`, line 2 shows "was Jump", card gets `0 0 0 1px rgba(255,67,104,.4), 0 0 18px rgba(255,67,104,.18)`. The trigger's own callout shows "Held" in crimson. No size change.
- Context header: layer segment = pill h28, bg layer-soft, text layer colour, "Editing layer: Vehicles". Held modeshift = fixed-width (220px) status pill, crimson soft + glow: "L4 held ··· 3 inputs shifted".

---

## 2. Collapsed binding row (3b)
Container: section list page as today. Row:
- Height **60**, radius 10, bg `--surface-row`; focused: bg `--surface-selected` + `0 0 0 2px --focus-controller`.
- Grid: `32px | minmax(0,1fr) | 250px (Extras) | 220px (Output)`, gap 14, padding 0 14. Optional column header row (11px, .12em, 600, `--text-4`): "EXTRAS", "OUTPUT".
- Col 1: `ButtonGlyph` 30px.
- Col 2: name 15/500 (ellipsis), input name 13 `--text-3`. Unbound: name "Unbound" in `--text-3`.
- **Extras** (left-aligned, gap 6, never wraps):
  - Modeshift tile: h32, radius 8, bg `--shift-soft`, `inset 0 0 0 1px rgba(255,67,104,.4)`, 13/600 `--shift-ink`; content = trigger cap (white rounded cap h22, min-w 26, radius 6, bg `#E8EEF4`, text `#0D1217` 10/800) + "→" in `--shift` + output.
  - Layer tile: h32, radius 8, bg layer-soft, `inset 0 0 0 1px layer/.4`, 13/600 layer colour, layer icon 14 + "Hold Vehicles" (verb + layer name).
  - Overflow: max **one** modeshift tile + **one** layer tile, then a single "+n" tile (h32, min-w 32, radius 8, `--surface-control`, 12/700 `--text-2`).
- **Output** (left-aligned so every row's first keycap starts at the same x):
  - Up to **2** command keycaps: h34, radius 7, padding 0 12, `--surface-control`, `inset 0 -3px 0 --line-2`; two lines: activation micro-label (8px/700, .1em, `--command`, e.g. PRESS / HOLD / TAP / DOUBLE) and key (13/600, nowrap).
  - 3+ commands: first two + "+n" (h34, radius 7, `--command-soft`, 12/700 `--command`).
  - Unbound: "None" 13 `--text-4`.
- Rows never grow taller or wider with content.

## 3. Open binding card (3c)
Replaces current `ButtonMappingCard` open state + `BindingCommandCard` rows. Width fills content column (mock 760).
- Card: radius 16, bg `--surface-row`, `0 0 0 1px --line-2, 0 8px 24px rgba(0,0,0,.35)`, overflow hidden.
- **Header**: padding 16 16 16 18, bg `linear-gradient(90deg, rgba(110,195,244,.10), transparent 55%)`, bottom hairline `--line-1`. Glyph 40 · title 18/600 + name 13 `--text-3` · **cog button** · **Details button**.
  - Console button base (used everywhere): h40, radius 10, bg `--surface-control`, `inset 0 0 0 1px --line-2`; icon-only = 40×40; with label = padding 0 14 0 10, 13/600, leading glyph 20 (Y for Details).
  - Header cog opens a menu/sheet: Copy, Paste, Reset to inherited. **Remove the inline Copy / Paste / Details text buttons** from `ButtonMappingCard.tsx` (lines ~233–235).
- **Body**: padding 16, gap 12, three **lanes**.
- **Lane**: padding 12, radius 12, gap 8.
  - Commands: bg `linear-gradient(135deg, rgba(110,195,244,.09), rgba(110,195,244,.02))`, `inset 0 0 0 1px rgba(110,195,244,.18)`.
  - Modeshifts: bg `linear-gradient(135deg, rgba(255,67,104,.12), rgba(255,67,104,.03))`, `inset 0 0 0 1px rgba(255,67,104,.3), 0 0 28px rgba(255,67,104,.08)`.
  - Layer actions: same as commands with layer-1 hue at .12/.03 and line .28.
  - Lane header: icon tile 28×28 radius 8 (concept soft .18–.2; modeshift tile adds `0 0 12px rgba(255,67,104,.35)`), label 12/700 .12em concept colour ("COMMANDS", "MODESHIFTS", "LAYER ACTIONS"), count 12/700 at 70% opacity.
- **Row** (all three lanes share it): h56, radius 10, bg `#26303A` (`--surface-row-hover`), padding 0 8 0 12, gap 12; focused = `--surface-selected` + focus ring.
  - Command row grid: `30px glyph | 96px activation | 16px arrow | auto output | 1fr label | 40px cog`.
  - Modeshift row grid: `auto input-chain | 16px | auto | 1fr | 40px`. Input chain = trigger cap (h28, min-w 34, radius 7, `#E8EEF4` bg, 12/800 dark) + "+" (`--shift`, 800) + input glyph 28.
  - Layer row grid: `30px glyph | 16px | auto layer tile | 1fr description | 40px`. Layer tile: h36, radius 8, bg layer/.18, `inset 0 0 0 1px layer/.45`, 14/600 `oklch(86% .07 H)`, icon 16 + "Hold Vehicles". Description 14 `--text-3` ("On while A is held").
  - **Activation chip-select**: h32, radius 8, bg `--command-soft`, `inset 0 0 0 1px rgba(110,195,244,.3)`, 12/700 .06em uppercase `--command`, chevron 10. Replaces grey `Select` in `commandTriggerBadge`.
  - Arrow "→" in concept colour.
  - **Output keycap**: h36, radius 8, padding 0 14, `--surface-control`, `inset 0 -3px 0 --line-2`, 15/600. A opens the action picker (existing behaviour).
  - Label: 14 `--text-2`; empty = placeholder "Name this action" `--text-4`. Rename lives in the cog sheet.
  - **Row cog** (40×40 console button) opens the command settings sheet: Output mode, Release early, Rename, Duplicate, Copy, Remove (danger). This replaces the inline Options / ··· / Remove buttons in `BindingCommandCard.tsx` (~221–231) and the inline `BindingEditor` expansion.
- **Add buttons** (lane footer):
  - h44, radius 10, padding 0 14 0 8, 14/700 `--text-1`, gap 10; bg concept soft .16, `inset 0 0 0 1px concept/.4, inset 0 -3px 0 concept/.25`; leading "+" cap 28×28 radius 7 solid concept colour, "+" 18/700 in dark ink (`#07131D` / `#1A0409` / `#120A1C`).
  - Commands lane: two-column grid, gap 8: **Add command** + **Capture a key** (neutral console button with X glyph 28, same metrics).
  - Labels: "Add command", "Capture a key", "Add modeshift", "Add layer action".
- Empty lane = header + add button only (no explanatory paragraph).
- **Delete `ReorderGrip`** (`ButtonMappingCard.tsx:293`) and its use in `BindingCommandCard.tsx:180`. Commands aren't reorderable.
- **Global rule: no `···` inline buttons and no text-only buttons.** Every action is a filled, bordered, padded console button; per-item settings use the cog.

## 4. Menu item card (3d)
Same component as §3 (it already is: `KeymapControls → ButtonBindingsCard → ButtonMappingCard → BindingCommandCard`), in a narrow column (mock 480).
- Header: icon well 44×44 radius 10 `--surface-sunken` + `inset 0 0 0 1px --line-2` (icon 22) · title = menu label 16/600 · sub "Region 1 · Row 1, Col 1" 12 `--text-3` · cog.
- Identity row: grid `auto | 1fr`, gap 8: **Change icon** console button (h44, icon 18, 14/700) + label text field (h44, radius 10, `--surface-sunken`, 14). Label = text shown on the on-screen menu.
- Commands lane only (menu items have no modeshift/layer lanes; omit, don't show empty). Command row without the input glyph column: `96px | 16px | 1fr | 40px`.
- Output is a single keycap (the picker handles Keyboard / Mouse / System etc.). Remove the current "Output: Keyboard" select, value field, Capture and "Keyboard…" buttons from `BindingEditor.tsx`.
- Move `IconPicker` out of the command row (`ButtonBindingsCard.tsx:605`) into the identity row.

## 5. Add flows
**Add command** → opens `ActionPicker` immediately, activation defaults to Press; on Choose, returns to the card with the new row focused. X on the lane (or the Capture button) captures a key instead.

**Add modeshift** (3e) → Sheet step 1 "Hold which button to change what A does?" → then `ActionPicker` (step 2) → back.
- Scrim `--surface-scrim` (.64). Dialog 900 wide, radius 16, `--surface-raised`, `0 12px 32px rgba(0,0,0,.45), 0 0 0 1px rgba(255,67,104,.35), 0 0 40px rgba(255,67,104,.14)`.
- Header padding 20 24, bg `linear-gradient(135deg, rgba(255,67,104,.16), transparent 70%)`: eyebrow "NEW MODESHIFT · STEP 1 OF 2" 11/700 .12em `--shift`; title 20/600; right: chain preview `[?] + [A]` (? box 40×30 radius 7 `inset 0 0 0 2px --shift`).
- Body: 2-column grid of groups (gap 18/28, padding 8 24 22). Group label 11/600 .12em `--text-3`. Items = buttons h44 radius 10 `--surface-row`, padding 0 12 0 8, cap (h26, min-w 30, `#E8EEF4`, 11/800; circle radius for face/sticks) + sub-label 13 `--text-2`.
- Groups (show only those the connected controller has): **Back grips** L4 L5 R4 R5 · **Face** A B X Y · **Shoulders** LB RB, LT/RT soft pull, LT/RT full pull · **Sticks** L3 R3 click, LS/RS touch, LS ring · **D-pad** ↑ ↓ ← → · **Trackpads** LP/RP touch, LP/RP click · **System** View Menu Home Share. Map to JSM names (e.g. ZL/ZLF, LEFT_PAD_TOUCH, LRING, UP…) using existing input definitions.
- The input being edited is disabled (35% opacity). Selected = crimson soft bg + focus ring, sub-label `--shift-ink`.
- Pressing a physical button on the pad selects it. Footer (h56, `#1B232B`): "Or press it on your controller" · A Next · B Cancel.

**Add layer action** (3f) → single sheet, no picker.
- Dialog 600, border `0 0 0 1px layer/.35`. Eyebrow "NEW LAYER ACTION · A BUTTON" in layer colour; title "Which layer?".
- Layer list rows h52 radius 10 (swatch 14×14 radius 4, name 15, "12 bindings" 13 right).
- Segmented control titled **"When A is pressed"** (not "Verb"): Hold · Toggle · Turn on · Turn off. Track `--surface-sunken` padding 4 radius 12; segment h40 radius 9; selected = solid layer colour, dark ink 14/700.
  - UI labels map to `layerVerbs` in `utils/layers.ts`: hold→Hold, toggle→Toggle, apply→**Turn on**, remove→**Turn off**. Update `layerVerbLabels`; config output unchanged.
- Result preview row (fixed h44): the "Hold Vehicles" tile + one-line explanation, ellipsized: Hold "Layer is on only while A is held down." / Toggle "Each press turns the layer on or off." / Turn on "Press turns the layer on; it stays on." / Turn off "Press turns the layer off."
- Footer: LB/RB "Hold / Toggle / On / Off" · A Add · B Cancel.

**After any add**: new row grows in (see Motion) and keeps focus. Collapsed-row chips update (e.g. modeshift tile + "+1").

## 6. System keys → action picker (1f)
`ActionPicker.tsx` already has a `System` category. Ensure `choices.System` contains all `systemKeyOptions` (`actionCatalog.ts`: VOLUME_UP, VOLUME_DOWN, MUTE, SCREENSHOT, NEXT_TRACK, PREV_TRACK, PLAY_PAUSE) with icons, labelled "Volume up", "Volume down", "Mute", "Play / Pause", "Next track", "Previous track", "Print Screen". Rename the tab to **"System & media"**. **Remove** the System key select from `BindingEditor.tsx` (~329–335) and the `commandOutputSystemKey` i18n string. Advanced/settings keeps only true options (Output mode, Release early).

## 7. Icon picker modal (1g)
Replace the inline popover `IconPicker` with a centred modal (portal, scrim .72):
- Dialog 840×580, radius 14, `--surface-raised`, `--shadow-menu`. Rows: header 68 · tabs 52 · grid · footer 56.
- Header: current icon preview 40×40 (`--surface-sunken`, radius 10) · title "Icon for “Home”" 17/600 + "Shown above the label on the menu" 12 · search field 240×36 · **+ Import** console button (future: custom icons; can be disabled for now).
- Tabs (LB/RB): General · Game · Media · Navigation · Custom. Pill h32; selected = `--accent` bg, `--text-on-accent`.
- Grid: 56×56 tiles, gap 10, **left-aligned** (`justify-content: start`), padding 20 24, scrolls vertically. Tile bg `#1B232B`; selected `--surface-selected` + focus ring.
- Footer: "Bundled with the configuration" · X No icon · A Use icon · B Cancel.
- Always centred on the viewport. It never positions relative to the trigger.

## 8. Hint capsule de-dup (1h)
Cause: `components/ui/SummaryRow.tsx` (~217–226) always appends `B:Back` after `props.hints`, and callers already pass e.g. `"A:Bind;B:Back"` (`PadSection.tsx`, `StickSection.tsx`, `TouchpadGridSection.tsx`). `parseHints` in `shell/HintCapsule.tsx` doesn't de-dup.
Fix:
1. `parseHints`: keep one hint per button (last declared wins), then sort into fixed order `MOVE, A, X, Y, B, LB/RB, LT/RT, MENU, VIEW`.
2. `SummaryRow`: only append `B:Back` when `props.hints` has no `B:`.
3. `withStepping` / `withHome` should also skip buttons already present (they mostly do).

## 9. Motion (2f)
Use existing tokens (`--dur-*`, `--ease-*`). The live demo in `#2f` is clickable.
| What | Spec |
|---|---|
| Expand card | Body height via `grid-template-rows: 0fr → 1fr` (inner `min-height:0; overflow:hidden`), `--dur-3` 240ms `--ease-emphasis`. Lanes fade in + rise 4px, staggered `--stagger` 24ms (first at 40ms). Card shadow grows to `0 8px 24px rgba(0,0,0,.35)`. |
| Collapse | 160ms `--ease-exit`, no stagger. Collapsed-row chips fade back in (160ms). |
| Chevron | Rotate 180°, 240ms, in step with body. |
| Add row | Row grows `0fr → 1fr` 160ms `--ease-standard`, then a glow in concept colour (`0 0 0 1px c/.6, 0 0 22px c/.45`) fades out over 900ms. Focus lands on it. |
| Remove row | Row collapses 160ms; neighbours slide up. Focus → next row, else the lane's Add button. |
| Picker / sheets | Scale .96 → 1 from the triggering pill/button, 240ms; scrim fades 160ms. |
| Modeshift held | Affected text crossfades 90ms, glow applied; no layout change. |
| Reduced motion | Heights snap; only opacity fades (≤120ms) — existing token override handles durations. |

## 10. Layout stability (2g)
Holding a chord/modeshift button currently grows callouts, the capsule and the header.
- **Fixed boxes for live text**: callouts fixed 2 lines × 56px; value pills min-width; all ellipsize. Details go to the inspector, never inline.
- **Reserved slots**: capsule and context header keep a fixed-width status slot (170–220px), empty when idle, filled with chip + count ("L4 held · 6 shifted"). Never append sentences to the capsule.
- **Swap, don't reflow**: state-driven text changes crossfade in place (90ms) with `font-variant-numeric: tabular-nums`. Only user actions (expand, add, remove) may move layout.

---

## State (per binding card)
- `open: boolean` (card expanded; A toggles, B closes)
- `focusedRowId` (restored after add/remove/picker)
- `justAddedId | null` (drives the 900ms glow; clear on timeout)
- `sheet: null | 'commandSettings' | 'addModeshift' | 'addLayerAction' | 'cardSettings' | 'iconPicker'` + sheet-local selection (`holdButton`, `layerId`, `layerVerb`)
- `pickerOpen` / `pickerTarget` (existing ActionPicker)
- Live `heldInputs` (from telemetry) for Overview / header / capsule shifted states.

## Controller hints (capsule) per context
- Collapsed row: A Open · Y Details · B Back
- Command row: A Change action · X Capture · Y Settings (cog) · B Close
- Add command button: A Add command · X Capture · B Close
- Add modeshift sheet: MOVE Move · A Next · B Cancel
- Add layer action sheet: A Add · LB/RB Hold / Toggle / On / Off · B Cancel
- Icon modal: A Use icon · X No icon · LB/RB Category · Y Search · B Cancel

## Design tokens used
Existing (`tokens/tokens.css`): surfaces `#0D1217 #131920 #181F27 #1F2730 #26303A #2E3844 #0F151B #232C36 #2A4A63`, text `#E8EEF4 #B0BCC8 #808C99 #5B6571`, accent `#6EC3F4`, focus ring `#9AD8FF` 2px, lines `rgba(214,228,242,.07/.13)`, error `#EF8A8F`, layers `oklch(76% .11 300/160/60)`. New: see §1. Font Geist / Geist Mono. Radii used: 6, 7, 8, 10, 12, 14, 16, 999. Type: 20/600 sheet titles, 18/600 card title, 15–17 row titles, 14 body, 13 secondary, 12/700 .12em lane labels, 11 eyebrows, 8/700 keycap micro-labels.

## Assets
- `glyphs/xbox/*.svg` — mock-only; production uses `ButtonGlyph` per family.
- `icons/ui/*.svg` — existing app icons (icon-picker sample content, overview icon).
- New icons: command / modeshift / layer / cog SVG paths in §1.

## Files
- `designs/Binding Card Refresh.dc.html` — all mockups. Approved: `#3a`–`#3f`, `#2a`, `#2f`, `#2g`, `#1f`, `#1g`, `#1h`.
- `designs/tokens/tokens.css`, `designs/glyphs/`, `designs/icons/`, `designs/support.js` — needed to open the HTML.

### Codebase touch-points
- `src/components/keymap/ButtonMappingCard.tsx` — header, remove ReorderGrip + inline Copy/Paste/Details
- `src/components/keymap/BindingCommandCard.tsx` — row layout, cog, activation chip-select
- `src/components/keymap/BindingEditor.tsx` — reduce to settings sheet; drop output-kind select, system key select
- `src/components/keymap/ButtonBindingsCard.tsx` — lanes, add buttons, IconPicker move
- `src/components/keymap/InputModeshiftPanel.tsx`, `InputModeshifts.tsx` — modeshift lane + add sheet
- `src/components/LayerBar.tsx`, `src/utils/layers.ts` — layer lane, add sheet, verb labels
- `src/components/keymap/ActionPicker.tsx`, `actionCatalog.ts` — System & media
- `src/components/keymap/IconPicker.tsx` — modal
- `src/components/OverviewPage.tsx` — callouts, live shifted state
- `src/shell/HintCapsule.tsx`, `src/components/ui/SummaryRow.tsx` — de-dup
- `src/shell/TitleBar.tsx` — layer segment colour, held-modeshift status slot
- `src/components/icons/iconData.ts`, `tokens.css` — new icons + tokens
