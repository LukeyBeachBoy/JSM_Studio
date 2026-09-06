# Playtest feedback implementation audit

Source: JSM Studio Feedback — Claude Code Prompt.pdf supplied in this task.

| Item | Finding and resulting implementation |
| --- | --- |
| 1.1 Binding visibility | Already fixed in the shared BindingCommandCard/BindingEditor, so buttons, trigger slots and grid regions share the visible output editor. Browser checks now exercise a bound region through the overview shortcut. |
| 1.2 Touch-stick purpose | Existing copy explains simultaneous grid and stick behavior; stick-only controls are conditional on a stick mode. |
| 1.3 Dual-stage / click required | Existing per-mode descriptions and per-pad click gate are wired into the engine. Click-required is now visible outside Advanced, with its explanation. |
| 1.4 Controller-specific controls | SDL reports supported physical button bits using the actual device mappings; editors and chord pickers filter those bits. Steam shared touch/click controls and unsupported sensor sections are gated; existing bound commands remain editable. |
| 1.5 Spacing | Existing shared spacing scale and normalized settings layouts retained. Corrected the new toolbar layout and click checkbox alignment. The Balanced smoothing preset now matches the engine default. |
| 2 Global chords | Settings contains a configuration picker and trigger buttons, with create-new and choose-existing entry points. All selected buttons must be held together. A desktop worker handles holds while the WebView is hidden. Native snapshots reset the full layout, then restore the applied assignments on release or disconnect. Pausing clears the held layout and disables mapping. Autoload cannot replace the held configuration. Quick Access uses MISC1; defaults include right-pad mouse, pad clicks, volume, window navigation and N (Y) power-off. |
| 3.1 Edit versus applied | Selecting, creating, importing, copying and saving a profile do not apply it. The toolbar shows editing and live applied names independently; live name comes from engine telemetry, including autoload and chords. Explicit Apply remains available. Drafts survive switching configurations during the session. Rename updates chord references; deletion rejects active/chord-referenced profiles. |
| 3.2 Power off | Fixed the invalid default binding and the native report payload: command 0x9f requires length 4 and the confirmation token `off!`. Sent the corrected report to the connected Steam Controller via its Proteus receiver; the write succeeded and SDL immediately observed disconnection. |
| 4.1 Navigation | Existing page-change focus fix now waits for lazy content. Numeric/slider controls can be left using vertical navigation. Browser tests confirm focus enters the page and reaches exact input editors. |
| 5.1 Overview | Shows actual output bindings, custom labels, grid regions and stick/pad modes. Bound inputs appear first. Trackpad modes also appear on the diagram. |
| 5.2 Preview shortcuts | Overview and live status diagrams open the matching input page, select grid regions and focus the editor. Grip aliases and left/right pad targets route to their actual controls. |
| 6 Steam Input conventions | Existing grouped sidebar/detail layouts retained. Command gear/right-click/touch-hold menus offer Regular Press, Settings, Rename, Remove, extra command and sub command actions. |
| 7 HidHide accuracy | Fixed the hide action to blacklist all interfaces in the selected physical container. Application-access repair respects inverse mode and includes the Studio executable. Status reports inverse mode and Steam application-list access; the UI distinguishes disabled hiding and refreshes on focus. A live test selected all 13 receiver interfaces, confirmed the driver blacklist and hidden status, and observed Windows denying a new vendor-interface open. Previous driver settings were restored afterward. Existing Steam handles require reconnecting the controller or restarting Steam. |

## Remaining work

- Item 2 is only partially complete: Studio still detects chord holds and tells JSM when to begin/end the temporary configuration. Moving the entire hold/release lifecycle into JSM remains outstanding; the present implementation depends on Studio remaining alive.
- Item 4.1 has implementation and browser focus coverage, but a complete physical-controller-only navigation playtest remains pending.
- The trackpad regression fixes below are installed and the user confirmed that they resolve the reported physical-controller symptoms.

## Validation

- Full Tauri release application build (`npm run tauri -- build --no-bundle`), frontend TypeScript, production build and ESLint.
- Rust backend unit tests, including Quick Access versus Guide and analog trigger chord detection.
- `tests/feedback_browser_regression.cjs`: isolated mocked renderer, no physical controller commands; edit/save independence and delayed-save switching, overview output, input and grid focus, menus, lazy content, and HidHide inactive/inverse/Steam-access status rendering.
- `tests/feedback_native_regression.py`: compiles the real file-loading and chord-transition code with a recording parser tail; resets, nested includes, autoload suppression, file edits during a hold, missing files and pause/release behavior.
- Existing Python UI/native regression suites. Updated two stale UI-structure references; retained the current Heavy smoothing behavior in its label check.
- Rebuilt bundled SDL JoyShockMapper executable.

The submodule publication blocker is resolved: native commit `705329d5c373c5c71174784cf5fce0bd08cd64e9` is published on `origin/fix/studio-controller-feedback`, the parent gitlink is staged, and the bundled mapper and commit stamp match it. Studio changes remain local; no installer has been published. Untagged native builds now show their actual Git revision instead of a malformed NOTFOUND version.

## Trackpad regression and installed build (2026-09-06)

Backed up the seven newly arrived uncommitted native trackpad/test files before restoring them and applying independently tested fixes. The backup is `%LOCALAPPDATA%\Temp\jsm-claude-trackpad-backup-cd80912k\trackpad-changes.patch`.

- SDL now uses the capacitive touch bit for contact, rather than allowing residual pressure to keep contact active. Release coordinates preserve the previous valid position.
- Mouse accumulation rejects nonfinite and out-of-range values, preventing an invalid value from permanently poisoning an axis. The touch pipeline resets invalid samples and mode transitions, and uses the actual sample interval for momentum calculations.
- All five numeric touch harnesses now compile under MSVC and pass, including release, retouch, both axes, optional coast, invalid-value recovery and subpixel accumulation. All seven native source regression checks pass. Previously the numeric runner could silently skip without a supported compiler; that gap is fixed.
- A 45-second raw HID capture observed three right-pad releases and movement on both axes. It did not observe pressure without touch, so it does not establish the exact cause of the reported episode.
- Full NSIS release build passed. `JSM Studio_0.7.4_x64-setup.exe` was installed with user approval; installer exit code was 0. Installed mapper and SDL SHA-256 hashes match the tested bundle. Studio differs from the prepackaging executable only in Tauri's expected `UNK` to `NSS` bundle marker. Studio was reopened for physical retesting.
- The user confirmed the installed build fixed the issue: "That fixed it!" This confirms the combined fix on their controller; it does not isolate which original failure caused the episode.
- `.github/workflows/trackpad-regression.yml` runs the five compiled numeric harnesses, real SDL patch checks and touch pipeline integration checks on pushes and pull requests. The release workflow calls the same checks as a prerequisite, so a failure blocks installer publication. These workflow changes remain local until the parent repository changes are pushed.

## Protocol investigation and hardware evidence

Steam Input's proprietary client implementation was not available for inspection. The shutdown correction is based on the public controller protocol and a successful hardware test, rather than an inferred zero-argument message:

- [SC Controller shutdown implementation](https://github.com/kozec/sc-controller/blob/master/scc/drivers/sc_dongle.py#L354): command 0x9f, payload length 4, ASCII `off!`.
- [SDL Triton driver at the build's pinned revision](https://github.com/libsdl-org/SDL/blob/5b98c1cc2f598115906c9c1f2758d3d256913468/src/joystick/hidapi/SDL_hidapi_steam_triton.c): 64-byte feature-report transport with leading report ID 1.
- [HidHide application-list implementation](https://github.com/nefarius/HidHide/blob/master/HidHideCLI/src/FilterDriverProxy.cpp): application-list semantics reverse when inverse mode is enabled.
- [HidHide access enforcement](https://github.com/nefarius/HidHide/blob/master/HidHide/src/Logic.c): access is checked when a process opens a device, explaining why an already-open Steam connection must be released.

Hardware verification on 2026-09-06: Valve 28de:1304 Proteus receiver. Corrected shutdown report returned success and the connected Steam Controller disconnected. The opt-in Rust test `live_controller_group_blocks_unapproved_access` exercised production enumeration, grouping, blacklist writes, status reads and an unapproved interface-open attempt; all 13 interfaces were listed and Windows returned Access denied. The test restored the initial empty blacklist and enabled hiding state, then verified access returned. It does not claim to inspect Steam's internal controller list.
