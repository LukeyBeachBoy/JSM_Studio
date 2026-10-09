# Restyle pass: match the app's existing flat art

Luke's feedback: the canvas illustrations use a skeuomorphic / neumorphic look (radial
spotlights, blurred glows, specular highlight strips, 3D stick pucks, keycap lips, drop
shadows under objects). It looks different from how JSM Evolved actually draws controllers,
virtual menus and trackpad zones, and the fake specular effects look cheap. Restyle every
illustration so it matches the app's real art. Layout, copy, rows and focus targets stay
exactly as they are; only the rendering of pictures, diagrams, graphs and decorative
surfaces changes.

## The app's real style (source of truth)

Look at these before you start (read only):
- `C:\Users\luker\code\JSM_Studio\JSM_GUI\jsm_gui_tauri\src\assets\controllers\steam-front.svg` and `steam-back.svg` (also dualsense-, xbox-series-, switch-pro- etc. in the same folder)
- `src\components\ModelControllerSvg.tsx` + `.module.css`, `src\components\ControllerStatusSvg.tsx`
- `src\overlay\Overlay.module.css` + `MenuDrawing.tsx` (on-screen menus and trackpad zones)
- `src\components\keymap\MenuPreview.tsx`, `VirtualMenuPreview.tsx`

Art tokens (dark theme, from styles/design-tokens.css):
- `--art-line: #e3eaf1` (main outline), `--art-detail: #aebbc8` (secondary lines and small parts)
- `--art-body: #1c242d` (controller body), `--art-well: #0e1419` (wells, pad surfaces, recesses), `--art-cap: #212a34` (buttons, stick caps)
- `--art-rim: rgba(255,255,255,.10)`
- Live telemetry: `#a6d65a` (stick dot, touch point, live trace), soft fill `rgba(166,214,90,.16)` (a touched pad / active area)
- Accent `#3e9fd8` for the selected or bound thing; on-accent text `#07131d`.

What that looks like:
- **Controllers:** flat line art. Body filled `--art-body`, 2px `--art-line` outline, buttons as `--art-cap` shapes with 1.5px `--art-detail` strokes, wells `--art-well`. The only gradient allowed is the one the app art itself uses on the body: a top-down white wash from 9% to 0% (`cl-art-light`). The live stick position is a small `#a6d65a` dot with a 2px `--art-line` ring; a touched pad is the soft green fill with a `#a6d65a` outline.
- **Virtual menus (wheels, grids, hotbars):** flat dark slices (`#0f141a` / `#131a21`) separated by 1px `rgba(255,255,255,.08)` lines, a flat centre circle, and labels as small chips (`#2b3138`, radius 4px, white 14px bold text). The selected slice is a solid accent fill with dark text. No glow, no ring of tick marks, no pushed-out slice, no 3D hub.
- **Trackpad zones:** like the overlay. A pad is a rounded rect `rgba(8,12,18,.72)` with a 1px `rgba(255,255,255,.16)` border; zones are `rgba(255,255,255,.05)` with `#b0bcc8` labels; the active zone is a solid accent fill (`rgba(62,159,216,.9)`) with dark text and icon; the label below an icon is a tiny chip.
- **Graphs and diagrams:** flat. 2px strokes, accent for the active line, `#808c99` dashed for alternatives, axes and grid in `rgba(255,255,255,.06–.1)`. An area under a curve may use a flat accent fill at 10–14% opacity. Markers are plain circles (white or accent) with no halo.
- **Keycaps and chips:** flat rounded rect `#2e3844` with a 1px `rgba(255,255,255,.08)` border and no bottom lip or highlight strip. Active is a solid accent fill.

## Remove everywhere

- `feGaussianBlur` and every `filter="url(#…)"` used for glow or shadow.
- `radialGradient`, and every `linearGradient` except the controller body's 9%→0% top wash. Replace gradient fills with the nearest flat token.
- Specular strips: small white rects or arcs at 10–35% opacity laid over shapes, and highlight arcs on stick tops.
- Drop-shadow ellipses under objects.
- 3D stick pucks (rim + concave cap + ridged ring). A stick is the app's stick: `--art-well` well, `--art-cap` cap, `--art-detail` stroke, plus the green live dot if live.
- CSS `radial-gradient(...)` or `linear-gradient(...)` backgrounds on picture panels and keycaps. Use flat `#0f151b` wells with a 1px `rgba(255,255,255,.06)` inset border.
- The `.focus` class's big drop shadow. Change it everywhere to `.focus{box-shadow:0 0 0 3px #3e9fd8,0 0 0 7px rgba(62,159,216,.2)}`.
- Dot-grid patterns used purely for texture. Keep them only where they carry meaning (a screen or pad surface).

## Controller pictures

Where an artboard draws a controller (front, back, or a small locator), use the app's real art
for that model instead of a hand-drawn gamepad. Read the SVG file, inline its markup (keep the
viewBox; drop comments; prefix its ids with your file's prefix so they stay unique), and define
the `--art-*` variables in your helmet CSS on a wrapper class, e.g.
`.art{--art-line:#e3eaf1;--art-detail:#aebbc8;--art-body:#1c242d;--art-well:#0e1419;--art-cap:#212a34;--art-rim:rgba(255,255,255,.10)}`.
Wardogs is a Steam Controller (`steam-front.svg` / `steam-back.svg`). Use the DualSense,
Xbox or Switch Pro art where a screen shows those. Highlight inputs by drawing flat accent
shapes or the green live dot over the art at the right coordinates (the art is 1117×750 in
overlay space; `ControllerStatusSvg.tsx` has the input positions). Labels next to a controller
use the app's callout style: small `#808c99` uppercase captions or chips, no glow.

## Process

1. Restyle only the files you're assigned. Keep every row, label, focus target and footer as is.
2. Afterwards, grep each file: `feGaussianBlur`, `radialGradient`, `radial-gradient`, `linear-gradient` and `filter=` must not appear (except the controller body's `linearGradient`). Run your static structure check if you have one.
3. Don't publish, render or open a browser. Report which files changed and anything you couldn't convert.
