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

### TODO-3 — Saving a profile drops its standalone comments

**Status:** DONE 2026-09-20 · uncommitted

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

**What was done**

- `configSerializer` now carries ordinary standalone comments on the following
  parsed line, so canonical section ordering does not separate a note from the
  setting it describes. Trailing comments remain in the custom block.
- Generated section headings are recognised as serializer structure, keeping a
  second Save byte-for-byte stable.
- `tests/comment_roundtrip_regression.cjs` covers directive, setting, section
  banner, trailing comments, and repeated-save placement.

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

**Status:** DONE 2026-09-20 · uncommitted

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

**What was done**

- Added `GridShape::EIGHT_WAY` as a fixed eight-wedge layout. It uses the same
  clockwise-from-up radial math as the overlay and ignores `GRID_SIZE`.
- Added the editor selector, explanations, deadzone control, preview and
  overlay parity handling. Existing rectangle, four-way and radial profiles are
  unchanged.
- Extended `touch_four_way_harness.cpp` and `overlay_layout_regression.cjs`
  with eight-way boundary, deadzone, release and parity coverage.

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

**Status:** DONE 2026-09-20 · uncommitted · hardware verification pending

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
  been proven to compile, resolve, render and hit-test, but not to fire on a
  physical stick.
- The overlay now has the same live dot for sticks and pads; the remaining
  validation is physical input rather than a missing implementation.

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

### TODO-24 — Grip pulse strength

**Status:** open · raised 2026-09-25

**Context**

`GRIP_HAPTIC_EFFECT = PULSE` is Steam's grip-calibration haptic, copied from USB
traffic: report `0x81`, target 3 (left grip) / 4 (right grip), 300 µs on, 300 µs
off, 1 repeat. `TAP` is the same pulse preceded by a pad `CLICK`. Luke confirmed
PULSE feels exactly like Steam's; the intensity dial only reaches TAP's click.
Filling the report's trailing 16-bit gain field did nothing.

**Done when** the dial audibly/tangibly changes PULSE's strength, or it is
established that it cannot and the dial is hidden for PULSE.

**Notes**

- Steam's grip tool calls `TriggerHapticPulse(ctrl, side, 300, 300)` — timing
  only, no strength. Steam's strength knobs are the per-side personalization
  settings `nLHapticStrength` / `nRHapticStrength` (slider − 2). Capture pending
  to see what they write to the controller.
- Candidate host-side knob: pulse on-time (on_us) and repeat count.
- **Answered 2026-09-25 (implemented, uncommitted):** Steam's pulse cannot be
  made stronger. Steam's haptic-strength sliders and rumble-intensity dropdown
  write nothing to the controller (capture: previews are `0x82` clicks at
  −17..−5 dB); `TriggerHapticPulse` has no strength; longer on-time or repeats
  change the character (thinner), not the strength. Targets 3/4 are the back
  rumble motors (SteamHapticsSinger), which *do* take gain via `0x83` — so
  RUMBLE is now a 60 Hz / 40 ms `0x83` burst on the side's back motor, following
  the intensity dial. PULSE is labelled fixed-strength in Studio.

---

### TODO-25 — Tone / Rumble / Noise / Script / Sweep haptics do nothing

**Status:** open · raised 2026-09-25

**Context**

These are sent as the 3-byte `0x82` command (side, effect, gain). Only TICK and
CLICK are self-contained; the others need frequency/duration that the short
command cannot carry, so the controller plays nothing.

**Done when** each effect offered in Studio produces a distinct, felt haptic, or
is removed from the list.

**Notes** — the full-parameter reports exist in SDL's `controller_structs.h`:
`0x83` LFO tone (side, gain, freq, duration_ms, lfo_freq, lfo_depth), `0x84` log
sweep (side, gain, duration_ms, start/end freq), `0x85` script (side, script_id,
gain), `0x80` rumble (type, intensity, per-side speed/gain).

- **2026-09-25 (implemented, uncommitted):** those reports number actuators
  0/1 = left/right pad, 3/4 = left/right back motor (SteamHapticsSinger
  `main.cpp`; `0x83` bursts on target 4 felt and gain-scaled by Luke). TONE =
  200 Hz / 60 ms `0x83` on the pad, RUMBLE = 60 Hz / 40 ms `0x83` on the back
  motor, SWEEP = 80 ms 100→600 Hz `0x84` on the pad — SWEEP is not yet felt.
  NOISE and SCRIPT are hidden from Studio's pickers (still parse) — no known
  parameters drive them.

---

### TODO-26 — Custom startup / shutdown sounds

**Status:** implemented, awaiting hardware check · raised 2026-09-25 · uncommitted

**Context** — Steam offers 14 built-in sounds (`SettingController_HapticSound_0..13`)
for Start Up Sound / Shutdown Sound on this controller. Luke wants to pick them
from JSM.

**Done when** a JSM setting chooses each sound and the controller plays it on
the next power-on / power-off.

**Notes** — Steam sends `ID_SET_AUDIO_MAPPING` (`0xC1`) on every settings apply:
16 slots indexed by SDL's `ControllerAudio` (0 startup, 1 shutdown, 2 pair, 3 pair
success, 4 identify, 5 lizard mode, 6 normal mode); observed
`ff ff ff ff 03 09 05 ff…` with both sounds at default. `ID_PLAY_AUDIO` (`0xB6`)
should preview. Capture of changing the sounds pending.

- **2026-09-25 findings (hardware-tested):**
  - Steam's "Identify Controller → Ping" is output report `0x85` (haptic
    script) `85 05 0c 00` = target 5, script 12, gain 0. Scripts 0–13 all play.
    Steam's names for its 14 sounds (`SettingController_HapticSound_0..13`):
    Warm and Happy, Invader, Controller Confirmed, Victory!, Rise and Shine,
    Shorty, Warm Boot, Next Level, Shake It Off, Access Denied, Deactivate,
    Discovery, Triumph, The Mann — index-to-script mapping assumed, not proven.
  - `0xB6` PLAY_AUDIO (u32 or u8 index) plays nothing. `0xC1` mapping with
    slots 0/1 = 12 changes neither jingle, with Steam closed. Firmware strings
    have no startup-sound key; the jingles look hard-coded. Only related key:
    `user/haptic_boot_level` (reads 2 via `0xED`) — not written (undocumented
    persistent store).
  - Plan agreed: JSM plays a chosen sound on connect and when *it* powers the
    controller off, with preview in Studio; custom sounds later as `0x83` tone
    sequences (SteamHapticsSinger-style, e.g. from `.mid`). The firmware's own
    jingle still plays at power-on / button power-off.

---

### TODO-27 — LED colour as a binding

**Status:** open · raised 2026-09-25

**Context** — Steam stores `led_red/green/blue`, `led_saturation`,
`led_brightness` for the controller (its UI hides colour when
`bUseOnlyBrightness`). SDL's Triton `SetJoystickLED` is unsupported, so JSM's
`LIGHT_BAR` does nothing today. Setting 45 (`LED_USER_BRIGHTNESS`) = 100 is
written by Steam on connect.

**Done when** a binding can set the LED colour and it visibly changes.

**Notes** — capture of Steam's LED page pending; first establish whether the
LED is RGB at all.

- **2026-09-25:** Steam shows only a brightness slider for this controller (no
  colour picker), and the capture shows only setting 45 changing (0–100). The
  LED is most likely white-only, so the achievable version is *brightness* as a
  binding (write setting 45), not colour.
- **Correction, same day:** the LED *is* RGB(W) — it shows orange/green, but
  only when the controller is **off** and charging (firmware-driven). Firmware
  strings: `ID_SET_LED_COLOR` / `ID_GET_LED_COLOR`, `cal/rgbw_{r,g,b,w}`,
  `pwmrgbleds`. OpenPuck's `steam_commands.h`: SET = `0xC5` (marked "??"),
  GET = `0xE9`. Verified on hardware: `E9` reads 4 bytes (default `00 00 00 00`);
  `C5` stores 4 bytes (clamped to 200) and any non-zero value turns the LED
  steady and overrides the charging pulse — but every byte position shows
  **white**. Setting 45 (brightness) visibly dims it. Steam never sets colour
  for this controller. **Parked** — next step would be disassembling the C5
  handler (needs Ghidra, installed by Luke). 52/53 are trackpad click pressure,
  not LED (written and restored during testing).
- **2026-09-25 (implemented, uncommitted): brightness as a binding.** JSM has
  `LED_BRIGHTNESS` (0-100, -1 = leave it alone, the default); SDLWrapper writes
  setting 45 when it changes. It is an ordinary setting, so a binding sets it
  with a console command (`LSL = "LED_BRIGHTNESS = 10"`) and a layer can carry
  its own value. The action picker's JSM tab has an LED brightness stepper that
  writes exactly that. Colour stays parked. **Needs a hardware check.**

---

### TODO-28 — Gyro calibration through the overlay, with a start delay

**Status:** implemented, awaiting hardware check · raised 2026-09-25 · uncommitted

**Context** — calibration currently runs from a Studio button with a small
countdown in the UI. Luke wants it bindable (global chord) with a configurable
delay before it starts, shown in the always-on-top overlay as a widget: the
countdown to start, then a progress bar and an SVG of the controller being
calibrated, visible in-game.

**Done when** a chord starts it, the overlay shows the delay and progress over
a fullscreen game, and the result is the same calibration the button does.

**Notes (2026-09-25, implemented)**

- JSM owns the run: `CALIBRATE_GYRO` waits `GYRO_CALIBRATION_DELAY`, then
  RESTART → `GYRO_CALIBRATION_TIME` → FINISH on its own thread; a newer run
  supersedes an older one. Phase / remaining / total go out in every telemetry
  packet as `gyroCal`.
- `RecalibrateGyro.txt` is now just `CALIBRATE_GYRO`; the timing lives in
  Studio's state (`gyroCalibrationSeconds/Delay`) → `StudioDefaults.txt`. A
  customised old `SLEEP n` is migrated once.
- Studio: `services/hud.rs` owns a separate always-on-top click-through window
  (`hud.html`, `src/hud/`), shown top-centre while `gyroCal.phase != 0` and for
  1.6 s after ("Gyro calibrated"). The in-app countdown pill is fed from the
  same telemetry, so the Studio timer thread is gone. `hud.html?demo[=state]`
  previews the widget in a browser.
- Settings page → Gyro Calibration (Start Delay, Duration) and Controller Sounds
  (connect / shutdown, with Preview) save immediately and are pushed to the
  running mapper by loading `StudioDefaults.txt`.
- Global chords only accept library profiles and act as held layers, so the
  chord route is: a binding inside the chord's profile that loads
  `RecalibrateGyro.txt`. Not yet verified.
- **2026-09-25 (implemented, uncommitted): moving the controller cancels the
  run.** While `CALIBRATE_GYRO` samples, JSM watches the raw gyro; above
  10 °/s for 50 ms it stops, puts back each controller's previous offset (the
  motion would otherwise be baked in as drift), and holds `gyroCal.phase = 3`
  with `reached` (0-99 %) for 2.5 s. The HUD shows "Controller moved · N %
  reached"; Studio toasts the result either way. Verified at rest (1 → 2 → 0,
  no false cancel); **the cancel itself needs a hardware check** — pick the
  controller up mid-run.

---

### TODO-29 — Per-grip sensor range (answered: not possible)

**Status:** answered 2026-09-25 — kept for the host-side alternative

Luke wants a short-range right grip (gyro) and a long-range left grip (layer).
The firmware has one range (`0x22`) and one flicker guard (`0x23`) and applies
each to both sensors (see `docs/grip-calibration-investigation.md`); Steam's
settings traffic confirms it only ever writes that one pair. The only host-side
lever is time, not distance: a separate release delay for the left grip.

- **2026-09-25 (implemented, uncommitted):** `LEFT_GRIP_RELEASE_DELAY` and
  `RIGHT_GRIP_RELEASE_DELAY` (0-2000 ms) keep a grip held that long after
  contact ends, applied in SDLWrapper after the Steam grip bits. Set from Grip
  sensors → Release delay. **Needs a hardware check.**

---

### TODO-30 — Controller-first redesign v3, through Claude Design

**Status:** open · raised 2026-09-25 · brief written

**Context** — Luke's view of the 2026-09-20 Steam Input passes: a re-skin on
old bones. The next attempt starts in Claude Design and produces an HTML/CSS
project plus a design system, which Claude Code then implements pixel for pixel.
The brief is [claude-design-brief.md](claude-design-brief.md). It consolidates
every earlier brief, audit and open UI item.

**Done when** the Claude Design output meets the brief's §13, and the
implementation matches it with every item in the brief's §4 still reachable and
the existing regression suite green.

**Notes**

- **2026-09-25 (uncommitted):** the handoff is in `JSM_GUI/jsm_gui_tauri/design/handoff/`
  and its seven implementation steps are in: tokens, icons/glyphs, the 1c shell,
  native controller navigation + Test mode, components, pages, overlay + HUD.
  Backups: `refs/backup/pre-redesign-2026-09-25` (repo and submodule),
  `refs/backup/pre-backend-2026-09-25` (submodule), step snapshots
  `refs/backup/redesign-*`. Preview without hardware: `/?mock` (`&nopad`,
  `&mapperdown`, `&configerror`).
- Backend for the system states: the mapper reports lines it could not use
  (`configErrors`: profile, file, line, text, reason) and sends a heartbeat
  packet every 0.5 s when no controller is polling; Studio reports the mapper
  exiting by itself (`mapper-status` event, `get_mapper_status`) with exit code
  and last console line. Test: `tests/mapper_config_errors_regression.cjs`.
- **2026-09-25, pages and states (uncommitted):** the remaining design pages
  are built, not just restyled: Trackpads shape tiles and region layout (15c),
  trigger calibration (15a, DualSense only), Layers "Active now · live" from
  the chord watcher's `layer-stack` event and "Suppress holds while active"
  (15e), Grip sensors live contact, release delay and haptic tiles (16a), Press
  timing with polling sources (16d), AI assistant chat with diffs (16e),
  Associations with per-app pause (`.txt.paused`, 16f), Global chords with
  Studio's reserved chords (QAM+R5 pause mapping, QAM+R4 calibrate; opt-in,
  16g), Device visibility groups (16h), Debug console (16i), Preferences with a
  Calibration HUD switch (16j), Documentation topics from the JoyShockMapper
  README (16k), controller connecting (17b, `?mock&padlater`), long-operation
  dialog (17f: import is cancellable; HidHide install and reconnect are not),
  update banner (17h, `?mock&update`), focus glide, LED brightness output
  (TODO-27), Soft pull / Full pull trigger rows, and a Studio tab strip that
  fits at 1280.
- Not built: the D-Pad "Mode" control (15d). JoyShockMapper has no D-pad mode
  to set, so it would be a control with nothing behind it.
- Needs hardware: moved-calibration cancel, grip release delay, LED brightness,
  reserved chords, paused associations.
- **0.7.72-0.7.73 (Luke: "controller navigation doesn't work"):** an old
  `controllerNavEnabled: false` (the pre-redesign keyboard/mouse-in-Studio
  switch) kept the rule off; it is reset to on once (`studioNavigationMigrated`).
  Apply loaded the configuration inside Studio; now Studio does the handover
  on its own window focus (front: AppNavigation; leaving for an app without a
  live rule: the applied configuration) and Apply re-takes the pad unless a
  Test runs (`set_studio_testing`). AppNavigation maps nothing: pads are
  unbound grids, `GYRO_ON = NONE` (the right pad used to be a mouse and the
  gyro is on by default). AutoLoad now skips `*.txt.paused`, which it used to
  load. Test: `tests/app_navigation_profile_regression.cjs`. Needs a hardware
  check.
- **0.7.74:** 0.7.73's AppNavigation left telemetry off after its
  RESET_MAPPINGS, so coming back to Studio showed "No controller" and killed
  navigation and global chords; it now carries Studio's required header
  (AUTOCONNECT, TELEMETRY_ENABLED/PORT, StudioDefaults.txt). At launch the focus
  event can beat the mapper, leaving the applied configuration live in Studio;
  the first telemetry after a launch or a 3 s silence now hands the pad to
  Studio (`mapper_came_up`).
- **0.7.75:** a controller turned off (the global chord's TURN_OFF_CONTROLLER)
  and back on was never detected: the log showed `Going from 1 devices to 0`
  and nothing after. SDL drops it, the dongle's interfaces never leave, and SDL
  only rescans on a device-change notification its main-thread window never
  receives; a fresh SDL process saw the controller. AutoConnect now restarts
  SDL's gamepad subsystem every 3 s while nothing is open
  (`RescanDevices`), covered by bug 5 in
  `tests/autoconnect_reconnect_regression.cjs`. Needs a hardware check.
- **2026-09-26, audit pass (uncommitted):** a walk of the redesign with the
  scripted pad (`window.__pad` under `?mock`) against the handoff frames, plus
  four parallel code audits (binding editor, hooks/utils, Studio pages, Rust).
  Fixed, frontend: StrictMode's second effect run focused the first filter
  chip on launch (`useKeyboardNav`); Left/Right could not walk the title bar
  because Radix triggers claimed arrows; the first D-pad press on a page
  landed on a "?" help button and then walked the column of them (help
  buttons are skipped by the arrow walk; Y still opens help); LT wrapped from
  Overview to AI assistant (clamped); arrows are now scope-aware per the
  focus model (title bar ↔ tabs ↔ page ↔ sections crossings are fixed, Up/Down
  read the page as rows so a select on the right and a slider on the left of
  consecutive rows are both visited); Up/Down on a closed Select or Menu
  trigger move focus instead of opening (A opens); Up/Down leave a single-line
  text field; the narrow drawer ping-ponged focus 60×/s (unstable `onClose`
  dep); focus glide re-measures after a dialog's scale-in; a render error no
  longer blanks the window (`ErrorBoundary` in main.tsx); the Applied segment
  shows the live layer stack and reads "Nothing applied" while the mapper is
  down; slider B-revert writes back the raw value so an unset setting stays
  unset, and `hasPendingChanges` compares canonical text so touch-and-revert
  is not "unsaved"; toasts stack (4 s, errors 8 s, click dismisses); section
  names follow the frames (Face buttons, Menu buttons, Back paddles). Naming
  the Plus/Menu button crashed (`setBindingLabel` regex escape); a
  `# @layer` with a primitive `overrides` threw on edit; layer actions were
  dropped by a cache keyed on text alone; `updateKeymapEntry` edited the
  first of a duplicated key while reads took the last; the action picker
  opened on the search box; X captures in the editor; input capture on the
  Debug console swallowed the pad; the long-operation dialog did not trap
  focus; Escape on a delete confirm also left Studio; Remove chord / remove
  association got the 17g confirm; the update banner could start two
  installs; several bridge calls had no catch. Rust: AppNavigation.txt was
  refreshed with a truncating copy on every command (now atomic, only when
  changed); layer files written atomically; `.txt.paused` rules were invisible
  to the list and to renames; terminate/launch race under the process lock;
  25 blocking commands run off the main thread (`#[tauri::command(async)]`).
  Tests: `layers_browser_regression` opens the layer menu with Enter now.
- Still open from the audit (deviations, not bugs): Trackpads (15c) region
  editor on the live preview, Joysticks (15b) card layout and "X Test
  segment", D-Pad mode (15d, no backend), binding-row origin markers and Y
  Details on closed rows (7a), Gyro sections General/Calibration/…/Diagnostics
  (6a) and the RWC helper buttons, Overview search in the header (5a),
  Configurations row facts (controller, autoload, saved time) and X/Y row
  hints (8a), 16f "last matched" and fallback row, 16j Dark/Light/System,
  17a copy and "last seen", 17d starter choice, light-bar `<input
  type=color>` not pad-operable, "+ Add app" needs a running-process picker
  for pad-only use. Dead files: `BindingRow.tsx`, `AdvancedBindingEditor.tsx`,
  `ControllerStatusPage.tsx` (its CSS module is still used).
- Working notes: Vite on this machine can serve a stale transform after two
  quick edits to one file (`curl` the module to check, touch it to refresh);
  never `git stash` while several agents edit the tree.
- **2026-09-26, second pass (uncommitted): every page and state built to
  its frame.** Buttons/D-Pad/Triggers/Joysticks/Trackpads rows are the
  design's binding row (title, long input name, origin marker, value pill;
  A Edit · X Capture · Y Details · B Back), the editor is 7a (commands,
  "+ Add command", "Capture a key", per-input Modeshifts and Layer actions,
  "Use inherited", Advanced), Triggers is 15a (behaviour row, live raw count,
  Threshold & release after the bar, "Calibrate triggers" header action,
  analog passthrough rows), Joysticks is 15b (plot card + Mode/Directions/
  Click/Deadzone rows, radial wheel with segment rows, X Test segment),
  Trackpads is 15c (region editor on the live preview, X Next region, Click
  required, Trackball, Other controller types under `trackpad-other`), the
  light bar is a swatch grid. Gyro is one page in the settings template
  (`GyroPage.tsx`: General · Calibration · Sensitivity · Noise & steadying ·
  Orientation · Dampening · Diagnostics; the "?" help button is gone from
  rows that show their description, the frame's help dot marks rows without
  one). Overview 5a (header search with Y badge, callout subtitles, origin
  dots, band mode lines, quick tiles). Studio: Configurations 8a (row facts,
  tags, "saved n min ago", A Edit · X Apply · Y Options, inline rename),
  first run 17d (`?mock&empty`; bundled starter in `constants/fpsTemplate.ts`),
  Associations 16f (last matched, Desktop fallback row, switches, running-
  process picker in "+ Add app"), 16g copy, 16h virtual-controller row, 16i
  card, 16j Dark/Light/System, 16e binding diff + "Edit in Buttons", 17a/17b
  copy with "last seen", 17g recycle-bin wording, focus after banner dismiss,
  Layers row hints and delete confirm. Backend: `library_list_profile_meta`,
  `list_running_processes`, `AutoloadRule.lastMatchedAtMs`
  (`autoload-matches.json`), `get/set_autoload_fallback` (loads the fallback
  when the front app has no rule; **needs a hardware check**), recycle-bin
  delete via the `trash` crate, bounded wait after TerminateProcess, reserved
  device names refused, case-only rename, content-compare before rewriting
  generated files. Not built, by decision: the D-Pad "Mode" row (no backend)
  and 16g's "Quick Access alone opens the Studio quick menu" row (no such
  menu exists). Dead files removed: `BindingRow.tsx`,
  `AdvancedBindingEditor.tsx`, `ControllerStatusPage.tsx`; `StickSettingsCard.tsx`
  and `BindingLabelLegend.tsx` are now unused but kept. Tests updated to the
  new structure: binding_card, shifted_binding_parity/imports,
  shifted_capture_isolation, load_config_binding, binding_row_labels,
  overview_layout, usability_audit, editor_feedback, grid_geometry,
  steam_workspace, layers_browser.
- **2026-09-26, polish pass (uncommitted):** unnamed binding rows title
  themselves by the input ("Y button" beside [F]; "Menu button / Unbound")
  instead of repeating the value pill; entering a page lands on the first
  row, never a toolbar, header action, search field or "Bind to WASD"
  (`pageEntryTarget`, `data-nav-entry-skip`); Copy / Paste tuning moved into
  the page header; the capsule keeps LB/RB and LT/RT on every row, names
  each action once, and refreshes when a page's section list appears;
  Associations switches say "A Turn on / off". Theme: the stored choice is
  now painted at launch (`initTheme` in main.tsx; before, Light reverted to
  dark until Preferences was opened), which exposed two selector bugs, both
  fixed: the compact 184px section width and prefers-reduced-motion were
  outranked by `:root[data-theme=…]` (design-tokens.css deviates from the
  handoff there, with a comment). Light mode reviewed and kept: the handoff's
  light tokens carry it; the selected segment is raised in light, where
  control and track were the same grey. Joysticks: "Directions / Unbound"
  instead of four dashes, stick modeshifts sit in the rows column.
  Trackpads: the preview shrinks to 168–220px so the right pad's rows stop
  wrapping; the click-regions hint wraps. The pad preview's "1–4" were the
  mock's key bindings, not missing labels. Tests: 50/52 with the installed
  JSM Studio running; app_navigation_profile and mapper_config_errors spawn
  their own JoyShockMapper and time out while another one holds the
  controller (both passed earlier today with nothing running).

- **2026-09-26 (Luke: "inconsistent with recognising my steam controller is
  connected/disconnected"):** both symptoms were the mapper's AutoConnect,
  not Studio. Every reconnect opens a ~6 s settle window in which the device
  count is resynced rather than acted on, and Studio's launch, every Apply
  and every focus change load a profile that flips VIRTUAL_CONTROLLER (the
  applied Cyberpunk is XBOX, AppNavigation is NONE), so each of them
  reconnects. A pad switched on inside the window was listed but never
  opened until the next churn (alt-tabbing, as it happened) reconnected for
  its own reasons; a pad switched off inside it (the chord: a profile load,
  then TURN_OFF_CONTROLLER) stayed open -- SDL keeps the gamepad object
  valid with its last state -- and was reported for the rest of the session,
  which is what Studio drew. Now `DeviceCensus.disconnected`
  (`SDL_GamepadConnected`) reconnects ahead of the window on any tick, and
  the window ends with a one-shot catch-up (`caughtUp`) when real devices
  are listed that the connect attempt did not try. Bugs 6 and 7 in
  `tests/autoconnect_reconnect_regression.cjs`; mapper rebuilt. **Needs a
  hardware check**: turn the pad on within ~6 s of launching Studio or of
  Apply; power it off through the chord, in Studio and in a game; watch the
  console for "no longer connected" / "arrived during the settle window".
  Follow-up worth doing: the churn itself. Each focus change unplugs and
  replugs the virtual pad and every reconnect hands the Steam Controller to
  Lizard Mode for a moment; AppNavigation keeping the applied
  VIRTUAL_CONTROLLER would remove most reconnects in a session.
---

### TODO-31 — Controller navigation feedback on v3 (24 remarks)

**Status:** built 2026-09-26 · uncommitted · needs a pass on real hardware

**Context**

Luke's playtest of the v3 shell with a real pad, with four screen recordings
(focus ring morph, flying ring, Configurations focus order, delayed focus).

**Done when**

Each remark below behaves as described on a real controller in the Tauri
build, not only in `?mock`.

**What was done**

- *Chord triggers also drove Studio.* While a chord is held the mapper's
  `activeProfile` is the chord's file; Studio now only reads the pad while it
  is AppNavigation (or Studio's AutoLoad rule), and after reading resumes,
  anything still held is latched until released (`PadNavigator.reset(true)`).
  `pad_navigation_browser_regression` holds RT through a chord and its end.
- *"Applied AppNavigation".* `appliedProfileLabel` treats AppNavigation like
  applied-preview; App's layer stack, Layers page and config errors use the
  applied configuration behind it (`runningProfilePath`).
- *Ring snapped size / flew in / shook on page change.* `FocusGlide` is now
  per-frame: it follows its control live, eases position, size and radius
  together from where it is drawn, and on entering a new scope waits for the
  control to hold still, then fades in. Clipped to its scroll area.
- *LB/RB spam.* One owner for page scrolling (`nav/scroller.ts`): a single
  retargetable animation per host, with a timer fallback when frames stop.
  Stepping counts from the section in flight (or just landed), not the spy.
- *Scrolled, then D-pad pulled focus back.* A move from a control more than
  70% off screen starts from what is on screen (`visibleEntry`).
- *Segmented choices had no hover.* A row with several stops rings the choice,
  tinted, and drops the row's own ring.
- *D-pad speed.* Telemetry carries `pressedSince` (Rust `PressLatch`): every
  button that went down between UI packets, so taps between display frames
  count. Visibility checks use `checkVisibility` (~0.3–0.5 ms per move).
- *Up/Down on sliders/number fields changed the value.* From the pad, every
  direction on a text/number/slider moves focus; an adjusting slider keeps
  Left/Right and leaves on Up/Down. The number box and Fine toggle are
  `data-nav-skip`.
- *Leave field lost the ring.* `nav/navAnchor.ts`: the left field stays the
  anchor and keeps the ring; A re-enters it, moves continue from it.
- *Hover for the pad.* A real pointer move over a control makes it where the
  next pad move starts (scroll-generated pointer events are ignored).
- *Configurations order.* `data-nav-region` keeps Up/Down inside the list or
  the panel (also the two Preferences columns).
- *Capsule.* View hint: "Title bar" / "Back to page"; coming back returns to
  the last control used in the page.
- *Focus landed, then moved.* Page entry waits for the page to settle (no
  structural change for 90 ms, nothing `aria-busy`), matches the remembered
  control by signature, and never overrides a move made meanwhile.
- *Also:* Manage layers dialog styled; title-bar menus no longer pull focus
  back behind a dialog they opened; unsaved-changes dialog is a vertical
  console-style choice list that takes focus; Global chords rows no longer
  squeeze their text; Preferences switches start with their stored values
  (`platform/preferenceStore.ts`); Overview lights bumpers on the real bumper
  outlines front and back, triggers on the back; the empty Advanced accordion
  is gone; Values & inheritance moved to the Editing menu as a dialog;
  paddles read L4/L5/R4/R5 everywhere; spacing in the command card.

**Notes**

- "Tactical map · Removed by R5" was accurate: Wardogs.txt only has
  `# @layer-action RSL = remove …`. "Add layer action" keeps one action per
  input per layer, so choosing Remove on R5 replaced the hold. The layer menu
  now says "Nothing turns it on · Removed by R5". Worth deciding whether that
  replacement should warn.
- Rust changed (`services/telemetry.rs`): needs the Tauri app rebuilt.
- `usability_audit_regression` waits for an "InputUseBadge" that nothing
  renders; failing before this work.

---

### TODO-32 — Haptic feedback for pad navigation in Studio

**Status:** built 2026-09-26 · uncommitted (Studio and the JoyShockMapper
submodule) · not yet felt on a real controller

**Context**

Luke asked for a tick/rumble when selecting with A, stepping sections (LB/RB)
and pages (LT/RT).

**Done when**

On the Steam Controller each of those is felt, distinct from each other, on
the side of the hand that pressed; another pad gets a short rumble; turning it
off in Preferences silences it; nothing is felt while a chord or a Test owns
the pad.

**What was done**

- Mapper: `StudioFeedback.{h,cpp}`, a loopback UDP listener on 8976
  (`FEEDBACK <effect> <intensity> <side> <rumbleMs> <rumble>`). The console
  injector starts a process per command, far too slow for a tick per D-pad
  press. Played from `joyShockPollCallback` under the controller's lock:
  firmware haptics on the Steam Controller 2026, else a rumble pulse that a
  later poll stops. Not gated on `RUMBLE`.
- Studio: `controller_feedback` command (`services/feedback.rs`, reused
  socket, only while Studio is focused and not testing); `nav/feedback.ts`
  holds the feel table (move tick, edge dull click, select click, back tick,
  section firm tick, page firm click) and the Off/Light/Medium/Strong setting
  (Preferences → Controller, local storage, previews on change).
- Only fires when the action did something; a press at the end of a list or
  page strip gets the soft "edge" click. Section and page steps report
  whether they moved (`stepSection`, `stepPageFromPad`).
- Checks: `pad_navigation_browser_regression` (click per page step on its
  side, softer at the end, nothing during a chord); Rust
  `datagrams_match_what_the_mapper_parses`; a standalone harness compiled
  against `StudioFeedback.cpp` sends real datagrams (scratch, not in repo).
  The bundled `bin/SDL/JoyShockMapper.exe` was rebuilt from the dirty
  submodule.

**Notes**

- The feel values are first guesses at the -24..+12 dB dial; tune in
  `nav/feedback.ts` after trying them on the pad.
- 2026-09-26, Luke: LT/RT paged at 60% of travel with the firmest click,
  after a lighter bump near 38% (~12,500) that is not Studio's -- most likely
  the controller firmware's own soft trigger click; not confirmed on hardware.
  Paging felt like it fired early yet still needed a long reach. Now pages at
  48% (release below 28%), and the page click is 68 / rumble 40 (was 80 / 50).
  Both regressions pull 42% (nothing) and 50% (pages).

### TODO-33 — Trackpad preview, menu sizing, joystick rows and modeshifts that stand out

**Status:** built 2026-09-26 · uncommitted · needs Luke's eye on the real app

**Context**

Luke's review of Wardogs in Studio, ten screenshots:

1. The right pad (MOUSE) previewed the four-way menu its pad-click modeshift
   opens, so it looked like a menu. Keep the virtual menu editor inside the
   modeshift, and make it the exact component the top level uses.
2. "Supply crate" overflowed its wedge with nowhere nearby to fix it: size,
   text size and icons belong where the menu is defined, not only on
   Tuning → Menu layout. "Appearance & Position" was too quiet.
3. Joysticks had become four dense columns; wrap to two rows like Trackpads.
4. Modeshifts were announced as one more row ("Click regions ·
   GRID_AND_STICK", "Add modeshift") and must stand out -- there can be
   several. "What does 'click regions' mean?" "Pad click" -- left or right?
5. The binding editor's Modeshifts / Layer actions panels: weird spacing, no
   hierarchy on their buttons. "Timing" did nothing.
6. Back paddles should show their layer actions (hold Vehicles & utility,
   hold Comms, toggle Tactical map).

**Done when**

Each item above reads as described on Wardogs in the Tauri build.

**What was done**

- `PadSection`: a pad that is not a grid draws its mode (mouse pad icon, "Moves
  the mouse"), never the click shift's menu; the "Click regions n" row is gone.
  New `appearance`, `settingPrefix` and `modeshifts` props.
- Pad modeshifts render `PadSection` itself against `TRIGGER,…` keys
  (`PadModeshiftBody` in `InputModeshifts.tsx`), full width under the pad.
  Shape and centre deadzone can now be shifted (`padModeshiftSettings`).
- `InputModeshifts` is a counted "Modeshifts" group with an add button; each
  shift is an accent banner "MODESHIFT While Right pad click is held" with what
  it becomes ("Menu · 4-way · Ping, Melee, Inventory, Sights"). The held-input
  picker names the pad side. Sticks use the same group, under the stick.
- `MenuAppearance`: width, text size, action names, keys, icons (new
  `icons off` option on the `@overlay` line, honoured by `MenuDrawing`) and
  when the menu shows, as a row beside the menu on pads, pad shifts and stick
  wheels, plus a "Menu appearance" link under the preview. "Position on
  screen" goes to Menu layout, which keeps placement.
- Joysticks: one stick per row (`mappingListSplit` removed); stick layout
  uses the pad layout's columns.
- Editor panels stack, each "title + count, one line, list, one add button";
  layer actions have a panel variant (`InputLayerActions variant="panel"`).
  "Timing" is "Options" (it opens output kind, value and behaviour; there is
  no per-command timing in JSM).
- Closed rows show every layer action as a coloured chip ("Hold · Vehicles &
  utility") beside the key; a `NONE` binding no longer shows an "Unbound" pill.
- `?mock` Wardogs mirrors the real profile's pads, paddles and layers.
- Tests: new `pad_modeshift_presentation_regression.cjs`;
  `controller_redesign_regression` follows Menu appearance → Position on
  screen instead of the removed "Appearance & Position" button.

**Notes**

- The Menu layout page still has its own size/font/labels/keys/reveal
  controls. Kept for now; removing them there is Luke's call.

### TODO-34 — Console refinement (design phase 2): Home, sheets, one state button

**Status:** in progress · raised 2026-09-26

**Context** — The second Claude Design handoff, unzipped at
`JSM_GUI/jsm_gui_tauri/design/console-refinement/`. Its README is the spec
(decisions D1–D12, frames 2a–2f, code map, verbatim copy, acceptance
checklist, and an eight-step order of work). In short: a Home screen
replaces the logo shortcut and the Tuning menu; tuning lives beside what it
tunes and opens as right-side sheets (Mouse feel, Grip sensors); Menu layout
becomes a full-window On-screen menus view; Press timing & polling moves to
Studio on a global store shared by every profile; the AI assistant gets a
"Working on" picker; Undo/Redo/Save/Apply become one state button plus a
Configuration menu; every hint shows controller glyph art, never names.

**Why** — the first redesign still did not feel like a console UI: too many
small inline buttons, Tuning and Studio hidden, unclear tuning scope.

**Done when** every box in the README's §8 acceptance checklist holds in the
Tauri build, and the existing regression suite is green (tests updated where
the design renames or removes what they asserted).

**Notes**

- Backup before starting: `refs/backup/pre-console-refinement-2026-09-26`
  (= b759a07). Step snapshots: `refs/backup/console-refinement-*`, newest at
  `refs/backup/console-refinement-latest`. Nothing committed.
- **2026-09-26, all eight steps built (uncommitted):**
  1. Shared pieces: `ui/SummaryRow.tsx` (one focus target; A opens, toggles or
     adjusts in place -- Left/Right step, A keeps, B puts back; Y Use Default;
     X What's this?; origin line "Changed in {config}" / "From {template}";
     mouse steppers while adjusting), `ExpandRow` (sub-list that B folds),
     `ui/Sheet.tsx` (640 right sheet, `data-focus-trap`, B via
     `data-modal-close`, capsule hidden, glyph footer), the state button and
     `shell/ConfigurationMenu.tsx` (1e; also "Configuration menu…" in the
     config chip's menu for mouse users), `glyphs/ButtonGlyph.tsx` (D11; a
     Switch pad gets − / + for View/Menu), capsule all glyph art.
  2. IA: `pages.ts` has `home`, no tuning group; timing and ai are Studio
     pages in §3's order. Title bar variants home / editing / studio; no
     Undo/Redo/Save/Apply and no Applied segment (the switcher menu lists
     the applied configuration and its live layers instead). Bars are 56px.
     View = Home from anywhere (closes what is open first), Menu = the
     Configuration menu, B on Home resumes editing, B on Studio goes Home.
  3. Home (2a) with live tile lines; tiles never hidden (D12).
  4. Trackpads (2b) pad columns of summary rows; Mode / Region / Click /
     Sensitivity sheets; Mouse feel sheet (2c) with the scope strip. The old
     Touchpad sensor/haptic sections are deleted; acceleration sits in the
     sheet as an ExpandRow. Light bar colour moved to a Trackpads row (sheet
     with the picker); adaptive triggers to the Triggers page.
  5. On-screen menus (2d, `keymap/OnScreenMenus.tsx`): every layer's menus
     drawn on a screen preview, LB/RB chips, Position pick-up (arrows/left
     stick move, right stick resizes via `jsm:stick-adjust`, B puts back).
     OverlayLayoutSection and MenuAppearance are deleted.
  6. Grip sensors sheet (2e); Buttons' extra section is "Grips" on a grip
     controller, without the pad clicks, with the Grip sensors row.
  7. Global timing store: `RuntimeMappingState` gains hold/dbl/sim/turbo ms,
     written to StudioDefaults.txt (every profile includes it first, so a
     file's own line still wins while applied) and injected live;
     `set_global_timing` extends `set_default_polling_ms`. Timing page (2f)
     saves on adjust end and lists files that still set a timing line (Move
     to shared / Remove from file). AI assistant "Working on" picker; its
     settings save as you type. Preferences lost its polling section.
  8. Sweep: Gyro has Essentials + "Fine tuning" rows opening Steadying,
     Orientation, Dampening and Diagnostics sheets; stick Directions,
     Deadzone and Flick-and-aim open sheets; per-section Save/Cancel
     (`SectionActions`) only renders in dialogs now (`standalone`).
- Real library note: FPS Template, Cyberpunk, The Finals, Quick Access Chord
  and Cyberpunk Trackpad Isolation all set `TICK_TIME = 1`, so the Timing
  page lists them until they are moved to shared.
- Tests: browser tests click `[data-home-continue]` after loading; the ones
  asserting removed UI were rewritten for the new design. New Rust test
  `studio_defaults_carry_the_global_timing`.
- **Calibrate gyro as a binding (Luke, same day):** `CALIBRATE_GYRO` (the full
  run with the overlay HUD) leads the action picker's JSM tab, named and
  described (`utils/commandLabels.ts`), and a bound row reads "Calibrate
  gyro". The bare `CALIBRATE` special is now "Calibrate while held (raw)".
  Test: `tests/calibrate_gyro_action_regression.cjs` (needs the dev server's
  `?mock`).
- Bugs the test rewrite found and fixed: a modeshift's Region row was keyed
  `RT1` instead of `L,RT1`; stepping a single-value `TOUCHPAD_SENS` split it
  into two values; B after adjusting an unset value wrote the default into the
  file (rows now restore the text exactly); jumping from Overview to a pad
  region never focused it (the observer missed an in-place key change); the
  Overview's "Inspect uses" named the raw input id (pre-existing).
- Suite: 53 of 53 browser/unit tests pass (run against a `vite preview` build
  on 1421 with `JSM_TEST_URL`; the calibration test against the dev server).
  Lint: 23 problems vs 24 at HEAD (the same 2 pre-existing errors).
- Needs Luke: a look on the real app and hardware, especially the global
  timing store (StudioDefaults.txt injection), View/Menu from the pad, and
  whether the five library files that set `TICK_TIME = 1` should move to
  shared.

---

### TODO-35 — Pad focus in menus and dialogs; the title bar from Menu

**Status:** built 2026-09-27 · uncommitted · not yet tried on hardware

**Context**

Luke on 0.7.83: the delete confirmation could not be used; dropdowns wore a
ring round the whole list as well as the option; no way from the pad to the
configuration, layer, output and Apply (View now goes Home); Static
sensitivity blank with no description; the editor's add buttons inconsistent;
a corner leak on the open binding card; View/Menu glyphs looking low-res.

**What was done**

- Delete/Rename from a row's options (Y): the menu's close handler put focus
  back on the row 80 ms later, unconditionally -- behind the dialog it had
  just opened, and away from the name field. It now only does that when focus
  is nowhere, and Rename's field takes focus then. Menus can name where
  focus returns (`returnFocusTo`) when their trigger is a hidden button.
- Dropdowns (`ui/Menu`): opened by pad or keyboard, focus moves to the current
  option, else the first enabled one (`enterMenu`, a few frames, since Radix
  focuses the list after mounting); the list never wears the pad ring.
- The Configuration menu (Menu / ☰) leads with the state button (Apply…),
  Configuration, Editing layer, Controller output and mapping on/off; the
  first three open their choices in place, B steps back, B again closes. The
  list effect is keyed on the view: keyed on the rebuilt items it snapped
  focus back to the current choice on every preview render. Menu now opens on
  Home and editing pages whether or not a configuration is chosen.
- Static sensitivity shows the maximum the mapper would use when unset (1,
  or the file's MAX_GYRO_SENS) and has a description.
- Editor: Commands, Modeshifts and Layer actions headings and add buttons
  share one icon + label pattern; new `command` and `modeshift` icons in the
  design handoff set (regenerated, nothing else changed).
- The open binding card's body takes the card's bottom corners.
- View and Menu glyphs redrawn on the 24 grid (and a 0.75 grid for the small
  cut) so their edges land on whole pixels; the Home chip's glyph is 24px.
- `tests/pad_menus_regression.cjs` covers the dropdown entry, the menu's
  choice lists, and Delete/Rename focus; `toolbar_regression` updated.

---

### TODO-37 — Keyboard hints, duplicate Back, pages open at the top, sound intensity, origin wording

**Status:** built 2026-09-27 · committed 2026-09-27 · 0.7.91 (Studio and the JoyShockMapper
submodule) · sound intensity needs a try on hardware

**Reported as**

"Add the option to change the intensity of the connect/disconnect haptic
sound" · "lots of duplicate 'back' buttons" · "Should show keyboard shortcut
glyphs instead of controller glyphs if the last used input method was
keyboard/mouse, and they should actually WORK" · "Some pages randomly scroll
after they load such as the Trackpads page" · "Changed in Quick Access Chord"
on the configuration being edited.

**What was done**

- *Keyboard hints:* `nav/inputSource.ts` decides pad art or keys (the pad's
  only while it is the input in use and connected); `ButtonGlyph` and the
  capsule draw keycaps otherwise. Every key named works: X/Y reach the same
  handlers as the pad's, `[`/`]` step sections, Home goes Home, M opens the
  Configuration menu, PgUp/PgDn step pages (bridge in
  `useControllerNavigation`). Overview's X (Inspect uses) and Y (search) had
  no handler at all, for the pad either; they do now.
- *Dead hints (audit):* the sheet footer names the focused row's buttons
  instead of a fixed list; Gyro rows say Documentation when Y opens it; Use
  Default not offered on disabled rows; X Edit applied only with something
  applied; Y Type removed from the AI page; X Fine only on sliders.
- *Duplicate Back:* the capsule keyed hints by button + label, and rows that
  declared B:Back got a second one from SummaryRow; repeated keys let React
  leave stale copies. One hint per button, keyed by button.
- *Pages open at the top:* the page landing restored the last focused control
  and scrolled to it after the page drew. It now lands on the first control.
- *Sound intensity:* mapper `SOUND_GAIN` (dB, the haptic-script report's
  gain byte, which was always 0); `PLAY_SOUND n [gain]`; Preferences →
  Controller sounds → Sound Intensity (Quiet −18, Soft −12, Medium −6, Full 0).
- *Origin wording:* a value the configuration sets with nothing behind it
  names no origin; an override says what it overrides ("Overrides FPS
  Template"); in a layer, "Changed in the Comms layer".
- `tests/keyboard_hints_regression.cjs`; origin tests updated.

---

### TODO-36 — Axis-true navigation, template overrides, "while released", Studio in front

**Status:** built 2026-09-27 · committed 2026-09-27 · 0.7.91 (Studio and the JoyShockMapper
submodule) · the foreground fix and "while released" need a try on hardware
· **2026-09-27:** "while released" could not have worked -- the line splitter
refused `!`; see the Done entry of the same date

**What was done**

- *Navigation audit:* every page, sheet, editor and menu walked at 1440 and
  1024. Up/Down only move vertically, Left/Right only horizontally, Down then
  Up retraces; straight ahead always wins over diagonal (`useKeyboardNav`),
  one box for "which control is this" shared by the pad and the ring
  (`nav/navBox.ts`), Documentation columns, two focus steals (Values &
  inheritance from the menu; the page-landing step overriding an early
  press). `tests/pad_axis_audit_regression.cjs` (~4 min).
- *Template overrides:* inheritance showed right except a template's label in
  the editor; a single-axis edit of an inherited pair zeroed the other axis.
  Setting an override back to what the child would inherit now drops the line
  (`utils/inheritedOverrides.ts`, through `useKeymapConfig`), counted as a
  change against the saved file; lines already equal on open are left alone.
  Layers do the same against Default (`foldLayer`).
  `tests/template_override_roundtrip_regression.cjs`.
- *While released:* `!X` -- a modeshift `!MISC6,W = U` holds while the grip
  is up (mapper: `InvertedChords.cpp`, `tests/inverted_chord_tests.cpp`), a
  layer action `# @layer-action !MISC6 = hold <id>` likewise (Studio's layer
  worker). Held/Released switches on modeshifts and in Add layer action.
  `tests/released_bindings_regression.cjs`; the mapper end-to-end
  `inverted_chord_mapper_regression.cjs` needs Studio closed.
- *Studio in front:* the window's Focused event follows the top-level
  window's keyboard focus, which the WebView's child window takes -- so
  Studio could count itself as not in front, stop feeding the UI telemetry,
  and a controller switched on did not appear until an app switch. The
  foreground window's process now decides (`services/foreground.rs`), for the
  UI feed and the controller handover. It follows Windows' foreground
  events (SetWinEventHook), not a poll; the hook thread asks once more after
  installing, since the main window is shown before the hook exists and its
  foreground event would otherwise be missed at launch.
- *Controller in Lizard Mode until an app switch:* SDL only handles its HID
  device-change window on the thread that called SDL_Init -- the mapper's
  main thread, which sat in `getline` and never pumped messages. A Steam
  Controller switched on through the dongle went unseen (still in Lizard
  Mode) until the next command Studio happened to send, typically the
  AppNavigation load on refocus. The mapper now waits for console input with
  `MsgWaitForMultipleObjectsEx` and dispatches window messages meanwhile
  (`waitForConsoleCommand`, main.cpp). An idle rescan that finds a device now
  connects in the same tick instead of the next.

---

### TODO-39 — Flicker guard stuck at 5%, haptic preview, typed values, modeshift triggers on the Overview, Configurations Apply

**Status:** built 2026-09-27 · committed 2026-09-27 · 0.7.91

**Context**

Six remarks from Luke on 2026-09-27:

1. Grip sensors › Flicker guard could be lowered but not raised past 5%.
2. Previewing a grip haptic meant Save, Apply and Test mode (or alt-tab).
3. Number rows with ‹ › arrows could not take a typed value, and had one step size.
4. Holding D-pad Left on Cyberpunk said "29 shifted". D-pad Left shifts one
   input, the right trackpad (into a 2x2 button pad); the 29 were its grid
   size, click and touch-stick settings and 25 region cells. The D-pad Left
   row's "Inspect uses" button and its "Where Left is used" modal (raw
   "Rt2 → NONE →" rows) were ugly and did not say what the use was.
5. Configurations: Apply only saved ("Saved The Finals. It stays off the
   live mapping until you Apply it"); Edit needed two presses.
6. Configurations: a shortcut (Y) to apply a row without walking to Apply.

**Done when**

- The flicker guard climbs from 5% one step at a time.
- A grip haptic's strength and effect play on the controller as they change,
  and on X, before anything is saved.
- Any number row takes a typed value (Enter keeps, Esc drops the typing) and
  X swaps coarse and fine steps.
- Holding a modeshift trigger counts inputs, not config keys, and names a
  single one; the Overview decorates a trigger with a modeshift tile and the
  inspector shows one modeshift row per input changed.
- Apply on Configurations applies; one Edit press opens the configuration;
  Y applies the focused row.

**Notes / what was done**

- *Flicker guard:* the firmware stores 25–100 whole numbers and 1% is 0.75 of
  one, so rounding put a +1% step back where it started (Cyberpunk had 96 =
  5%). `gripGuardStepRaw` / `gripRangeStepRaw` (utils/gripCalibration) move
  the stored value at least one unit toward the new percent. Both rows now
  step 5% coarse, 1% fine. The guard has 76 levels, so fine steps
  occasionally skip a percent (9 → 11); that is the controller's resolution.
- *Haptic preview:* `utils/hapticPreview.ts` plays an effect at a strength
  through Studio's own feedback channel (the UDP `FEEDBACK` datagram
  nav/feedback.ts uses), unscaled by Studio's feedback strength, on the grips
  that pulse (Grip sensors) or the pads set to Mouse (Mouse feel). Plays on
  every change of Strength or Effect, and on X. The grip sheet sends the
  datagram's new optional sixth field (target 1, StudioFeedback.h), and the
  mapper plays it through `JslWrapper::SetGripHaptic`: PULSE and TAP at the
  grip actuators, as the grip sensors' own pulse plays them (a binding's
  PULSE/TAP still aims at the pads). A five-field datagram parses as before.
  Harness: `JoyShockMapper/tests/studio_feedback_harness.cpp`; Rust test in
  `services/feedback.rs`. The bundled mapper (src-tauri/bin/SDL) was rebuilt
  at 19:53; it reaches the installed app with the next installer build.
- *Number rows (SummaryRow adjust):* typing 0-9 . , - on a focused number
  row starts adjusting and replaces the value; Backspace edits, Enter/A
  keeps (clamped), Esc drops the typing, an arrow keeps it. `fineStep`
  (default 1 for a whole-number step, a tenth otherwise); X toggles it while
  adjusting, Shift+arrow takes one fine step. A caption under the row says
  the step size and, on the keyboard, that a number can be typed.
- *Modeshift count:* `utils/shiftedInputs.ts` maps a shift target to the
  input it belongs to (RT/LT/T cells and sided pad settings → the pad, LM/RM
  segments and stick settings → the stick, gyro settings → gyro).
  `shiftTriggerTargets` collects inputs; `heldStatus` carries them; the title
  bar and capsule name a single one ("Left held → Right pad", short because
  the slot is a fixed 220px). The Overview's "Shifts n" chip names one input
  ("Shifts Right trackpad") and its relation prose groups by input.
- *Overview decoration:* the "Inspect uses" button is gone. A compact callout
  (D-pad, face buttons) hangs its relations under it as concept tiles —
  crimson modeshift tile "Right pad", chord tiles, layer tiles in their hue —
  each opening the inspector. X still opens it from the pad.
- *Uses inspector* rebuilt as a sheet (`components/InputUsageInspector.tsx`,
  replacing LayerBar's modal): "While D-Pad Left is held" → one row per input
  changed: held cap + "+" + the input's glyph, name, and what it becomes
  ("Button pad · 2×2 grid · no click needed · touch stick: directions ·
  region 1 → F3"); A opens that input's editor. Also "Changed while another
  input is held", "Pressed together", "Layers", "Settings that listen to it",
  and the same per layer. The design handoff (binding-card-refresh §2a) only
  specifies the chip and "full prose in the inspector"; the row follows §3's
  modeshift row.
- *Configurations:* `onApply` was `handleApplyWithFinalize`, which only
  saves; it now runs the title bar's action (save and apply with edits
  pending, apply otherwise). New `onEditLibraryProfile` switches and opens
  the Overview in one press, after the unsaved guard's answer when there is
  one. Y applies the focused row (or the selected one from the side panel);
  X opens a row's options (was Y). The Apply button carries a Y cap.
- Tests: `tests/row_stepper_haptic_preview_regression.cjs`,
  `tests/configurations_apply_edit_regression.cjs`,
  `tests/modeshift_trigger_overview_regression.cjs`; updated
  `binding_card_review`, `overview_binding_lines`, `usability_audit`,
  `pad_menus` for the new wording and the X/Y swap.

---

## Done

### "While released" modeshift never loaded: `!MISC6,S = X_UP` was an unknown command — 2026-09-27

**Status:** DONE 2026-09-27 (JoyShockMapper submodule, mapper rebuilt and bundled) · **needs a live check**

Reported as: a modeshift that should make A send d-pad Up while the left grip
is released did nothing. The line Studio wrote is right, and the mapper's
released-chord machinery (TODO-36: `InvertedChords.cpp`, `operator>>`,
`JSMAssignment::getModifiedCmd`) all understood it. The one place that did not
was the first: the regex `CmdRegistry::processLine` splits every line with
admitted `[+-]?\w*` as the chord, so a leading `!` failed the match and the
line was reported as `unknown command !MISC6,S = X_UP`. `isCommandValid` had
the same pattern. The end-to-end `inverted_chord_mapper_regression.cjs` would
have caught it and had never been run (it needs the live mapper out of the way;
it still cannot get telemetry with Studio running).

Fix: the split lives once in `include/ConfigLine.h` (`splitConfigLine`), used
by both sites, and its chord group takes an optional `!`. Nothing else in the
pattern changed; a `!` anywhere but the chord still ends up refused by the
registry as before. `tests/config_line_tests.cpp` (standalone, MSVC) covers
the released chord, sign buttons, labels and the plain lines.

---

### Overlay and HUD vanished behind Cyberpunk after alt-tabbing — 2026-09-27

**Status:** DONE 2026-09-27 · confirmed in-game by Luke

Reported as: the left-pad chord menu stopped drawing, in-game and on the
desktop, while its bindings kept working; toggling the overlay did nothing,
restarting Studio fixed it until the next few alt-tabs. Codex's live check
found the game window topmost and stacked above the overlay: the shell promotes
a borderless-fullscreen window to the top of the topmost band when it takes
focus, and nothing in Studio ever raised the overlay again. `set_always_on_top(true)`
on enable is a no-op once the flag is set, hence the useless toggle.

Fix (`services/overlay.rs`): a native repair that walks the windows above ours
and re-raises with `HWND_TOPMOST` + `SWP_NOACTIVATE` only when a visible,
non-click-through window overlaps. It runs from the foreground hook, after every
show of the overlay or HUD, and from a 250 ms guard thread (a covered WebView
throttles its JS, so the page cannot rescue itself). Covered by a real-Win32
unit test (`stacking::tests`). Whether RenoDX/ReShade have any part in the
game's promotion is unconfirmed; the fix does not depend on it.

---

### TODO-38 — Gyro calibration survives a reconnect; hardware calibration switch

**Status:** DONE 2026-09-27 · committed 2026-09-27 · 0.7.91

**Reported as**

"save each controllers offset so we can restore the last gyro calibration value
on next reconnect. Also, can you add a global setting for 'Disable hardware
calibration' so steam controller users recognise we have that feature."

**Fault**

A reconnect (any controller switching on or off, via AutoConnect) rebuilds
every `JoyShock`, and each one's `GamepadMotion` starts at a zero offset. With
`AUTO_CALIBRATE_GYRO = OFF` every controller drifted until recalibrated. The
firmware auto-cal switch (settings 84/85) was hard-coded off with no setting.

**Fix**

- `connectDevices` saves each controller's offset, keyed by
  `JslWrapper::GetControllerKey` (vid:pid:serial:path on SDL; empty on JSL,
  which opts out), and restores it on the new `JoyShock`. Zero offsets and
  mid-calibration offsets are not saved.
- Persisted to `GyroCalibration.dat` in JSM_DIRECTORY (Studio's runtime dir),
  temp-file-plus-rename, written when it changes: at a reconnect and when a
  calibration finishes (Studio kills the mapper, so there is no exit hook).
  Loaded at the first connect. "Better a stale bias than zero" was Luke's call
  on 2026-09-27.
- Not captured: offsets `AUTO_CALIBRATE_GYRO` learns between reconnects, if
  Studio exits first.
- `DISABLE_HARDWARE_GYRO_CALIBRATION` (Switch, default ON, exempt from
  RESET_MAPPINGS): `applyTritonSettings` writes 84=0,85=0 or 84=1,85=100 when
  it changes and once per connection.
- Studio: Preferences > Gyro calibration > **Disable hardware calibration**,
  with the firmware-bug explanation; written to StudioDefaults.txt.

**Done when** — calibrate, switch the controller off and on (and separately,
restart Studio), and the gyro does not drift; the Preferences switch flips the
firmware behaviour live. Not yet checked on hardware (the live JSM is
elevated; the build, Rust tests and a file round-trip harness pass).


### TODO-22 — A shifted binding could not be un-named

**Status:** DONE 2026-09-13 · uncommitted

**Reported as**

"in my wardogs config the facebuttons have a couple modeshifts and it is not
possible to unset an inherited label that was set in the main face button
bindings. If you try making the input empty then it will refill with the label
set in the main face button binding."

**Fault**

A shifted card with no label of its own shows the unshifted input's, so a shift
is never anonymous (`InputModeshifts.tsx`, the `bindingLabel` prop). Clearing
the field wrote an empty label through `setBindingLabel`, which deletes the
line -- and with no line for the shifted key, the very next read fell through
to the input's own label and put it straight back. The two halves disagreed:
the writer had no way to record "cleared" and the reader treated absence as
"inherit".

**Fix**

- `setBindingLabel` takes `{ keepEmpty }`, which writes the empty label as its
  own line (`# @label L,S =`) instead of deleting it.
- `parseBindingLabels` keeps empty label lines rather than skipping them, so a
  cleared shift reads as `''` -- falsy everywhere that renders a label, but
  distinct from "no line" in the fallback, which is the only place it matters.
- The shifted card passes `keepEmpty` only while the input has a label to
  suppress, so clearing a shift of an unnamed input still leaves no line behind.
- `ControllerStatusSvg`'s two pad names fall back with `||` rather than `??`,
  so a hand-written empty label cannot blank the diagram.

The annotation survives Save untouched: `configSerializer` preserves any
`# @label` line verbatim.

**Verified** against the dev server with a profile carrying `# @label N = Jump`
and an `L` shift on N: the shifted card shows Jump, clearing it leaves it clear,
the save writes `# @label L,N =` alongside the unshifted label, and reopening
the card shows it still empty while the input keeps its own name.

**Guard**

`tests/shifted_label_clear_regression.cjs` -- the fallback, the clear, the
save round trip, naming it again, and the unnamed-input case. Verified to fail
on the previous `bindingLabels.ts` ("Jump" !== "").

---

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

### TODO-1 — Inherited indicator on every exposed setting, not just button cards

**Status:** DONE 2026-09-17 · 0.7.49 · uncommitted

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

**Outcome**

Done by the per-value origin marker added for the usability audit, rather than
by a new mechanism: `SettingOrigin` (`src/components/SettingOrigin.tsx`) reads
the import resolution and the selected layer, and is rendered by `NumberField`,
`AppSelect` and each binding row in `BindingEditor`. It is the shared wrapper
the Notes argued for — controls pass one `setting` prop rather than two, and
`SettingPrefix` supplies the modeshift prefix for a whole panel.

It reads `Inherited · FPS Template`, `Default → FPS Template` inside a layer,
`Override · Comms`, `This profile` or `App default`, and carries the matching
restore button (`Use inherited` / `Use Default`) beside the value itself, so an
override is undone in place rather than through raw keys in Manage layers.
`SettingsInventory` lists every effective value with its origin for anything
not individually threaded.

Sensitivity, trackpad tuning, grip sensors, timing, gyro, modeshifts and
binding rows all carry it — about 90 controls.

**Verified**

`tests/config_imports_ui_regression.cjs` now covers a trackpad mode dropdown, a
settings field (grid size) and an `RT1` grid cell, all inherited from an
imported file; that overriding the grid size marks that control alone and
leaves the mode dropdown and the grid cell inherited; and that `Use inherited`
restores the imported value in place. Per-binding origin and reset inside a
layer are covered by `tests/usability_audit_regression.cjs`.

Not installed or tested on a physical controller.

---

### Usability audit follow-through — 2026-09-17

**Status:** DONE 2026-09-17 · 0.7.49 · uncommitted

Implements the ten findings in `docs/ui-audit-2026-09-17.md`.

- Availability is now activation-aware: an input that only enables gyro or only
  drives an analog trigger says so (`Enable gyro`, `Analog left trigger →
  Xbox`) instead of `Unbound`, and `Available inputs` lists what is genuinely
  spare, including grid cells that exist in the geometry but hold no binding.
- Discard now drops the draft instead of returning it on the next visit.
- Creating a layer selects it, and the migration checkbox starts clear and says
  how many assignments it would move.
- Layers compose: persistent layers stack in application order with held layers
  on top in press order, last one winning a conflict, and Remove affects only
  its own layer. The composed profile is named for its layers, so the applied
  label reads `Wardogs · Vehicles + Comms` while the picker still edits one.
- Hold/Apply/Remove layer are ordinary binding choices on the input itself.
- Per-value origin and in-place restore — see TODO-1.
- Overview describes effects, offers search and binding/modifier filters, and
  each use opens the setting behind it.
- Narrow widths use a navigation drawer; Back retraces to the originating
  input and restores its focus.
- One shared device identity across diagram, rows, glyphs and tooltips.

**Verified**

39 browser/node regressions and 32 Rust unit tests pass, including
`tests/usability_audit_regression.cjs` and the layer-activation composition
tests. Two faults found while finishing this and fixed here:

- The narrow-width drawer button printed the internal tab id (`triggers`), and
  `tests/select_help_panel_fit_regression.cjs` could not navigate below 1060px
  because the rail it clicked is now behind that drawer.
- `readLayers` required a `trigger` key while the mapper defaults it
  (`config_layers.rs`), so a hand-written Apply/Remove-only layer ran on the
  controller while being invisible in every editing surface.

Not installed or tested on a physical controller. Finding 4 in particular
wants a controller playtest: composition is covered by unit tests only.

---


### Overview readability — 2026-09-16

Grouped shoulder, grip, back and middle inputs beside the controller; sticks,
D-pad and face buttons below it, with separate trackpad groups. Binding rows
grow with wrapped text and modeshifts are separate lines. Horizontal layer
preview buttons share the editor selection. Controller highlights use blue;
shared input glyphs have solid silhouettes and family-specific shoulder labels.
Also fixed annotation comments being parsed as extra chord bindings.

Verified the production frontend build and browser regressions for dense
bindings, layer switching, input navigation, narrow layouts and offline use.
See tests/overview_layout_regression.cjs. Packaged in the 0.7.47 NSIS installer;
version and SHA-256 verified. Not installed or tested on a physical controller.

### Full trigger pull never fired on a trigger that stops short — 2026-09-18

**Status:** DONE 2026-09-18 · 0.7.50 · uncommitted

**Reported as**

"I also have a binding on the full pull of the left trigger, which is supposed
to hold the shift key, but that doesn’t seem to be doing anything."

**Fault**

`ZLF = LSHIFT` was correct in the profile, in the applied copy and in every
composed layer, and `ZL_MODE = NO_SKIP` does allow a full pull. But the mapper
decided a trigger was fully pulled with `position == 1.0` — an exact float
comparison, at seven sites in `JoyShock.cpp` — while `position` is the SDL axis
divided by `SDL_JOYSTICK_AXIS_MAX` (`SDLWrapper.cpp`, `GetLeftTrigger`). A
trigger that stops one count short of 32767 therefore never satisfies it, and
the full-pull binding silently never fires. The soft pull is unaffected because
it compares `position > threshold` (`InputGuards.h`).

**Change**

`fullPullPressed(position)` in `InputGuards.h` (`>= 0.99f`, non-finite guarded)
now backs all seven sites, including the two `X_LT`/`X_RT` chord-stack updates,
which had the same latent fault for a virtual-gamepad full pull.

Studio gained a raw trigger readout under each shoulder, shown with the
Overview’s **Details** toggle. It prints the axis count against its maximum
(`32766/32767`), not a decimal: one count short still rounds to `1.0000`, which
is the exact distinction that decides whether a full-pull binding can fire.
Steam drawing only — the other families share DualSense geometry (finding 10),
which was not worth risking a text collision in without rendering it.

**Verified**

JoyShockMapper compiles; 39 browser/node regressions and 32 Rust tests pass.
The readout was rendered against a synthetic `32766/32767` left trigger and a
`32767/32767` right trigger and reported both correctly.

**Not verified:** whether Luke’s left trigger actually stops short. That is the
hypothesis this fixes, and it needs the controller — the readout is in the build
so it can be answered. If the trigger does reach 32767, the real cause is still
open and this change is merely a robustness fix.

0.99 is a judgement call: a trigger pulled to 99% now counts as a full pull.
Worth revisiting against the measured value.

**Follow-up 2026-09-18 (0.7.52):** confirmed from the console — the full pull
now fires, so the trigger does stop short of the axis maximum. But it fired as
`ZLF: true / false` on alternating polls: the engage test had been relaxed to
0.99 while the three release tests still read `position < 1.0`, so anything
resting between them engaged and released every poll and machine-gunned the key.
`fullPullPressed` now takes the previous state and releases at 0.97, and the two
`X_LT`/`X_RT` level tests latch through `_fullPullDown`. Covered by
`tests/trigger_full_pull_harness.cpp`.

---

### Live controller view went laggy on a complex profile — 2026-09-18

**Status:** DONE 2026-09-18 · 0.7.51 · uncommitted

**Reported as** "the live joystick/touchpad is really laggy in the UI now".

**Fault**

Not the layer conversion and not the trigger work, though both were suspected.
Measured at 250 Hz synthetic telemetry on Wardogs: **17.8 fps, worst frame
123 ms**, and only 37 of ~1000 samples delivered in four seconds. The same
profile in its pre-conversion modeshift form measured 17.0 fps, and a minimal
profile 62.8 fps — so the cost tracked configuration size, not layers.

A CPU profile put 59.8% of self time in `layerEntries`, 11.9% in `inputUsage`
and 8.6% in `parseComboBindings`. The usage badges, per-value origins and
modifier filter added for the usability audit are all pure functions of the
configuration text, but they were called per input per render — and renders are
driven by controller telemetry, so the profile was being re-parsed hundreds of
times a second.

**Change**

- `layerEntries` caches its last 8 whole-configuration parses, frozen, keyed by
  text. Single-line lookups are deliberately not cached: each line is a distinct
  key that would evict the configuration.
- `configLines` does the same for the line split in `keymap.ts`, for the two
  read-only scanners only. The four writers there mutate their array and keep
  their own split — freezing a shared one would have broken them.
- The Overview memoizes its modifier options, and the per-row "Inspect uses"
  button reads `hasUses` from the `bindings` memo instead of recomputing
  `inputUsage` for every input on every frame.

**Result** on the same measurement: **59.3 fps, worst frame 30 ms**, 144 samples
delivered — roughly 4x the throughput and 4x better latency, at the 60 fps cap.

**Verified**

39 browser/node regressions and 32 Rust tests pass. The freezes are the risk
worth noting: any future caller that mutates a cached parse will now throw
rather than corrupt a shared value, which is the intended trade.

Measured headless at 1440x900, not on the real device: the remaining cost is
still `inputUsage` and `parseComboBindings`, which scan per input rather than
building one index per configuration. That refactor was not attempted here.

---

### Live preview follows the monitor, not a fixed 60 Hz — 2026-09-18

**Status:** DONE 2026-09-18 · 0.7.53 · uncommitted

**Asked for:** "While the UI is focused I would like it to use the max refresh
rate of my monitor."

**Where the 60 Hz came from**

Two caps, both deliberate at the time. `useTelemetry` published on a
`1000 / 60` timer, and the emitter in `telemetry.rs` refused to send a UI packet
more often than `Duration::from_micros(16_667)`. Raising either alone would have
changed nothing.

**Change**

The overlay already solved this: it measures its display and reports the rate
through `overlay_set_refresh_hz`, with a comment about "the 60 Hz the main UI is
intentionally capped to". The main window now does the same.

- `ui_interval_us` in `AppState`, defaulting to the previous 60 Hz until the
  window reports, read by the emitter in place of the fixed interval.
- `ui_set_refresh_hz` command, clamped to 30..1000: below 30 the preview
  stutters, above 1000 it would outrun the mapper own tick.
- `useTelemetry` publishes on `requestAnimationFrame` rather than a timer, so
  the pace is the panel own clock, and samples arriving between frames replace
  the pending one instead of queueing.
- The rate is measured over 40 frames and re-measured on focus, since the
  window may have been dragged to a different monitor.

Emission is still gated on `telemetry_ui_active`, which the window Focused
event drives, so an unfocused window costs nothing however fast its display is.
That was the existing behaviour and it is unchanged.

**Verified**

`tests/telemetry_performance_regression.cjs` was rewritten around the new
contract: it drives the real hook against a fake 120 Hz frame clock and asserts
the rate is reported as 120, that 120 packets produce ~120 updates rather than
60, that a burst inside one frame collapses to a single update, and that idle,
blurred and hidden windows schedule nothing. A Rust test covers the Hz-to-
interval maths and the clamp. 39 browser/node regressions and 33 Rust tests
pass.

**Not verified:** the actual rate on the real monitor. Measured in a headless
browser the publish rate is render-bound on a large profile, not cap-bound, so
the ceiling being lifted is shown by the unit test rather than by a frame
count.

---

### Overlay drew the wrong menus, and its touch dot missed the finger — 2026-09-18

**Status:** DONE 2026-09-18 · 0.7.54 · uncommitted

**1. A chord swap left the previous profile’s menus on screen**

Reported as: holding the global chord and moving the right stick put up the
weapon wheel on the FIRST movement, but not on a second one.

The overlay re-read the running configuration on a `setInterval(load, 2000)`
and nothing else, so for up to two seconds after a binding swapped the
configuration it still held the old menus. The first tilt in that window drew a
wheel for a stick that is a scroll wheel in the config actually loaded; by the
second tilt the poll had landed, which is what made it look intermittent.

The overlay packet now carries `activeProfile`, and the hot path drops every
menu and re-reads the moment it changes. The interval stays as the backstop for
a file edited underneath us.

**2. The touch dot sat up and to the left of the finger**

It was centred twice — `margin: -8px 0 0 -8px` and `translate(-50%, -50%)` —
and its offsets start at the pad’s padding box while the container units that
move it measure the content box. At the top-left corner the dot was almost
entirely outside the pad; at the bottom-right it stopped short of it.

The margin is gone and the inset is now one `--pad-inset` variable that both
the padding and the dot’s origin read, so the dot shares the box the regions
are drawn in. `.radial` sets it to 0, matching its own `padding: 0`.

**3. Wedges painted over the pad’s rounded corners**

A wedge is a clip-path triangle filling a square cell, and `.pad` had
`border-radius` but no `overflow: hidden`. Clipping there both cuts the wedges
to the corners and rounds the block of wedges, which has no corners of its own
to round.

**Verified**

Two new tests: `tests/overlay_touch_dot_regression.cjs` puts the dot at both
corners and the centre within 1.5px and asserts the pad clips; and
`tests/overlay_live_profile_swap_regression.cjs` swaps the running profile and
asserts the first tilt afterwards shows nothing, then that the real menu
returns. 41 browser/node regressions and 33 Rust tests pass. Screenshots of
both pad corners are in `tmp/ui-verify-2026-09-18`.

Not tested on the physical controller.

---

### TODO-23 — L4 + START no longer opens the Wardogs Menu configuration

**Status:** DONE 2026-09-18 · 0.7.55 · uncommitted

**Fault**

The console settled it. The binding was mapped and firing:

```
LSL,+ mapped to Instant profiles-library/Wardogs Menu.txt
LSL,+: true
```

...and the load was being discarded. `CmdRegistry::loadConfigFile` carried:

```cpp
// Autoload may enqueue a file while a chord is held. Leave the held
// configuration intact; only the internal restore may replace it.
if (!_chordRestore.empty() && !_chordLoading && _loadingFiles.empty()) return true;
```

`_chordRestore` is non-empty for the whole time a chord OR a layer is held,
because Studio activates both with `STUDIO_CHORD_BEGIN`. Holding L4 activates
the Vehicles & utility layer, so every outside load was swallowed — and a
binding that loads a config reaches `loadConfigFile` by exactly the same route
Autoload does (`WriteToConsole` in `Mapping.cpp` and `AutoLoad.cpp`), so the
guard could not tell them apart. It returned true, and the binding looked dead.

This is why it worked before the layer conversion: holding L4 was an ordinary
modeshift inside the mapper, and nothing was being held at the registry level.

**Change**

Autoload now announces itself — `STUDIO_AUTOLOAD <path>` — and the registry
ignores that one line while a configuration is held. The blanket guard is gone,
so a binding the player pressed loads its config even while a layer is held.
The held state then clears itself through the `RESET_MAPPINGS` at the top of
the newly loaded profile, so a later `STUDIO_CHORD_END` cannot restore over it.

**Not verified on hardware.** The mechanism is read from the source and the
console output; the reported symptom should be gone, but only the controller
can confirm it.

**Follow-up 2026-09-18 (0.7.56):** confirmed working, and it exposed the other
half. Returning from the menu profile left every layer dead, because the load
does not clear `_chordRestore`: the clear inside the `RESET_MAPPINGS` branch is
guarded on `_loadingFiles.empty()`, which is never true while a file is being
loaded. The flag survived, and `STUDIO_CHORD_BEGIN` opens with
`if (!_chordRestore.empty()) return;`, so every later chord and layer was
refused in silence. A deliberate top-level load now clears the held state and
its restore lines, which is what the earlier note wrongly assumed already
happened.


---

### Layer activation reworked around context, and one hold at a time — 2026-09-18

**Status:** DONE 2026-09-18 · 0.7.58 · uncommitted

Two corrections from Luke, both of which changed the model rather than a config.

**1. An activator belongs to a state, not to the root**

Asked for: menu mode entered with L4 + START and left the same way. The first
attempt made `LSL,+` a chord in the root configuration, which Luke rejected:
if L4 holds the Vehicles layer then START pressed there belongs to *that*
layer, not to a root chord. Nothing in the root should fire while a layer is
held.

So an activator is now read in the state it belongs to: **Apply while its layer
is off, Remove while it is on.** A layer can never apply and remove itself in
one press, the same input can serve as both (the earlier apply==remove toggle
special case falls out of this for free and was deleted), and the two can
differ. Menu is therefore Apply `LSL,+`, Remove `+`: entered from inside
Vehicles & utility, left with START alone.

Writing that rule immediately broke `held_layer_restores_persistent_layer_and_
remove_can_cancel_a_hold`: Remove could no longer cancel a *held* layer,
because a held layer is not latched. Remove is now read while the layer is on in
either sense.

Activators may also be chords: `layer_pressed` splits on `,` and requires every
part down. `LayerBar` keeps an assigned chord in its dropdown, which only lists
single inputs, so opening the panel cannot silently replace one.

**2. Only one layer is held at a time**

Held layers used to compose in press order. They no longer do: `held_order`
remains the press-order stack but only its top is active, so a second hold takes
over completely and releasing it falls back to a hold still under the finger,
then to the persistent layers, then to Default. `held_layers_compose_and_
release_independently` asserted the old rule and now states the new one.

**Verified**

37 Rust tests and 41 browser/node regressions pass, including a test of the
exact menu flow and one pinning what happens when a toggle chord shares a button
with a hold layer. `docs/config-layers.md` and the Manage layers copy now
describe both rules.

**Still open:** a held layer is not suppressed while a persistent layer is
active, so L4 still holds Vehicles & utility in menu mode. Luke expects it not
to. That needs a way for a layer to say it excludes holds; not invented here.

Not tested on the physical controller.

---

### Layer behaviour checked against Steam, and corrected — 2026-09-18

**Status:** DONE 2026-09-18 · 0.7.59 · uncommitted

Luke asked how Steam actually does this, since our layers are copied from it.
Read from Valve’s Steamworks documentation (Action Set Layers, General Concepts,
ISteamInput), not from memory.

**What Steam does**

- Action sets: "Only one action set can be active for any given input device at
  a given time." They replace the layout wholesale. In legacy mode — a
  player-made configuration, which is our case — "action set changes must be
  manually triggered by the player themselves."
- "Activating a new action set will clear all active layers from the old set."
- Layers: "More than one layer can be applied at a time and will be applied
  consecutively", with no technical limit, and "the last layer applied will
  override any conflicting information that came before."
- Applying an already-active layer does nothing and does not reorder it;
  deactivating and reapplying puts it on top.
- There is no nesting. `ActivateActionSetLayer` / `DeactivateActionSetLayer` /
  `DeactivateAllActionSetLayers` operate on a flat ordered stack, and
  `GetActiveActionSetLayers` returns an array of everything active.

**What that changed here**

- **Stacking restored.** 0.7.58 had made only one layer holdable at a time. That
  is not Steam: holding a second layer adds it on top and releasing it removes
  only that one. Reverted, and the test now states the documented rules.
- **Menu mode goes back to being a separate configuration.** A Steam action set
  is a whole alternative layout, one at a time, player-switched, clearing the
  layers of the set it leaves — which is precisely what loading another profile
  already does here (the worker resets activation and re-prepares layers for the
  new profile). So `Wardogs.txt` + `Wardogs Menu.txt` was the right shape all
  along; it only looked wrong because the mapper was swallowing the load, fixed
  in 0.7.55/0.7.56. `Wardogs Layered.txt` is left on disk, unused.

**Kept from the layer work**, because these do match Steam: an activator is read
in the state it belongs to (Apply while off, Remove while on — which is also why
applying an active layer is a no-op), and an activator may be a chord.

`docs/config-layers.md` and the Manage layers copy now describe Steam’s rules
and say plainly that a separate configuration is our action set.

37 Rust tests and 41 browser/node regressions pass. Not tested on the physical
controller.

---

### Layer actions removed from the output list — 2026-09-18

**Status:** DONE 2026-09-18 · 0.7.60 · uncommitted

Luke noticed there were two places to bind a layer action and asked why.

They were never two ways of doing it. The section under the binding card is the
editor; the three entries in the Output dropdown set nothing at all. Choosing
one dispatched `jsm:edit-layer-binding` and returned before touching the
binding. Observed rather than assumed: the configuration was unchanged, the
dropdown snapped back to its previous value, the section opened below, and
focus stayed on the dropdown — the handler focuses the section, but Radix
restores focus to its own trigger when the menu closes, and that wins (checked
at 50ms and 600ms).

They came from the audit finding 5, which wanted layer actions reachable from
the ordinary binding editor instead of only from Manage layers. But a layer
action cannot be an output value: it needs a layer as well as an action, one
input can carry several, and it coexists with that input’s ordinary binding.
So the dropdown could only ever be a signpost to the section, and it read as a
duplicate mechanism instead.

Removed: the option group, the handoff in `handleOutputKindChange`, the listener
in `InputLayerActions`, and the ref that existed only to serve it.

`tests/layers_browser_regression.cjs` now asserts the output list offers no
layer entries, still offers real outputs, and that the section is on the same
card. 41 browser/node regressions and 37 Rust tests pass.

---

### Overview: layer actions look like layer actions, and a modifier says what it changes — 2026-09-18

**Status:** DONE 2026-09-18 · 0.7.61 · uncommitted

From Luke, reviewing screenshots: layer bindings should be distinct, and
"Modeshift trigger · 1 changed inputs / settings" raised more questions than it
answered.

**Both were fair.** A layer action changes what the whole controller is doing,
not what one input emits, and it was rendered as another plain line among the
bindings. And the modeshift line counted rather than named: it said there was
something to find without saying what it was or where it lived. The grammar was
wrong for one, too.

**Change**

An Overview line now carries its kind (`OverviewLine`), so a layer action can be
rendered as one: the layer icon and the same blue the layer badges already use.
Relationship lines are muted, because they are context about other inputs.

The modeshift summary names what it changes. With one affected input there is
room to say what it becomes, reusing the same output description the binding
rows use, so `L4` now reads `While held: Menu → Load Wardogs Menu` instead of
`Modeshift trigger · 1 changed inputs / settings`. With several it names the
first three and counts the rest. A pad cell keeps its own name rather than being
title-cased into `Rt1`.

**Verified**

`tests/overview_binding_lines_regression.cjs` covers a layer action being marked
and iconed, the one-input wording, the crowded wording, the pad-cell name, and
that neither half of the old string survives anywhere on the page.
`overview_layout_regression.cjs` asserted the old wording and now states the new
one. 42 browser/node regressions and 37 Rust tests pass.

One thing the screenshots caught that the tests could not: the first version
styled the layer line `inline-flex`, which ignores `text-align`, so in the
right-aligned left-hand column it sat flush left while every sibling sat right.
It is inline again with the icon aligned by `vertical-align`.

---

### Layer activation belongs to the input — 2026-09-18

**Status:** DONE 2026-09-18 · 0.7.62 · uncommitted

Luke: "make our layer system faithful to steam and move the ownership to the
input -- activation stored as a regular binding on a button rather than a field
on the layer."

It was stored on the layer: one `trigger`, one `applyTrigger`, one
`removeTrigger` each. That is why only one input could ever drive a layer, why
the layer panel owned activation at all, and why the input card was a derived
view of somebody else’s data.

**Format.** An annotation beside the layers, ignored by the mapper like the
other `# @` lines:

```
# @layer {"id":"map","name":"Tactical map","overrides":{ ... }}
# @layer-action RSL = toggle map
```

Verbs `hold`, `apply`, `remove`, `toggle`. The input may be a chord, one input
may carry several actions, and several inputs may drive one layer.

**Migration.** Both sides read the old fields and the new lines, so a profile
keeps working untouched; writing emits annotations and drops the fields.
`applyTrigger == removeTrigger` reads back as a `toggle`.

**Changed:** `layers.ts` (model, `readLayerActions`, `setLayerActions`, cached
the way `layerEntries` is), `LayerBar` (the panel lost activation; the input’s
own section gained the verb, including the explicit toggle), `App.tsx`
(provides the actions and the one writer), `config_layers.rs` (`parse_actions`,
`PreparedLayer` now holds lists), `layer_activation.rs` (any input may fire an
action).

**Verified**

42 browser/node regressions and 39 Rust tests, including two new Rust tests for
the parser and the legacy path, and `layers_regression.cjs` rewritten around the
new model. Checked against the real profiles: `Wardogs.txt` and
`Wardogs Layered.txt` read back with identical activation, lose the old fields
on save, and every layer projects exactly the same effective configuration.

One bug worth recording, found by the browser test rather than by reasoning:
`defaultLayer` stripped the new annotation lines, and since every projected
configuration is built on it, the whole UI went blind to activation. Only the
writer drops them now.

Not tested on the physical controller.

---

### Manage layers is a dialog, and creating a layer binds nothing — 2026-09-18

**Status:** DONE 2026-09-18 · 0.7.63 · uncommitted

Luke, on the previous build: why does Manage layers still expand a huge section
with a long description, and why does Create layer still have a "Hold
(optional)" field when we just decided inputs are responsible for applying
layers? It should be a modal for add/delete/rename, with no activation out of
the box.

Both fair. The Hold field was left behind by the previous change and
contradicted it: creating a layer quietly bound R4 by default.

**Change**

- Manage layers opens a dialog (`.layer-modal`, the existing modal pattern),
  not an inline slab above the controller. It closes with Close.
- It holds: create by name, rename in place, delete, and each layer’s overrides
  with Restore inheritance. No activation controls of any kind.
- The four-line paragraph is two lines saying what a layer is and where
  activation lives.
- Creating a layer now binds nothing at all.
- Lifting an input’s modeshifts into a layer stays, because it edits that
  layer’s overrides, but it moved onto the selected layer ("Move modeshifts
  into Comms from R4") instead of riding on a create-time button field.

**Verified**

42 browser/node regressions and 39 Rust tests. `layers_browser_regression.cjs`
follows the new flow: create binds nothing, the modeshift move is a separate
act, and Comms ends up driven by three inputs at once — a hold on R4, an apply
on L5 and a remove on R5 — which the old model could not express. The real
profiles still read back with identical activation and no projection changes.

Not tested on the physical controller.

---

### Saving a template turned it into a profile — 2026-09-18

**Status:** DONE 2026-09-18 · 0.7.64 · uncommitted

Reported as: “it says my currently applied config is FPS Tempalte”.

**Fault**

`FPS Template.txt` had been saved from the editor, and every save runs through
`ensureHeaderLines`, which puts `RESET_MAPPINGS`, `AUTOCONNECT` and the two
telemetry lines at the top of the file. The template deliberately had none of
them: its own header said so.

That breaks an imported file twice. The importing profile has already run its
own `RESET_MAPPINGS`, so a second one part-way through the load wipes everything
above the import line. And `CmdRegistry` sets `liveProfile` on each
`RESET_MAPPINGS` it processes, to the file being loaded at the time -- so the
mapper reported the template as the configuration it was running, which is
exactly what the label showed.

Nothing to do with the layer work; the save has behaved this way all along and
only bites a file used as an import.

**Change**

`ensureHeaderLines` treats a missing `RESET_MAPPINGS` as deliberate and leaves
the text alone. A real profile always has one -- Studio seeds new profiles with
the header -- so they are unaffected and still get their telemetry lines tidied
to the top.

Luke’s template was repaired in place (backup:
`FPS Template.txt.backup-2026-09-18`): the three injected lines removed and the
explanatory header written back, including why it must not have them.

**Verified**

`tests/imported_template_save_regression.cjs` saves a template and asserts it
gains no RESET_MAPPINGS, telemetry or AUTOCONNECT and keeps its settings, while
a real profile still gets its header put first and its telemetry added. 43
browser/node regressions and 39 Rust tests pass.

**Still missing:** the comments the earlier save stripped out of the template
are gone; only the header was reconstructed. That is TODO-3, which is still
open.

---

### Steam Input UI/UX transformation — 2026-09-20

**Status:** DONE (verification pass) 2026-09-20 · uncommitted

**Asked for**

A full visual/interaction redesign so JSM Studio reads as a premium,
controller-native configurator comparable to Steam Input, given as a detailed
brief directly to Codex (not routed through this file). Codex audited the
codebase, wrote the plan in
[steam-input-transformation.md](steam-input-transformation.md), implemented
stages 1-4 (design tokens, shell/nav split, shared surfaces, the category
action picker, gyro reorganisation), and ran out of usage before stage 5
(verification).

**What was actually wrong when picked up**

Nothing in the implementation itself — `tsc`, the web build, and the two new
tests Codex wrote (`steam_workspace_regression.cjs`,
`layers_browser_regression.cjs`) all passed untouched. The gap was exactly
what stage 5 says to do and hadn't been done: run it against the *existing*
suite. Five pre-existing tests failed, all because they drove UI shapes the
redesign had deliberately moved (bindings collapsed behind "Choose an
action" / "Advanced command settings", trigger tuning behind its own
disclosure, "Edit config" into a menu) — plus one real regression, a trigger
mode label (`l2FullPullMode`/`r2FullPullMode`) that got hardcoded to English
instead of translated, silently dropping Chinese support for that string.

**Fixed**

- `keymap.l2FullPullMode` / `keymap.r2FullPullMode` retranslated to "Left/
  Right trigger behavior" in both locales and read through `t()` again.
- The five stale tests updated to drive the new UI shape rather than the old
  one. `select_help_panel_fit_regression.cjs` additionally had its
  width-to-side table (which had gone stale because the wider redesigned rows
  shift exactly where that breakpoint falls) replaced with geometry-based
  invariants that don't depend on today's specific pixel budget.
- `ControllerGlyphBar`'s D-pad hint cluster was missing a `key`, found via a
  React console warning while debugging one of the above.

**Verified**

47 browser/node regressions and 41 Rust unit tests pass (the
`jsm-gui-app-tauri` binary test needs elevation on this machine and could not
run, unrelated to this change). Visual sweep at 1440x900 and 1024x720 across
every configuration page plus the Studio-side pages (Configurations,
Application associations, Debug Console, Settings) against the supplied Steam
Input screenshots. Full account in
[steam-input-transformation.md](steam-input-transformation.md)'s validation
log.

**Not verified:** physical controller. **Also flagged, not fixed:** the
select help panel's "drop below" placement overflows the window by ~8px at a
couple of narrow widths (540-560px, 480px) — pre-existing, unrelated to this
redesign, spun off separately.

---

## Dropped

_Nothing yet._
