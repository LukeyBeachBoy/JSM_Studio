# SHELL notes (P1/P2 gaps: header, footer, focus, type, Settings, Home, backend)

Built against `Main`, `Kit`, `Home`, `Layout` (header), every `Settings*.dc.html`, and the audit `P1P2.md`. Verified with the `?mock` pad and screenshots, and by `tests/shell_settings_regression.cjs` (new).

## 1. What I built, file by file

### Shell
- `shell/TitleBar.tsx` (rewritten). One header row (V3, 64px; 76 on Couch): Home chip, game chip (art or initial, configuration, controller line, "· <Mode> mode" with its swatch, "only for this controller" when a variant exists), the page tabs, the status chip, a ☰ button. Removed: the mapping plate dropdown, the "Editing layer" dropdown, the separate tab row.
  - `StatusChip` (same export; every SubPage header still shows it) says exactly: **Live · saved**, **Unsaved · ☰ to save**, **Testing · B to stop**, **Paused while you edit** (the saved-but-not-live and idle states). Each has a `data-caption` instead of a `title`.
  - The game chip's menu (search, "Live now", Games, Bases, "Only for this controller…", "Open the library", "Options…") replaced the profile menu. Home's bar shows controller, battery and a clock; no mapping plate.
- `shell/PageTabs.tsx`: tabs only (words, no icons unless compact); the controller status label moved into the game chip.
- `shell/pages.ts`: `startup` added; `SETTINGS_PAGES` is Controller, Hold to swap, Press timing, Hide the real controller, Look & language, Startup, Assistant, then Guides & reference, Troubleshooting log, About & credits (`SETTINGS_REFERENCE_START` draws the rail divider). `pageOrder` returns only the page itself for Settings, so **LB/RB do nothing in Settings** (LT/RT step the categories). New `slideOrder` (page-change direction) and `stepLabel` (Section / Mode / Category / Topic). LIBRARY's `bases` line was left alone.
- `shell/stepClaims.ts` (new): a page can claim LT/RT (`jsm:section-step`) or LB/RB (`jsm:page-step`) before the shell takes them. Guides uses it for topics and matches. App's `stepSection`, `stepPage` and `stepPageFromPad` ask first.
- `shell/HintCapsule.tsx` + `hintLabels.ts`:
  - One `HINT_ORDER` (A, X, Y, LT/RT, LB/RB, Menu, View, B), shared.
  - LB/RB are labelled **Tabs**, LT/RT are named per page from `.app-shell[data-step-label]` (Section / Mode / Category / Topic). Settings drops LB/RB.
  - Menu and View are no longer added to every footer; Home says "☰ Options".
  - Home's default hints are A Edit layout, X Test, Y Switch game.
  - Footer left side: the focus caption as a bold full label plus one line of help (no 2-line clamp). The mode being edited stays beside the caption in a small tag (`mode` prop; LAYOUT asked for this). `data-pad-listening-message` lets a page set the "press the buttons" text.
- `shell/SectionList.tsx`: `stepLabel` prop, `divider` on a section; `App.tsx` passes "Category" for Settings.
- `shell/ConfigurationMenu.tsx` is unchanged; `App.tsx` rebuilt its items: Review changes, Undo, Redo, the status action, Save (not live yet), Save as copy, Discard, Test it, Switch game, Games see, Pause mapping, Only for this controller…, Where values come from. No "Editing layer".

### Styles (V9, V10)
- `design-tokens.css`: Couch 40/26/20/16 plus bar and row heights; Desk floors hint, eyebrow and micro at 14 (nothing below 14). The `:root[data-theme]` twin keeps the specificity rule. `--focus-controller-width` is 3px.
- Old ring remnants gone: `components.css` (`.setting-row:focus-within`, `.binding-summary`, the transition's `transform`), `forms.css` (`.flex-inputs > label`), and the 18 CSS-module rules (`AppearancePage`, `AssociationsPage`, `AutoloadManager`, `ControllerStatusPage`, `ActionPicker`, `AddSheets` x2, `Grips`, `Lane`, `ShapePicker`, `Keymap`, `Layers`, `OverviewPage`, `ProfileManager` x2, `SteamImport`, `ThemeToggle`, `Menu`, `Select`): all now `var(--focus-ring-pad)`, no lift, no drop shadow.
- `shell.css` / `console.css`: the one-row header, game chip, ☰ chip, caption layout, rail divider, mode tag, titlebar tab sizing.

### Captions (V9)
`title=` became `data-caption` (with `aria-label` kept where the title was the only name) in every file nobody else owns: `App.tsx` (telemetry chip), `TuningClipboard`, `SettingOrigin`, `HelpButton`, `BindingLabelLegend`, `BatteryIndicator`, `KeyboardView`, `ToastHost`, `MenuDrawing`, `Select`, `NumberField`, `ControllerFeedbackSetting`, the TitleBar and PageTabs. `ControllerStatusSvg` (LAYOUT) and component-prop titles (Sheet, RowGroup, Dialog…) were left.
The old `title` fallback in the footer still reads any remaining `title` on a focused element.

### Show config names (V12)
`ConfigName` now follows `html[data-config-names]` through a `useSyncExternalStore` and renders nothing while off. Consumers: `SummaryRow` (label), the kit rows `ValueRow`/`SegmentedRow`/`OpenRow` (from `setting`; `OpenRow` gained a `setting` prop, ValueRow/SegmentedRow gained `global` for Settings values that do not belong to the configuration being edited), `SettingOrigin`'s inventory, and every Settings row that maps to a key.

### Home (`HomePage.tsx`, `.module.css`, `utils/configSummary.ts`, `hooks/useGameArt.ts`)
Hero (Steam hero/header art when LIBRARY's `steam_app_for_exe` + `steam_game_art` answer, else a flat two-tone cover), Live pill, "Launches with <exe>", name, summary line ("Shooter · gyro aim on right grip · trackpad menus · 3 modes", from the file), **A Edit layout / X Test it / Y Switch game**, **Quick tune · changes apply live** (Gyro speed adjusts in place with ◂ ▸, Shift fine; written through the Gyro page's own `writeTurnSpeed`, and saved and made live 0.9 s after the last step when nothing else was unsaved; "Gyro is on · While holding right grip"; "Right trackpad · Mouse, 4 click zones"), Your games ("N configurations", covers, **Desktop gamepad · When no game matches** from the Launch-with-game fallback), New for a game, Library, the Settings and assistant doors. No mapping plate, no "profiles/templates", clock in the bar.

### Settings pages (`components/settings/*` plus the old file names)
- `SettingsKit.tsx` / `Settings.module.css`: `SwitchRow`, `SettingsSection`, `StatusStrip`, `SettingsColumns` (settings + aside), `SettingsNote`, `usePadButton`.
- **Controller** (`ControllerSettings.tsx`, `ControllerPreferences.tsx`, `VirtualKeyboardSettings.tsx`): Navigate this app with the controller, **Screen distance**, Rumble when moving around the app, Stop the Steam Controller recalibrating its gyro, Show where my thumb is, Show a countdown, Light colour (opens a page; ◂ ▸ steps the colours), "This configuration's light and sounds ▸" (dispatches `jsm:open-light-sounds`, MODES' hand-off), then On-screen keyboard (layout picture cards, Look, Press force / Smoothing / Steadying / Haptics sliders, shortcut legend as ten rows each opening a button list, Advanced with the haptic type and reset), Calibration and light tiles, Controller sounds (On connect, On turn off, How loud, Your sounds play on, Silence its own jingles, Y Your sounds), Trackpad rotation cards (As mounted / Level / Advanced).
- **Hold to swap** (`GlobalChordsPage.tsx`): Holding / Let go cards, the "Not a mode" explainer, **A presses the buttons** (`usePressCapture`: waits for everything let go, gathers what is held, takes it on release; Esc or 8 s cancels), X edits the configuration (or Make my own copy for Quick tools), Y opens the entry sub-page (hold-these rows, Choose from a list, Another way to hold it, configuration choice, Which controller incl. disconnected ones, Order · higher wins with Up/Down, Remove). Built-in = "Quick tools"; the copy is "My Quick tools". No "chord"/"combo" anywhere.
- **Press timing** (`TimingPage.tsx`): Relaxed / Default / Quick cards, rows (Hold time, Double-tap window, Press-together window, Turbo rate, Controller polling), a try-it panel per row (X listens, A/B timed, "2 of 3 counted. Missing a lot? Try 0.20 s."), Advanced (links to Buttons ▸ Configuration timing, "Still set in a file" with Make it shared / Remove it). Hold is refused while it would not exceed the press-together window.
- **Hide the real controller** (`HidHidePage.tsx`): status strip, Hide from games switch, controller cards with the real front art and one action each ("Show to games", "Hide from games", "Clear old entry"), the "reconnect it or restart Steam" note after a change, **Apps that can still see them** (HidHide's app list, added-for-you marks, Steam warning), "If something looks different" cards, Advanced (device paths, repair the app list, Open HidHide), Y menu. Not installed or not elevated: the three-step setup.
- **Look & language** (`AppearancePage.tsx`): theme cards (Dark / Light / Same as Windows), accent cards, language cards, Screen distance, Show config names, a preview panel (Save, tabs, Turn speed 2.3×, modes) and "The app icon follows it". Focusing a theme or accent card previews it on the whole app; A keeps it; leaving restores.
- **Startup** (`settings/StartupPage.tsx`): Start with Windows, Start in the tray, What loads first (Last one live / Desktop gamepad / Pick another), Updates (Check now), Reset everything (a sub-page; Cancel first), version.
- **Guides & reference** (`HelpDocsPage.tsx`): 12 authored plain-language guides read first, then the README's sections under "From the JoyShockMapper manual". Topic names as designed; LT/RT step topics (or the next guide with a match while searching); search behind Y with the on-screen keyboard (a hidden field stays for Ctrl+F); with a query LB/RB step the matches, X clears, "13 matches in 4 guides" line; B goes to the categories; links in new words plus "Full manual online ↗".
- **Troubleshooting log** (`MapperConsole.tsx`, `MappingDebugPage.tsx`): "Mapper running · <config>" strip, log, Type a command (A opens the on-screen keyboard), Recent commands (persisted by Rust), Look closer (What Windows receives as a sub-page that captures on entry and stops on leaving, held-keys picture, From JSM / Everything on LB/RB, Y clear/copy; Where is a button used? press-to-find), Fix it (Copy the log, Restart the mapper, Reconnect controllers, each once).
- **About & credits** (`CreditsPage.tsx`): app header, version and update status, Project / What's new / GyroWiki tiles, People with avatars, the featured projects, "And N more ▸" (the rest, in a sub-page), a licence reader (LICENSE.md), X Check for updates, Y Read the licence.
- `UpdateBanner.tsx`: reads the shared status and installs through the new backend; `ResetDefaultSettings.tsx` (Reset everything now also resets density and config names).

### Platform
- `platform/shellBridge.ts` (new): update status store (`useUpdateStatus`, `checkForUpdatesNow`), Startup preferences, Hold to swap reorder, recent commands, foreground app, restart mapper. Each falls back to `window.electronAPI` mocks (`dev/mockDesktop.ts`: Wardogs, Gamepad, a Quick tools chord, a HidHide status with an app list, `?mock&update` has 0.8.0 waiting).
- `desktopBridge.ts`: `GlobalChord.rank`, `HidHideStatus.appList`; `listGlobalChords`, `saveGlobalChord`, `deleteGlobalChord` and `getHidHideStatus` fall back to the preview mock.

### Rust (`cargo test --lib`: 166 passed)
- `services/updates.rs` (new): GitHub latest-release check (D19) for `LukeyBeachBoy/JSM_Studio`, numeric version compare, one shared status, events `update-status` and `update-progress`, install = download the release's `-setup.exe` (or `.msi`) to the temp folder, run it, exit. Checked 3 s after launch. No Tauri updater plugin.
- `runtime.rs`: `start_in_tray` and `startup_profile` ("last", "fallback", "named:<name>") in `RuntimeMappingState`, `get/set_startup_preferences`, `apply_startup_choice` (makes the choice the live configuration before the mapper launches, so the startup file honours it); `GlobalChord.rank` plus `chords_in_priority_order` and `reorder_global_chords` (the order is also what the chord watcher uses, so **higher card wins** is real).
- `lib.rs`: tray preference read at setup (`show_window_at_launch`), startup choice applied, update check started, new commands registered.
- `services/hidhide.rs`: `app_list` in the status (JSM's entries first, Steam flagged).
- `services/console_history.rs` (new): recent commands, newest first, capped at 8.
- `services/foreground.rs`: the app in front other than this one, `get_foreground_app` and the `foreground-app` event (for LIBRARY's "Running now").
- `commands.rs`: `get_update_status`, `check_for_updates`, `install_update`, `get/set_startup_preferences`, `reorder_global_chords`, `list/record/clear_recent_console_commands`, `get_foreground_app`, `restart_mapper`.

## 2. Re-homed settings (D5)

| Was | Now |
|---|---|
| Title bar: Editing layer, Manage layers | Layout's mode strip and the Modes tab; the mode shows in the game chip and footer |
| Title bar: Mapping plate (on/off, Virtual output, Bind whole controller) | ☰: Pause mapping, Games see (output + Bind whole controller) |
| Title bar: Apply / Applied / Changes, Return to Studio | The status chip (A does the one action), ☰ ▸ Review changes |
| Configuration menu: Editing layer, Configuration, Controller output | ☰ (Switch game, Games see); the chip's menu |
| Controller layout… | ☰ and the chip's menu: "Only for this controller…" |
| Start with Windows, Version, Reset default settings | Startup |
| Controller feedback | Controller ▸ Rumble when moving around the app |
| Trackpad overlay, Calibration HUD | Controller: "Show where my thumb is…", "Show a countdown…" |
| Controller light + default brightness | Controller ▸ Light colour (page) and the Light tile |
| Start Delay, Duration | Controller ▸ Calibration and light (Countdown, Sample) |
| Disable hardware calibration | Controller ▸ Stop the Steam Controller recalibrating its gyro |
| Connect/Shutdown sound, intensity, Play Sounds On, jingle, Manage sounds | Controller ▸ Controller sounds (Y Your sounds) |
| Trackpad orientation (presets + degrees) | Controller ▸ Trackpad rotation (cards; degrees under Advanced) |
| Keyboard layout/appearance/grouping/right stick/thresholds/haptics/shortcuts/reset/Open keyboard | Controller ▸ On-screen keyboard (X Open the keyboard; haptic type, shortcut reset under Advanced) |
| Hold to swap: Edit, Remove, configuration Select, controller Select, chip grid, Add OR alternative, "+ Add chord", Choose existing config | Cards, Y entry page (buttons, Choose from a list, Another way, configuration, controller, Order, Remove), Add one |
| Timing page "Polling" group, "Still set in a file" | Controller polling row; Advanced ▸ Still set in a file |
| HidHide: Device paths, Repair whitelist, Open HidHide, Refresh, Clear stale selection, heuristic and inverse notes | Advanced, Y menu, controller cards, "If something looks different" |
| Mapping debug: Input capture folder, Start/Stop/Pause/Clear, filter | What Windows receives sub-page (auto-start, A, X, Y, LB/RB) |
| Console: Pause/Clear toolbar, Send | Live strip, X Pause, Y Copy/clear, Keyboard + Recent |
| Credits: every group on the page | People and featured projects on the page; the rest behind "And N more" |
| Home: Gyro / Trackpad feel / Grip sensors tiles, Test tooltip | Quick tune read-outs (Gyro speed adjusts in place; the others open Gyro and Trackpads). Grip sensors stay at Buttons ▸ Grips |
| Documentation search field | Y (field kept for Ctrl+F) |

## 3. Preset numbers (D7)

Hold / double-tap / press-together, ms: Relaxed 250 / 250 / 60, Default 150 / 150 / 50, Quick 120 / 120 / 40. "Custom" when the three do not match a preset. Turbo and polling are not part of a preset.

## 4. Decisions

- **Updates are a GitHub compare** (D19). The version people see is `tauri.conf.json`'s. "Install and restart" needs a release asset ending `-setup.exe` or `.msi`; with none it opens the release page.
- **Start in the tray** is the stored switch; the logon task keeps `--autostart`, and the window is shown at launch when the switch is off. **What loads first** writes `active_profile_path` before the mapper starts ("Desktop gamepad" uses the Launch-with-game fallback).
- **Hold to swap order** is a `rank` on each chord; chords without one keep the old rule (your own before the built-in ones).
- **X and Y on a Settings page** need focus inside the page (the host's pad events); the footer says so only for the rows that act.
- **Press timing Advanced** links to the per-configuration panel at the foot of Buttons (BIND's `ProfileTiming`) instead of copying it, as briefed; its rows were renamed to the new words ("Double-tap window", "Press-together window", "Controller polling", "Timing for").
- A Settings **value row** uses `global` so the origin tag and Y reset of the configuration being edited do not appear on a global setting.

## 5. Tests

Updated: `shell_regression` (header, Library/Settings lists, Home, LB/RB vs LT/RT in Settings), `toolbar_regression` (status chip, ☰), `binding_card_review_regression` (footer order), `keyboard_hints_regression`, `builtin_chords_browser_regression` (rewritten for Hold to swap, Quick tools, capture, order, copy, remove, Reset), `nested_back_browser_regression` (Hold to swap section), `dualsense_chord_browser_regression`, `controller_inputs_focus_browser_regression` and `ui_ux_audit_browser_regression` (Controller, Startup), `profile_timing_browser_regression`, `credits_browser_regression`, `keyboard_haptics_browser_regression`, `keyboard_shortcut_defaults_browser_regression`, `keyboard_feedback_polish_browser_regression`, `virtual_keyboard_browser_regression`, `light_bar_picker_browser_regression`, `todo44_prefs_columns_browser_regression` (rewritten for the new Settings layout), `todo48_focus_ring_browser_regression`, `feedback_browser_regression` (status chip), `steam_workspace_regression` (names only), `controller_redesign_regression` (navigation only), `config_imports_ui_regression`, `editor_feedback_regression`, `grid_geometry_regression` (navigation by id).
New: `shell_settings_regression.cjs` covers the type scale, Screen distance, Show config names, focus captions, timing presets, Startup, the shared update status (banner, Startup, About), Copy the log, recent commands, the HidHide app list, Guides (LT/RT, B), and Settings' footer (no Tabs). Rust: startup choice, tray decision, reorder, update version compare and installer pick, recent commands, HidHide app list.

### Results against the baseline (port 1425 copy of the pre-redesign tree)

Passing now, failing on the baseline: `shell_regression`, `toolbar_regression`, `keyboard_hints_regression`, `todo48_focus_ring`, `controller_inputs_focus`, `profile_timing`, `controller_sounds`, `virtual_keyboard`, `todo44_prefs_columns`, `layers_browser`, `layers_ui_polish`, `mapper_startup_crash`, `steam_import` (the baseline copy lacked fixtures).
Passing on both: `builtin_chords`, `credits`, `keyboard_haptics`, `keyboard_shortcut_defaults`, `light_bar_picker`, `midi_library`, `dualsense_chord`, `appearance_persistence`, `game_association`, `controller_layouts`, `timing_native_units`, `binding_card_review` (after dropping `OverviewPage.module.css` from its layer-hue file list: LAYOUT's rewrite colours modes inline), new `shell_settings_regression`.
Also passing now, after the coordinator gave the baseline its own `cacheDir` and restarted both servers (before that, the two shared one `node_modules/.vite` through a junction and every test that imports `/node_modules/.vite/deps/react.js` straight from the dev server died with "Invalid hook call"): `keyboard_feedback_polish_browser_regression` (including that direct import; its Settings half now waits for the page slide and scrolls the Look row into view, which the longer one-column Controller page needs), `nested_back_browser_regression`, `grid_geometry_regression` (updated to LIBRARY's Y ▸ "Edit the file directly"; it also failed on the baseline), `editor_feedback_regression`, `imported_template_save_regression` (run from the repo root).
Final run on the fresh servers: 31 pass, 10 fail. The failures all stop inside another area's UI, and all failed on the baseline too except `ui_ux_audit`, which is P4's unnamed buttons:
- `ui_ux_audit_browser_regression`: every page of mine reports 0 unnamed buttons; it stops on the unnamed buttons of Sticks (13), Triggers (2), Trackpads (8).
- `feedback_browser_regression`: the Layout callout does not focus the N command; everything of mine before it passes.
- `config_imports_ui_regression`: BIND's `[data-command-row]` / Choose action. `controller_redesign_regression`: BIND's Trigger combobox.
- `steam_workspace_regression`: I fixed what was mine (it never dismissed the first-connection jingle prompt, so it never left Home; editing pages have no `.page-header__title`, so it now reads the active tab). It now reaches the Buttons edit, where choosing K from the picker saves `# @controller type-24 N = K` (the edit folded into the connected controller's variant, one line) instead of a shared `N = K`. That is BIND's `foldController` behaviour, not the shell's.
- `overview_layout`, `usability_audit`, `pad_menus`, `pad_navigation_browser`, `template_override_roundtrip`: timeouts or assertions inside the editing pages' old markup (Layout, Buttons, Sticks).

Rust: `cargo test --lib` 166 passed, 0 failed. `tsc --noEmit`: clean (checked last on 2026-10-08, after P4's `writeChoice` edit landed).

## 6. Not done, and why

- **Guides illustrations.** The guides are plain-language text with links; the design's per-article pictures were not drawn.
- **zh-CN.** The new Settings pages use English strings (as the other redesigned pages do); only the page names (`app.nav.preferences`, `app.nav.startup`) are translated.
- **Steam art on Home** needs LIBRARY's `steam_library.rs` commands (`steam_app_for_exe`, `steam_game_art`); in `?mock` only the flat fallback can show.
- **Updates and the tray/startup behaviour** were not exercised against a real release or a real logon: `cargo test` covers the logic, the browser tests cover the UI against the mock.
- **Hold to swap capture and the timing tests** read the real pad's raw buttons through telemetry; verified with the mock pad only, not on hardware.
- **Where is a button used?** opens the existing inspector with the first button pressed; it needs the editing page's providers, which the shell mounts on every page.
- **`cargo test` (bin target)** cannot start: the app manifest requires elevation (os error 740). `cargo test --lib` is the runnable suite.
- Tests that stop earlier in another area's UI (Choose action, Edit source, Mode rows, Trigger comboboxes) were updated only where my area is involved; see the final report.
