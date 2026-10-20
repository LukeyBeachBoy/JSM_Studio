# Installer acceptance — 20 October 2026

This is a test on the maintainer's existing Windows PC, with no controller
connected. It is not clean-machine, game, or physical-controller acceptance.

## Public 0.7.155

Tested the exact public installer identified in [the release notes](0.7.155.md).
Downloaded bytes matched the published SHA-256 and version.

| Check | Observed result |
| --- | --- |
| Upgrade from 0.7.154 | Completed through the interactive installer; the maintainer assisted with the old uninstaller |
| Preserve saved profiles | All 59 checked configuration files matched the saved backup after upgrade |
| Normal launch | App and mapper process tokens were not elevated |
| Runtime ownership | One app, one mapper and the app's loopback telemetry listener |
| Reopen an existing session | Reopened the existing app without retaining a duplicate mapper |
| Real update check | Completed while the app stayed running; checks stable releases only |
| Existing library | Saved Megastore Simulator configuration and the existing library reopened |
| Fresh app data | Welcome guidance appeared; its Review startup settings action opened the correct page |
| First-run permissions | Admin on launch, Windows startup and Windows sign-in input were off |
| No controller | The app reported that it was searching; editing/navigation remained available |
| Restore after fresh-data test | Original app data restored; all 59 checked configuration files still matched |

The fresh-data check temporarily moved the app's roaming and local data out of
the way. It did not remove shared drivers, Windows settings or an existing
accessibility helper. Test data and private backups were retained locally.

## Follow-up candidate fixes

The local 0.7.156 candidate addresses findings from this test:

- Use the existing product logo for setup/uninstall icons, header and sidebar.
- Replace “Click OK to kill it” with a warning to save changes before closing
  the app, and explain that mapping pauses during replacement.
- Clarify that the uninstall data checkbox deletes saved profiles and settings.
- Say “No newer stable release” rather than “Up to date”, and provide a
  **Browse all releases** action for previews.
- Keep the optional Windows Sign-in reference in Library, but remove it from
  the Home screen's suggested games and game count.
- Retain previous accent icon files because Windows can keep their paths
  cached after a shortcut changes. The reported blank taskbar icon still needs
  visual confirmation after restarting; both the current executable icon and
  shortcut icon decoded correctly during inspection.

The browser regression covers permission consent/cancel/reset, independent
administrator preference, update failure/retry, the preview link, stable-only
wording, the game shelf and minimum-window confirmation layout. Browser checks
use simulated input; they do not establish native input or controller support.

The final local 0.7.156 installer built successfully and was installed on this
PC. Its branded pages and corrected close-app warning were inspected in Windows.
All 59 checked configuration files remained unchanged. The installed app showed
the corrected game count and stable-release wording, and **Browse all releases**
opened this project's GitHub releases in the browser while the app kept running.
The five native icon/shortcut tests passed.

Local candidate installer SHA-256:
`53e084d00faae248b0f63020f46f75d7478992d070fb79ce15f9e0a313fd590f`.
This identifies the local test package, not a public GitHub download. The
installed and build executables differed only in Tauri's three-byte NSIS bundle
marker, verified by byte comparison.

## Manual checks before a broad Reddit post

Record version, controller model, firmware, connection, Windows version and game
for each result. List Steam Controller 2015 and 2026 separately.

1. **Ordinary mapping:** connect each advertised controller, calibrate gyro,
   verify buttons/sticks/grips and intended keyboard/mouse or virtual-gamepad
   output. Check slow gyro motion, flicks, trackpad click/lift, grip haptics and
   reconnect/wake.
2. **Actual games:** try Steam Input enabled/disabled as appropriate, check
   duplicate input and mixed mouse/gamepad behavior, and verify profile
   switching, held layers, global chords and overlays in a game.
3. **Save and restart:** make a small mapping change, save and make it live,
   restart, reconnect the controller and confirm the mapping and chords work
   without editing a setting again.
4. **Optional sign-in:** with a physical keyboard available, test explicit
   consent and cancellation, real Windows lock/unlock, disabled behavior,
   held buttons/reconnect and power-shortcut cancellation. Do not record a
   real PIN or sign-in input telemetry.
5. **Clean Windows setup:** test missing-driver refusal and approval, requested
   reboots, HidHide recovery, administrator approval/cancellation, old startup
   task migration, uninstall with data retained, and the final browser download's
   SmartScreen behavior. Existing shared drivers prevented those checks here.
6. **Outside feedback:** have someone unfamiliar with the app follow the setup
   guide, then record a short real-controller demonstration.

The app and installer remain unsigned. Branding does not authenticate their
publisher or guarantee that Windows will accept the download without warnings.
