# Steam Controller 2026 Support Implementation Plan

> **For Hermes:** Implement task-by-task, keeping the mapper fork and Studio fork changes in separate commits and PRs.

**Goal:** Make the JSM Studio fork recognize the 2026 Valve Steam Controller over USB and the Steam Controller Puck, expose all standard and Valve-specific inputs, and let users configure both physical trackpads independently.

**Architecture:** Upgrade the JoyShockMapper SDL dependency to a release containing the SDL Triton driver’s two-touchpad support. Extend JoyShockMapper’s internal touch model from one logical touch surface to a list of physical pads while preserving existing single-pad commands/configuration. Add a Steam Controller type with Valve VID/PIDs and explicit mapping for the two pad clicks, four paddles, capacitive sticks, and two grip-sense inputs. Extend telemetry and the Tauri UI so device status shows both pads and the touchpad editor can select/configure left or right physical pads.

**Tech Stack:** C++23, SDL3/HIDAPI, Tauri 2, Rust, React/TypeScript, Vitest/TypeScript compiler, CMake/MSVC on Windows.

---

### Task 1: Prepare the two fork branches

**Objective:** Keep the mapper implementation and Studio integration independently reviewable.

**Files:**
- Modify: `.gitmodules`
- Submodule: `JoyShockMapper`

**Steps:**
1. Create `feat/steam-controller-2026` in both personal forks from the current integration baselines.
2. Change the Studio submodule URL to the personal JoyShockMapper fork only after the mapper branch has a commit to reference.
3. Keep all changes on feature branches; never push to `main`.

**Verification:** `git status --short --branch`, `git submodule status`, and both remotes show clean feature branches.

### Task 2: Upgrade SDL and add Valve identifiers

**Objective:** Build against SDL containing the Triton driver’s two-pad API and represent the 2026 Valve device explicitly.

**Files:**
- Modify: `JoyShockMapper/JoyShockMapper/CMakeLists.txt`
- Modify: `JoyShockMapper/JoyShockMapper/include/JslWrapper.h`
- Modify: `JoyShockMapper/JoyShockMapper/src/SDLWrapper.cpp`

**Steps:**
1. Pin SDL3 to the first reproducible upstream commit containing the merged Triton touchpad support, `SDL_GAMEPAD_TYPE_STEAM`, the four cap-sense APIs, and the current Triton button map (`5b98c1cc2f598115906c9c1f2758d3d256913468`, subject to the final SDL release/tag available when this branch is reviewed).
2. Add `JS_TYPE_STEAM_CONTROLLER` after existing controller type values.
3. Add Valve VID `0x28DE` and 2026 PIDs `0x1302` wired, `0x1303` Bluetooth, `0x1304` Puck, and `0x1305` Nereid receiver.
4. Detect the type by vendor/product before generic SDL type fallback.
5. Verify SDL HIDAPI hints keep Steam/Triton enabled and the new `SDL_GAMEPAD_TYPE_STEAM` remains compatible.

**Verification:** CMake configuration resolves SDL 3.4.14; source-level assertions cover each PID and type value.

### Task 3: Extend the mapper touch abstraction to two physical pads

**Objective:** Make both 2026 physical pads independently usable without breaking existing DS4 configurations.

**Files:**
- Modify: `JoyShockMapper/JoyShockMapper/include/JslWrapper.h`
- Modify: `JoyShockMapper/JoyShockMapper/include/JoyShockMapper.h`
- Modify: `JoyShockMapper/JoyShockMapper/include/JoyShock.h`
- Modify: `JoyShockMapper/JoyShockMapper/include/Stick.h`
- Modify: `JoyShockMapper/JoyShockMapper/src/SDLWrapper.cpp`
- Modify: `JoyShockMapper/JoyShockMapper/src/main.cpp`
- Modify: `JoyShockMapper/JoyShockMapper/src/Stick.cpp`

**Steps:**
1. Add a physical touchpad state type containing `down`, `x`, `y`, `pressure`, and previous state.
2. Add `GetNumTouchpads()` and indexed touchpad state/dimension methods to `JslWrapper`, with compatibility defaults for the legacy backend.
3. Keep `TOUCH_STATE` as the legacy single-surface callback contract for DS4/old configs, and add a new indexed callback contract for multiple physical pads.
4. Have SDLWrapper query `SDL_GetNumGamepadTouchpads()` and `SDL_GetGamepadTouchpadFinger()` for both indices, preserving coordinates through release frames.
5. For the Steam Controller 2026, report pad 0 as left and pad 1 as right; expose each pad’s click as a distinct logical binding.
6. Refactor touch processing into a per-pad function so `MOUSE`, `GRID_AND_STICK`, and touch-stick modes can run independently for left and right pads.
7. Preserve the old `TOUCHPAD_MODE`, grid, and PS touchpad output semantics for one-pad devices.
8. Add explicit names/settings for selecting pad side where required, without changing existing profile files silently.

**Verification:** Unit tests exercise one-pad DS4 compatibility, two-pad state transitions, simultaneous touches, release handling, dimensions, and independent left/right movement.

### Task 4: Map every 2026 controller input

**Objective:** Ensure every physical input reaches a configurable JSM binding.

**Files:**
- Modify: `JoyShockMapper/JoyShockMapper/src/SDLWrapper.cpp`
- Modify: `JoyShockMapper/JoyShockMapper/src/main.cpp`
- Modify: `JoyShockMapper/JoyShockMapper/src/ButtonHelp.cpp`
- Modify: `JoyShockMapper/JoyShockMapper/include/JoyShockMapper.h`

**Steps:**
1. Map normal buttons, sticks, triggers, d-pad, menu/view/Steam buttons.
2. Map L4/L5/R4/R5 to the existing four paddle bindings.
3. Map left/right capacitive stick touch to `LTOUCH`/`RTOUCH`.
4. Map left/right grip sense to dedicated `MISC` slots or add named `LGRIP`/`RGRIP` bindings if the existing six misc slots cannot communicate side reliably; document the choice.
5. Map left/right pad clicks independently rather than collapsing both into `CAPTURE`.
6. Keep all unknown extra SDL buttons visible through the remaining `MISC` bindings instead of dropping them.

**Verification:** A table-driven mapping test covers every SDL Triton button enum and confirms unique JSM logical output.

### Task 5: Extend telemetry and controller status

**Objective:** Make the Studio status page prove both pads are live before configuration.

**Files:**
- Modify: `JoyShockMapper/JoyShockMapper/include/Telemetry.h`
- Modify: `JoyShockMapper/JoyShockMapper/src/Telemetry.cpp`
- Modify: `JoyShockMapper/JoyShockMapper/src/main.cpp`
- Modify: `JSM_GUI/jsm_gui_tauri/src/hooks/useTelemetry.ts`
- Modify: `JSM_GUI/jsm_gui_tauri/src/components/ControllerStatusPage.tsx`
- Modify: `JSM_GUI/jsm_gui_tauri/src/components/ControllerStatusSvg.tsx`
- Modify: `JSM_GUI/jsm_gui_tauri/src/utils/controllers.ts`
- Modify: `JSM_GUI/jsm_gui_tauri/src/utils/controllerStatus.ts`
- Modify: `JSM_GUI/jsm_gui_tauri/src/i18n/resources/en.ts`
- Modify: `JSM_GUI/jsm_gui_tauri/src/i18n/resources/zh-CN.ts`

**Steps:**
1. Add a versioned optional `touchpads` array to telemetry, with index/side, down, x/y, pressure, and dimensions.
2. Keep existing telemetry fields unchanged so old viewers continue to parse core status.
3. Add a `Steam Controller 2026` label and correct Steam visual family/type handling.
4. Render two live pad panels/dots for the new controller and preserve existing DS4 rendering.
5. Add user-facing labels for left/right pad touch and click.

**Verification:** TypeScript compile and telemetry serialization tests validate old packets and new packets.

### Task 6: Make both pads configurable in the GUI

**Objective:** Let users choose left or right physical pads and configure mouse, grid/stick, and touch bindings independently.

**Files:**
- Modify: `JSM_GUI/jsm_gui_tauri/src/App.tsx`
- Modify: `JSM_GUI/jsm_gui_tauri/src/components/KeymapControls.tsx`
- Modify: `JSM_GUI/jsm_gui_tauri/src/components/keymap/TouchpadGridSection.tsx`
- Modify: `JSM_GUI/jsm_gui_tauri/src/components/keymap/TouchpadSettingsSection.tsx`
- Modify: `JSM_GUI/jsm_gui_tauri/src/components/keymap/TouchpadStickSection.tsx`
- Modify: `JSM_GUI/jsm_gui_tauri/src/hooks/useTouchpadConfig.ts`
- Modify: `JSM_GUI/jsm_gui_tauri/src/keymap/schema.ts`
- Modify: `JSM_GUI/jsm_gui_tauri/src/utils/touchpadConfig.ts`
- Modify: `JSM_GUI/jsm_gui_tauri/src/utils/configSerializer.ts`
- Modify: related CSS/i18n files

**Steps:**
1. Add a physical-pad selector visible only when the connected controller exposes two pads.
2. Store left/right pad UI state in a backward-compatible profile/config representation.
3. Route selected-pad settings and grid bindings to the corresponding JSM commands/config sections.
4. Keep existing single-pad profiles loading unchanged.
5. Make button capture distinguish left-pad click and right-pad click.

**Verification:** Frontend tests cover default selection, profile round-trip, single-pad fallback, and independent left/right edits.

### Task 7: Update packaging and developer documentation

**Objective:** Ensure releases build the new mapper and SDL rather than shipping stale binaries.

**Files:**
- Modify: `.gitmodules`
- Modify: `.github/workflows/release.yml`
- Modify: `JSM_GUI/jsm_gui_tauri/scripts/build-joyshockmapper.ps1`
- Modify: `README.md`
- Modify: `README_zh.md`
- Modify: `docs/joyshockmapper-upstream.md`
- Modify: `JSM_GUI/jsm_gui_tauri/src-tauri/tauri.conf.json` if resource paths need adjustment

**Steps:**
1. Point the submodule at the personal mapper fork/feature branch for development, then pin the exact mapper commit in the Studio PR.
2. Ensure the Windows build checks out recursive submodules and builds SDL3 from the upgraded pin.
3. Document USB and Puck support, required Steam-closed/HidHide conditions, and the live two-pad test procedure.
4. Do not commit generated release binaries unless the repository’s release process requires them; ensure CI generates them reproducibly.

**Verification:** Windows CI configuration is internally consistent and the local source build reaches the mapper target on macOS as far as the platform toolchain allows.

### Task 8: Build, test, review, and open PRs

**Objective:** Deliver verified source changes and honest hardware-test status.

**Steps:**
1. Run mapper unit/source tests and CMake configure/build on the available host.
2. Run Studio TypeScript/lint/build checks.
3. Review the complete diff for scope, stale binary changes, accidental secrets, and backward compatibility.
4. Push mapper branch and open its PR.
5. Update Studio submodule to the pushed mapper commit, push Studio branch, and open its PR.
6. Report exactly which checks ran, which require Windows hardware, and do not merge without Luke’s approval.

**Acceptance criteria:**
- Steam Controller 2026 is named and identified for USB/Puck paths.
- All SDL-exposed standard and Valve-specific inputs have distinct configurable JSM mappings.
- Both physical pads provide independent touch coordinates, pressure, touch/click state, and configurable output.
- Existing DS4, DualSense, Joy-Con, and one-pad profiles remain compatible.
- Mapper and Studio PRs are open with reproducible build/test instructions.

---

## Known constraints

- The host is macOS, so Windows HID/Puck hardware and MSVC builds cannot be exercised locally.
- SDL’s Triton driver and JSM’s existing touch callbacks use different concepts: SDL has multiple physical pads; old JSM has one logical pad with up to two fingers. The implementation must not fake two physical pads by treating them as two fingers.
- A source-level test harness with mocked SDL calls or captured reports is required to validate two-pad transitions without hardware.
- The current JSM Studio GUI displays controller diagrams based on a finite type table; adding the type and live status is required, but an illustration alone is not proof of input support.
- All changes must go through PRs; do not merge them automatically.

## Expected PR structure

1. JoyShockMapper fork PR: SDL upgrade, Valve type, input/touch abstraction, mapping/telemetry tests.
2. JSM Studio fork PR: submodule pin, GUI/controller status/two-pad configuration, packaging/docs.
3. Optional later PR: release artifact generation/update once Windows hardware validation succeeds.

## Verification notes

The final report must distinguish:

- source/unit-test verification,
- Windows CI build verification,
- SDL testcontroller verification on the Steam Controller,
- actual JSM Studio hardware verification over USB,
- actual JSM Studio hardware verification through the Steam Controller Puck.

Do not describe the last two as complete until run on real hardware.

---

## Sources consulted

- SDL Triton driver and touchpad API changes: https://github.com/libsdl-org/SDL/pull/15528
- SDL original Steam Controller touchpad API change: https://github.com/libsdl-org/SDL/commit/74a746281f2208e07a7680560fcb7ec57565228e
- Current JSM SDL wrapper: https://github.com/hotuns/JoyShockMapper/blob/jsm-studio/JoyShockMapper/src/SDLWrapper.cpp
- Current JSM Studio architecture: https://github.com/hotuns/JSM_Studio
- Current JSM Studio release workflow: https://github.com/hotuns/JSM_Studio/blob/main/.github/workflows/release.yml
