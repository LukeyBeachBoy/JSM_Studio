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

## Per-grip follow-up — 2026-09-10

Requested behavior: right grip for responsive gyro activation, with a much larger
left sensing range so a deliberate hand lift can switch the controller layout.

### Confirmed observations

- Re-read the installed Steam UI. It still exposes `nAuxCapSenseThreshold` and
  `nAuxCapSenseHysteresis` without a left/right field or argument. Left/right
  indicators are separate booleans. The calibration component also calls
  `SetEditingTritonCapSenseSettings` while open; that is not evidence of separate
  distance controls.
- Re-disassembled the installed `steamclient64.dll`. Its SHA-256 still matches
  the earlier investigation above. The personalization path at
  `0x13860795b..0x1386079c7` still emits one setting `0x22` and one setting `0x23`.
- Inspected the locally bundled firmware `IBEX_FW_6A628345.fw` read-only.
  SHA-256: `865B4A7B1786C4A9990375759548331D313170C3E3B4C5897E16DC01B9AB12A8`.
  After removing the 32-byte header, addresses below use base `0x8000` and Thumb
  instructions. This is a bundled image, not a readback of the connected device.
- The settings callback at `0x1cae8` dispatches setting `0x22` to `0x1cb42`
  (sensor attribute 4) and `0x23` to `0x1cb4a` (sensor attribute 5). Both call
  `0x1cab0`. That function loads the two sensor instances from `0x20002278` and
  `0x20002144`, invokes the same attribute setter `0x4a7ba` for each with the same
  value, and marks both instances for refresh. There is no side selector in this
  path. The setter stores attributes 4/5 at offsets `0x0e`/`0x10` of its state.
- The firmware's grip touch/de-touch threshold queries (attributes 6/7 in
  `0x4a802`) use the conversion at `0x3be44`, which reads those two fields.
  This ties the shared writes to actual grip threshold calculations, rather
  than merely to UI names.
- Current [SDL Triton input code](https://github.com/libsdl-org/SDL/blob/main/src/joystick/hidapi/SDL_hidapi_steam_triton.c)
  reads two grip-touch bits and publishes boolean cap-sense states. Its normal
  input path does not expose analog grip distance/capacitance for Studio to
  threshold independently. The [report structures](https://github.com/libsdl-org/SDL/blob/main/src/joystick/hidapi/steam/controller_structs.h)
  and [OpenPuck protocol implementation notes](https://github.com/safijari/openpuck/blob/main/docs/PROTOCOL.md)
  corroborate the ordinary grip-touch bits.
- [Valve's Grip Sense guide](https://steamcommunity.com/groups/steam_hardware)
  describes a single range slider and a single flicker-guard slider. It does not
  document separate calibration for each grip.

### Conclusion and limits

The known host command path actively writes the same calibration to both grips.
Adding two range sliders in Studio would not create two independent ranges with
these commands. No usable per-grip distance or hysteresis control was found.

This is strong evidence for a limitation of the currently understood interface,
not proof that independent calibration is physically impossible. An undocumented
sensor command, diagnostic raw-data stream, or changed firmware could provide a
different route. The investigation did not exhaustively reverse-engineer every
firmware handler or confirm the connected controller's installed firmware version.
No speculative setting IDs were sent, and no firmware was flashed or patched.

A host-side release delay could independently ignore brief left-grip dropouts and
require a sustained release to change layouts while keeping right-grip response
immediate. It would measure time, not hand distance, and would introduce deliberate
left release latency. It is not implemented or presented as a distance control.

### Per-grip automatic haptics

Studio now has separate **Left grip** and **Right grip** checkboxes under
**Grip sensors → Haptic feedback**. They control both automatic contact and release
pulses. Shared strength/effect controls and explicitly bound haptic effects retain
their behavior; the sensor inputs and bindings are unaffected.

For right-only feedback, with existing nonzero contact/release strengths:

```text
LEFT_GRIP_HAPTICS = OFF
RIGHT_GRIP_HAPTICS = ON
```

Both switches default to ON to preserve existing profiles. The shared contact and
release intensities still default to 0, so fresh profiles remain silent.

Validation: frontend production build, native Release build, focused ESLint,
compiled production haptic-routing tests, existing calibration/integration checks,
and frontend config round-trip tests passed. Browser checks confirmed independent
checkbox state, scoped unsaved feedback, and Cancel restoring the previous values;
the layout was visually reviewed. The routing test covers all four side
combinations, independent noisy transitions, simultaneous transitions, contact and
release strengths/effects, live enable, and independent devices. The updated native
binary was copied into Studio's bundle by the normal build script. No installer
was produced or installed, and physical haptic feel remains untested.
