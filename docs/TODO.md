# JSM Studio — open requests and feedback

Running list of Luke's requests and feedback, kept in the repo so work survives
across sessions. Newest items go at the bottom of **Open**.

**How to use this file**

- One heading per item, with a stable `#id` so it can be referenced in commits
  and conversation ("picking up TODO-3").
- Keep **Context**, **Why**, and **Done when** filled in. "Done when" is the
  acceptance test — it is what a future session checks against, and it is the
  part that stops an item drifting into something else.
- Record findings under **Notes** as they are learned, including dead ends.
  A ruled-out approach is worth as much as a chosen one.
- When an item is finished, move it to **Done** with the date and the commit,
  and leave the entry intact rather than deleting it.
- If an item turns out to be wrong or unwanted, move it to **Dropped** with the
  reason. Do not silently remove entries.

---

## Open

### TODO-1 — Inherited indicator on every exposed setting, not just button cards

**Status:** open · raised 2026-09-10

**Context**

Import resolution landed in 0.7.23 (`src/utils/configIncludes.ts`,
`src/hooks/useConfigIncludes.ts`). Every read now goes through the
import-resolved text, so inherited *values* are correct everywhere. The
`InheritedBadge` that says where a value came from, though, is rendered in
exactly one place: `ButtonMappingCard.tsx`, fed from
`KeymapControls.tsx:1135`, keyed on the whole input's command.

So `Wardogs.txt` — the first profile to import a template — shows the badge on
things like the left-stick directions, and shows nothing on:

- every settings field (sensitivity, trackpad tuning, grip sensors, timing)
- trackpad mode dropdowns, grid size, and the `RT1..RT9` grid cells
- individual binding rows inside a card, which is the wrong granularity anyway:
  one input can hold several bindings (tap, hold, chord, double) and they can
  come from different files

**Why**

An inherited value is a ghost — it is live and it is real, but it is not in the
text the editor shows, so someone hunting for it in the config editor cannot
find it. The badge is the only thing connecting the two, and a badge that
appears on some controls and not others is worse than none: its absence reads
as "this one is mine", which is a lie.

**Done when**

- Every UI control that exposes a config value shows the indicator when that
  value's effective definition comes from an imported file.
- The indicator is per *binding*, not per input, wherever an input holds more
  than one binding.
- Overriding an inherited value drops the indicator on that control alone.
  (Already the behaviour — `inheritedFrom` returns null once the profile owns
  the key — so this needs a test, not an implementation.)
- A regression test covers at least one settings field and one grid cell, not
  just a button card. Extend `tests/config_imports_ui_regression.cjs`.

**Notes**

- `inheritedFrom(resolution, INCLUDE_ROOT, key)` already answers this for any
  key, including chorded ones (`MISC2,RIGHT_TOUCHPAD_MODE`). The work is
  plumbing and per-control placement, not resolution logic.
- Worth considering a shared wrapper (something like `<Inheritable configKey>`)
  rather than threading two props into every field, given how many controls
  there are. `ConfigScope` in `src/hooks/configContext.ts` is a precedent for
  wrapping a group of controls with config-derived state.

---

### TODO-3 — Saving a profile drops its standalone comments

**Status:** open · raised 2026-09-10

**Context**

`parseConfigText` skips any line whose first token starts with `#`, so pressing
Save rewrites the profile without its comment lines. Inline comments survive
(`E = C # Crouch`) because they ride along on the assignment, but a comment on
its own line does not.

This ate the whole explanation block in `Wardogs.txt` — the real-world
calibration table, the note about WARDOGS not scaling proportionally, and every
section banner — the first time the profile was saved from the app.

**Why**

Configs being plain text that a person can read and annotate is the reason for
working in them at all. A GUI that silently deletes the prose on save makes the
file a worse artefact than the one the user wrote.

**Done when**

- Saving a profile preserves standalone comment lines.
- A comment stays attached to what it describes, rather than being pooled at the
  top or bottom.
- A regression test round-trips a commented profile and asserts the comments and
  their positions survive.

**Notes**

- Predates the import work; it just became very visible because imports
  encourage long explanatory profiles.
- The hard part is anchoring: the serializer reorders lines into canonical
  sections, so a comment needs to travel with its following assignment. A
  banner comment with a blank line after it has no obvious anchor — decide
  whether those attach to the next section or are preserved verbatim.

---

### TODO-4 — Trackpad slow-pan smoothness, after the reverted attempt

**Status:** open · raised 2026-09-11

**Context**

Two backend passes (`trackpad-wardogs-smoothness.md`, then
`trackpad-pan-protection.md`) tried to smooth slow trackpad panning. The second
made the orbit-and-recenter test measurably worse and both were reverted; the
installed backend and the repo bundle are back at baseline `e994dfe` /
`E614E33A…`. Full analysis in
[trackpad-pan-protection-postmortem.md](trackpad-pan-protection-postmortem.md).

The original complaint is therefore still open: a slow pan at Wardogs settings
shows microstutter, and at that sensitivity the swipe averages well under one
mouse count per display frame, so integer injection is quantising it.

**Why**

The pad is the primary aiming input. Everything else about the profile is tuned
around it, and the quantisation floor is a real limit rather than a bug, so the
fix has to come from somewhere other than more filtering.

**Done when**

- A slow orbit-and-recenter pan is smoother **in game**, confirmed by playing it,
  not by a synthetic CV number.
- Lag-compensated residual distortion on a swept-speed input stays at 0.00%,
  matching the baseline resampler. Any stage that fails this is rejected.
- No release path discards measured displacement that the hand actually produced.
- The regression suite gains a swept-speed distortion test, since every existing
  harness passed the reverted code.

**Notes**

- The five rules at the end of the postmortem are the constraints. The first one
  is the important one: the delivery window must not vary with speed, or the
  stage stops being a pure delay and starts reordering motion.
- **2026-09-11: both salvaged fixes are reapplied and installed**, separately
  from everything else that was reverted, and still awaiting the in-game check.
  - Partial lift suppression no longer clears the whole resampler queue on every
    poll; only a fully suppressed lift cancels pending output. This is the one
    with a demonstrable effect: `touch_lift_partial_harness` passes against the
    fix and fails against `e994dfe`, where a 20% pressure dip mid-glide delivered
    roughly half of what the hand asked for instead of the graded 83%.
  - `TouchPositionFilter` keeps the position recurrence in double precision.
    `touch_filter_precision_harness` locks the property, but **passes against the
    single-precision predecessor too** — the benefit did not reproduce here, and
    Codex's own figure for it was 7.45e-9 pad widths. Kept as correctness
    hardening, not as a fix for anything observed.
  - Deliberately NOT reapplied: the adaptive held-coordinate stop window. It is a
    real fix for a real bug, but `clamp(.040/cutoff, .016, .250)` evaluates to the
    original 16 ms at any cutoff at or above 2.5 Hz, so it is inert at every
    shipped preset and only changes behaviour below that — where it delays a
    stop by up to 250 ms. Worth doing on its own terms, with its own in-game
    check, rather than riding along with these.
- The most promising untried lever is count density, and it is independent of any
  filtering: halving in-game sensitivity while doubling `RIGHT_TOUCHPAD_SENS`
  (with `IN_GAME_SENS` 0.5 to preserve the existing gyro calibration) gives the
  game twice as many counts at half the angle each. The reverted report measured
  frame-to-frame variation falling from 0.498 to 0.143 counts from this alone.
  Worth testing on the baseline backend before writing any code.
- The reverted diff and the comparison simulations are preserved outside the repo
  in the session scratchpad; ask before assuming they are gone.
- `python` is not installed on this host — only the Microsoft Store stub. The
  `python …` repro commands in both reverted reports cannot run as written. Node
  is available.

---

### TODO-5 — Diagonals for the 4-way button pad

**Status:** open · raised 2026-09-11

**Context**

`GRID_SHAPE` landed with `RECTANGLE` and `FOUR_WAY` (see `TouchGridRouting.h`).
The enum was deliberately written so `EIGHT_WAY` appends before `INVALID`
without changing what any existing name means.

**Why**

Steam's button pad offers 8-way, and diagonals as their own bindable regions is
the difference between a d-pad you can strafe diagonally on and one you cannot.

**Done when**

- `EIGHT_WAY` divides the pad into eight wedges, region order clockwise from the
  top, and `touchGridRegionCount` returns 8 for it.
- The preview draws eight wedges and names them, the way the four do now.
- `touch_four_way_harness` grows the equivalent boundary and deadzone cases.

**Notes**

- The wedge maths is `touchFourWayCell`; eight-way is the same idea with
  `atan2` and a 45-degree offset rather than the `|dy| >= |dx|` comparison.
- Steam also has an "overlap" option where a diagonal presses both neighbouring
  cardinals at once. That is a *third* behaviour, not a region count — decide
  whether it belongs as its own setting before assuming EIGHT_WAY covers it.

---

### TODO-6 — Switch layer when a mouse cursor appears on screen

**Status:** open · raised 2026-09-11

**Context**

Steam Input can activate an action set layer when it detects a cursor on screen,
so a pad that aims in gameplay becomes a pointer the moment a menu opens. Luke
wants the equivalent.

This is feasible on Windows without injecting into the game. `GetCursorInfo`
reports global cursor state: `CURSOR_SHOWING` clears when a game calls
`ShowCursor(FALSE)`, and `ci.hCursor` goes null or changes to a blank bitmap for
games that hide the pointer by swapping the cursor instead. Polling it at 20-30 Hz
costs nothing.

**Why**

It is the one piece of Steam Input's model JSM Studio has no answer to, and the
workaround — manually switching profiles mid-game — is exactly the kind of thing
a mapper should do for you.

**Done when**

- A pseudo-button (working name `CURSOR_VISIBLE`) is held for as long as a cursor
  is detected, and released when it goes away.
- It chords like any other button, so `CURSOR_VISIBLE,RIGHT_TOUCHPAD_MODE = MOUSE`
  works with no new machinery, and the existing modeshift editor can target it.
- Detection is debounced, so a cursor flickering for one frame does not shift.
- It can be turned off, since the heuristic will be wrong for some games.

**Notes**

- The pseudo-button approach is the important design call: adding a whole
  "action set layer" concept duplicates what chords and modeshifts already do.
  Everything downstream — the GUI, `readShifted`, the config format — then works
  unchanged.
- `ButtonID` is a flat enum and the grid regions are addressed by offset from
  `FIRST_TOUCH_BUTTON` / `FIRST_LEFT_TOUCH_BUTTON` / `FIRST_RIGHT_TOUCH_BUTTON`.
  A new entry must be appended somewhere that does not shift those offsets, or
  every existing grid binding silently retargets.
- Two failure modes, with opposite consequences. Both are about *visibility*;
  `SetCursorPos` recentring is about position and does not affect either.
  - **False negative (harmless):** the game draws its own pointer inside the
    scene and never shows the OS cursor, so menus look identical to gameplay and
    nothing ever shifts. Common in controller-first and console-port UI.
  - **False positive (dangerous):** the game hides the cursor by *drawing a
    blank one* — `SetCursor` with a fully transparent bitmap, or a blank window
    class cursor — instead of `ShowCursor(FALSE)`. `CURSOR_SHOWING` stays set
    for the whole session and `hCursor` is a valid handle to an invisible image,
    so the naive check shifts layers mid-firefight.
  - `hCursor != IDC_ARROW` does not separate these: it means "custom", not
    "invisible". The robust discriminator is to read the cursor bitmap
    (`GetIconInfo` then `GetDIBits`) and test whether every pixel is fully
    transparent. Not exotic, but it is the difference between a feature that
    works and one that fires at random.
- A cursor from a *different* window (an alt-tabbed app, the JSM Studio window
  itself) would also trip it. Gate on the foreground window being the game, or
  on the mapper's own active-profile target.
- Steam does this well partly because its overlay is already injected into the
  game. Unhooked, this is strictly a heuristic and should be sold as one.
- Verify against a real game with a menu before building any UI for it. The
  detection heuristic is the risky part; the plumbing is not.

---

### TODO-7 — Icons on overlay regions, via Iconify

**Status:** DONE 2026-09-12 · uncommitted

**Context**

The trackpad overlay draws each region's action name and key. An icon above
those would make a menu readable at a glance mid-firefight, which is the whole
point of the overlay. Iconify is the intended source:
<https://icon-sets.iconify.design/>.

**Done when**

- A binding can be assigned an icon, stored in the profile the way `# @label`
  and `# @overlay` are, so it travels with the config.
- The overlay renders it above the label; the editor offers a searchable picker.
- Icons resolve offline. The overlay must not depend on a network call to draw,
  and the published app must not fetch from a CDN at runtime.

**Notes**

- **Out of scope for now, but a recorded requirement:** letting users import
  their own icons. Whatever storage the Iconify work picks should not make that
  harder later — a name that resolves through a lookup, rather than a hardcoded
  Iconify-only identifier.
- Iconify ships per-set npm packages, so bundling only the sets actually used
  keeps this offline without shipping a 200k-icon blob.

**What was done**

- `# @icon RT1 = game-icons:ak47`, parsed and written by `utils/bindingIcons.ts`
  exactly the way `# @label` is, so an illustrated profile still loads anywhere.
- `utils/iconLibrary.ts` resolves a name to SVG **entirely offline**. Two sets
  are bundled: `lucide` (0.6 MB, general) and `game-icons` (6.4 MB, game
  actions). Each is a separate vite chunk loaded lazily and independently, so a
  profile using only lucide never reads the big one, and the overlay's own
  bundle is still ~5 kB. Adding a set is one entry in `SOURCES`.
- Icons are resolved when menus load, not when a thumb lands, because loading a
  set is a multi-megabyte disk read and the overlay has to appear instantly.
- Rendered inline in both the overlay and the editor preview, sized from the
  same `--overlay-font` variable so one control scales a region together.
- `IconPicker` in the binding card, beside the action name, with per-set search.
  It only reads a set once someone opens it.

**Still open from this item**

- Custom icon import, as above. `iconLibrary`'s `SOURCES` map is the seam: a
  user-supplied source reads from disk instead of a package, and nothing above
  that layer knows where an icon came from.

---

### TODO-8 — Radial menus, and menus on the sticks

**Status:** open · raised 2026-09-12

**Context**

A GTA-V-style weapon wheel is a better fit than a grid for several of the things
a pad menu is wanted for, and the sticks should be able to drive one too, with
the same overlay treatment as the pads — including drag positioning.

**Done when**

- A radial/donut region shape exists in the backend beside `RECTANGLE` and
  `FOUR_WAY`, with the overlay's `hitTestRegion` matching it coordinate for
  coordinate in `tests/overlay_layout_regression.cjs`.
- The overlay renders it, reusing the existing placement, label, key, font and
  drag-positioning machinery rather than a parallel implementation.
- A stick can drive a menu, not just a pad.

**Notes**

- `GridShape` was deliberately written so new shapes append before `INVALID`
  without changing existing values, so adding `RADIAL` breaks no profile.
- Deadzone already exists and means the same thing for a donut's hole.

**What was done (2026-09-12) — the pad half**

- `GRID_SHAPE = RADIAL` in the backend (`touchRadialCell`). Segment count is
  rows x columns, so `GRID_SIZE = 8 1` is an eight-segment wheel; segment 0 is
  *centred* on up and they run clockwise, which makes a four-segment wheel
  exactly a `FOUR_WAY`. `GRID_DEADZONE` is the hole in the middle.
- Rendered as annular sectors in both the overlay and the editor preview from
  one shared `radialSegmentClip`, with labels placed inside their own slice.
- The editor preview now calls the overlay's own `hitTestRegion` instead of
  reimplementing the maths, so the two cannot disagree about what is selected.
- `tests/overlay_layout_regression.cjs` sweeps 4851 coordinates across five
  radial layouts against the real compiled backend; the C++ harness adds a
  full-circle sweep proving every segment is reachable and none is skipped.

**What was done (2026-09-12) — the stick half**

- `StickMode::RADIAL_MENU`, with `LM1..LM25` / `RM1..RM25` appended after `RT25`
  and `LEFT/RIGHT_STICK_MENU_SIZE` and `_DEADZONE`. Dispatch reuses
  `touchRadialCell`, so a stick wheel and a pad wheel select identically; the
  old segment is released before the new one is pressed, so sweeping around the
  wheel does not leave a trail of held buttons.
- The enum layout is pinned by `static_assert`s in `JoyShockMapper.h` rather
  than a harness: order, spans, and that `RM25` stays inside
  `MAGIC_ENUM_RANGE_MAX`. They run on every build, which a harness someone has
  to remember to run does not.
- `OverlaySurface` replaced `OverlayPad`, so `LSTICK`/`RSTICK` share every piece
  of the pad machinery — placement, labels, icons, hit testing, drag
  positioning. A stick wheel is not a second implementation.
- The overlay treats a stick as live once it is pushed past the menu deadzone,
  which is the same test the backend uses, so both agree about when a wheel is
  up. Stick y is flipped to the pad convention in one place.
- Studio: `Radial menu (wheel)` in the stick mode list, segment count and
  "select past" controls, and the segments bound through the same
  `TouchpadGridSection` a pad wheel uses.

**Correction to the note above:** the claim that a misplaced enum entry would
"silently retarget every existing grid binding" was wrong. Configs bind by NAME
(`LT1 = G`) resolved through magic_enum, not by index, so a consistent reorder
does not touch user bindings. Sabotaging the enum to prove the assertions caught
it showed they did not fire — because inserting before `SIZE` moves `SIZE` and
`T1` together. The assertions are worth keeping as a record of the layout; they
are not the safety net that note implied.

**Still open from this item**

- Not verified on hardware: no controller was available, so the stick wheel has
  been proven to compile, resolve, and render, but not to fire.
- The overlay has no live *dot* for a stick the way it has for a pad; the
  selected segment highlights, but there is no cursor showing deflection.

---

### TODO-17 — Left grip is not usable as an input until the strip is moved

**Status:** open · blocked on hardware · raised 2026-09-13

**Context**

The left grip (`MISC6`) does not trip reliably. Its capacitive strip sits lower
in the shell than the right grip's, so a normal hold does not reach it and a
deliberate squeeze only sometimes does. Luke intends to open the controller and
move the strip up to match the right grip.

Until then `MISC6` is **deliberately unbound** in `Wardogs.txt` and
`Wardogs Menu.txt`. The vehicle-and-utility layer it was carrying — 13 bindings
including the profile-switch chord — moved to **L4 (`LSL`)**, which cost nothing
because L4 only duplicated face E (crouch).

**Why**

An unreliable modifier is worse than no modifier: the layer silently fails to
engage and the base binding fires instead, which in a firefight means the wrong
action rather than no action. It is also not fixable in software — sensitivity
is `GRIP_SENSOR_RANGE` / `GRIP_FLICKER_GUARD`, and those only move the trip
point within what the strip can already sense.

**Done when**

- The strip is repositioned and the left grip trips as consistently as the right
  one at a comparable `GRIP_SENSOR_RANGE`.
- `MISC6` goes back to carrying the utility layer, and L4 returns to crouch.
  This is a `sed 's/^LSL,/MISC6,/'` plus restoring `LSL = C` — the layer's
  contents do not need to change.
- Both grips are checked against the same range/guard values, since the profiles
  currently set one pair for both (`GRIP_SENSOR_RANGE = 306`,
  `GRIP_FLICKER_GUARD = 96`) and there is no per-side calibration command.

**Notes**

- See `docs/grip-calibration-investigation.md` for why there is no per-side
  firmware setting to compensate with.
- Worth re-checking once moved: the right grip is `GYRO_ON`, held constantly
  while aiming, so the two grips want different trip points and cannot have
  them. If the repositioned left grip proves too eager as a chord, a paddle
  stays the better home for a held layer.

---

## Done

### TODO-21 — Rotary scroll wheel had nothing left to fire

**Status:** DONE 2026-09-13 · uncommitted · shipped in 0.7.44

**Reported as**

"the rotary scroll wheel right stick isn't working"

**Fault**

Not in JoyShockMapper. `JoyShock.cpp:99` wires the right stick's scroll wheel to
`RLEFT`/`RRIGHT` and `JoyShock.cpp:1336` pulses them on every notch of rotation,
exactly as documented.

The editor hid those two cards. `visibleButtonsForGroup` folds a stick's four
direction cards away once the stick is in a whole-stick mode, and asked
`isDirectionalStickMode` — which answers no for `SCROLL_WHEEL`, because it is
not a four-way directional mode. So picking Rotary Scroll Wheel removed RS Left
and RS Right, the only place to say what a scroll notch does, and left the mode
with nothing to fire. The left stick had it too; it was just hit on the right.

The yes/no shape of the question was the actual bug. `SCROLL_WHEEL` is neither
"sends all four" nor "sends none": it sends two.

**Fix**

- `stickModeDirectionUse` in `src/constants/sticks.ts` returns `all` /
  `leftRight` / `none`. `SCROLL_WHEEL` is the `leftRight` case.
- `visibleButtonsForGroup` keeps Left and Right in that mode and drops only Up
  and Down, which the backend really never sends there.
- `isDirectionalStickMode` is unchanged. Its other caller is Bind to WASD, which
  genuinely needs all four and so must still clear a `SCROLL_WHEEL` mode.
- Added a note above Scroll sensitivity: counter-clockwise pulses Left,
  clockwise pulses Right, bind `MWHEELUP` / `MWHEELDOWN`. "RS Left" does not
  read as "rotate counter-clockwise" on its own, which is why the mode looked
  inert even once the cards were back. English and Chinese.

**Verified** against the dev server: with the right stick on Rotary Scroll
Wheel the accessibility tree lists "Right stick left direction" and "Right stick
right direction" and no longer lists up/down; click, ring and touch unaffected.

**Guard**

`tests/scroll_wheel_directions_regression.cjs` pins `stickModeDirectionUse`
against `isDirectionalStickMode` for every mode in `STICK_MODE_VALUES` (they may
only disagree on `SCROLL_WHEEL`), and reads `JoyShock.cpp` to assert both sticks
still initialise their scroll wheel from the LEFT/RIGHT button ids — if upstream
rewires it, the cards the editor keeps would be the wrong two.

---

### TODO-20 — Dropdown rendered trigger-wide and pushed its help panel off screen

**Status:** DONE 2026-09-13 · uncommitted

**Reported as**

"At some screen sizes the dropdown renders way too wide and you can't read the
helper text."

**Two faults, one symptom**

1. `.content` took `min-width: var(--radix-select-trigger-width)`. These triggers
   stretch to their settings column, so a list of words like `NO_SKIP` rendered
   850-920px wide and left nothing beside it for the help panel.
2. `measureHelpSide` ran in the Content's **ref callback**. Radix positions a
   popper with Floating UI *after* it mounts, so the measurement was taken where
   the list had not been put yet. It read as acres of room on the right and
   chose `right` unconditionally — the `left` and `bottom` fallbacks could never
   fire.

Measured before the fix, the help panel ran off screen at **every** width tested
except 1920: at 1440 it ended at 1643px, at 1058 it ended at 1276px.

**Fix**

- `min-width: min(var(--radix-select-trigger-width), 22rem)` with a `30rem` /
  `92vw` max. A narrow control's list still lines up under it; a stretched one
  stops inheriting a column's width.
- The side is chosen in a `useLayoutEffect` + `requestAnimationFrame` after the
  popup opens, so the popper has been positioned. Still decided once per open,
  which is what stops the panel hopping sides while the pointer moves.

**After:** the list is 352px at every width; the panel is fully on screen from
1920px down to 640px, sitting `right` where there is room and dropping to
`bottom` at 700px and below where neither side fits.

**Guard**

`tests/select_help_panel_fit_regression.cjs` sweeps eight window widths and
asserts the panel stays within the viewport, the list stays under the cap, the
cap is actually biting (the trigger is far wider at most of those sizes), and
that the tightest width falls back to `bottom` — which is the assertion the old
ref-callback timing could not have passed.

`tests/select_help_panel.cjs` (the panel must not move the options it describes)
still passes unchanged.

---

### TODO-19 — Four-way wedge menu edge-aligned its left and right contents

**Status:** DONE 2026-09-13 · uncommitted

**Reported as**

"The 4-way button pad trackpad virtual menu should horizontally center the left
and right icons/keys, like they are centered for the top and bottom items."

**Cause**

A wedge has two jobs — put its block on its own side of the pad, and stack the
icon, label and key on one centre line — and `Overlay.module.css` did both with
the region's `align-items`. On a column flex container that is the *horizontal*
alignment of the children, so the only way to push the left block off centre was
`align-items: flex-start`, which also flush-aligned the narrow icon and key
against the wide label. `flex-end` did the mirror image on the right. Up and
down looked correct only because their block belongs in the middle anyway, so
they never overrode `center`.

**Fix**

The same shape the radial menu already uses: an inner `.wedgeContent` block.
The region's `align-items` positions that block; the block centres its own
contents. Two jobs, two elements.

**Guard**

`tests/overlay_wedge_centering_regression.cjs` measures rendered centres in the
editor preview, which shares `MenuDrawing` with the live overlay. It asserts the
three parts of each wedge agree within 1px, that the left and right blocks are
still off-centre in the right directions (centring everything would satisfy the
first check and be wrong in the other direction), and — by collapsing the
wrapper with `display: contents` to recreate the pre-fix DOM — that the left
wedge then comes apart, so the test can fail.

Measured before: the left wedge's icon and key sat 23.3px apart. After: every
wedge has icon, label and key on one x.

---

### TODO-18 — Overlay kept drawing the old profile's menus after a runtime switch

**Status:** DONE 2026-09-13 · uncommitted · **needs a build to reach the user**

**Reported as**

"When I switch to the menu config, clicking the right trackpad still shows the
4-way virtual menu from the main config."

**Cause**

`Overlay.tsx` asked `get_active_profile` for what to draw. That command returns
`read_runtime_mapping_state().active_profile_path` — what Studio has **selected**
— which is only the same thing as what the mapper is **running** while nothing
switches configurations behind Studio's back.

A `loadConfig` binding does exactly that. `LSL,+ = "profiles-library/Wardogs
Menu.txt"` is a console command handled entirely inside JoyShockMapper; it never
reaches Studio, so the stored selection still named `Wardogs.txt` and the
overlay kept resolving that profile — including its `# @overlay RIGHT:MISC2`
pad-click menu, over a profile that deliberately has none.

The bindings were correct throughout. `MISC2,RIGHT_TOUCHPAD_MODE = NONE` does
clear the inherited modeshift: `modeshiftParser` intercepts `NONE`, and the
chord command's `setTaskOnDestruction` runs `processModeshiftRemoval`, which
erases the chorded variable. Only the drawing was stale.

**Fix**

The overlay now prefers the profile the mapper reports. JSM sets `liveProfile`
on the `RESET_MAPPINGS` of whatever file it loads (`CmdRegistry.cpp`) and ships
it as `activeProfile` in telemetry, which Studio already caches whole — so
`get_latest_telemetry_sample` had the answer and no Rust change was needed.

Two reported paths are *not* runtime switches and fall through to Studio's
selection:

- `profiles-library/applied-preview.txt` — Studio applies by copying the edited
  profile here and loading the copy, so the mapper reports the preview during
  ordinary use. Following it would draw a file the user never edits, and would
  lose unsaved editor state.
- `MappingDisabled.txt` — the stub loaded when mapping is off.

**Deliberately not done:** making Studio's *state* follow the runtime. The
editor should keep showing what you are editing; only the overlay is a live view
of what the controller is doing. Rewriting `active_profile_path` from telemetry
would swap the editor's contents under an unsaved edit.

**Guard**

`tests/overlay_live_profile_regression.cjs` locks which path wins, including
both placeholders and case/separator normalisation, and asserts end to end that
the combat profile resolves a `MISC2` pad menu while the menu profile resolves
none — and that using the stale selection is what drew it, so the test can fail
against the old behaviour.

**Not verified**

No controller, so the switch has not been watched happening on screen.

---


### TODO-20 — A shifted binding could not be edited in a profile with imports

**Status:** DONE 2026-09-13 · 0.7.41 · uncommitted

**Reported as**

"I still cannot change the output key for this modeshifted binding", on
`RSR,S` in `Wardogs.txt`, after TODO-19 shipped and did not fix it.

**Cause**

The shifted editor is the only place that both reads from and writes to the
import-resolved text: it projects the shift onto an ordinary configuration,
hands that to the normal binding card, and folds the result back into chorded
lines. Everywhere else reads the resolved text and writes the profile's own.

A profile that imports a template routinely assigns a key twice — `FPS
Template.txt` line 137 sets `S = SPACE` and `Wardogs.txt` line 22 sets it
again — and only the last is in force. `projectModeshift` substituted the
shifted value into *both* occurrences, so the card wrote to one and read back
the other. `foldModeshift` then saw no change and wrote nothing: pick a key,
watch the field snap back to what it was.

The projection now collapses each key to its last assignment, which is the one
in force. The comment above that code had already described this exact failure
for the base-versus-override case; it just did not account for duplicates
already present in the resolved text.

**Why neither earlier attempt found it**

TODO-19's capture-key collision was real and worth fixing, but it was not this.
I proved it "fixed" against a harness that mocks `loadLibraryProfile` and not
`readConfigFile` — so imports never resolved, the resolved text had one `S`
line, and the bug could not appear. **Every browser test in this repo has been
running with imports unresolved.** That is the hole that let a bug through two
rounds of fixes, and it is bigger than this one defect.

**Guard**

`tests/shifted_binding_imports_regression.cjs` resolves imports, and asserts it
did before testing anything else. It picks a key and captures one on a shifted
binding whose key the template also assigns, requires the field not to snap
back, and requires the written profile to change `RSR,S` alone — with the
import line intact, the unshifted binding untouched, another shift untouched,
and none of the template inlined. Verified to fail on the old projection with
"the edit snapped back: the card read a different line than it wrote".

**Still open**

The other browser tests should resolve imports too, or at least the ones
covering the binding editors. Until then they are testing a configuration shape
that no profile using a template actually has.

---


### TODO-19 — Capture on a shifted binding reached the unshifted one

**Status:** DONE 2026-09-13 · 0.7.40 · uncommitted

**Reported as**

"I can't change that output value in the UI via capture or the keyboard
feature" — on `RSR,S`, the R4+A chord.

**Found**

A capture is registered against the command's id, and `parseRowsToCommands`
builds ids from the input's own command. The shifted card for `RSR,S` and the
normal card for `S` therefore both registered under `S-S-tap-0`. Both rows
entered the capturing state on one click, and the captured value went to
whichever had registered last. The visible symptom is the shifted output
refusing to change; the invisible one is the *unshifted* binding quietly taking
the value instead.

Introduced in TODO-13, when the shifted editor became the same
`ButtonBindingsCard` the unshifted input uses. `domCommand` was added then to
tell the two apart in the DOM, and should have covered the capture keys too.
It does now.

**Honest limits.** The exact symptom did not reproduce in this harness — the
shifted card happened to register last here, so the write landed correctly and
only the doubled capturing highlight showed. Render order in the packaged app
is not guaranteed to match. The collision is real either way, and the guard
asserts on the thing that is deterministic: only one row may be waiting.

**Also in this release: `-` reads as Hyphen, not Minus**

Raised in the same message, and the reasoning matters more than the rename.
On the *input* side of a line `-` is `ButtonID::MINUS`, the View/Share button.
On the *output* side `nameToKey` maps it to `VK_OEM_MINUS`, the keyboard key
beside `0`. They are different namespaces that happen to share a character, and
a gamepad button can only be an output through the virtual controller, where it
is `X_BACK` or `PS_SHARE`.

So naming this output after a gamepad button would state something false about
what the binding sends. "Minus" was still a poor choice for echoing the other
meaning; "Hyphen" names the key without borrowing the button's name. Typing
"Minus" is still understood, along with a handful of other names people
reasonably use for the same keys.

**Guard**

`tests/shifted_capture_isolation_regression.cjs`: asserts the ids still collide
(so the browser half is testing something real), that exactly one row waits for
a capture, and that both capture and the keyboard picker write to `RSR,S` while
`S = SPACE` is left alone. Verified to fail without the namespacing with
"2 rows are waiting for the same capture".

---


### TODO-18 — Keys shown by their legend, not by JoyShockMapper's name

**Status:** DONE 2026-09-13 · 0.7.39 · uncommitted

**Reported as**

"It's weird that the output value is shown as `-`" after picking that key from
the keyboard, with the ask: translate keys that have a JSM-specific alias and
show only names a person recognises.

**The complaint is right and the picker was innocent**

Picking Tab writes `TAB` and showed `TAB`; there was no bug in capture or in
the keyboard picker. What there was is JoyShockMapper's vocabulary leaking into
every place a binding is displayed: `SCREENSHOT` for Print Screen, `CONTEXT`
for the Menu key, `SUBTRACT` for the numpad minus, `N7` for numpad 7, and bare
punctuation for the rest. `-` is the worst of them, because in any other
position that character is a modifier — so the row read as though something had
gone wrong rather than as the key beside `0`.

**Delivered**

`utils/keyNames.ts`, built from `nameToKey`'s own table so the vocabulary
matches the parser that has to accept it, including the misspelling
`SUBSTRACT` that JoyShockMapper also takes. Applied to binding rows, command
cards, the Overview callouts and the Advanced system-key list.

The Output value field shows the name and stores the token. Typing accepts
either — someone who knows `SCREENSHOT` can still type it — and anything
unmodelled passes through untouched, because that field has always accepted
tokens this editor does not know about.

**Nothing about a configuration changes.** The token is what is written and
what the backend reads; this is display and a typing convenience. Every binding
value in every installed profile still serializes byte-for-byte as before.

**Guard**

`tests/key_display_names_regression.cjs`: the names themselves; keys that
already say what they are are not renamed; unknown tokens pass through; typing
a name, a token, or a bare letter all resolve; every token survives being shown
and typed back; and no display name collides with a different key's token.

Four existing tests asserted the displayed token (`SPACE`, `TAB`) and now
assert the legend. Each still asserts the written token separately, which is
the half that matters.

---


### TODO-17 — The editor wrote bindings that meant something else

**Status:** DONE 2026-09-13 · 0.7.38 · uncommitted

**How it came up**

I told Luke that setting a tap on a config-switch binding needed hand-editing
the `.txt`, and he pushed back: the point of Studio is that nobody has to. He
was right, and so was the pushback — the Trigger picker already writes `'`
(`TRIGGER_TO_EVENT.tap`). The claimed gap did not exist.

Checking it surfaced something worse.

**Silent corruption**

Setting Trigger = Tap on `RSR,S = -` wrote `RSR,S = -'`. Every modifier
character is also a key, and JoyShockMapper's action-modifier group is greedy,
so `-'` is read as a **release-modified apostrophe**. The hyphen is gone. Then
adding the hold produced `-' "profiles-library/Wardogs Menu.txt"_`, and the
editor showed the apostrophe it had just invented back to the user as if they
had typed it.

Two separate defects behind it.

**1. The parser did not backtrack.** `parseBindingToken` stripped a leading
action modifier and a trailing event modifier by position. TODO-15 had already
guarded the "nothing left" case; the remaining half was that the backend's key
group is `(".*?")|\w*[0-9A-Z]|\W`, and `_` matches none of them on its own — so
`-_` is a hyphen *held*, not a release on an underscore, and Studio read it the
second way. `splitBindingToken` now tries the same four combinations the
regex's backtracking does, in the same preference order, and accepts one only
where what is left between the modifiers is a key the backend would accept.

**2. The serializer wrote forms it could not read back.** There is no escape
syntax to reach for, but there is position: the first of several tokens is a
tap and the second a hold, so a modifier the grammar already implies does not
need writing — and not writing it removes the ambiguity.
`serializeBindingExpression` now re-parses what it is about to write, and when
that does not come back as the tokens it started from, drops the implied
modifiers and checks again. `- "profiles-library/Wardogs Menu.txt"_` is the
result, which reads back as tap-hyphen / hold-switch exactly as configured.

Where nothing expressible is left — a lone `-` has no second token for position
to work with — it drops the modifier rather than the key. The binding sits
visibly on Press, which the reader can see and fix, where writing it changes
which key is sent and nothing shows that at all. Adding a second command then
makes it a tap by position anyway.

**Not a churn**

Only expressions that would be misread take the alternate form. Every binding
value in every installed profile — including `RSL = !M\ !M/` — serializes
byte-for-byte as before.

**Guard**

`tests/ambiguous_serialization_regression.cjs`: the reported tap-hyphen /
hold-switch pair survives a write and reads back with the right triggers;
a table of unambiguous forms is asserted unchanged, so the guard cannot start
rewriting profiles; and a lone hyphen tap keeps the hyphen.
`modifier_key_binding_regression` gained the `-_` case.

**Still open**

`- NONE` reads back as Press rather than Tap. JoyShockMapper treats the first
of two tokens as a tap whenever anything follows it, including `NONE`;
`defaultFallbackTrigger` only does so when it has parsed two tokens into one
row, and an explicit `NONE` splits them into two. Cosmetic, and nothing writes
that shape today, but it is the same class of disagreement as the two above.

---


### TODO-16 — "Load configuration" as an output kind

**Status:** DONE 2026-09-13 · 0.7.37 · uncommitted

**Asked for**

A new option beside Script / command that switches to another configuration,
with the output value becoming a dropdown of the existing configs rather than a
path to type.

**Delivered**

`loadConfig` in `BindingOutputKind`, offered under Advanced between Gyro action
and Script / command. Choosing it seeds the first configuration that is not the
one being edited and turns the value field into a list of the library, with the
current profile marked `(this configuration)` — binding an input to load the
profile it is already in does nothing.

**It is the same token underneath**

JoyShockMapper has no command for this. A double-quoted binding value is a
console command, and a bare config path typed at the console loads that config,
so the whole mechanism is `RSR,S = "profiles-library/Wardogs Menu.txt"`. The
token kind stays `console_command` and the text written is byte-for-byte what a
hand-written profile contains; `utils/loadConfigBinding.ts` only recognises the
shape well enough to offer names instead of paths. A path with another
directory in it, or any other quoted command, is still a Script / command.

Reading is the same seam in reverse: `outputKindFromToken` sends a
`console_command` whose value is a library path to `loadConfig`, so a profile
written by hand opens in the picker rather than as a path in a text box.

Rows and command cards name it — "Load Wardogs Menu" — through
`describeOutputValue`, which already did this for virtual-controller tokens.

**A path to a configuration that no longer exists** stays in the list rather
than emptying the control, so renaming a profile does not silently drop the
binding that refers to it.

**Guard**

`tests/load_config_binding_regression.cjs` drives both directions: the picker
offers names (never paths) with the current config marked, the written line is
exactly `RSR,S = "profiles-library/Wardogs Menu.txt"`, and a profile that
already contains that line comes back as this output kind with the right
configuration selected and survives a save untouched.

**Not verified**

No controller, so the switch itself has not been seen to fire. The editor half
is covered; the runtime half is the mechanism described in TODO-14's answer and
rests on reading `Mapping.cpp` and `CmdRegistry.cpp`.

---


### TODO-15 — A binding of just `-` showed as Unbound

**Status:** DONE 2026-09-13 · 0.7.36 · uncommitted

**Reported as**

"I can't see the scoreboard binding in the UI", with the R4 modeshift open on
the Face Buttons page: Y, B and X showed their keys, A showed **Unbound**.
`Wardogs.txt` has `RSR,S = -      # Scoreboard. The value is the hyphen KEY,
not a release`.

**Cause**

`parseBindingToken` stripped an action modifier off the front and an event
modifier off the back unconditionally. Every one of those characters is also a
key you can send — `-` `+` `/` `'` `\` `_` `!` `^` — so a binding that is just
one of them was stripped down to an empty value, and an empty value renders as
Unbound.

JoyShockMapper reads it the other way round and is right to: its pattern is
`\s*([!\^-]?)((\".*?\")|\w*[0-9A-Z]|\W)([\\\/+'_]?)\s*(.*)` with both modifier
groups optional, so for input `-` it backtracks past the action group and
matches the key group. The hyphen is sent. The comment in the profile was
correct and the editor was wrong.

**Fix**

Strip a modifier only when something is left to modify (`remaining.length > 1`).
`-A` is still a release-modified A, `!M\` is still instant-M-on-press, and `-'`
still resolves the way the backend's backtracking does: `-` as the modifier,
apostrophe as the key.

Also added `+` to the character class that decides an input is a key. It is in
`nameToKey`'s accepted list but was missing here, so `+` classified as a raw
literal and lost its keyboard editor.

**Scope**

Not modeshift-specific and not new — the same binding read as Unbound on an
ordinary row too, and has since the tokenizer was written. It surfaced now
because this profile is the first to bind punctuation on a chord.

**Guard**

`tests/modifier_key_binding_regression.cjs`: every modifier character bound
alone parses as that key, round-trips, and classifies as an input; modifiers
with something to modify still work; and the reported `RSR,S = -` reads as a
hyphen through the same projection the shifted editor uses, while the `-`
*button*'s own `- = TAB` binding is untouched. Verified to fail against the
unconditional strip.

---


### TODO-14 — Binding rows in the reader's vocabulary, and the modeshift card

**Status:** DONE 2026-09-13 · 0.7.35 · uncommitted

**Reported**

Screenshots of 0.7.34 against Steam Input, with eight things.

**The one behind three of them: the rows spoke the config file's language**

- `Triangle / Y` on a Steam Controller, which has neither a triangle nor a
  second name for Y. `controllerButtonLabel` ignored the connected pad and
  always printed both families. It now takes the family: PlayStation gets its
  own names, Steam and Xbox the Xbox lettering, Nintendo its swapped face
  buttons, and only the generic case — nothing plugged in, so no right answer —
  keeps the dual form.
- `X_Y` as an output. It is a Y button to everyone except the parser, so
  `describeVirtualControllerToken` names it from the token's own prefix rather
  than from the profile's output setting — a profile whose tokens have not been
  migrated still reads as what the game will actually receive. `X_LB` is a left
  bumper, `PS_TRIANGLE` a triangle.
- Trigger pickers had the same problem (`L — top-left bumper (L1 / LB)`). The
  i18n strings carry both names; `resolveModifierOptionLabel` now swaps the
  parenthetical for the connected pad's own — `LB — top-left bumper`, `R4 —
  primary right back paddle`.

**Why the output keycap floated in the middle of the row**

The value and the chevron each had `margin-left: auto`, so the free space was
split between them and the value landed wherever the input's name happened to
end. The row is a grid now — glyph, name, value, chevron — so the values line
up as a column the way Steam Input's do.

**The modeshift card**

Too bare closed, too much bottom padding, too many borders, and a trigger
caption jammed against the top edge. It is one of the list's rows now: the same
summary treatment as every other input, with the trigger's own glyph, its name
and a count of what it binds; the accent edge is all that marks it out. Padding
moved off the card and onto the summary and the body, which is what left a
closed card with a band of empty space under its title. The inner per-binding
frames are gone — the rows inside carry their own.

Not made a modal, which was the suggestion. Every specific complaint was
consistency, spacing or borders, and making it consistent with the list it
lives in fixes those without moving modeshift editing out of the page its
bindings are on. Still worth doing if it does not feel better in the hand.

**Two real bugs**

- The virtual-menu preview drew a green thumb dot parked in its top-left
  corner. `MenuDrawing` renders the dot unconditionally, but only the live
  overlay moves it — through a ref it passes in. With no ref there is nobody to
  move it, so the editor preview got the decoration and none of the behaviour.
  Drawn only when something is there to drive it.
- The selected menu region was a panel whose header repeated the command, the
  row and column and the bound state, wrapping a card that already showed all
  three — an expandable inside an expandable, three frames around one binding.
  The panel is gone and the card arrives open, since it *is* the selection.

**Help**

The gyro help buttons landed on their own line: the labels stack caption over
control, so a button after the text falls beneath it. `.field-caption` keeps
the two on one line. Noise & Steadying had none on decel brake and several
others — `settingHelp` now answers for the gyro deadzone and steadying (which
were being answered by the generic deadzone rule, wrongly), smooth threshold,
One Euro speed coefficient, angle snapping, both decel brake controls and
trackpad press damping, and the three dropdowns got their own. The decel brake
text is written from `main.cpp` rather than guessed: it engages on how sharply
you decelerate, full at ~3.5x that rate, and only between 2 and 60 °/s.

**Guard**

`tests/binding_row_labels_regression.cjs`, against a mocked Steam Controller:
no PlayStation names, no raw tokens, the trigger named R4 not RSR, every row's
value ending at the same x and starting past the halfway mark, no undriven dot,
and the region card open with no wrapper panel. Verified to fail on the old
output (`the row should not print the raw token: Y Y X_Y`) and on the old
layout (`the value is adrift in the middle of the row`).

**Still open from this item**

- The two real-world-calibration buttons at the top of Gyro Behaviour render as
  full-width bars that read like broken headings. Not reported, not touched.

---


### TODO-13 — The controller-first redesign, finished

**Status:** DONE 2026-09-13 · 0.7.34 · uncommitted

**Asked for**

Every remark in `1-JSM-Studio-remarks.pdf`, as one consistent redesign:
a controller-centred overview, a simplified rail, compact summaries, focused
detail editors, and mouse and keyboard still first-class in the same interface.

**Where it was picked up**

Codex had built most of it across 0.7.23–0.7.33 and stopped mid-flight. What
was left is recorded remark-by-remark in
[controller-first-redesign.md](controller-first-redesign.md); the short version
is four things.

- **The shifted binding editor was still the old, reduced one.** It is now the
  same `ButtonBindingsCard` the unshifted input uses, reached by projecting the
  shift onto an ordinary configuration and folding the edits back into chorded
  lines. See the remark table for why the fold has to diff against the
  import-resolved projection rather than the profile's own text.
- **Six regression tests had been left failing** by the redesign. Repaired
  against the new UI, not deleted. Two of them were reporting real bugs:
  Escape had stopped clearing the binding clipboard (controller navigation was
  eating it), and the add-trigger menu still offered a chord on pages that
  filter chord rows out of the card.
- **The bundled backend predated the polling work.** `StudioDefaults.txt` was
  being written by Studio and read by nobody, because the shipped
  `JoyShockMapper.exe` was built before `CmdRegistry` learned to load it.
  Rebuilt.
- **Four remarks were only partly met** and were finished: raw telemetry now
  sits behind Details on the Overview rather than captioning both pads with
  `p=0.0000`; Bind Whole Controller moved into the header Output menu; the
  three remaining persistent gyro paragraphs became Help buttons; and the pads,
  their numbered regions, stick-wheel segments and stick directions got real
  glyphs instead of a disc showing the first two characters of the token.

**Guard**

`tests/shifted_binding_parity_regression.cjs` is the new one: it requires the
shifted card to be the normal card (same activation kinds, capture,
output-kind picker, action name, add-another-trigger), to refuse chords, and —
the part that matters for configurations — to write only its own shift, leaving
the normal binding, the other shifted inputs, the other triggers and every
inherited value it merely read alone.

**Not verified**

No controller was available, so the whole hardware half of the acceptance list
is untested: the no-mouse workflow, focus versus capture on a real pad, polling
across a restart, device coverage, and overlay-versus-editor menu fidelity at
real display scaling. The `.py` tests could not run either — this machine has
only the Microsoft Store Python stub.

---


### TODO-12 — Choose when a virtual menu appears

**Status:** DONE 2026-09-12 · 0.7.33 · uncommitted

**Asked for**

A choice between showing the menu only once the input has reached the outer ring
(where the bindings are) and showing it on any touch or tilt — the second being
what you want when a region fires the moment it is touched, so you can aim at
the action rather than discover it.

**Delivered**

`# @overlay ... show ring|touch`, with a two-option control in the Overlay
layout panel that explains the trade-off rather than making the user infer it
from a checkbox label.

- `ring` — hidden until a region is actually selected. Implemented as the hit
  test, not a distance: on a rectangular grid every touch selects something, so
  those pads behave exactly as they always have.
- `touch` — visible on contact, or on any tilt past the stick's own
  `*_STICK_DEADZONE_INNER`. That floor matters: a stick reports noise at rest,
  and without it the wheel would flicker on an untouched controller. The menu is
  up with nothing highlighted, which is the point.

Defaults are per surface and are each surface's existing behaviour — pads on
contact, stick wheels at the ring — so no existing profile changes.

**Also fixed here**

- `setOverlayPlacement` wrote the literal `show undefined` into a profile when
  handed a placement built before the field existed. It now normalises first.
- The Overlay layout panel called every surface a touchpad, so the user's right
  stick wheel appeared in it labelled "Right touchpad". Surfaces are now named
  properly, which matters more now that the panel carries a per-menu behaviour
  switch.

**Guard**

`tests/overlay_reveal_regression.cjs`, in two halves: the option parses,
defaults per surface, tolerates nonsense, leaves the other options on the line
alone and round-trips; and the running overlay is driven at three tilts
(resting, aiming inside the dead zone, out in the ring) in both modes, requiring
them to differ only in the middle one. Verified to fail when the overlay ignores
the option, with "touch: up while you are still aiming".

`overlay_layout_regression` and `annotation_roundtrip_regression` had their
placement expectations extended — the object legitimately gained a field — and
the first gained an assertion that "show undefined" is never written.


### TODO-11 — Wheel boundaries, and a hole that means what it shows

**Status:** DONE 2026-09-12 · 0.7.32 · uncommitted

**Asked for**

A visible divider between segments: the wheel read as one grey ring until
something was selected.

**Delivered**

Boundaries and a ring around the hole, drawn on a layer of their own above the
segments (`radialDividerStyle` / `radialHubStyle`). They cannot be borders on
the segments themselves, for two reasons that both come down to "what you see
must be what fires":

- every segment's box is the whole wheel and is cut down by `clip-path`, so an
  inset shadow traces the wheel's *rectangle* clipped to the segment rather than
  the segment's own edges — which is what the preview had been doing, drawing
  corner fragments and nothing where segments actually meet;
- narrowing the drawn wedge to leave a gap would make the visible edge stop
  matching the boundary the hit test splits on.

A spoke is a constant-width line pinned at the centre and rotated onto
`(index + 0.5) * step` — the same angle the hit test uses — so a divider is
drawn exactly where the action changes. The overlay and the editor preview share
the geometry, so the preview shows the wheel the player will see.

**Found while doing it: the drawn hole was half the dead zone**

`deadzone` is the fraction of the pad from centre to edge that selects nothing,
and that is what the backend compares against — `touchRadialCell` tests
`hypot(dx, dy) <= deadzone * 0.5` in 0..1 coordinates whose half width is 0.5,
so the hole's radius is `deadzone` of the wheel's radius. `radialSegmentClip`
halved it. With the user's `RIGHT_STICK_MENU_DEADZONE = 0.55` the wheel showed a
hole 27.5% of the radius while the real dead zone was 55%: a stick pushed to
about 40% looked like it had left the hole and chosen a weapon, and fired
nothing. Now `radialInnerRadius`, shared by the clip, the hub and the labels.

**Two layout bugs the bigger hole exposed**

- Labels sat at a fixed distance from the centre, so with a large dead zone they
  reached into the hole and were cut off by the segment's own clip-path — the
  "t" was missing from "Medkit". They now sit halfway across the annulus.
- An absolutely positioned box with a `left` and no `right` shrinks to fit the
  room left between `left` and the container edge, and the `translate(-50%)`
  that centres it runs after layout. A label on the right of the wheel was given
  the last 16% of the box to lay out in, so "Grenade" wrapped to "Grenad / e".
  Width and a half-width negative margin now come from `radialLabelPosition`,
  sized from the annulus.

**Guard**

`overlay_radial_geometry_regression.cjs` gained the dead-zone invariant: the
drawn hub must be `deadzone` of the wheel across, *and* pushing the stick either
side of that radius through the real pipeline must select nothing / exactly one
segment. Verified to fail on the halved hole with "the drawn hole is 69.6px
across but the dead zone is 139.3px".

**Still open**

- A very large dead zone leaves a thin annulus, and long labels get tight. The
  real answer is labels outside the ring, as Steam does. Not done.
- The `.py` tests cannot run here — this machine has no real Python, only the
  WindowsApps stub — so `per_pad_grid_regression.py` and
  `capacitive_preview_regression.py` were not exercised against these changes.


### TODO-10 — The stick wheel drew as slivers down the left edge

**Status:** DONE 2026-09-12 · fixed in 0.7.31 · uncommitted

**Reported as**

"the overlay is scuffed", with a screenshot of a circle containing a column of
labels and a thin blue sliver where a segment should be.

**Root cause**

Every wheel segment sits in grid cell `1 / 1` and is cut out of it by
`clip-path`, so that cell has to *be* the whole wheel. `Overlay.tsx` skipped the
inline grid template only for `FOUR_WAY`, so a `RADIAL` menu was still given
`grid-template-columns: repeat(4, 1fr)` — four real tracks. Each segment was
then clipped inside a quarter-width sliver of the first column. Measured: a
segment box of 97.5 x 390 in a 390 x 390 wheel, exactly 390/4.

The editor preview had this right (`.touchpadGridPreviewRadial` sets
`1fr / 1fr`, and the component skips the template for radial), which is why the
preview looked correct while the overlay did not.

**Fix**

The condition now covers `RADIAL` as well, and the wheel's CSS carries the
single `1fr` track explicitly. `.pad:has(.segment)` became a real `.radial`
class applied from the component, so the rule that sets the track and the code
that decides the shape live in the same place instead of one inferring the
other. Padding dropped to 0 there, so the wheel fills the box the hit test uses.

**Guard**

`tests/overlay_radial_geometry_regression.cjs` — the overlay's first DOM test.
It loads the real `overlay.html` in a browser and stubs only
`window.__TAURI_INTERNALS__`, so the actual component runs; then it requires
every segment box to equal the wheel box, and the four labels to sit above,
right, below and left of the centre rather than in a column. Verified to fail on
the broken layout with "segment 1 is 97.5x390 but the wheel is 390x390".

**Noted while testing, not fixed**

- The first telemetry packet for a menu cannot highlight anything: it is the
  packet that decides which menu is up, and the region elements do not exist
  until React has rendered it. Costs one frame at the display's refresh rate.
- The wheel has no visible divider between unselected segments, so it reads as
  one grey ring until something is selected. Adding one cannot use an inset
  shadow (clip-path clips it to the pad rectangle, not the segment) and must not
  narrow the drawn wedge, or the visible edge stops matching the hit test — it
  needs a separate decorative layer. Cosmetic; left alone.


### TODO-9 — The mapper crashed on any stick radial menu binding

**Status:** DONE 2026-09-12 · fixed in 0.7.30 · uncommitted

**Reported as**

"oh dear now my controller is not showing up anymore :(" after installing
0.7.29.

**What was actually happening**

JoyShockMapper started, loaded the profile, and died about three seconds later
with an access violation (0xC0000005). Nothing said so: JSM is a WinMain
application that allocates its own console, so a redirected launch captures no
output at all, and PowerShell does not wait on GUI-subsystem processes — the
first measurement said "exit code 0, no output", which read like a clean quit
and pointed the investigation at the config file. It was a crash.

Minimal reproduction: a config containing nothing but

    RESET_MAPPINGS
    RM1 = 1

**Root cause**

`onNewStickMenuSize()` registers the 25 wheel segments the way the touchpad
grids do:

    maps.push_back(button);
    registry->add(new JSMAssignment<Mapping>(maps.back()));

A `JSMAssignment` holds a **reference** to the `JSMButton`, so the vector must
never reallocate. The three grid vectors are reserved — in `main()`, about 1700
lines away from the loop that depends on it. The stick menu vectors copied the
loop and not the reserve, so every assignment registered before a growth step
was left pointing at freed memory, and parsing `RM1 = 1` dereferenced one.

**Fix**

`reserve(MAX_GRID_BUTTONS)` now sits at the top of each registration function,
immediately above the `push_back` that requires it, rather than in `main()`. The
`main()` reserves are kept (harmless) but are no longer load-bearing.

**Guard**

`tests/mapper_startup_crash_regression.cjs` launches the real built binary with
a config that binds `LM1`, `RM1`, `LT1` and `RT1` and requires it to still be
alive six seconds later. Verified to **fail on the 0.7.29 binary** with
0xC0000005 and pass on 0.7.30. It runs with `AUTOCONNECT = OFF`, so it needs no
controller and does not take one away from whoever is running it.

**Worth remembering**

The annotation block 0.7.29 started writing (`# @label`, `# @icon`,
`# @overlay`) was the obvious suspect, since the profile was rewritten minutes
after the install. It was innocent — `CmdRegistry::processLine` skips any line
starting with `#`. Bisecting the profile by line count found the real trigger in
two minutes; reasoning about the diff would not have.


### TODO-2 — Modeshift re-exposes the input’s real modes

**Status:** DONE 2026-09-10 · uncommitted

**Context**

A modeshift is, by definition, one physical input reconfiguring itself to any
mode it already supports while a trigger is held — including the *same* mode
with different bindings. Steam Input's common case is face buttons in "Button
Pad" mode shifting to another Button Pad with a different set of bindings.

The trackpad modeshift does not work that way. `KeymapControls.tsx:1197`
hardcodes two options and renames one of them:

```ts
mode: { key: `${prefix}_TOUCHPAD_MODE`, defaultValue: 'GRID_AND_STICK',
  options: [{ value: 'GRID_AND_STICK', label: 'Button grid' }, { value: 'MOUSE', label: 'Mouse' }] },
```

Two problems follow:

1. `PS_TOUCHPAD` is missing, and `GRID_AND_STICK` is relabelled "Button grid",
   which invents a mode name that exists nowhere in JSM.
2. `InputModeshifts.tsx` re-implements the shifted mode's editor from scratch —
   a columns/rows picker plus a cell grid for `GRID_AND_STICK`, and two
   sensitivity fields for `MOUSE`. It does not render the real sections
   (`TouchpadGridSection`, `TouchpadStickSection`, `TouchpadSettingsSection`),
   so everything those expose is unreachable in a shift.

The concrete thing this blocks: the touch-stick half of `GRID_AND_STICK` —
`RIGHT_TOUCH_STICK_MODE`, `RIGHT_TOUCH_STICK_RADIUS`, `TOUCH_RING_MODE`,
deadzone, and the `TUP`/`TDOWN`/`TLEFT`/`TRIGHT` directions. Luke wants to try
directional swipes on pad-click and cannot, because the invented "Button grid"
mode has no stick.

**Why**

The runtime already supports all of this: `RIGHT_TOUCHPAD_MODE` is chordable
like any other setting, and every per-pad setting can carry a chord prefix. The
limitation is purely the editor's, and the shape of it — a custom mini-editor
per shifted mode — will keep diverging from the real one as settings are added.

**Done when**

- A trackpad modeshift offers every mode the pad supports, under JSM's own
  names, with no invented modes.
- Selecting a shifted mode renders the same section components the normal mode
  renders, scoped to write chorded keys (`<trigger>,<KEY> = value`).
- Same mode on both sides of a shift works — e.g. `GRID_AND_STICK` normally and
  `GRID_AND_STICK` shifted, with different bindings.
- A shifted `GRID_AND_STICK` can configure the touch stick, including the four
  swipe directions, which is the case that proves the bespoke editor is gone.
- `tests/modeshift_regression.cjs` covers the same-mode shift and a shifted
  touch-stick setting.

**Notes**

- The read/write split from TODO-1's feature applies here: `InputModeshifts`
  currently takes `text` for reads and writes via `onChange(previous => ...)`.
  Any reuse of the real sections has to keep that split, and must keep writing
  chorded keys rather than plain ones.
- `src/utils/modeshift.ts` already has `readModeshift`/`writeModeshift`, which
  handle the chord prefix. The section components read via `getKeymapValue` and
  write via handlers from the config hooks, so making them chord-aware probably
  means passing a key prefix down rather than rewriting them.
- Face buttons are a separate group in JSM (`N`/`E`/`S`/`W` are individual
  buttons, not one "Button Pad" input), so the Steam Input parallel is about
  the *principle*, not a 1:1 port. Check what a face-button modeshift offers
  today before assuming it needs the same fix.

**What was done**

- `ModeshiftTarget` gained a `pad` descriptor; `InputModeshifts` renders
  `TouchpadModeCard`, `TouchpadGridSection` and `TouchpadStickSection` against
  chorded keys instead of its own grid and sensitivity fields. The invented
  "Button grid" mode is gone; the shifted card offers Grid and Stick, Mouse and
  PS Touchpad, and a shifted Grid and Stick can configure the touch stick.
- `readShifted` centralises the read-through rule: a shift overrides only what
  it assigns, so an unassigned setting shows the value the shift inherits.
- `padModeshiftSettings` lists every per-pad key, so removing or renaming a
  shift takes all of its lines instead of orphaning the ones the old, shorter
  list did not know about.
- **Behaviour change:** adding a shift now inherits the pad's current mode
  rather than forcing Grid and Stick. `editor_feedback_regression.cjs` asserted
  the old default and was updated to select the mode explicitly.

**Still open from this item**

- Binding the touch stick's four swipe directions (`TUP`/`TDOWN`/`TLEFT`/
  `TRIGHT`/`TRING`) inside a shift. The stick's *settings* are configurable, and
  the chorded form works at the data level, but those five commands are global
  in JSM rather than per-pad, so putting them in a pad target's `buttons` would
  make one pad's shift removal delete the other pad's lines. Needs a decision on
  ownership before wiring the UI. Folded into TODO-1's sweep or its own item.

---

## Dropped

_Nothing yet._
