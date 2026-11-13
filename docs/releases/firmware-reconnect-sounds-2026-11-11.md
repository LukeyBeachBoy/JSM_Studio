# Steam Controller firmware update investigation — 2026-11-11

Installed GUI: 0.7.194, with mapper-only reconnect-sound and shutdown-lock fixes. Saved profiles
and configuration slots were preserved (81 profile files checked by SHA256).

## Confirmed sound fault and repair

The connected controller reports firmware `6AE90BC5`. JSM's requested
`BOOT_SOUND_LEVEL` was 0, but HID command `DB` returned `01 DB 02 01 02`:
the controller was playing its factory jingles at normal volume. Sending the
existing mute command `01 DC 02 01 00` succeeded and readback became
`01 DB 02 01 00`; a subsequent read still returned 0.

`applyTritonSettings` previously retained a process-wide serial/key cache of
boot volume across disconnects. A firmware update or other writer could reset
the hardware preference while JSM continued to treat it as already applied.
The cache is now connection-local, like the other hardware settings. A new
connection reapplies the requested level. Unchanged polls do not write, failed
writes retry, and an unset preference still leaves hardware alone.

The first power-on after a firmware reset can play the factory jingle before
JSM has a connection. Reapplying mute affects shutdown and subsequent boots.

## Grip evidence and remaining limitation

With both trackpads released, the actual firmware settings matched the running
Desktop profile: range 393 and guard 99 (about 2% and 1% in the UI). Switching
the mapper to the saved Gaming slot produced 400/100 (0%/0%), then Desktop
returned to 393/99. The current Desktop preview was restored afterward. Thus
these live checks did not reproduce a dropped grip write on this firmware.

Version 0.7.194 deliberately waits until **both** trackpads have been released
for 100 ms before changing grip calibration, because those writes previously
caused a visible pause during cursor gestures. A thumb resting on either pad
can delay a change indefinitely. This behavior has not been relaxed: doing so
without physical testing could reintroduce the cursor freeze. Luke subsequently
confirmed that Desktop grip sensing feels "very dialed in now".

## Validation and deployment

- `python JoyShockMapper/tests/run_grip_harness.py`: passed production-block
  tests for the sound reset/reconnect case, failure/retry and unset behavior;
  grip scope selection, reconnect, retries and both-pad release gating;
  haptic edge routing; and continuous-touch profile handoff.
- Release native mapper build: passed.
- Initial sound-only mapper SHA256:
  `1B8411D108057277578B95438B86A66B746516A6CEC313E48B2FFE86CB912F37`.
- JSM and the new mapper restarted; Desktop slot 2 and the mute preference
  remained selected. The controller was unavailable for a post-install HID
  readback. Luke subsequently confirmed one custom sound on shortcut shutdown
  and one on power-on, with no additional factory jingle.
- Original installed mapper backup:
  `tmp/grip-research/installed-before-firmware-reconnect-fix/JoyShockMapper.exe`.

The HID probe now supports `SCPROBE_INTERFACE` to select the connected puck
slot; choosing the first vendor collection can target an empty slot. Diagnostic
probe access through HidHide was temporary and restored after each run.

## Follow-up: shutdown light delay

Luke reports that the light stays on for a long time after the shutdown
shortcut. Sound 7 has a 172 ms playback wait. `TurnOffController` then requires
Steam, Quick Access and Y to be released continuously for 75 ms, cancelling
after 10 seconds if a wake button remains held. Luke later estimated about two
seconds and requested a faster shutdown if practical.

The poll loop previously acquired `controller_lock` before waiting for the
configuration lock in hardware maintenance and mapping callbacks. Shutdown
owns the configuration lock and needs `controller_lock` to read live releases
and send power-off. Repeated poll waits could therefore delay shutdown beyond
the intended debounce. Polling now waits for configuration **before** acquiring
`controller_lock`. If configuration remains busy, SDL still refreshes raw
buttons, but mapping is skipped until the command finishes. The sound duration,
75 ms release guard, reconnect protection and 10-second cancellation remain.

`shutdown_poll_lock_regression.py` exercises the actual production poll prefix
with a contended configuration and controller mutex. It failed before this
change and passed afterward: shutdown can acquire the controller mutex while
polling waits, raw buttons still update, and normal mapping resumes. The
existing shutdown release/bounce/timeout tests, grip/sound tests and full native
mapper stability harness also passed. The release build succeeded.

Installed and bundled mapper SHA256 after the shutdown fix:
`7E3D5AD18ED23AE579C07A242DC1B9AE88965C158166843B450B45E10E7B2C3F`.
The app and new mapper restarted; all 81 saved profile files were unchanged.
Backup of the preceding sound-only mapper:
`tmp/grip-research/installed-before-shutdown-lock-fix/JoyShockMapper.exe`.
No controller was connected during the post-install snapshot, so physical
light-off timing with this build remains unmeasured.

## Follow-up: Desktop versus Cyberpunk grip distance

Luke subsequently reported that Desktop requires deliberate shell contact but
Cyberpunk activates farther away. Read-only HID checks after he selected each
configuration, with trackpads released, found:

| Active configuration | Firmware range (0x22) | Guard (0x23) | UI range / guard |
|---|---:|---:|---:|
| Desktop slot 2 | 393 | 99 | 2% / 1% |
| Cyberpunk slot 1 | 306 | 96 | 25% / 5% |

The saved `Cyberpunk.txt` has Steam Controller model overrides of 306/96,
which take precedence over its shared 194/82 entries. The slot-aware foreground
worker (`slots.rs::apply_foreground`) rewrites the game's slot snapshot from the
saved named source when its foreground rule matches. A temporary 400/100 Gaming
snapshot observed earlier therefore did not establish what would load next
time Cyberpunk became foreground. During this follow-up the slot snapshot was
observed changing back to the saved Cyberpunk content; the final live readback
was 306/96. No tuning values were changed in this follow-up.

Read-only disassembly of the installed `IBEX_FW_6AE90BC5.fw` (32-byte header,
image base 0x8000) confirms:

- Getter `0x4f936` obtains grip touch/release thresholds through `0x3d094`.
  That calculation uses only the range and guard fields: touch threshold
  `225 + 9 * range`, release threshold truncated from `touch * guard / 100`.
- The grip processing path averages a two-sample buffer (`0x4f7e0`,
  `0x4f7fc`, `0x4f818`), compares against the touch threshold at `0x1c838`
  and release threshold at `0x1c6fc`, and updates a held-state bit.
- This establishes threshold/hysteresis behavior in the main firmware. It
  does **not** establish whether the underlying capacitive sensing pipeline
  performs startup or adaptive baseline compensation. No user-accessible
  "capture ungripped baseline" command was identified, and no calibration or
  reset command was sent.

Matching Cyberpunk's saved Steam Controller overrides to Desktop's 393/99
would be the first controlled comparison. Raw range 400 (UI 0%) is the maximum
threshold supported by JSM's current range control, not a guarantee of literal
contact-only sensing or a distance in millimetres.

Luke then requested matching Desktop's grip settings in Cyberpunk and preserving
them on game load. Saved Steam Controller overrides 393/99 in both
`profiles-library/Cyberpunk.txt` and `.slots/slot-1.txt`, with byte comparisons
confirming only those two values changed. The original files are backed up in
`tmp/grip-research/cyberpunk-desktop-match-20261111-192544`.
The saved source and Gaming snapshot have matching hashes. Cyberpunk's enabled
auto-load file points to that saved source and slot 1. After reloading the Gaming
snapshot with the controller connected, both JSM's effective setting queries
and direct HID readback returned 393/99 (UI 2%/1%). Factory-sound mute remained 0.
Bringing the game forward via computer use could not be completed because app
access timed out; verification used JSM's loader and the existing auto-load rule.
