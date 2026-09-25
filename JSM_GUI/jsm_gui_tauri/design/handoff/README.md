# Handoff: JSM Studio redesign (Tauri)

## Overview
A full redesign of JSM Studio, the Tauri GUI for JoyShockMapper, for the Steam Controller in the dark theme. It covers the console-style shell (frameless title bar, page tabs, section list, drawer), every configuration page, the binding editor and action picker, Studio pages, system states, the in-game overlay, the calibration HUD, and a controller-first focus model driven by native SDL input.

## About the design files
The files in `designs/` are **design references built in HTML**. They show the intended look and behaviour; they are not production code to copy. Recreate them in the existing codebase (`jsm_gui_tauri`: React + TypeScript + Vite + Tauri, CSS modules) using its established patterns. Do not import `support.js` or the `.dc.html` runtime into the app.

## Fidelity
**High fidelity.** Final colours, type, spacing, radii, motion and copy. Match them exactly, using the values in `designs/tokens/tokens.css` (drop-in) and `HANDOFF.md`.

## Where the detail lives
`HANDOFF.md` is the spec. It contains:
- File index (which `.dc.html` shows what)
- Shell decisions and the focus model (scopes, rings per input source, title bar order 1–9)
- Native controller navigation architecture (SDL input, pause-while-focused, Test mode, global chords)
- Measurements, motion spec, token migration table (old → new names)
- Component → React file map (which existing `.tsx` owns each design)
- Copy deck, requirements checklist, open questions

## Viewing the designs
Open any file in `designs/` directly in Chrome/Edge (keep the folder structure; files import siblings). Start with `Prototype.dc.html` for the flow, then `JSM Shell.dc.html` and `Components.dc.html`.
Prototype keys: arrows move · Enter = A · Esc = B · Tab / Shift+Tab = RB / LB · PgDn / PgUp = RT / LT · Space = X.

## Assets
- `designs/tokens/tokens.css`, `tokens.json` — all tokens, dark + light, reduced-motion overrides
- `designs/icons/{ui,modes,app}/*.svg` — UI, mode and app icons (optimised, 24 grid)
- `designs/glyphs/{steam,xbox,ps,nin}/*.svg` — controller glyphs; Steam files named by JSM input id
- `designs/controllers/` — Steam Controller source geometry (front/back)
- `designs/reference/` — current UI screen + current tokens for comparison
- Fonts: bundle Geist and Geist Mono (variable woff2) locally; the previews use Google Fonts only for convenience.

## Suggested implementation order
1. Tokens: add `tokens.css`, alias old variable names (see token migration table).
2. Icons and glyphs: replace `NavIcons.tsx`, `InputGlyph.tsx`, `inputMarks.tsx` with the SVG sets; `<Icon size>` sets optical stroke.
3. Shell: title bar, page tabs, section list, drawer, hint capsule.
4. Focus engine: make `useKeyboardNav.ts` input-agnostic; add the Tauri SDL navigation stream, pause/resume on focus, Test mode.
5. Components: setting row, slider (adjust mode), binding row, menus, dialogs, toasts.
6. Pages: Overview (with `Controller Live` art) → Buttons/Binding Editor/Action Picker → Gyro → remaining configuration pages → Studio pages → system states.
7. Separate windows: overlay, calibration HUD (keep their CSS self-contained).

## Open items
See "Open questions" in `HANDOFF.md`: region icons are placeholders, glyph labels need outlining to paths, TODO-6 (cursor-visible input), TODO-7 (icon import) and TODO-27 (LED brightness output) are specified but not drawn, calibration failure isn't reported by the engine yet.

## Using this with Claude Code
Copy this folder into the repo, e.g. `jsm_gui_tauri/design/handoff/`, then prompt:

> Read `design/handoff/README.md` and `design/handoff/HANDOFF.md`. Open the `.dc.html` files in `design/handoff/designs/` as visual references. Implement the redesign in this codebase following the suggested implementation order, one step per PR-sized change. Use `tokens.css` values exactly and the component → React file map to find what to change. Ask before deviating from the spec.
