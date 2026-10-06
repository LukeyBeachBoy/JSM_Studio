# JSM keyboard video and telemetry comparison

Video: `C:/Users/luker/Downloads/jsm.mp4`, 43.433 seconds, 1920 × 1080, 30 fps.

Capture: 57,762 mapper packets, 11:35:03.864–11:37:12.727 Europe/Brussels,
with raw sensor coordinates and reported pad coordinates for both trackpads.

The video matches the telemetry approximately 67.03 seconds after the first
captured packet (about 11:36:10.9). Alignment used 478 detected cursor positions
from both pads. The fitted screen projection has approximately 6.8 pixels RMS
error; this is an approximate synchronization, including video sampling,
display latency and image-based circle detection.

Both rotations remained 0 degrees throughout the recording. Every touched
sample's reported position equals its raw sensor position. Consequently, the
curved trajectories seen in this clip already exist upstream of keyboard
rendering. They cannot be attributed to the rotation containment correction,
because the recording uses no rotation.

The visible keyboard cursors closely follow those coordinates. The video does
not show the fingers themselves, so it cannot establish that physical thumb
travel was straight. It also cannot distinguish controller/driver behavior
from thumb motion or determine which additional transformations Steam applies.

## Steam comparison

Video: `C:/Users/luker/AppData/Local/Packages/Microsoft.ScreenSketch_8wekyb3d8bbwe/TempState/Recordings/20261004-0953-17.8636751.mp4`,
32.789 seconds, 2560 × 1440, 30 fps. No mapper telemetry was recorded for this
Steam attempt, to avoid having the mapper control the device during the test.

Visible typed results for the same intended sentence:

- JSM: `Hello woorl tiof kd me yteying go tupe obn ott titchnkettboard`
- Steam: `Hello worl thus is me typing on the tpuch keyboard`

Steam produces substantially more readable text in this demonstration. This is
a typing comparison, rather than a controlled sequence of isolated vertical
swipes, so it does not establish a numerical cursor accuracy or error rate.

Steam uses staggered letter rows and differently sized action keys; JSM uses a
rectangular grid. Steam's touch indicators visibly move within highlighted
keys, so the footage does not support assuming its cursors simply snap to key
centres. Without Steam input coordinates, its rotation, gain, filtering and
contact handling cannot be recovered reliably from this video.

JSM's zero-degree orientation means the recorded test did not compensate for
the mounted pad cant. The current Preferences preset “Level with the
controller” uses left +10.7° and right −10.5°. The keyboard now consumes these
preferences. A compensated test would establish whether the remaining problem
is orientation or requires an additional change to keyboard navigation.

The raw JSM curves demonstrate that the rendered cursor followed the input;
they do not establish a hardware fault or that the user's physical swipe was
curved. They also do not prove Steam receives the same coordinates or applies
the same projection.

## Follow-up code audit: S-shaped movement

The zero-degree setting does not establish the cause of the observed S shape.
The earlier recommendation to select cant compensation addresses axis alignment,
but should not be presented as a diagnosis of the bending.

The audited input path is:

1. SDL's Triton driver converts signed HID pad coordinates to 0..1 with a
   constant scale and inverted Y. It has no position-dependent curve here.
2. `SDLWrapper::GetRawTouchState` reads these SDL coordinates without mapper
   rotation. Telemetry converts them to -1..1 with another constant scale.
3. The keyboard chooses those original coordinates, applies the preference
   rotation once, and clamps each axis independently.
4. Selection hysteresis changes the highlighted key only. It does not change
   `Frame.left_touch` or `Frame.right_touch`.
5. `KeyboardView` projects each axis independently into the grid. Standard
   uses the full grid for each pad; Split uses the corresponding half.
   Cursor CSS disables transitions. RAF batching selects a whole frame,
   rather than independently interpolating X and Y.

The mapper's existing radial rotation containment is nonlinear and can bend
edge swipes. The keyboard bypasses it when the original-coordinate fields
are present. Its compatibility fallback for older mapper packets cannot
reverse radial containment; this remains a limitation of that fallback.
The supplied JSM recording contains both original-coordinate fields.

Added native regression: 4,020 samples through the actual keyboard reducer,
both layouts and pads, zero/cant/45-degree rotations, changing pressure and
crossing key boundaries. Deliberately curved processed telemetry verifies
the original stream remains selected. All output segments remain collinear.
All 33 native keyboard tests passed.

Added browser regression: 24 vertical, horizontal and diagonal paths through
the actual KeyboardView, both pads/layouts, normal and minimum sizes, changing
highlights and shift/symbol state. Maximum permitted perpendicular deviation
is 0.05 pixels; all paths passed, with no browser errors.

These are synthetic source-code checks. They have not reproduced or fixed the
physical recording's S shape, and do not establish behavior of an installed
binary or controller firmware under competing clients. No new runtime mapping
change was made during this audit.

See `raw-pad-trajectories.png` for the normalized XY paths in the video interval,
and `video-alignment.json` / `video-cursor-points.csv` for the alignment evidence.

## Fresh investigation (second pass, 4 October 2026)

Tool: `tools/analyse-pad-swipes.mjs` (Node, no dependencies). It reads this
JSONL or a USBPcap `.pcap` of the controller's own HID reports.

### What the JSM capture proves

- **The typed text is reproduced exactly from telemetry.** Replaying every
  packet through the keyboard's selection + press rules (Standard layout,
  `padPressThreshold` 0.02, 0.65 release band, W = backspace) yields
  `hello woorl tjof kd me yteying go tupe obn ott titchnkettboard`; the capital
  H came from the trigger shift. 62 of 65 letters were force presses, none
  click-only. So the telemetry is ground truth for which key was under each thumb.
- **The rendered cursor is the reported coordinate.** Frames at 6.20–6.95 s
  (telemetry 73.2–74.0 s) show the cursor and highlight exactly where the
  telemetry puts them (e.g. left cursor on the d/f corner, x = −0.49, for the
  `f` typed instead of `s`). There is no transform between SDL and the screen
  that bends a path at 0°: SDL scales the HID int16 linearly. X and Y always
  update together (5,780 joint vs 171/221 single-axis changes on the right pad,
  which is ordinary one-axis-unchanged motion). There are no stale-sample jumps
  (2 steps > 0.08 in 6,172), and updates arrive at ~250 Hz.
- **Steam receives the same coordinates.** Decoding Steam's setup writes in the
  puck capture: 48 = 24 (IMU), 7 = 8 = 7, 24 = 0, 46 = 0, 45 = 100, 49 = 2, 82 = 3,
  and **52 = 53 = 65535** (firmware pad clicks off; Steam presses in software).
  None of these touch pad coordinates. Firmware rotation needs 24 ≠ 0 and
  setting 2 ≠ 0. In the JSM capture the firmware clicks still fired (bits 28/29
  toggled 29 times), so Steam had not configured the controller during it.
- **Steam's gain is the same as JSM Standard's.** On Steam's own recorded
  thumb paths, Steam sent 41 / 13 / 34 / 5 / 3 key-crossing ticks per contact.
  JSM's Standard 12 × 5 grid crosses 46 / 13 / 33 / 7 / 3 times on the same
  paths; Split (6 × 5) crosses 29 / 7 / 20 / 4 / 2. Gain and aspect are therefore
  **not** what separates the two keyboards. Steam's rotation could not be
  recovered: a full layout fit matched only 55–67 % of ticks at any angle.
- **Steam's press force, measured:** decoded HID force crosses 8.4 % 2–6 ms
  before each of Steam's ten press ticks; releases tick at 3.8–4.2 %. JSM's
  default was 4 % (release 2.6 %); this capture ran at 2 % (release 1.3 %).

### What the curved paths are, and what they are not

- Right-pad natural up/down strokes (23 strokes ≥ 0.6 pad units): median
  tilt **+14.7°** (top leaning clockwise; IQR 5.7..20.7). Median bow 0.12 pad units
  = 0.73 Standard key widths: 17 C-shaped and 6 S-shaped. The left pad has too
  few vertical strokes (4) for a figure.
- Steam's HID capture (no JSM, no SDL) has the same kind of bowed paths
  (median bow 0.10 on the right pad). Its strokes were loops, not up/down swipes,
  so it is not a like-for-like shape comparison.
- No periodic electrode-pitch nonlinearity: local y gain is flat within ±4 %
  over −0.36..0.2. X coverage was too small to test.
- The Standard grid is 6 key widths per pad unit across but 2.5 rows down.
  Any sideways component of a thumb stroke is therefore 2.4× larger in keys
  than the same distance vertically (3.3× in screen pixels at this window size).
  An uncorrected 15° lean becomes ~33° in keys and ~41° on screen. Steam's
  keyboard has the same gain, so this magnification is shared, not a JSM defect.

### Typing errors, classified

- In-transit presses: 13 of 39 right-pad presses (1 of 23 left) fired while the
  thumb was still moving more than a quarter key per 60 ms. At 2 % the press
  fires at the first rise of force. Replaying at Steam's 8.4 %/4.2 % removes the
  extra letters (`woorl` → `worl`, `yteying` → `teying`, `go` → `to`).
- Settled substitutions remain at every threshold, and a "wait until the
  thumb stops" gate does not change them (`f`/`d` for `s`, `j` for `h`, `o` for
  `i`, `y` for `t`). Nearly all are 1–2 columns to the right of the intended key.
  This is consistent with the ~15° right-pad lean at 0° rotation: travelling
  from the space bar to the top row (~1.1 pad units) drifts 0.29 units, about
  1.8 keys right. Replays with rotation cannot test this, because the user
  steered by watching the 0° cursor.

### Change made

Keyboard force-press default 4 % → 8 %, and release band 0.65 → 0.5 of the
press force (Steam: 8.4 % / ~4 %). This is a default only: the saved
preference in this setup is still 2 %.

### Evidence still needed to settle the S shape

The capture cannot separate thumb kinematics from a sensor/firmware
nonlinearity. Both look identical in any coordinate stream. The decisive test:
with telemetry recording, make five strokes per pad along a ruler held against
the pad (fingertip guided by the edge), then five natural thumb strokes.
Run `node tools/analyse-pad-swipes.mjs <capture> --from <s> --to <s>` on each
segment. If the ruler strokes are straight (bow ≲ 0.02) and the thumb strokes
are not, the S comes from thumb kinematics, and orientation (≈ −15° right pad,
measured) plus press force are the fixes. If the ruler strokes bow, it is the
sensor/firmware, and the next step is a USBPcap capture of the same strokes.
That would show whether the HID reports themselves bend.
