# Triton grip calibration — 2026-09-07

## Findings

The previous implementation used settings 72/73 (`TIMP_TOUCH_THRESHOLD_ON/OFF`) from SDL's generic controller enum. Steam's Triton personalization path instead submits setting **0x22** for auxiliary capacitance threshold and **0x23** for auxiliary capacitance hysteresis. The threshold and hysteresis are independent values. Subtracting the guard from the threshold was incorrect.

Read-only inspection of the locally installed Steam client established the following:

- `steamui/chunk~2dcc5aaf7.js`, the Grip Sensor Calibration component: threshold UI limits 25..400, default underlying threshold 100, displayed slider value `425 - threshold`. The callback writes `nAuxCapSenseThreshold`.
- The same component: guard UI limits 25..100, default underlying hysteresis 80, displayed slider value `125 - hysteresis`. The callback writes `nAuxCapSenseHysteresis`.
- `steamclient64.dll` personalization application routine, preferred image addresses `0x13860795b` through `0x1386079c7`: bounds threshold to 25..400, packs setting ID 0x22 plus a 16-bit value; bounds hysteresis to 0..100, packs ID 0x23 plus a 16-bit value; submits each through the same setting-write method. No subtraction is performed.
- The setting-write method at `0x138608150` queues the three-byte entry. Its worker at `0x138602ac0` forwards that entry with count 1 to the controller's settings method.
- SHA-256 of the inspected DLL: `CABA4826AA3501039D095AEE1843A6BFB270FB43A3AB4455B2D6733223579FEE`. Addresses are evidence for this binary, not runtime hooks or dependencies. No Steam files were changed or proprietary code copied into the application.

Valve's [Grip Sense guide](https://steamcommunity.com/groups/steam_hardware) confirms that reducing range requires closer finger contact and reducing Flicker Guard makes release quicker. Very low guard may cause flicker.

## Implemented correction

- Native `TritonGripSettings.h` uses the Triton IDs and native value limits; each setting works independently. Unset values leave controller state unchanged. Unchanged values are not written every poll, and unsuccessful sends leave caches unchanged for retry.
- Studio exposes 0..100% controls in the same direction as Steam. Smaller values mean shorter range and less guard. Config commands retain raw firmware values; the UI converts them rather than silently reversing the meaning of existing config text.
- `GRIP_SENSOR_RANGE = 400` corresponds to Studio's 0% range. `GRIP_FLICKER_GUARD = 95` corresponds to approximately 7% guard, a starting point for a short finger lift rather than a guarantee for every hand.
- Clear either field to leave that controller setting unchanged. This is not a factory reset or a readback of the current firmware value.
- Compiled native tests cover IDs, independent writes, bounds, invalid inputs, unset settings, unchanged settings and retry/reconnect inputs. Frontend tests cover direction, endpoints, defaults and round trips. The release prerequisite workflow includes these checks.

## Verification limits

Native compilation, frontend TypeScript/production build, focused ESLint, grip tests and all current numeric touch harnesses passed. The full NSIS build also passed and produced `JSM_GUI/jsm_gui_tauri/src-tauri/target/release/bundle/nsis/JSM Studio_0.7.9_x64-setup.exe`. The build required a Windows PowerShell module path in the packaging process environment; no driver checksum checks were bypassed. This installer has not yet been installed in this session.

Physical calibration is pending: the receiver is present, but the read-only feature queries failed in this session. Hardware readback must confirm the new values and a finger-lift test must confirm the desired behavior. The earlier source tests asserted the incorrect TIMP assumptions; they were corrected and supplemented with compiled tests.

Other uncommitted trackpad changes in the shared fork have been preserved. This correction does not claim to validate those changes on hardware.
