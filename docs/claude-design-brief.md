# JSM Studio — Claude Design brief (controller-first redesign, v3)

> Paste everything below the line into Claude Design. Attach, in this order:
> 1. The five "JSM vs Steam Input" comparison sheets (JSM Studio left, Steam Input right).
> 2. The current app, for honesty about the starting point: `tmp/nav-redesign/*.png`,
>    `tmp/numberfield-pass/*.png`, `tmp/page-sweep/*.png`.
> 3. The existing controller artwork: `JSM_GUI/jsm_gui_tauri/src/assets/steam-controller-front.svg`,
>    `steam-controller-back.svg`, and `JSM_GUI/jsm_gui_tauri/design/dualsense.svg`,
>    `dualshock.svg`, `dualsenseEdge.svg`.
> 4. The seven AI-generated inspiration mockups (gyro sensitivity slider rows,
>    Gyroscope section list, Triggers rows, visual tokens, universal binding row,
>    contextual sidebar, proposed shell). §2.1 of the brief explains how to read
>    them.
>
> Sources this brief consolidates: `docs/steam-input-transformation.md` (the first
> brief and its four implementation passes), `docs/controller-first-redesign.md`,
> `docs/ui-audit-2026-09-17.md`, `docs/playtest-feedback-audit.md`,
> `docs/config-layers.md`, `docs/trackpad-overlay.md`, and every open item in
> `docs/TODO.md` that needs UI.

---

## 0. Your role and what you deliver

You are the lead product designer for **JSM Studio**, a desktop configuration app
for game controllers. Design a **premium, console-grade, controller-first**
interface for it, in the same league as Steam Input, the PS5 settings UI and the
Xbox Accessories app, while keeping JSM Studio's much deeper feature set.

Your output is a **high-fidelity static HTML + CSS project and design system**.
Claude Code will implement it pixel for pixel in the existing React app, so the
handoff has to be exact, complete and buildable. It does not need to be a
mood board.

**The deliverable:**

```
jsm-studio-design/
  README.md                 how to open it; index of every file
  tokens/
    tokens.css              all design tokens as CSS custom properties, dark + light
    tokens.json             same values, machine-readable
  foundations.html          colour, type, spacing, radius, elevation, motion, focus,
                            iconography and glyph specimens, with the token name
                            beside every swatch and sample
  components.html           every component in every state (see §7), labelled
  glyphs/                   new inline-SVG controller glyph sets, per family (see §8)
  icons/                    new UI icon set: navigation, status, modes, categories (see §8)
  controllers/              hero controller illustrations with addressable hotspots
                            (Steam Controller: same geometry, elevated rendering)
  screens/                  one HTML file per screen per viewport (see §6)
  overlay/                  the in-game overlay surfaces (see §6.18)
  prototype.html            clickable walkthrough: arrow keys / Enter / Esc /
                            Tab / PageUp / PageDown move a real focus ring
                            through the main flows (see §9)
  handoff/
    HANDOFF.md              component anatomy with px measurements, the token
                            migration table (§5.5), component → React file mapping
                            (§11), interaction and focus spec, motion spec, copy
                            deck, and open questions
```

**Technical rules for the HTML/CSS:**

- Plain semantic HTML and hand-written CSS. Use custom properties from
  `tokens.css` for **every** colour, size, radius, shadow and duration, with no
  literal values in component CSS. Vanilla JS only for the prototype's focus
  movement and open/close behaviour. No frameworks, no Tailwind, no build step.
- **No network at runtime.** The app is an offline Tauri desktop app. Do not use
  CDN scripts or Google Fonts links. If you choose a typeface, reference it as a
  local `@font-face` file with a system fallback stack, and name the exact font
  files to bundle. Icons are inline SVG.
- Class names should be semantic and component-scoped (`.binding-row`,
  `.binding-row__value`, `.binding-row--inherited`) so they translate directly
  into CSS modules.
- Every state must be forceable by a class or data attribute
  (`data-state="focused|selected|open|adjusting|capturing|disabled"`,
  `data-origin="inherited|override"`) as well as by real pseudo-classes, so each
  state can be screenshotted and implemented without driving interaction.
- Design at **1440×900** as the primary viewport and **1024×720** as the minimum
  comfortable desktop. Also show the **< 1060px navigation drawer**. Assume 100%,
  125% and 150% Windows scaling.
- Provide **dark (primary) and light** themes. The app already has a theme
  toggle, and both must be first-class. Show every screen in dark and the key
  ones (Overview, Buttons, Gyro, action picker, Settings) in light.
- **English only.** Do not spend design effort on localisation. Layouts should
  still cope with long English labels by wrapping or truncating deliberately.
- **Motion is part of the deliverable, not decoration** (see §5.4). Build
  animations in CSS keyframes, transitions or SMIL/CSS-animated inline SVG so
  they carry straight into React. Live telemetry repaints at the monitor's full
  refresh rate (up to 240 Hz), so animate with `transform`, `opacity` and SVG
  stroke/dash properties, and never animate layout. Reserve `backdrop-filter` and
  large blurred shadows for surfaces that are not also redrawn on every
  telemetry frame.

---

## 1. The product

JoyShockMapper (JSM) is an open-source input remapper. It reads a controller
through SDL and turns it into keyboard, mouse, a virtual Xbox or DualShock 4
pad, or combinations of these. It is best known for gyro aiming, flick stick and
advanced trackpad handling. **JSM Studio** is the GUI around it: a Tauri 2 +
React 18 desktop app that edits JSM's plain-text configuration files,
applies them to the running mapper, and shows the controller live.

**Primary hardware: the Steam Controller (2026).** It has two capacitive
trackpads with click, two thumbsticks with click and capacitive touch, a D-pad,
A/B/X/Y, LB/RB, analog LT/RT with soft and full pull, View/Menu/Steam, a Quick
Access (…) button, four back paddles (**L4, L5, R4, R5**), two capacitive **grip
sensors**, a gyro, haptics on both pads and two back rumble motors, and an LED.
Studio also supports DualSense and DualSense Edge, DualShock 4, Xbox One,
Series and Elite, Switch Pro and Switch 2 Pro, Joy-Cons, HORI Steam, 8BitDo,
Flydigi, GameSir and more. Each family has its own glyphs and geometry.

**The owner and main user** is an enthusiast who plays FPS games (the reference
profile is for *Wardogs*) with gyro aim enabled by the right grip, mouse aiming
on the right trackpad, a grid or radial menu on the left pad, layers held on
the paddles, and a separate menu configuration that a chord swaps to. Profiles
are big: imports from a shared "FPS Template", several layers, dozens of
modeshifts, named actions and icons. The UI has to make that complexity readable
without dumbing it down.

**Why this exists:** Steam Input is the gold standard for *feel*, but it hides
hardware capability. JSM Studio goes deeper: grip sensor tuning, per-pad grid,
radial and 4/8-way menus with an in-game overlay, full gyro filtering (One Euro,
steadying, decel brake), flick stick, raw haptic effects and trigger calibration.
The design has to feel as polished as Steam and **more** capable.

---

## 2. Where we are, and why the last attempt was not enough

This is the **third** design brief. The history matters, so do not repeat it.

**Pass 1 (a written brief implemented straight into code):** the palette was
swapped to Steam-like tokens (`#1b2027` canvas, `#252d36` sidebar, `#292f38`
rows, `#414953` controls, `#35536b` selected, `#66c0f4` accent), the type scale
was set to 22/16/14/12, Configuration and Studio navigation were split, a
category action picker was added, and bindings were collapsed behind
progressive disclosure. **Owner's verdict:** *"You've just changed the theme…
the bones of the app still look the same."*

**Passes 2–4** added value pills, 36px glyph badges, inset focus rings, 12px/8px
radii, 56px rows, a bigger Overview diagram, an accordion sub-nav inside the
sidebar in place of the in-page tab strips and rails, thicker sliders with
always-visible descriptions, and a taller 56px footer. **Owner's verdict on the
shell:** the "Mapping on" switch *"screams this is a website wrapped into a
Tauri app"*.

**The lesson:** the app was re-skinned one component at a time on top of the
old layout, so it still reads as a dense desktop form tool. **This time, design
from the structure up:** shell, navigation model, page templates and focus model
first, then components, then skin. You are free to throw away the current
layout. You are **not** free to throw away functionality (§4).

### 2.1 The AI inspiration mockups (attached)

These seven images were generated during the first brief. Treat them as a
**direction to exceed, not a spec**:

- **Gyro Sensitivity**: label left, value in a small pill at the top right, a
  full-width thick slider, and the description always visible underneath, with a
  hairline between rows. This is the setting-row pattern to perfect.
- **Gyroscope** section list: full-width rows with a chevron, and a selected row
  filled with the focused blue. This is the drill-in list pattern, grouped as
  General / Sensitivity / Calibration / Noise & Steadying / Orientation /
  Activation & Dampening / Output / Hardware Diagnostics.
- **Triggers**: an uppercase side label (RIGHT TRIGGER / LEFT TRIGGER), then
  Behaviour / Full Pull / Soft Pull / Analog Output rows, each with its value
  in a right-aligned pill.
- **Visual tokens**: the palette in §5.2, described as "Steam-inspired, with a
  slightly cooler blue-grey identity". That phrase is the brand direction.
- **Universal binding row**: a circular glyph badge, the input name, the value
  in a keycap-like chip, and a gear, with the focused row shown as a blue fill
  plus a 1–2px accent outline.
- **Contextual sidebar**: a small, calm "CONTROLLER SETTINGS" list of Buttons /
  D-Pad / Triggers / Joysticks / Trackpads / Gyro, with Action Sets separated at
  the bottom. It holds only what belongs to the thing being edited.
- **Proposed shell**: app name + "Controller connected" status, then a
  configuration header (icon, "Desktop Layout", "Steam Controller · Default
  layer", a switcher chevron), then category rows with a description. Its own
  caption says it is a hierarchy concept, **not** a home-screen card layout.

What they get right is hierarchy, calm and consistency. What they lack, and what
you must add, is density for power users, live hardware state, and real
craft: typography, glyph artwork, motion and depth.

**Known leftovers from those passes** (address each one):

- Multi-command bindings still list every command inline. Steam collapses them
  into a summary such as `Quick Access Menu, Cleared from…` with Expand/Collapse
  and "Adjust Timings". Design that collapsed summary.
- The footer is a full-width strip. The mockups wanted an **inset, floating
  capsule** action bar. Decide and specify.
- The Overview hero's **Steam Controller geometry is approved**, but its
  rendering (thin black outlines) is flat. Make it more striking without
  moving anything. **Every other icon and glyph in the app must be redrawn**
  (§8).
- The narrow (< 1060px) drawer works but was never designed.
- Some settings ("Static Sens (X)") have no help text. Design a help pattern that
  degrades gracefully when a description is missing.
- The dropdown's help side-panel overflows the window by ~8px at 480–560px
  widths. Design a placement rule that cannot overflow.

---

## 3. Design principles (in priority order)

1. **Controller-first, mouse-perfect.** Every workflow must be completable with
   the pad alone, and must feel native with a mouse and keyboard. Neither is
   the fallback.
2. **One input, one complete explanation.** Selecting any physical input shows
   everything it does *in the current context*: its binding, modeshifts, layer
   actions, what it enables (for example "Enables gyro"), where each value came
   from, and what editing it will change. Nothing about an input should need a
   visit to three pages.
3. **The reader's vocabulary, not the file's.** Show `Right grip`, `R4`, `Left
   pad · region 3`, `Hold → Crouch`, not `MISC5`, `RSR`, `LT3`, `E = C`. Raw
   tokens are available on demand (a Details toggle), never by default.
4. **A row is a surface, not a label beside a tiny input.** The whole row
   focuses, the whole row activates, and its value sits right-aligned in a
   consistent pill.
5. **Progressive disclosure in three depths:** summary, then commands and
   conditions, then advanced properties. The default view of any page should
   fit a normal profile without scrolling past something you did not ask for.
6. **Context is always visible, never loud.** You should always be able to
   see which configuration you are editing, which is applied, which layer you
   are editing, which layers are active, whether there are unsaved changes, and
   whether mapping is on. None of that should compete with the content.
7. **Hierarchy through restraint.** Layered charcoal and blue-grey surfaces, one
   accent, and a clear type step between page, section, label and hint. No
   glows, no gradients on controls, no borders on every box, and no accent on
   every clickable element.
8. **Instrument panels look like instruments.** Live gyro, stick, trigger, pad
   and grip telemetry is a deliberate, beautiful readout, not form fields that
   happen to update.
9. **Motion makes it feel expensive.** Premium products are recognised as much
   by how they move as by how they look. Focus glides, panels settle, values
   count, and hardware readouts breathe. Every motion is quick, purposeful and
   physically plausible, and none of it delays the user.

---

## 4. Functional inventory: everything that must exist in the design

Treat this as the checklist. Every item needs a home, and nothing may be removed.
You may move, merge, rename or hide things behind disclosure, but each must stay
reachable by controller.

### 4.1 Global context and actions (currently a crowded two-row header)

- **Mapping on/off**: master switch for whether JSM is mapping. It is a state as
  well as an action, so do not use an HTML-looking toggle.
- **Editing configuration** picker (the profile library, grouped, searchable).
- **Currently applied** configuration, which can differ from the one being
  edited. Clicking it jumps to editing it, through the unsaved-changes guard. It
  shows the composed name when layers are active, for example
  `Wardogs · Vehicles + Comms`.
- **Virtual output device**: Disabled / Xbox / DualShock 4, plus **Bind Whole
  Controller** as a separate action, disabled while output is Disabled.
- **Undo / Redo**, **unsaved-changes indicator**, **Save** (write the file) and
  **Apply** (load it into the mapper). These are separate operations and their
  meanings must not blur.
- **Configuration tools**: Edit source config (a raw text editor), Open config
  folder, Autoload / Application associations, Recalibrate gyro (with a
  countdown).
- **Layer context**: an "Editing layer" selector (Default + named layers),
  **Manage layers**, and a readout of which layers are active live.
- Battery / connection / controller identity, update banner, toasts.

### 4.2 Configuration pages (per profile)

- **Overview**: a live controller diagram with callouts grouped anatomically
  (left shoulder & grip, left middle, right shoulder & grip, right middle,
  sticks, D-pad, face buttons, trackpads, gyro). Each callout shows glyph +
  action label + output, modeshift and layer lines, and usage badges. Selecting
  a callout opens that input's editor. It has search, filters (All bindings /
  Overrides / Available / Uses this modifier…), **Show unbound inputs**, **Show
  affected inputs** per modifier, a gyro summary tile, a raw-values **Details**
  toggle (pad pressure, trigger counts `32766/32767`, stick vectors), and
  category shortcut tiles.
- **Buttons**: groups for face buttons, bumpers, center/menu buttons (View,
  Menu, Steam, Quick Access), paddles L4/L5/R4/R5, grips, and extra buttons.
- **D-Pad**: four directions (and diagonals where the mode supports them).
- **Triggers**: per side, a trigger **behaviour** mode (JSM: `NO_FULL`,
  `NO_SKIP`, `NO_SKIP_EXCLUSIVE`, `MUST_SKIP`, `MAY_SKIP`, `MUST_SKIP_R`,
  `MAY_SKIP_R`, analog passthrough `X_LT`/`X_RT` for virtual Xbox or
  `PS_L2`/`PS_R2` for DS4), **soft pull** binding, **full pull** binding,
  **Threshold & release tuning** (soft press point, flicker guard), a live
  trigger bar, and trigger calibration.
- **Joysticks**: per stick, a **stick mode** (Directions, Mouse Aim, Flick
  Stick, Flick Only, Rotate Only, Mouse Area, Rotary Scroll Wheel, Hybrid Aim,
  Directions + Light Tilt, Directions + Full Tilt, Radial menu (wheel), Virtual
  Controller Left/Right Stick). Also stick click, stick touch, ring binding,
  inner/outer deadzone, directional bindings when the mode sends them, radial
  menu segments (up to 25) with "select past" deadzone, flick and aim tuning, and
  a live stick readout.
- **Trackpads**: left and right pads are independent. Each has a pad **mode**
  (Mouse / Grid and stick / None), pad click (with a "click required" gate),
  pad touch, grid **regions** shape (Grid rows×columns up to 5×5, 4-way button
  pad, 8-way button pad, Radial wheel), deadzone, per-region bindings, a
  touch-stick section, a live touch preview drawn with the same renderer as the
  in-game overlay, and "Bindings from other controller types" for unsupported
  inputs.
- **Gyro**, currently three tabs: **Behaviour** (activation: Always enabled /
  Hold to enable / Hold to disable / Always disabled, activation button, output:
  Mouse / Left stick / Right stick, Real World Calibration with an Easy
  calibration guide modal, In-game sensitivity, gyro space: Local / Yaw + Roll /
  Player Turn / World Turn, axis X/Y inversion, counter OS mouse speed, and
  calibrate); **Sensitivity** (static vs acceleration curve with Linear /
  Natural / Power / Sigmoid / Quadratic / Jump, and each curve's parameters,
  min/max sens X/Y, min/max threshold, roll contribution, a live sensitivity
  graph, a curve editor, a sensitivity-shift button with its own values); and
  **Noise & Steadying** (deadzone, steadying, smooth time, smooth threshold,
  smoothing decay, One Euro filter with min cutoff and speed coefficient, angle
  snapping with easing, decel brake strength and threshold, trackpad-press
  damping) with **live gyro telemetry** (speed °/s, timestamp, sample rate).
- **Layers**: per-profile layers with Steam semantics. Multiple layers stack,
  and the last applied wins conflicts. The **editing** layer is not the same as
  the **active** layers. Every setting and binding can be inherited or
  overridden per layer.

### 4.3 Binding model (the heart of the app)

Every physical input can carry:

- **Commands**, each with an **activation**: Regular press, Tap, Hold, Double
  tap, Chord (with another input); rarer ones are Release, Turbo, Simultaneous
  and Diagonal; there are also stick modeshifts.
- An **output** per command: keyboard key (captured by pressing it or picked from
  a visual keyboard), mouse button, scroll wheel, system key (volume, mute,
  media, screenshot), virtual gamepad button (Xbox or DS4 names), JSM built-ins
  (Turn off controller, Restart / Finish gyro calibration, Calibrate triggers,
  Gyro on/off), **Load configuration** (which switches profile, JSM's
  equivalent of a Steam action set), haptic effect (Tick, Click, Tone, Rumble,
  Sweep, Pulse with intensity), and raw or unrecognised commands, which must be
  preserved and editable as text.
- **Modeshifts**: "while X is held, this input becomes…". They use the same
  editor as the input itself.
- **Layer actions**: Hold / Apply / Remove / Toggle *layer name*. These live on
  the **input** (one input can have several; several inputs can drive one
  layer). This was deliberately removed from the output list because a layer
  action is not an output. Keep it as its own section on the input.
- An **action label** (`Crouch`) and, for virtual-menu regions only, an **icon**
  from a bundled offline icon library (lucide, game-icons) with search.
- An **origin**: inherited from an import (for example "FPS Template"), from
  Default (when editing a layer), or overridden here, with **Use inherited**
  available in place. "Use inherited" and "None" are different things.
- Copy / paste a binding, input capture, and "Advanced command settings" (timing,
  repeat, and so on).

### 4.4 Tuning pages

- **Trackpad tuning**: Motion (smoothing), Press & release, Trackball
  (glide/momentum), Haptics, Acceleration (with a curve editor).
- **Grip sensors**: live left/right contact status, activation bindings, sensor
  range and flicker guard (**one pair shared by both grips**, which is a
  firmware limit, so say so), calibration, grip haptic effect and intensity.
  **Pulse is fixed-strength** and the design must show that the dial does not
  apply to it.
- **Menu layout**: the virtual-menu appearance editor (size, position, font,
  label and key visibility, reveal on ring or touch) with a live preview that is
  pixel-identical to the overlay.
- **Press timing & more**: hold, tap and double-tap timings, turbo rate, and a
  per-profile **controller polling** override that shows the effective value and
  its source (this profile / an import / the global default of 3 ms).
- **AI Assistant**: natural-language mapping helper.

### 4.5 Studio pages (app-level, not per profile)

- **Configurations**: the library, with create, import, copy, rename, delete,
  templates and imports, and which files import which.
- **Application associations**: autoload a configuration when an app is focused.
- **Preferences**: theme, start with Windows, controller navigation
  on/off, overlay on/off, global polling default, and a pointer to the header
  Output control.
- **Global chords**: button chords that swap to a configuration while held, the
  Quick Access chord, and pause.
- **Device visibility** (HidHide): hide the physical controller from games so
  they only see the virtual one. It separates Connected from Hidden, keeps the
  device-interface details under Advanced, and explains why hiding matters.
- **Debug console**: live mapper log and command input.
- **Documentation**.

### 4.6 Dialogs and transient surfaces

Unsaved-changes guard (**Discard and switch** / **Keep draft and switch** /
Cancel), Manage layers (create, rename, delete, overrides with Restore
inheritance, "Move modeshifts into *layer* from *input*"), the Real World
Calibration guide, the gyro recalibration countdown, the keyboard picker, the
icon picker, the action picker (§6.9), the long-press/timing editor, the source
config editor, confirmations for delete, toasts, and the update banner.

---

## 5. Visual system

### 5.1 Direction

Aim for *Steam Input × PS5 settings*: layered charcoal and blue-grey planes, one
restrained cool accent, generous but not wasteful spacing, big confident page
titles with a small uppercase eyebrow, value pills, large physical-input glyph
badges, and a focus treatment you can read from across a desk. It should look
native, not like a web page:

- no default-looking checkboxes, switches, scrollbars or selects;
- custom scrollbars;
- no underlined links;
- no hover-only affordances;
- consider a **custom frameless title bar** that merges the window chrome with
  the app header (Tauri supports `decorations: false`). Design it, and design
  the fallback with native Windows chrome as well.

### 5.2 Starting tokens (current implementation, yours to refine)

| Role | Current value | Token |
|---|---|---|
| App frame / top bar | `#111820` | `--bg-1`, `--topbar-bg` |
| Content canvas | `#1b2027` | `--bg-0` |
| Sidebar | `#252d36` | `--bg-1-5`, `--sidebar-bg` |
| Row surface | `#292f38` | `--bg-2` |
| Control surface | `#414953` / hover `#4c5864` | `--bg-btn`, `--bg-btn-hover` |
| Input field | `#343d47` | `--bg-input` |
| Selected / focused row | `#35536b` | `--state-selected`, `--state-focused` |
| Accent | `#66c0f4` | `--accent` |
| Primary button | `#2b5878` bg, `#3183c4` accent | `--bg-btn-primary`, `--accent-primary` |
| Text | `#dfe6ed` / `#a5b4c2` / `#8b919a` / `#6a7078` | `--text-strong/-mid/-muted/-dim` |
| Borders | `rgba(255,255,255,.07)` / `.16` | `--border-1`, `--border-strong` |
| Live telemetry | `#a3d34e` | `--telemetry-green` |
| Warn / error / success pills | amber / red / blue families | `--pill-*` |
| Type | page 26 / section 16 / label 14 / hint 12 px | `--font-*` |
| Radii | card 12 / control 8 / pill 999 | `--radius-*` |
| Heights | control 44 / row 56 / header 56 / footer 40 | |
| Sidebar width | 224 px | `--sidebar-width` |
| Motion | 120 ms ease | `--transition-fast` |

The app currently uses the system UI font (Segoe UI Variable on Windows 11). You
may propose a bundled face such as Inter or similar, if you justify it.

### 5.3 Required token categories

Colour (surfaces by elevation, text, accent, semantic states, telemetry, layer
colour, inherited/override markers, focus), typography (family, sizes, weights,
line heights, tracking, and tabular numerals for values), spacing scale,
radii, control and row heights (compact / default / hero), sidebar, header and
footer dimensions, elevation (sparingly), focus ring (controller focus vs
keyboard focus-visible vs mouse hover must be distinguishable), motion
durations and easings, `prefers-reduced-motion` behaviour, and z-index layers.

### 5.4 Motion language

The owner explicitly wants **high-quality animation** as a core part of what
makes this feel premium. Design a motion system, document it in
`foundations.html` with live examples, and apply it everywhere:

- **Tokens:** durations (for example 90 / 160 / 240 / 400 ms plus a long
  "ambient" loop), easings (a crisp standard ease-out, an emphasised ease for
  entrances, and a restrained spring-like overshoot used sparingly), and
  staggers.
- **Focus movement:** the controller focus ring **glides** between rows rather
  than jumping. It is one shared highlight that translates and resizes, the
  way console UIs do it. The row under it lifts subtly.
- **Navigation:** page and section transitions (a short cross-fade + slide
  along the direction of travel), drill-in/back, and sidebar sub-items unfolding.
- **Disclosure:** binding rows expanding into their editor, pickers opening from
  the row that summoned them and returning to it, and dialogs scaling in from
  their origin.
- **Values:** slider fills and value pills animate on change, numbers tick, a
  toggle's state morphs, and a saved/applied confirmation has a moment of
  delight (a check that draws itself, for example).
- **Hardware:** a pressed button pulses on the diagram, stick and pad dots leave
  a short fading trail, trigger fill has a soft leading edge, grip contact
  glows, gyro traces scroll smoothly, and the connection state has its own
  animated states (searching, connecting, connected).
- **Ambient:** anything that needs attention (unsaved changes, capture waiting
  for a press, calibration running) gets a quiet animated state, never a
  blinking one.
- **Restraint and cost:** composited properties only (see §0), no animation
  longer than needed, idle screens that are genuinely still, and loops that
  pause when their window is hidden. Specify the `prefers-reduced-motion`
  version of each animation (usually a cross-fade or an instant change).

### 5.5 Migration table

In `HANDOFF.md`, map every new token to the current token it replaces, or mark
it new. Old names may stay as aliases, which is easier for Claude Code than a
rename.

---

## 6. Screens to design

Use realistic content from the example profile in §10 throughout. Do not use
lorem ipsum. Each screen shows its default state plus the listed variants.

**6.1 App shell.** Propose the structure. Requirements:

- It separates **app-level** navigation (Configurations, Associations, Chords,
  Device visibility, Debug, Preferences, Docs) from **configuration-level**
  navigation (Overview, Buttons, D-Pad, Triggers, Joysticks, Trackpads, Gyro,
  Layers, plus the Tuning pages).
- A slim **context header** shows configuration / applied / layer / mapping /
  unsaved state, and moves occasional tools into a menu or their contextual page.
- A **page header** has an eyebrow, title, one-line purpose and page-level
  actions.
- The **footer** is a persistent, context-sensitive controller hint bar (§9).
- Sub-sections of the active page appear in the sidebar. Choose between drill-in
  and accordion. The current accordion keeps free movement between top-level
  pages, and a mandatory Back step between pages would be a regression for
  someone tuning Buttons → Gyro → Buttons.
- Variants: collapsed rail, < 1060px drawer, disconnected controller, mapping
  off, unsaved changes, applied ≠ editing, layers active.

**6.2 Overview.** The controller is the hero. Show callouts with leader lines or
anatomical grouping (Steam groups "LEFT SHOULDER & GRIP" and so on, and this
grouping is tested and valued). Include the live state (pressed buttons, stick
positions, pad touches, trigger fill, grips) and quick settings in the Steam
landing-page style (gyro behaviour, sensitivity, invert, right-pad behaviour,
Calibrate). Variants: search active, "Available inputs" filter, a modifier's
"Show affected inputs" open, Details (raw values) on, a Steam Controller profile,
a DualSense profile, and a complex profile (Wardogs) next to a simple one.

**6.3 Buttons.** Grouped binding rows with the physical glyph on the left and the
value pill on the right. Show these row states: unbound, single command,
multi-command collapsed ("2 commands · Long press"), multi-command expanded,
inherited, overridden, has modeshifts (count plus the first shift), has a layer
action (in the layer colour, with the layer icon), enables gyro, focused,
open/editing, and capturing ("Press a key… Esc to cancel").

**6.4 Binding editor (an input opened).** The three-depth disclosure: summary,
then commands (activation + output + label per command, add command, reorder,
remove), then advanced (timing, repeat, turbo, fire delays, toggle, cycle). Also
the modeshifts on this input, the layer actions on this input, origin with
**Use inherited**, copy/paste, and a raw-token Details view. Base the
long-press settings dialog on the Steam reference (Hold to Repeat, Long Press
Time, Repeat Rate, Haptic Intensity, Fire Start/End Delay, Cycle Commands,
Toggle, Add sub command, Remove).

**6.5 D-Pad**, **6.6 Triggers** (behaviour, soft pull, full pull, analog output,
the tuning disclosure, a live bar with the soft point and full-pull thresholds
marked, and the raw count), **6.7 Joysticks** (mode picker as a Steam-style icon
list, click, touch, ring, deadzones visualised on a live stick plot, radial menu
segment editor).

**6.8 Trackpads.** Left and right side by side at 1440 and stacked at 1024. Show
the mode, click, touch, the region shape picker with visual previews of Grid /
4-way / 8-way / Radial, a region editor where you select a cell on the preview
and bind it, and the live touch dot.

**6.9 Action picker.** The replacement for dropdown-driven binding, modelled on
Steam's full-screen picker. It has category tabs across the top switched with
LB/RB: **Gamepad** (a controller visual with selectable buttons, which shows the
virtual Xbox or DS4 names), **Mouse**, **Keyboard** (a full visual keyboard),
**Numpad**, **System** (media, volume, screenshot), **JSM** (built-ins, gyro,
calibrate, haptics), and **Configurations** (Load configuration), plus a
**Capture** mode and a **Custom/raw** text entry. Selecting an action returns
you to the originating input with the new value visible. Variants: each
category, search, a "not supported by this output device" state, and focus on a
keyboard key.

**6.10 Behaviour/mode picker.** Steam's icon list modal (None / Gyro To Mouse /
Mouse Region / …) applied to stick modes, pad modes, trigger modes and gyro
output. Each option shows an icon, name and a one-line explanation, with the
explanation panel beside the open list. It must fit at every width.

**6.11 Gyro.** Use the full content width. Steam's gyro page is the reference:
a left sub-nav (General, Angle Calibration, Sensitivity, Momentum, Orientation,
Trigger Dampening, Mouse Output) and full-width rows with a wide slider,
right-aligned value pill and description underneath. Organise JSM's real settings
(§4.2) into clear sections. Suggested sections: **General** (activation, button,
output), **Calibration** (RWC, in-game sens, easy guide, recalibrate),
**Sensitivity** (static/curve, graph, curve editor, shift), **Noise &
Steadying**, **Orientation** (space, axes, roll), **Dampening** (trackpad-press
damping, decel brake) and **Diagnostics**. The diagnostics section is an
**instrument panel**: live gyro speed trace, sample rate, noise floor versus
deadzone and steadying thresholds drawn on the same scale, and calibration state.
Also design the slider in **adjust mode** (controller left/right changes the
value, fine/coarse toggle, B to leave).

**6.12 Layers.** Show the editing-layer selector, the active-layers readout
("Active: Vehicles + Comms"), the Manage layers dialog, per-value inherited and
override markers across Buttons and Gyro, and an input's layer-actions section.

**6.13 Trackpad tuning**, **6.14 Grip sensors** (with live contact meters, and
Pulse shown as fixed-strength), **6.15 Menu layout** (appearance editor with the
overlay preview), **6.16 Press timing & polling** (effective value + source).

**6.17 Studio pages**: Configurations library (cards or list with applied /
editing / template / imported-by markers), Application associations, Global
chords, Device visibility, Debug console, Preferences, Documentation, AI
Assistant.

**6.18 In-game overlay** (a separate transparent always-on-top window, drawn
over games). It shows pad and stick menus in Grid, 4-way, 8-way and Radial
shapes, with label, key and icon per region, the live touch dot, the region about
to fire, and the configured size and position. It must read in half a second
mid-firefight, so use high contrast, legible type over bright and dark game
scenes, and no ornament beyond purposeful motion.

**6.18a Gyro calibration HUD, the signature animation.** This already exists
and works: `hud.html` / `src/hud/CalibrationHud.tsx` / `Hud.module.css`. It is a
**380 × 150 px**, click-through, always-on-top window centred 48 px from the top
of the screen, over games. Whatever starts a calibration (the Studio button, a
global chord or a binding) shows it. It currently has three phases, driven by
telemetry at ~30 Hz:

1. **Waiting**: a countdown before sampling starts ("Put the controller down",
   the remaining seconds, and the start delay the user configured).
2. **Calibrating**: the gyro is being sampled, with a progress bar driven by
   remaining/total ms and a simple line-art Steam Controller whose "rotation
   arcs" animate.
3. **Done**: "Calibrated" with a check, lingering for 1.6 s, then gone.

Redesign it as the product's **hero moment**, in the spirit of the **iOS Face ID
authentication animation**: a contained, glassy, jewel-like widget in which
something is visibly *working*. Examples: a ring of fine segments that fills as
samples land, a scanning sweep, particles or dots settling to a centre as the
reading stabilises, a controller silhouette that gently levitates and then
settles, and a final morph from the working state into a crisp self-drawing
check with a small bloom. The design needs:

- a distinct animated treatment for each phase, and **choreographed transitions
  between phases** (the countdown resolving into the scan, the scan resolving
  into the check), plus an exit;
- a **failure/cancelled** state (the controller moved, or the run was cancelled),
  so the sequence has a designed sad path even though the engine does not report
  it yet (note this in Open questions);
- progress that reads at a glance over both a bright and a dark game scene;
- motion at 60 fps or better, built from CSS/SVG so it ports straight into the
  existing component, with the progress interpolated between the ~30 Hz
  updates so it never looks steppy;
- `overlay/calibration-hud.html` with a demo that loops all phases (mirror the
  existing `hud.html?demo=waiting|calibrating|done` switch), shown over a
  light and a dark game screenshot background;
- the reduced-motion version.

The same visual language should carry into the **in-app** calibration surfaces:
the Gyro › Calibration section, the Real World Calibration guide, and the
Recalibrate gyro action.

**6.19 System states.** No controller connected, controller connecting, mapper
not running, first run with an empty library, an error loading a
configuration, update available, a long operation in progress, toasts
(success/warn/error), and a destructive confirmation.

---

## 7. Component library (`components.html`)

Every component, in every applicable state: default, hover, **controller
focus**, keyboard focus-visible, pressed, selected, open/expanded, **adjusting**
(value edit mode), **capturing**, disabled (with the reason shown), inherited,
overridden, warning, error, loading, and empty.

Required components: navigation item (plus sub-item and section label), context
header segments, page header, footer hint bar and hint chip, section heading,
**setting row** (label + description + control, in compact, default and tall
variants), **binding row**, **value pill** (key, mouse, gamepad, system, JSM,
layer, raw, unbound, multi), **physical input glyph badge**, origin marker
(inherited from *X* / override / Use inherited), usage badge, slider (with ticks,
fine/coarse, value pill, units), stepper/number field, toggle (not an HTML
checkbox look), segmented control, select trigger + icon list modal +
explanation panel, primary/secondary/tertiary/danger buttons, icon button,
disclosure/expandable section, tabs (LB/RB switchable), menu, dialog, drawer,
toast, banner, tooltip, empty state, search field with filter chips, live meters
(stick plot, trigger bar, pad touch surface, grip contact, gyro trace), curve
editor, and keyboard key cap.

---

## 8. Controller artwork and glyphs

**The rule for this section: the Steam Controller's geometry is the
foundation, so make it more striking; redo everything else.**

- **Elevate: the Steam Controller (2026) art.** The owner is happy with the
  controller *shape* in `src/assets/steam-controller-front.svg` and
  `steam-controller-back.svg`: its proportions, and where each input sits. Treat
  that geometry as correct. If you can make the drawing **higher quality or more
  visually striking**, do so. It currently reads as thin black filled outlines,
  which look flat on the dark UI. The owner's own suggestion is a starting
  point, not a limit:
  - **light/white outlines** instead of black;
  - **thicker line weights** by default;
  - a **heavier stroke on the main shell** than on the inner details, so the body
    has presence and the drawing stops feeling flat;
  - consider subtle depth as well: an inner rim or bevel line, a soft tonal fill
    for the shell, recessed pads and stick wells, and gentle light on the
    top edge.

  Show two or three rendering directions side by side in `controllers/`,
  recommend one, and draw the pressed, focused and bound states in that style. It
  must stay crisp at every size the app uses (from the small footer/HUD
  controller up to the Overview hero) and work in both themes.

  **Hard constraint:** keep the artwork in the same **1117 × 750 viewBox**, with
  every input at the same coordinates. `ControllerStatusSvg.tsx` draws the live
  stick dots, pad touches, trigger fills and highlights at fixed positions in
  that space, so moving or rescaling the geometry would misalign all of them. If
  a line weight change makes an edge look shifted, adjust it optically without
  moving the input's centre.
- Each input becomes a separately
  addressable SVG element with an `id` that uses JSM's names (the map is below),
  so the app can highlight, press and attach callouts to it. Include the states
  idle, pressed, focused/selected, and bound vs unbound. The paddles and grips sit
  on the back, so use the existing back view as an inset or give them a clear
  convention.
- **Redo: every other icon and glyph in the app.** The current set is
  functional but amateur, and nothing in it is a reference for quality. That
  covers the input glyphs (`components/glyphs/InputGlyph.tsx`,
  `inputMarks.tsx`), the sidebar and navigation icons (`components/NavIcons.tsx`),
  the footer hint glyphs, status and badge icons, the layer icon, and the
  behaviour/mode picker icons (stick modes, pad modes, trigger modes, gyro
  outputs, action picker categories). Treat it as a from-scratch icon system at
  the standard of a first-party console UI (PS5, Xbox, Steam Big Picture):
  - **one drawing grammar** throughout: grid, stroke weight, corner radius,
    terminals, optical sizing and fill style. Specify it in `foundations.html` so
    new icons can be added later in the same hand;
  - **controller glyphs as proper button badges**, the way consoles draw them:
    crisp solid face-button discs with their family's own markings (Xbox
    lettered, PlayStation shapes, Nintendo lettered, Steam lettered), shoulder
    and trigger shapes that read as the physical part, stick glyphs with click,
    touch, ring and direction variants, D-pad directions, menu/view/home/QAM
    buttons, and dedicated glyphs for **paddles L4/L5/R4/R5, left/right grips,
    left/right pad click, pad touch, pad regions (numbered), stick-wheel
    segments, and gyro**. The Steam Controller glyphs must match the approved
    controller art;
  - **pixel-snapped** and legible at 16, 20, 24, 36 and 48px, with hand-tuned
    small sizes rather than scaled-down large ones, and state colours (default,
    pressed, focused, disabled);
  - one consistent family per controller (Steam, Xbox, PlayStation, Nintendo);
  - unfamiliar inputs (grips, paddles, pad regions) always pair the glyph with a
    name;
  - **other controllers' hero art** (DualSense, Xbox Series, Switch Pro, and a
    generic fallback) drawn in the same rendering style as the refined Steam
    Controller art, since today they borrow DualSense geometry. The existing
    `design/*.svg` files show the shapes but are not the quality bar.
  - Deliver every icon and glyph as a clean, optimised inline-ready SVG in
    `glyphs/` and `icons/`, with a contact sheet in `foundations.html`.
- **Steam Controller (2026) JSM names**: A/B/X/Y = `S`/`E`/`W`/`N`, LB/RB = `L`/`R`,
  LT/RT = `ZL`/`ZR` (full pull `ZLF`/`ZRF`), View/Menu = `MINUS`/`PLUS` (written
  `-`/`+` in configs, but use the word forms as SVG ids), Steam = `HOME`,
  Quick Access = `MISC1` (reserved globally), right pad click = `MISC2`, left pad
  click = `MISC3`, right grip = `MISC5`, left grip = `MISC6`, L4 = `LSL`, L5 =
  `LSR`, R4 = `RSR`, R5 = `RSL`, stick clicks = `L3`/`R3`, pad regions =
  `LT1–LT25` / `RT1–RT25`, and stick-wheel segments = `LM1–LM25` / `RM1–RM25`.
  Use these as the SVG ids.

---

## 9. Controller navigation and focus model

Today the pad drives the app through a mapping that turns it into a keyboard
while Studio is focused. Design around exactly these inputs:

| Pad | Key | Meaning |
|---|---|---|
| D-pad / left stick | Arrows | Move focus spatially |
| A | Enter | Activate / confirm |
| B | Esc | Back: close the innermost thing, then retrace navigation |
| X | Space | Toggle / secondary action |
| Y | *(free)* | Propose a use, for example Details/Options or Search |
| LB / RB | Shift+Tab / Tab | Previous / next section or tab |
| LT / RT | PgUp / PgDn | Previous / next page |
| Right pad / right stick | Mouse | Cursor; pad clicks = mouse buttons |

Specify:

- **Focus ring**: a visible, unmistakable controller focus, distinct from mouse
  hover, that follows rounded corners and never shifts layout.
- **Focus scopes**: sidebar, page, dialog, picker. Specify the entry point of
  each scope and focus restoration when you return to it.
- **Back behaviour**: close popup → close detail → return to the originating page
  at the same layer, scroll position and input (for example Overview → Y editor
  → Back → Overview with Y focused).
- **Adjust mode** for sliders and steppers: enter with A, change with left/right,
  fine/coarse with X, leave with A or B, with a visible "adjusting" state.
- **Capture mode**: while an input is being captured, navigation is suspended and
  the footer says so. There must always be a guaranteed keyboard/mouse escape in
  case the pad itself is the thing being rebound.
- **Footer hints** change with context (row focused, slider adjusting, picker
  open, dialog, capture) and use the connected controller's glyph family.
- **Automatic scrolling** keeps focus in view with comfortable margins.
  Disabled items stay focusable when they carry an explanation and are skipped
  when they don't. Specify which.
- `prototype.html` must demonstrate this across Overview → an input → the action
  picker → back, and Gyro slider adjust mode.

---

## 10. Example content (use it; it is real)

- **Configurations:** `Wardogs` (imports `FPS Template`), `Wardogs Menu`,
  `Cyberpunk`, `Gamepad`, `FPS Template` (a template, not a profile). Applied:
  `Wardogs`. Editing: `Wardogs`.
- **Layers in Wardogs:** `Comms`, `Vehicles & utility` and `Tactical map`. For
  example, L4 holds Vehicles & utility, R4 holds Comms, and a stick click toggles
  Tactical map. Active example: `Wardogs · Vehicles + Comms`. Comms overrides Y
  with **Squad push**.
- **Bindings:** Right grip → *Enables gyro* (no direct binding, inherited from
  FPS Template); right trackpad → Mouse (inherited); both pads have a
  **4-way button pad** shape. Left pad regions: **Rotate buildable** (R),
  **Toggle snapping** (B), **Dismantle** (V), **Deploy supply crate** (G). Right
  pad regions: **Ping**, **Melee**, **Inventory**, **Sights**, each with a
  game-icons icon (convergence-target, knife-thrust, knapsack, crosshair). B
  (`E`) → **Crouch** (`C`), overriding the template's Left Ctrl. LT full pull
  → Left Shift. L4 + Menu → **Load Wardogs Menu**. Right stick → **Radial
  menu**, 8 segments (**Primary**, **Secondary**, Slot 3, **Equipment**, Slot 5…
  bound to 1–8, with rifle/pistol/defib icons), overriding the template's Mouse
  Aim. Quick Access → reserved by the global Quick Access chord.
- **Gyro:** Hold to enable (Right grip), output Mouse, Real World Calibration
  **35.856**, In-game sensitivity **0.5**, gyro space **Local**, min sens
  **1 / 1** (template: 3 / 3), polling tick 1 ms, sample rate 1000 Hz.
- **Cyberpunk:** LT/RT → analog virtual Xbox triggers (they must *not* read as
  "Unbound").

---

## 11. Handoff mapping (the implementation Claude Code will modify)

Stack: React 18 + TypeScript, Tauri 2, Vite, **CSS modules** + shared global CSS
(`styles/tokens.css`, `base.css`, `forms.css`, `panels.css`, `layout.css`,
`overlays.css`, `controller-workspace.css`), **Radix** primitives (select, menu,
slider, dialog), i18next (text comes through `t()`, but design in English only). There is no router and no state library, so
do not design anything that assumes them.

In `HANDOFF.md`, map each of your components onto the file that owns it today:

| Area | Current component(s) |
|---|---|
| Shell, sidebar, header | `App.tsx` (`PrimaryNav`, utility bar), `SideNav.module.css`, `TopBar.module.css`, `LayerBar.tsx` |
| Footer hints | `ControllerGlyphBar.tsx` |
| Overview | `OverviewPage.tsx`, `ControllerStatusSvg.tsx`, `BindingLabelLegend.tsx` |
| Input pages | `KeymapControls.tsx`, `KeymapSection.tsx`, `ButtonMappingCard.tsx`, `ButtonBindingsCard.tsx`, `BindingCommandCard.tsx`, `BindingRow.tsx` |
| Binding editing | `BindingEditor.tsx`, `AdvancedBindingEditor.tsx`, `InputModeshifts.tsx`, `ActionPicker.tsx`, `KeyboardBindingModal.tsx`, `IconPicker.tsx`, `HapticOutputPicker.tsx` |
| Origin / inheritance | `InheritedBadge.tsx`, `SettingOrigin.tsx`, `ConfigScope.tsx` |
| Sticks / pads / grips | `StickSettingsCard.tsx`, `TouchpadSettingsSection.tsx` (+ `TouchpadGridSection`, `TouchpadStickSection`, `TouchpadSensorSection`, `TouchpadAccelSection`, `TouchpadHapticSection`), `GripSettingsSection.tsx`, `MenuPreview.tsx`, `OverlayLayoutSection.tsx` |
| Gyro | `GyroBehaviorControls.tsx`, `SensitivityControls.tsx`, `NoiseSteadyingControls.tsx`, `AccelCurveEditor.tsx`, `SensitivityGraph.tsx`, `CurvePreview.tsx`, `TelemetryBanner.tsx`, `RwcGuideModal.tsx` |
| Primitives | `NumberField.tsx`, `ui/Slider.tsx`, `ui/Select.tsx`, `ui/AppSelect.tsx`, `ui/Menu.tsx`, `AdvancedDisclosure.tsx`, `HelpButton.tsx`, `Card.tsx`, `glyphs/InputGlyph.tsx` |
| Studio pages | `ProfileManager.tsx`, `AutoloadManager.tsx`, `GlobalChordsPage.tsx`, `HidHidePage.tsx`, `MappingDebugPage.tsx`, `PollingSettings.tsx`, `HelpDocsPage.tsx`, `AiMappingPage.tsx`, `ConfigEditor.tsx` |
| Misc | `BatteryIndicator.tsx`, `ToastHost.tsx`, `UpdateBanner.tsx`, `ThemeToggle.tsx`, `LanguageSelect.tsx` |
| Focus engine | `hooks/useKeyboardNav.ts` (spatial focus, dialogs, page stepping, focus memory), `hooks/useSectionScrollSpy.ts` |
| Overlay | `overlay.html` + `src/overlay/` (separate ~6 kB bundle, so keep its CSS self-contained) |
| Calibration HUD | `hud.html` + `src/hud/CalibrationHud.tsx`, `Hud.module.css` (its own window, driven by `src-tauri/src/services/hud.rs`; keep it self-contained too) |

Where your design needs something the current structure cannot express, say so
explicitly in **Open questions** rather than quietly assuming it.

---

## 12. Open product items that need UI (from `docs/TODO.md`)

Design a place for each of these, even where the engine work is pending:

- **Cursor-visible layer switch (TODO-6):** a "Cursor visible" pseudo-input that
  can be used as a modeshift/layer trigger (for example "When a cursor appears →
  right pad becomes Mouse"). Label it as a heuristic, with an on/off control and
  a debounce setting.
- **Custom icon import (TODO-7 follow-up):** an "Import icons" source in the icon
  picker beside the bundled lucide and game-icons sets.
- **Haptic effects (TODO-24/25):** a picker listing Tick, Click, Tone, Rumble,
  Sweep and Pulse, each with a preview button and intensity. Pulse is
  fixed-strength and Noise/Script are hidden.
- **Startup / shutdown sounds (TODO-26):** choose from 14 named sounds (Warm and
  Happy, Invader, Controller Confirmed, Victory!, Rise and Shine, Shorty, Warm
  Boot, Next Level, Shake It Off, Access Denied, Deactivate, Discovery, Triumph,
  The Mann), each with a preview. Explain that JSM plays it on connect and on its
  own power-off, and the firmware jingle still plays.
- **LED brightness as a binding (TODO-27):** a brightness output (0–100). Colour
  is not supported on this controller, so don't show a colour picker.
- **Gyro calibration via chord + HUD (TODO-28):** the HUD now exists (§6.18a).
  Design the settings around it: the start delay, the bindable Calibrate gyro
  action, and a HUD on/off preference.
- **Grip sensors (TODO-17/29):** a single shared range/flicker-guard pair is a
  firmware fact, so design it as one control labelled "both grips". Add a
  per-side **release delay**. Add a gentle warning when a held layer is bound to
  an unreliable left grip.
- **Layers:** a way for a layer to say it **suppresses holds while active** (open
  request: in menu mode, L4 should not hold Vehicles).

---

## 13. Definition of done for the design

- Every item in §4 and §12 has a designed home, reachable by controller, and
  `HANDOFF.md` has a checklist that ticks each one off by screen.
- Shell, page templates and focus model are designed from scratch rather than
  re-skinned, and a side-by-side against the current screenshots reads as a
  different, more premium product.
- Every component in §7 exists in every state and uses tokens only.
- Screens exist at 1440×900 and 1024×720 (dark), key screens in light, and the
  narrow drawer is shown.
- `prototype.html` can be driven end to end with arrow keys / Enter / Esc / Tab
  / PgUp / PgDn, with a visible focus ring and correct footer hints.
- The Steam Controller art keeps its approved geometry and 1117 × 750
  coordinates, is visibly more striking than today's thin black outlines, and
  every input is a JSM-named hotspot. **No icon or glyph from the current app survives unchanged.**
  The new icon system and per-family glyph sets cover every input and UI
  concept, share one documented drawing grammar, and hold up at 16px as well as
  48px.
- The motion system in §5.4 is documented with live examples and applied across
  focus, navigation, disclosure, values and hardware readouts. The calibration
  HUD (§6.18a) is a finished, choreographed piece that feels as polished as Face
  ID. Everything runs smoothly alongside live telemetry, and every animation has
  its reduced-motion version.
- `HANDOFF.md` gives exact measurements, the token migration table, the component
  → file map, the copy deck (Title Case for headings, labels, options and
  actions; sentence case for prose) and the open questions.
