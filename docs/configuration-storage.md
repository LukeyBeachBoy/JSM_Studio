# Configuration storage and Windows launch contexts

JSM Evolved owns one per-user configuration location. On Windows, the data root
is the user's Roaming AppData known folder plus the configured application
identifier, `com.lukeybeachboy.jsmstudio`. The library is
`jsm-runtime/profiles-library` below that root. Permissions, AI settings and the
mapper runtime use the same root resolver. Environment variables, the working
directory and the launcher do not select a separate library.

Windows Desktop Bridge/MSIX filesystem virtualization can give a process a
private AppData view inherited from its launcher. On the affected PC, even an
explicit absolute path and a process reporting no package identity opened a
different physical file. The directory handle itself could point at the normal
directory while individual files opened under a package's `LocalCache`.

Before creating WebViews, acquiring the single-instance lock, initializing
settings or starting the mapper, the app therefore creates and removes one
uniquely named, empty probe file. It compares that file's final physical location
with its containing directory's final location and checks for a private package
cache. The probe never loads or changes profiles.

A redirected launch asks the existing Explorer desktop's shell COM object to
open this same executable with the original arguments and a one-time marker.
The replacement repeats the physical storage check. If it is still redirected,
or Explorer/storage is unavailable, startup stops with an error instead of
opening another library or creating default configurations. A normal launch
continues directly. Existing instance handoff happens only after this check, so
a second launch cannot start another mapper in a private storage context.

This does not migrate, merge, overwrite or delete older private copies. Those
copies can be retained for recovery. On this PC, Cyberpunk's missing Cyborg
metadata was restored separately with a backup, preserving its ordinary saved
Steam Controller settings.

Library → Configuration folder shows the resolved physical library path and
opens the folder used by the backend.

## Verification

- `cargo test --lib --offline`: native regression suite, including argument
  quoting and private-storage detection.
- `node tests/config_directory_browser_regression.cjs`: folder disclosure,
  minimum-width wrapping and Open folder routing.
- `cargo run --example storage_context_probe --offline --
  --report=<absolute JSON path> --profile=Cyberpunk`: isolated native launch
  probe. Run once directly from Codex and once through ordinary Explorer, with
  separate report paths. Physical library and profile SHA-256 must agree;
  only the redirected launch should report `desktopHandoff: true`.
- Verify both cold launches of the installed executable, visible Default,
  Driving and Weapons bindings, one app/mapper process pair, and unchanged
  saved-profile hashes. Repeat for future storage/startup/installer changes.

Windows references: [MSIX filesystem behavior](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-behind-the-scenes)
and [known-folder redirection flags](https://learn.microsoft.com/en-us/windows/win32/api/shlobj_core/ne-shlobj_core-known_folder_flag).

## Local acceptance: 28 October 2026, 0.7.181

The full native suite passed (196 passed, two ignored), the web build passed,
and the folder disclosure browser regression passed. The isolated Codex and
Explorer probes both opened the ordinary Roaming AppData library and read the
same 10,250-byte Cyberpunk file with SHA-256
`2CED7710E20F6C2B8E3846EFE0E9B2C2AF69DC30B861BF9DE9A9DFA6CB5DEA01`.
The Codex invocation performed the desktop handoff; Explorer did not need one.

The final NSIS installer was installed through the ordinary desktop session.
All 65 saved profile and backup files checked during the upgrade were unchanged.
Both cold launches of the installed executable loaded Cyberpunk and its two
layers, with one app and one child mapper. The Codex invocation's surviving
process carried the handoff marker; the Explorer invocation did not. The normal
app's Library showed the ordinary configuration folder. Both launch paths
visibly showed the restored Default bindings, and the app was left on Default
with Cyberpunk live. Gameplay and physical button output were not exercised.

Installer SHA-256:
`D082B0590E1B10BC9B3008E6686B0B13524A996893D6FFE35084C061996BFFD7`.
Local evidence is retained under ignored `build-jsm-sdl/storage-*.json` and
`build-jsm-sdl/install-storage-context-0.7.181.json`.
