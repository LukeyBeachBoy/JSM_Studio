# Windows controller access and sign-in

JSM Evolved prefers the signed FakerInput virtual keyboard/mouse when installed.
The mapper and controller keyboard share the same native transport. This allows
keyboard, mouse, gyro and trackpad input to reach SYSTEM-level windows such as
Virtual Desktop Streamer. The existing SendInput path remains the fallback for
machines without the driver and characters not available in the keyboard layout.
The app does not run as SYSTEM, install a privileged command service, or change
Windows UAC/security policies. The shared driver remains installed when JSM is
uninstalled; it can be removed separately in Windows Installed apps.

## Windows Sign-in configuration

The library contains **Windows Sign-in**, but controller input on the lock screen
is **off by default**, including after upgrading. To opt in, open **Settings →
Startup → Windows sign-in**, enable **Controller input on the Windows lock screen**,
and confirm the explanation. FakerInput must be installed separately; having the
driver or preset already installed does not enable this feature.

Once enabled, the preset is selected by Windows session lock state, not by
matching LockApp.exe or LogonUI.exe as a normal foreground program.
The mapper must already be running in the signed-in Windows session. This supports
locking and unlocking that session, including reconnecting the controller while
locked. It does not start the mapper before the first Windows login after reboot.

Turn the setting off in the same place to revoke access. The mapper checks the
separate per-user consent file every 100 ms, cancels pending sign-in actions when
the choice changes, and ignores buttons held while enabling. Missing, unreadable
or malformed consent is treated as Off. Ordinary mappings are suppressed while
Windows is locked even when sign-in is disabled.

| Controller input | Default key |
| --- | --- |
| Face buttons clockwise: Y / B / A / X | 1 / 2 / 3 / 4 |
| D-pad Up / Right / Down / Left | 5 / 6 / 7 / 8 |
| LB / RB | 9 / 0 |
| Left stick click / Right stick click | 9 / 0 |
| Four rear buttons | 1 / 2 / 3 / 4 |
| Menu / Right trigger / Right pad click | Enter |
| View / Left trigger / Left pad click | Backspace |
| Steam / Home | Escape |

Dismiss the lock-screen background to reach the PIN field, then enter your PIN
yourself and submit if Windows requires it. No PIN is stored and there is no
automatic unlock action. A held button types once; release it to type it again.
Buttons already held when locking are ignored until released. After unlocking,
normal mappings resume after the mapped buttons are released.

**Turn the controller off:** hold Quick Access, tap Y, then release both buttons.
This fixed Steam Controller shortcut works while locked only when Windows sign-in
is enabled. The desktop shortcut is configured separately.
It does not enter Y's PIN digit. It ignores buttons already held when locking and
cancels if Windows unlocks before release. Press Steam to wake the controller.
The command is queued to the console thread so it never waits for the polling
thread's own controller lock, and it targets only the originating controller.

**Button reference:** select Windows Sign-in in the Library, then open Button
reference. The diagram follows the saved digit and control bindings and contains
no live input. [Full reference](assets/windows-sign-in-reference.png) and
[lock-screen background](assets/windows-sign-in-background.png) exports are included.
Run `node scripts/export-windows-sign-in-guide.cjs` to regenerate the default images.
The background leaves the middle clear for Windows' account picture and PIN field.
JSM does not draw an ordinary overlay over the secure sign-in desktop. Applying
the optional background and disabling its visual blur are separate Windows
personalization choices; an app update does not change them automatically.

The preset can be edited in the library. While locked, only individual digits,
ENTER, BACKSPACE, ESC and NONE are accepted. Includes, macros and commands are
ignored. Layout-dependent numeric characters are translated through the active
Windows keyboard layout. Locked-session packets omit all device/button data and
console history; Studio must not restore cached buttons into those packets.

## Verification

- Native HID tests exercise report packing, modifiers, key releases, rollover,
  mouse movement, wheel, media keys and unsupported-key fallback.
- Lock-state tests exercise held-button suppression, one press per digit,
  unlock release gating, restricted preset parsing and the fixed controller-off
  shortcut (either release order, no PIN digit, no repeated shutdown).
- Rust tests ensure lock notifications clear cached button telemetry.
- Verify actual SYSTEM-window interaction and a manual lock/unlock separately.
  Do not record controller telemetry or screenshots while entering a real PIN.
- Manual controller-only PIN entry, unlock and locked-session controller-off
  shortcut confirmed on 2026-10-16, before the explicit consent gate was added.
  Repeat native acceptance on the new candidate before claiming it validated.

Upstream: [FakerInput](https://github.com/Ryochan7/FakerInput/releases/tag/v0.1.1)
and [Microsoft Windows desktop model](https://learn.microsoft.com/en-us/windows/win32/winstation/desktops).
