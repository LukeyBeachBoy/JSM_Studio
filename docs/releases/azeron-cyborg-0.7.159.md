# Azeron Cyborg and multiple-controller game configs — 0.7.159

Built and installed locally on 26 October 2026. This installer includes the current working tree, including pre-existing overlay and managed-controller work. It has not been published.

## Delivered

- Cyborg DirectInput support (`16d0:12f7`, controller type 25): 32 numbered button assignments, hat and analog stick. The idle composite XInput companion is excluded when DirectInput is available.
- Fixed native digital-button allocation and dispatch, so numbered inputs reach the binding engine as well as telemetry.
- Original theme-aware Cyborg vector drawing with labelled, clickable inputs, live feedback and numbered input glyphs.
- Multiple controller layouts inside one game config, including adding models, selecting saved disconnected models and retaining the edit destination across disconnect/reorder. Selecting a layout without editing preserves the source rather than creating unsaved changes.
- Cyberpunk Cyborg preset: keyboard on foot; button 25 Escape; button 22 toggles Driving; analog left stick and keyboard vehicle controls in Driving. Labels change with the selected layer.

## Validation

- Native release build, TypeScript/Vite production build and NSIS installer completed.
- Rust suite: 184 passed, 1 ignored. Includes Cyborg mask decoding, toggle edges, Steam isolation and disconnect reset.
- Azeron, controller-layout, layer and managed-controller regression scripts passed.
- Browser checks passed for Cyborg art and interaction, multiple-controller selection, unchanged source on selection, offline editing, existing gamepad artwork and controller-layout editing.
- Physical input capture confirmed JOY1–JOY25, all hat directions and both stick axes. JOY26–JOY32 were not exercised.
- Final native smoke tests opened type 25 without its Xbox companion and parsed the combined Cyberpunk profile, projected on-foot layout and composed Driving layout without config errors or missing button handlers.
- Installed app detected both Cyborg and Steam Controller. Cyberpunk showed both saved layouts, the labelled Cyborg art, correct Driving labels/analog mode, and “Live · saved”. Switching layouts did not mark the config unsaved.
- The runtime generated `profiles-library/.layers/applied-preview/0-Driving.txt` after editor capture released.
- The installed mapper matches the tested native binary. The installed app matches the release executable apart from Tauri's expected NSIS bundle marker.

The existing Cyberpunk file is preserved byte-for-byte as the prefix of the updated file; only Cyborg model rows were appended. A backup of the profile, applied preview, device allowlist and GUI state is at `%APPDATA%/com.lukeybeachboy.jsmstudio/backups/azeron-cyborg-20261026-212148/`. The allowlist now includes the Cyborg alongside the existing Steam device IDs. Cyberpunk was made live; its existing AutoLoad rule was left as configured.

Physical gameplay, output feel and unplug/reconnect in Cyberpunk have not been tested. Automated layer activation and input capture do not establish those results.

Installer: `JSM_GUI/jsm_gui_tauri/src-tauri/target/release/bundle/nsis/JSM Evolved_0.7.159_x64-setup.exe`

SHA-256: `7AB35066F066DBE31CEE74CE0F4074D8A2AB65773AB36E0A8A47778EBD521F41`
