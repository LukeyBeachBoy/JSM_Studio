# Steam Controller 2026: LED colour, start-up sound, per-side grips, pad orientation — 2026-09-29

What the controller's firmware lets a host change, what it does not, and how JSM
should expose each. Everything below was derived from the firmware image the
controller actually runs (`IBEX_FW_6AA43B55.fw`, confirmed live: attribute 4
FIRMWARE_BUILD_TIME = 0x6aa43b55), checked against the connected controller with
the probe in `tools/triton-probe/`, and re-read by independent reviewers working
from the listing; their corrections are folded in. Addresses are flash addresses
(body at 0x8000). Feature reports are written as
`[report id 1][cmd][len][payload]`, zero-padded to 64 bytes.

**Implemented on 2026-09-29** (uncommitted, awaiting a hardware check): a
configuration's `LIGHT_BAR` now drives the light (§1), a global **Trackpad
orientation** preference rotates the pads in the mapper (§4 route B), and a
**Power jingle** preference writes the persistent volume byte (§2). See
`docs/TODO.md` items 26, 27 and 41.

Short version:

| Ask | Answer |
|---|---|
| Change the start-up / shut-down jingle and persist it | **Melody: no** — the two jingles are compiled code selected by immediates; the audio-upload commands of the old controller are not in this firmware. **Volume: yes**, persistently: `user/haptic_boot_level` 2 = normal, 1 = quiet, 0 = off, written with `01 DC 02 01 <level>`. |
| Change the LED colour | **Yes, while powered.** The LED is RGBW. Colour needs setting 37 = 1 (`01 87 03 25 01 00`) and then `01 C5 04 RR GG BB WW` in percent. It cannot be persisted; it is RAM until the controller powers off, so JSM re-sends it on connect. |
| Grip range / flicker per side | **No, and now provably so:** both trackpad controllers share one threshold struct in RAM. Only a firmware patch of the per-side threshold copy could do it, and flashing a patched image is a brick risk (§5). |
| Let users rotate the pads | **Two routes, both verified.** The firmware has a built-in mirrored de-cant (setting 2, applied only while setting 24 is non-zero; 5° steps, RAM-only). A host-side per-pad rotation in JSM is fully general; plan in §4. |

---

## 0. What the connected controller reported

Read with `tools/triton-probe/scprobe.exe` over USB (PID 0x1302, vendor collection
COL03; HidHide does not cloak the USB path, only the puck's 0x1304 interfaces).

- Attributes (`01 83`): PRODUCT_ID 0x1302, CAPABILITIES 0, FIRMWARE_BUILD_TIME
  **0x6aa43b55**, BOOTLOADER_BUILD_TIME 0x68d2f92e (2025-09-23), BOARD_REVISION
  0x48, CONNECTION_INTERVAL 4000 µs.
- Settings (`01 89 <id> 00 00`, all 86): notable values — 0x22 grip range 100,
  0x23 flicker guard 80, 44 LED baseline 50, **45 LED brightness 100** (Steam
  writes this), **37 (LED user-colour enable) 0**, 38 (brightness curve) 1,
  **24 = 0** (table default 20; see §4), 2 = 0, 84/85 = 1/100 (the firmware's gyro
  auto-calibration is currently on in the device), 52/53 = −1, 7 = 7, 8 = 1.
  Full dump in Appendix B.
- LED colour (`01 E9`): 00 00 00 00 (none set).
- Persistent keys (`01 ED "<key>\0"`): `user/haptic_boot_level` = 2,
  `user/keylock` = 0, `user/wireless_transport` = 2, `cal/rgbw_r/g/b/w` =
  108 / 31 / 149 / 54 (per-unit LED white balance; ROM defaults 90/35/120/80),
  `cal/touch_l` = `80 00 d8 27 4d 29 d8 27 be 28`, `cal/touch_r` =
  `80 00 9f 29 04 2b 9f 29 7a 2a`. The `settings/haptics/*` keys have no getter.

## 1. LED colour

### How the LED is driven

- The Steam-button LED is a 4-channel PWM RGBW package (`pwm@40021000`, channels
  0..3 = R, G, B, W, 50 000 ns period, inverted polarity). The LED thread at
  0x18870 (its Zephyr thread name is, misleadingly, `rgbled_test_thread`) sets
  each channel to `duty = colour_ch × cal_ch/100 × bright/100`, clamped to 100 %,
  where `colour` is a 4-float RGBW value, `cal_ch` is the per-channel gain byte
  from `cal/rgbw_r/g/b/w`, and `bright` is setting 45 passed through
  `trunc(100 × (6^(s45/100) − 1) / 5)` while setting 38 = 1 (default; 50 → 29 %,
  100 → 100 %). Setting 44 is never read by the LED code.
- Colours come from pattern tables in .data: white `(0, 0, 0.05, 0.5)` and blue
  `(0, 0, 0.2, 0)` for "connected" (mode 1; white for the puck/ESB transport, blue
  for transport 1), green `(0, 0.25, 0, 0)` for ST_USB_DATA (mode 2), orange
  `(0.2, 0.2, 0, 0)` for the suspended / puck-off / wireless-off states (mode 3,
  pulsing below 100 % charge and steady at 100 %), red `(0.1, 0, 0, 0)` for the
  low-battery blink, a green one-shot flash, and off. So "orange while charging,
  green when full" is the state machine moving from the suspended state to
  ST_USB_DATA, not a colour ramp.
- `ID_SET_LED_COLOR` (0xC5, handler 0x1f4b5) takes **4 bytes [R, G, B, W] in
  percent** (each byte / 100 → float, no clamp) and stores them at 0x2000d136.
  The thread applies that colour — before any pattern, every 100 ms, overriding
  even the charging pulse — **only while the byte at 0x2000d146 is non-zero, and
  the only writer of that byte is the settings callback for setting id 37
  (0x25, range 0..1, default 0).** The firmware uses the very same mechanism
  itself: on a first boot `ST_INITIAL` sets 37 = 1, blinks magenta `(1, 0, 1, 0)`
  seven times and clears 37 again. The live controller has 37 = 0, which is why
  the 2026-09-25 test "every byte position looks white" saw nothing: 0xC5 stored
  a colour nobody read and the LED kept its normal white connected pattern.
- `ID_GET_LED_COLOR` (0xE9) is buggy: it truncates each float to an integer
  before multiplying by 100, so it reads 0 for anything under 100 %, 100 for
  100..199 % and 200 for 200..255 %. Confirmed live today: `C5 64 00 00 00` reads
  back `64 00 00 00`, `C5 32 00 00 00` reads `00 00 00 00`, `C5 c8 ff 01 00` reads
  `c8 c8 00 00`. That is the "clamped to 200" observation.

### Recipe (RAM only; lost at power-off)

```
01 87 03 25 01 00        enable the user colour (setting 37 = 1)
01 C5 04 RR GG BB WW     colour in percent, e.g. 64 00 00 00 = red, 00 00 00 64 = white
01 87 03 2D 64 00        optional: brightness 45 = 100 (Steam already sets this)
01 87 03 25 00 00        restore: back to the automatic patterns
01 C5 04 00 00 00 00     restore: clear the stored colour
```

Bytes above 100 push a channel past its calibration gain (e.g. G = 255 gives
2.55 × 35 % = 89 % duty with the default green gain); the 100 % clamp is the only
limit. While 37 = 1 the low-battery blink and the charging pulse are suppressed.

### Persistence

- The colour and the enable byte live in .bss: zero at boot, RAM only.
  `ID_SET_SETTINGS_VALUES` (0x87) stores every id in the RAM settings array;
  only ids 0x30, 0x54 and 0x55 are additionally routed to the IMU settings
  handler (a runtime set; whether that handler writes flash was not traced).
  There is no settings key for a colour, so a colour **cannot** survive a power
  cycle on this firmware. JSM must re-send it on every connection, exactly as it
  re-sends the grip range today.
- The only persistent colour-related values are the four gains `cal/rgbw_*`
  (1 byte each; `0xEE` sets the RAM copy, `0xEF` commits it, and `0xEF` refuses
  values outside 1..199 because the getter does). They are the unit's factory
  white balance and scale every pattern, so they can tint the connected white
  (e.g. W = 1, B = 199 → faint blue) but cannot produce an arbitrary colour, and
  0 silences a channel. Not recommended.

### What JSM should do

- Give `LIGHT_BAR` (already a Color setting, currently a no-op on this
  controller) a Triton path: on connect and whenever it changes, send
  `37 = 1` plus `C5 R G B W` (RGB → percent; W = 0, or a separate
  `LED_WHITE` value), tracked per device like `_appliedLedBrightness`. When the
  colour is unset or JSM exits, send `37 = 0` so the charging and low-battery
  patterns come back. Bindings then work through the existing
  `LIGHT_BAR = ...` console command, layers can carry their own colour, and
  `LED_BRIGHTNESS` (setting 45) keeps scaling it. One hardware look is still
  needed to confirm the channel order R, G, B, W (inferred from the pattern
  colours and key names; the device tree is not in the image).

## 2. Start-up and shut-down sound

### What plays and why it cannot be swapped from the host

- The jingles are **haptic scripts**: 8-byte entries `{u16 delay_ms, u16 0,
  step function}` terminated by a null function, where each step is compiled
  code emitting one tone command. A 16-entry pointer table lives in flash at
  0x68598 (two more scripts at 17/18 are unreachable). The player 0x3b6d0 accepts
  ids 1..16 and indexes `table[id − 1]`.
- Boot: `ST_USB_WAIT_FOR_ENUMERATION` and `ST_USB_WAIT_FOR_WAKEUP` play
  **script 1** (588 → 699 → 882 Hz, 80 ms notes: a rising D5–F5–A5 arpeggio); a
  battery boot plays script 1 for transport 0/2 (puck/ESB) or **script 2** (same
  plus a 1176 Hz tail) for transport 1/3. Shut-down (`ST_SHUTDOWN`, `ST_REBOOT`,
  `ST_SHUTDOWN_LOW_BATT`, `ST_USB_WIRELESS_OFF`) plays **script 5**, the arpeggio
  reversed. The ids are `movs` immediates at 0x1e2d4, 0x1e0b2, 0x43752/0x4375a
  (boot) and 0x43732, 0x1e062, 0x1df98 (shutdown); nothing reads a stored id.
- Every one of those calls goes through 0x3b788, which picks the gain from
  `user/haptic_boot_level`: **2 → −12 dB (default), 1 → −18 dB, anything else →
  the call returns without playing.** That byte is a persistent settings key with
  its own read/write commands. The lost-connection cue (script 4) uses the same
  level.
- The audio commands the original Steam Controller used (`0xB6` play,
  `0xB7..0xB9` upload, `0xC1` mapping) are absent from this firmware's command
  table; sending them is silently ignored. The melody can therefore only be
  changed by a firmware patch (§5): retarget the table words (id 1 at 0x68598,
  id 5 at 0x685a8) to another of the 16 scripts or to a new step list placed in
  free flash, change the immediates, or change the gain constants (MVN at
  0x3b794 = −12 dB, 0x3b79c = −18 dB).
- The host power-off command `0x9F` goes through `ST_REBOOT` and therefore plays
  the shut-down jingle at the stored level; `ST_SHUTDOWN_SILENT` is reached only
  by the ISP-reboot command 0x90 (do not use it for a quiet power-off).

### How the jingles are voiced (2026-09-30)

Read from the step functions of scripts 1, 2, 5 and 12 (listing via
`tools/triton-probe/thumbdis.rs`):

- Every step builds a zeroed **28-byte tone request** on the stack and hands
  it to the channel submit routine 0x4d84a → 0x3f6c4 (a per-channel message
  queue): `+1` type, `+8` gain (dB, signed), `+12` frequency as a **float**,
  `+16` duration (ms), `+20` LFO frequency (float), `+24` LFO depth. The
  channel object comes from a 4-entry table at 0x51cd4 indexed by the script
  context's channel byte (`ctx+0x30`); the gain from `ctx+0x38` (the 0x85
  report's gain, or −12 / −18 dB for the boot path).
- **Script 1** (boot): a click (type 2, +4 dB, 1 ms) at t = 0, then tone
  requests 588 Hz (gain as given), 699 Hz (−3 dB) and 882 Hz (−3 dB), 80 ms
  each, issued 81 ms apart — legato, no gap. **Script 2** adds 1176 Hz, 160 ms,
  −22 dB. **Script 5** (shutdown) is 882 / 699 / 588 with no click. **Script
  12** (ping) opens with a 65 Hz, 200 ms thump then alternates 699 / 588.
- The **0x83 handler** (0x1fe98) builds the very same request from the report
  (`side, gain, freq u16 → float, duration, lfo_freq → float, lfo_depth`), type
  3. So an 0x83 tone *is* a jingle note; the firmware has no other voice for
  scripts. The side byte maps to channel sets through a jump table: 0 → {0},
  1 → {1}, 2 → {0,1}, 3 → {2}, 4 → {3}, **5 → {2,3}**, 6 → {0,1}, 7 → {2,3}.
  The same table serves 0x81 pulse, 0x82 command and 0x84 sweep.
- Channels 0/1 are the trackpads' actuators, 2/3 the motors behind the grips
  (Steam's grip-calibration tap uses targets 3/4 = channels 2/3). **The
  firmware's tunes therefore play on the grip motors**, and `85 05 …` (Steam's
  ping, JSM's PLAY_SOUND) does too. A custom tone sequence sent to sides 0 and
  1 plays the same notes on a different, thinner instrument — which was the
  whole of the "custom sounds are muddy" problem. JSM's player now targets
  side 5 by default (`SOUND_ACTUATORS`).
- Request types seen: 0 tick, 1 click (0x82 cmd 1/2 → types 0/1), 2 plain
  tone (the click step uses it with 4000 at +10 and 1 ms), 3 LFO tone (0x83),
  5 log sweep (0x84), 6 stop (issued by the duration timer), 9 with flags 2 =
  off (0x82 cmd 0).
- Output reports **0x86–0x89 are PCM streaming** (mode / mono / stereo / mono
  with length), used by SteamHapticsPlayer for 8 kHz audio; not analysed here
  (TODO-43).

### Recipe for the persistent volume switch (verified safe by two reviewers)

```
01 DB 00                                  read:  reply 01 DB 02 01 <level>
01 DC 02 01 <level>                       write + persist (settings_save_one, then reload)
```
Equivalent through the generic named-key commands: `01 EE 18 "user/haptic_boot_level" 00 <level>`
sets the RAM copy, `01 EF 17 "user/haptic_boot_level" 00` persists it, `01 F0 17 "user/haptic_boot_level" 00`
deletes the key (default 2 returns). Only 0, 1 and 2 mean anything. A factory
reset (0x86) also wipes the key.

### Playing sounds on demand

Output report `85 <target> <id> <gain>`: `target` selector 0..7, where 5 = channels
2 + 3 (the pair the firmware's own jingles use), `id` = 1..16 (**0 is rejected** —
the earlier note "0..13 all play" is off by one and should be re-tested), `gain` =
signed dB offset (the jingles use −12; 0 is louder). Known scripts: 1/2 boot,
5 shutdown, 4 lost connection, 8/9 pairing, 10 first-boot test, 12 identify
("ping"), 16 a random easter egg on channel 2.

### The named-key user store (0xED / 0xEE / 0xEF / 0xF0)

- `0xED "key\0"` reads a key's current value (only keys whose handler has a getter
  answer: `user/*`, `cal/*`, `esb/bond*`, `mte/charge_level`, `debug/resetreason`;
  the `bt/*` and `settings/haptics/*` keys return nothing).
- `0xEE "key\0" value` is `settings_runtime_set`: **RAM only**, lost at reboot,
  accepted for any key prefix that has a handler (each handler enforces its own
  length).
- `0xEF "key\0"` persists the key's *current RAM value* to flash
  (`settings_save_one`). `0xF0 "key\0"` deletes any stored key by name without
  consulting the handler table.
- Never write or delete from a host: every `cal/*` (joystick, trigger, pressure,
  touch, LED white point, gyro bias, voltage offset), `esb/bond*` and `bt/*`
  (pairing), `user/wireless_transport`, `user/keylock`, `mte/charge_level`,
  `debug/resetreason`, `settings/haptics/amplifier_mode`, `settings/sensors/imu/*`.
  Also never send `0x86` (factory reset: wipes `user`, `esb`, `mte`, `debug`, `bt`
  and reboots) or `0xFE` (erases every `cal/*` key).

### What JSM should do

- Keep the implemented TODO-26 design (JSM plays a chosen script on connect and
  when *it* powers the controller off, with a Studio preview). Add one device
  setting next to it: **Firmware jingle volume: Normal / Quiet / Off**, written
  once with `01 DC 02 01 <2|1|0>` and read back with `01 DB 00`. It is the only
  part of the start-up sound the firmware lets us persist, and "Off" is what most
  people asking for this actually want. Note that "Off" also silences the
  lost-connection and low-battery cues, which share the same level.

## 3. Grip range and flicker guard per side

The 2026-09-27 answer stands, and the reason is stronger than stated then:

- The trackpad attribute setter 0x4c46e has exactly two callers, both in 0x1cda8,
  which is reached only from the settings callback 0x1cde0 for ids 0x21/0x22/0x23
  (attrs 3/4/5) and 0x48/0x49/0x42 (attrs 0/1/2). No pointer table or literal
  references either function.
- **The storage is not per device.** Both trackpad devices' data structs
  (`olympus-trackpad-left` data 0x20003094, `-right` 0x20003064) hold the same
  pointer 0x200030c4 at +0x2c (confirmed from the image words at 0x66e68 and
  0x66e38), so grip range (+0x0e) and flicker guard (+0x10) exist exactly once
  for the whole controller. The touch / de-touch thresholds
  (`touch = 225 + 9 × range`, `detouch = touch × flicker / 100`, from the VFP at
  0x3cb5c) are copied per pad instance into `[inst+0xc8]/[inst+0xcc]` by the
  per-side loop 0x1cfb0 (strd at 0x1d068) and compared against each side's
  averaged aux-capacitance sample at 0x1d17e / 0x1d2ba.
- Every remaining handler was decoded and none touches the aux thresholds:
  0xFE erases all calibration (magic 0xc6674885), 0xF2 debug/version GET, 0xBE
  battery data, 0xE2 re-applies stored `cal/trg`, `cal/joy`, `cal/prs` blobs for
  one side, 0x85/0x81 lizard-mode digital-mapping default/clear, 0xD8/0xC3/0xC0
  joystick / trackpad-pressure / trigger calibration, 0xA2 writes the 24-byte
  `esb/bond`, 0x86 factory reset. `cal/touch_l` / `cal/touch_r` are stored and
  read back by their own settings handlers and consumed by nothing.
- The genuinely per-side values are the click-pressure thresholds (settings
  0x34 left / 0x35 right) and the click calibration `cal/prs_l/r`; neither enters
  the grip compare.
- Grip settings are RAM-only and must be re-sent after every reconnect (JSM
  already does this per device in `applyTritonSettings`).

A firmware patch could only add a per-side offset where the per-instance copy is
made (0x1d068) or at the compares, because the storage is shared; patching the
attribute path cannot work (see §5). The practical per-side levers remain the
electrode (TODO-17) and time (`LEFT_GRIP_RELEASE_DELAY`).

## 4. Pad orientation

The pads are physically canted about 10.6° outward (Studio's artwork constants:
left +10.7°, right −10.5° in SVG `rotate()` terms; the true hardware angle should
be measured once by swiping along a pad edge and reading the raw telemetry). SDL
delivers the raw pad frame; SDL's driver for the *original* Steam Controller
de-cants by a fixed 15°, the Triton driver does not.

### Route A — the firmware's own rotation (setting 2, applied only while setting 24 ≠ 0)

Found during review and independently verified against the bytes:

- In the per-pad function 0x1cb38 (called per side from the input callback
  0x1cfb0), after filtering and before the values are packed into the wire report
  as `sLeftPadX/Y` / `sRightPadX/Y`, the firmware reads setting **24** (Valve's
  `SETTING_SMOOTH_ABSOLUTE_MOUSE`); if non-zero it reads setting **2**
  (`SETTING_TRACKBALL_ROTATION_ANGLE`, range 0..360, default 0) and, if non-zero,
  rotates the pad coordinates by `angle × (−1 for the left pad, +1 for the right)`
  with the fixed-point routine 0x3bed0 (Q13 sin/cos tables: 1° resolution for
  0..4 and 356..360, 5° steps in between via integer division, so 11..14 → 10).
- Setting 24's only reader in the image is that gate and setting 2's only reader
  is that block; the table default of 24 is 20 but the live controller has **0**
  (a host wrote it — SDL's SC1 driver does exactly that on connect, the Triton
  driver does not; Steam is the likely author). Both are RAM-only and must be
  re-sent on every connection.
- Direction, derived statically: the firmware's y negation and SDL's cancel, so
  the rotation acts in the host's own y-down frame. **A positive angle rotates
  the LEFT pad's reading clockwise and the RIGHT pad's counter-clockwise, as seen
  by the user** — exactly a mirrored de-cant, matching the artwork (left pad
  canted clockwise by 10.7°). One live write settles it and the sign in one look.
- Recipe: `01 87 06 18 01 00 02 0A 00` (24 = 1, 2 = 10) after connecting;
  restore with `01 87 06 18 00 00 02 00 00`. Negative angles are sent as 360 − a.
- Consequences: two setting writes de-cant both pads with no mapper maths, and
  everything downstream — JSM, telemetry, Studio's overlay, Steam Input — sees
  the rotated frame. Limits: one magnitude for both pads, mirrored; 5°
  granularity above 4°; the controller-art dot in Studio
  (`ControllerStatusSvg.tsx` `padPoint`), which rotates telemetry onto the canted
  artwork, has to subtract the applied angle or it drifts near the rim.

### Route B — host-side rotation in JSM (fully general)

Plan, reviewed for feasibility against the code:

- **Settings**: `LEFT_TOUCHPAD_ROTATION` / `RIGHT_TOUCHPAD_ROTATION`, float
  degrees, default 0, range −180..180, **positive = clockwise as the user looks
  at the controller** (the 0..1 frame has y down, so the plain rotation matrix is
  clockwise for positive angles; this matches the SVG constants, so the
  "undo the cant" values are +10.7 / −10.5). Registered like
  `LEFT_GRID_DEADZONE` (`JSMSetting<float>` + filter + `JSMAssignment`), so
  a chord or modeshift cannot change them: the value is read where the pad is
  sampled, outside any controller's chord stack, and Studio keeps it as a global
  preference. Rotation is applied before `TOUCH_STICK_AXIS`, which stays a
  separate sign switch. Telemetry carries the applied angle per pad
  (`leftPad.rotation`), so the controller artwork can turn the point back by
  what was really applied.
- **Where**: at the source, for `JS_TYPE_STEAM_CONTROLLER_2026` only — in the
  touch state read (`SDLWrapper.cpp` `GetTouchState`, or a helper used by both
  its callers) so that the *same* rotated coordinates reach `touchCallback`
  (grid cells, four-way / radial wedges, the touch stick's deltas, the One Euro
  mouse pipeline) **and** the telemetry block in `main.cpp` (~1849), which the
  overlay's `hitTestRegion`, the keymap preview and Studio's Rust
  `global_chords.rs` `layer_input_pressed` all read independently. Rotating only
  inside `touchCallback` would make the overlay highlight a different region from
  the one that fires. Rotate the new and previous states with the same angle so
  `movX/movY` rotate too; rotate about (0.5, 0.5) — the pad is reported square
  (1920 × 1920) so normalised space is isotropic; then project points that leave
  the unit box back onto it, because `TOUCH_POINT::isDown()` treats anything
  outside 0..1 as lifted. Reset the mouse pipeline if the angle changes
  mid-contact. Leave the legacy single-pad branch (1920 × 920, would shear) and
  `PS_TOUCHPAD` untouched.
- **Studio**: keys in `configKeys.ts` (`touchpadKeys` + `keyName`, per-pad
  `LEFT_/RIGHT_` variants like every other pad key), read/write in
  `useTouchpadConfig.ts` (an explicit 0 must be written to override an inherited
  value), an **Orientation** row group in `PadSection`'s Mode sheet, ungated by
  mode (rotation affects menus, mouse and touch-stick alike; not on the shared
  Mouse-feel sheet), with a "Match controller body" preset from one shared
  constant once the physical angle is measured. Because the rotation happens at
  the source, `MenuPreview`, `TouchpadGridSection` and the overlay stay correct
  without redrawing anything; only `ControllerStatusSvg`'s dot needs to subtract
  the configured rotation. Add `TOUCHPAD_ROTATION` to `overlayLayout.ts`'s
  per-pad key regex so layer discovery still works; i18n in `en.ts` / `zh-CN.ts`;
  a sentence in `HelpDocsPage`'s Steam Controller notes.
- **Tests**: a C++ `touch_rotation_harness.cpp` (90° maps top-centre to
  right-centre, corner projection keeps direction, composition with
  `touchGridCell`, delta rotation); a node test for the key lists, serializer
  section and keymap round-trip; extend `tests/overlay_layout_regression.cjs` so
  the JS and the compiled header agree at several angles.
- **Risks**: RECTANGLE grid corners become slightly unreachable after a
  non-multiple-of-90° rotation (inherent; the preview should show the rotated
  pad outline); mapper and Studio must ship together for overlay parity; default
  0 keeps every existing profile unchanged.

Recommendation: implement Route B (it is what users will tune per pad, to the
degree). Route A is worth one live test because it is nearly free and also
de-cants the pads for Steam Input; if the sign checks out it can become a
"firmware de-cant" switch that JSM re-applies on connect, with Route B layered on
top for fine adjustment.

## 5. Firmware update path and the risk of a patched image

Both per-side grips and a different jingle would need a modified image, so the
update path was analysed as far as the files on this machine allow. Two reviewers
checked it; the second refuted the first draft's completeness, and the gaps are
included here.

- **The application cannot flash itself.** The command table has no upload
  command; the NVMC flash driver (`flash-controller@4001e000`, 7 references) is
  used only by the Zephyr settings store; "Rescue image" / "Firmware loader" are
  labels in an enum-name table. Updating is done entirely by the ISP bootloader
  in flash 0..0x8000, which is in no file here.
- **Header**: 32 bytes `{magic d2d86467, body_size, crc32(body), 20 zero bytes}`;
  the CRC is plain zlib CRC32 and matches for all four IBEX images on disk. No
  signature, timestamp, load address or entry field. The build time the device
  reports (attribute 4) lives in the body.
- **Reboot commands**: `0x9F` writes reason 0xabdf9710 → `ST_REBOOT` (audible,
  `sys_reboot`); `0x90` writes a fixed 0xecaabac0 → `ST_SHUTDOWN_SILENT` →
  `sys_poweroff` (System OFF); `0x95` writes its payload word verbatim, so
  `01 95 04 c0 ba aa ec` is the ISP path and `01 95 04 10 97 df ab` a plain
  reboot. The app never touches the nRF GPREGRET registers. How the bootloader
  learns it should stay in ISP after a System OFF is not provable from these
  files: the reason word is ordinary RAM (unlikely to survive OFF), and there is
  a magic-validated retention structure at 0x2001ff00 (written before reboots,
  also the `debug/resetreason` store) that neither analysis could tie to ISP.
  Other reboot triggers exist (factory reset 0x86, a reset-reason capture path,
  SMF run-state reboots, and a peripheral at 0x40010000 that may be a watchdog).
- **hardwareupdater.exe** is a PyInstaller-frozen Python 3.14 program (hidapi,
  OpenSSL, zlib); its protocol is compiled bytecode, not recoverable from
  strings. Its RSA/SHA strings are the executable's Authenticode chain and its
  "header crc mismatch" string is zlib's, so **no firmware-image signature check
  is visible anywhere we can look — but the bootloader may still enforce one.**
- **Risk**: a body-only, CRC-correct image passes every check the application
  performs. What can still brick the controller: a bootloader signature or
  layout check (unknown); a transfer that writes more than the app slot (the
  header carries no load address, so "the bootloader stays intact" is an
  inference, not a fact); a patch that hangs and reset-loops under a watchdog;
  and there is no ISP button chord in the application (the `ST_*_KEYCHORD_*`
  states select the wireless transport) — if one exists it is in the bootloader.
  Recovery, if ISP is still reachable: Steam's updater re-flashing the official
  image is plausible but unverifiable. Patch survival: the in-body build-time
  word 0x6aa43b55 must be left alone — Steam force-flashes only below
  `MUST_UPDATE_TRITON_FW_TS 6A18D057`, so an image that still reports 6AA43B55
  is left in place, while a changed timestamp could provoke a reflash that
  silently removes the patch. **Conclusion: not recommended without the
  bootloader in hand.**
- **Patch designs (not applied)**. Byte-exact designs were produced and hand-
  verified for (a) retargeting the boot/shut-down scripts — table words 0x68598
  (id 1, `64 1f 05 00`) and 0x685a8 (id 5, `44 1f 05 00`) to another script
  pointer, e.g. the unreachable scripts 0x51f14 / 0x51edc or an appended step
  list; the step pointers inside a script need the Thumb bit, the table words do
  not — and (b) the jingle gain, MVN at 0x3b794 (`6f f0 0b 02`, −12 dB) →
  `6f f0 05 02` (−6 dB) and 0x3b79c (`6f f0 11 02`, −18 dB), then recompute
  body_size and the header CRC. A per-side grip patch was also designed around
  the attribute setter (two appended stubs that write attribute 4 on one device
  each); it assembles correctly but **cannot work**, because the setter writes
  the struct both devices share (§3). A working patch has to add a per-side
  offset where the thresholds are copied into each instance (0x1d068) and it
  would need a second setting id for the other side; nobody has written that
  patch and, per the paragraph above, nobody should flash one yet.

## 6. Holding the Steam button powers the controller off (2026-10-03)

Asked: can the long-press power-off be disabled? **Not from the host.** The
same logic is in 6AA43B55 and in 6ABC4999, which Steam shipped on 2026-09-30.

- The firmware keeps a table of button combos in .data (6AA43B55: flash 0x683ec
  ↔ RAM 0x20004644..0x200046f4, 11 entries of `{mask, press_fn, release_fn,
  active}`; .data offset 0x1ff9c258). The matcher 0x1d518 runs on every change of
  the report's button word. It first clears 0x39900000 (both grip touches, both
  trigger clicks and both stick touches). An entry fires `press_fn` when the
  remaining word **equals** its mask and `release_fn` as soon as it no longer does.
- Entry 0x683fc is `{0x10000 = TRITON_LBUTTON_STEAM, 0x1d581, 0x1d565}`. Press
  (0x1d580) schedules delayed work 0x20001ac0 after **0x38000 ticks = 7.0 s**
  (32 768 Hz tick) and work 0x20001a90 after 0x290 ticks (20 ms). Release
  (0x1d564) cancels both. The 7 s work (handler 0x43642) posts state-machine
  event 6. In `ST_BATTERY` (run 0x1de20) event 6 goes straight to state 22
  `ST_SHUTDOWN`. In `ST_PUCK_ON` (0x1df70) it plays script 5 and goes to state 8.
  In `ST_USB_DATA` (0x1d8b8) it is ignored, so a wired controller is not turned off.
- The delay is an immediate. Setting 25 has the shape of Valve's SC1
  `SETTING_STEAMBUTTON_POWEROFF_TIME` (default 40, range 3..99), but neither image
  ever reads it. No callback handles it, and no command writes the combo
  table or the two work items. Only a firmware patch could change the delay or
  the mask (`mov.w r2, 0x38000` at 0x1d582; 6ABC4999: 0x1cb06, table entry
  0x66c3c), and §5 advises against flashing one.
- Consequences for mappings: the 7 s timer runs only while Steam is the **only**
  counted input. Pressing any other button or touching either trackpad cancels
  it, and releasing that input starts a fresh 7 s. Grip touches, trigger clicks,
  stick touches, stick movement, analog trigger travel and gyro do not count.
  Chords such as QAM + Steam or Steam + a face button are safe while the second
  input is held. A layer held on Steam alone (for example Steam + gyro or Steam +
  stick) turns the controller off after 7 s unless a thumb rests on a trackpad.

## Appendix A — the command table (firmware 6AA43B55)

`{id, handler}` from the dispatch table at 0x685e0. Not listed = silently
ignored (incl. 0xB6, 0xB7–0xB9, 0xC1, 0x8F, 0xA7, 0xAA, 0xAC).

| id | meaning |
|---|---|
| 0x81 / 0x85 | clear / default digital mappings (lizard mode) |
| 0x83 | GET_ATTRIBUTES_VALUES |
| 0x86 | factory reset (magic `17 a9 c1 ef`) — never send |
| 0x87 / 0x89 | SET / GET settings values (`{id u8, s16}`; RAM, ids 0x30/0x54/0x55 also go to the IMU settings handler) |
| 0x8E | load default settings |
| 0x90 | reboot into ISP (silent System OFF) |
| 0x95 | firmware-update reboot (payload word → shutdown reason) |
| 0x9F | turn off (`"off!"`), plays the shut-down jingle |
| 0xA1 | device info (18 zero bytes here) |
| 0xA2 | write `esb/bond` (24 bytes) |
| 0xAE | GET_STRING_ATTRIBUTE (0 board serial, 1 unit serial) |
| 0xBE | battery data (15 bytes) |
| 0xC0 / 0xC3 / 0xD8 | trigger / trackpad-pressure / joystick calibration state machines |
| 0xC5 / 0xE9 | SET / GET LED colour (RGBW percent; GET truncates) |
| 0xDB / 0xDC | GET / SET user store (`user/haptic_boot_level`) |
| 0xE2 | re-apply stored calibration blobs for one side |
| 0xED / 0xEE / 0xEF / 0xF0 | named key: get / RAM set / persist / delete |
| 0xF2 | debug/version GET (0 = fw timestamp + build strings) |
| 0xFE | erase all `cal/*` (magic `85 48 67 c6`) — never send |

Output reports: 0x80 rumble, 0x81 pulse, 0x82 command, 0x83 LFO tone, 0x84 log
sweep, 0x85 script, 0x86..0x8A further haptic/debug handlers.

## Appendix B — live settings dump (2026-09-29)

```
0=0 1=2 2=0 3=1200 4=0 5=0 6=0 7=7 8=1 9=0 10=7000 11=200 12=100 13=50 14=5500 15=923
16=382 17=2 18=8000 19=1770 20=1630 21=5 22=2 23=2 24=0 25=40 26=0 27=-10 28=16500
29=15000 30=500 31=400 32=800 33=0 34=100 35=80 36=0 37=0 38=1 39=0 40=20 41=3900
42=1 43=0 44=50 45=100 46=0 47=0 48=0 49=2 50=900 51=250 52=-1 53=-1 54=100 55=100
56=10 57=10 58=0 59=0 60=0 61=0 62=0 63=150 64=4 65=1 66=1 67=0 68=90 69=1 70=1 71=1
72=1300 73=1000 74=3 75=0 76=-3 77=0 78=1 79=2 80=1 81=0 82=3 83=1 84=1 85=100
```

## Appendix C — method

- Disassembly: `tools/triton-probe/thumbdis.rs` (yaxpeax-arm) over the image body
  at 0x8000; cross-references with `xref.js`; the range table with `table.js`.
  Listing quirks that bit every reader: 16-bit conditional-branch and cbz/cbnz
  targets print 2 bytes high; `mov.w rX, imm` encoded `6ff0….` is MVN; VFP shows
  as `.hword` pairs.
- Five analysis passes (LED, sound, update path, grips, rotation) and two
  independent adversarial re-readings of each firmware topic; the update-path
  report was refuted once on completeness and the missing points are in §5.
  Live checks were read-only except the LED readback test, which wrote a
  RAM-only colour with the enable off and restored zero.
