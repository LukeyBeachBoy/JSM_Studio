# LIBRARY (P7): notes

Library ▸ Games, Bases and Launch with game; the New configuration wizard; Steam import review; the assistant (Settings ▸ Assistant and the conversation). Decisions D18, D21, D23, D24.

## What was built, file by file

### Rust (`src-tauri`)

| File | What |
|---|---|
| `src/services/bases.rs` + `src/services/bases/*.txt` | The shipped preset bases (D24), embedded with `include_str!`, written to `jsm-runtime/bases/` from `ensure_required_files` on every launch (a changed copy is replaced, the person's own files in that folder are left alone), `list_builtin_bases`, `is_builtin_base_path`. Each file starts with a `# @base {...}` header (preset, title, short, blurb, families, needs, order). Eight files, no `RESET_MAPPINGS`/`AUTOCONNECT`/telemetry. Tests. |
| `src/services/steam_library.rs` | D23. A small VDF reader; `list_recent_steam_games` (localconfig.vdf `LastPlayed` plus appmanifests in every library folder, Steam tools filtered, newest first); `steam_game_art` (data URL from `appcache/librarycache`, both the flat `<appid>_library_600x900.jpg` and the newer `<appid>/<hash>/…` layouts; app id must be digits); `steam_app_for_exe` (matches an exe to the app whose `installdir` it sits in); `list_running_games` (running windows ranked Steam game, other launcher's folder, other app; shell processes removed). Built on `steam_layouts.rs` (`first_value`, `library_folders`, `app_name` became `pub(crate)`). Tests with fixture trees. |
| `src/services/credentials.rs` | Windows Credential Manager (`CredWriteW/ReadW/DeleteW`, generic credentials named `JSM Evolved/<name>`); in-process map off Windows. `hint()` gives "…a1b2". Added `Win32_Security_Credentials` to the windows-sys features. |
| `src/services/ai.rs` | Rewritten around providers (see below). |
| `src/services/ai_chatgpt.rs` | The ChatGPT PKCE loopback flow and the Responses API client (see below). |
| `Cargo.toml` | `base64`, `getrandom`, `sha2` (all already in the lock file). |
| `lib.rs`, `services/mod.rs`, `runtime.rs` | Command registration, module list, one `crate::services::bases::seed(app)` call in `ensure_required_files`. |

The bases live in their own subfolder, outside `profiles-library`, so they never show in the library listing and none of save / rename / delete can reach them: they are read-only the way the built-ins are. A game imports them as `bases/<file>.txt` (the mapper resolves it against the runtime folder; `read_runtime_config` already read any runtime subfolder).

### Assistant backend (D18)

- Settings file `ai-settings.json` is now `{version: 2, provider, careful, anthropic:{model}, openaiCompatible:{model,baseUrl}, local:{model,baseUrl}, chatgpt:{clientId,model,redirectPort,authorizeUrl,tokenUrl,responsesUrl,account,expiresAt}}`. **No secret is in it.** The old file (plain `apiKey/model/baseUrl/temperature`) is migrated on first read: a key goes to Credential Manager and the file is rewritten without it; a loopback address with no key becomes the `local` provider, otherwise `openai_compatible`.
- The web view sees `{hasKey, keyHint}` per provider and `connected`/`status` strings; never a key.
- Commands: `get_ai_settings`, `save_ai_settings` (a patch: absent fields stay, `provider: null` clears), `set_ai_key`, `forget_ai_credentials` (every key and token, provider cleared), `test_ai_connection`, `detect_local_ai_models` (Ollama 127.0.0.1:11434, LM Studio 127.0.0.1:1234, 1.5 s probes), `chatgpt_sign_in_command`, `chatgpt_cancel_sign_in`, `generate_ai_mapping`.
- **Claude**: native `POST /v1/messages` with `x-api-key` and `anthropic-version: 2023-06-01`. No `temperature` (current models reject it), no `thinking` (on and not disableable on Opus 5.5), `max_tokens` 16000, 300 s timeout, `output_config.effort` from "How careful" (Careful = high, Balanced = medium, Quick = low; omitted for Haiku 4.5, which rejects it), structured output (`output_config.format` JSON schema for `{summary, configText, assumptions, warnings, unchanged}`), `fallbacks: "default"` with the `server-side-fallback-2026-07-01` beta header on Opus 5.5 / Opus 5 / Sonnet 5.5 / Fable 5.1, and `stop_reason` is read before the content (`refusal` and `max_tokens` become readable errors). Test = `GET /v1/models`. Default model `claude-opus-5-5`; the picker offers `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-haiku-4-5`, and whatever the tested key returns.
- **OpenAI-compatible / local**: `POST {base}/chat/completions`; temperature from "How careful" (0.1 / 0.3 / 0.6); bearer only when there is a key; no key needed on loopback; the tolerant JSON extraction is kept for servers that fence their output.
- **ChatGPT**: PKCE (S256, 64-byte verifier, random `state`), one-shot `TcpListener` on `127.0.0.1` (the registered port, or any when the setting is 0) with the state checked, token exchange and refresh, tokens in Credential Manager, `POST /v1/responses` with `stream: true`, `store: false`, no temperature, `text.format` JSON schema, the SSE body parsed after it ends (reqwest has no `stream` feature here). Endpoints, client id, model and port are settings. **Without a client id the card stays visible and unavailable-with-reason ("Needs OpenAI's approval for this app")**; a build can bake one in with `JSM_CHATGPT_CLIENT_ID`.
- Rust tests (`ai.rs`, `ai_chatgpt.rs`, `credentials.rs`, `bases.rs`, `steam_library.rs`): request builders for every provider, the effort mapping, structured output shape, refusal and cut-off handling, model-list parsing, the settings migration, patches, loopback detection, the RFC 7636 test vector, the authorize URL, callback and state checks, a real loopback round trip, the Responses stream parser, secret round trip, base seeding, Steam fixtures.

### Front end

| File | What |
|---|---|
| `utils/presetBases.ts` | The base catalogue (reads the same `.txt` files through `import.meta.glob`, so the wizard, the Bases tab and the browser preview match what Rust seeds), `presetChoices` (the variant for the connected controller's family and capabilities, with "unavailable, because it needs gyro"), `recommendedPreset` ("Best with your controller"). |
| `utils/libraryGraph.ts` | Pure library graph: games vs bases (a file with no `RESET_MAPPINGS` is meant to be imported, as is one another file imports), `usedBy`, `builtinUsedBy`, Hold to swap links both ways (`swaps`, `swappedFrom`), import loops and missing bases per file, `setBaseInclude` (replaces the first import, or puts one right under the header so the file's own lines stay below it), `newGameText`, `baseFromGame`, `copyName`, `# @game {steamAppId,name}` read/write. |
| `hooks/useLibraryGraph.ts` | The data hook (every file's text, shipped bases, rules, fallback, chords, saved times), `duplicateConfiguration(name)` for any configuration, `changeBase`, `libraryChanged()` (`jsm:library-changed`). |
| `components/ProfileManager.tsx` | Rewritten: Games (cover shelf with Live / older-version pills, Desktop gamepad cover, New cover with Import from Steam / Import a file, detail with Sends / Built on / Modes / Launches with, loop and missing-base warning, Hold to swap links including the built-in, X Make live / Make this version live, Y More) and Bases. First-run welcome when the library is empty. |
| `components/library/*` | `LibraryCover` (Steam capsule or flat generated cover, never a gradient), `LibrarySheets` (`MoreSheet` with the delete confirmation inside it, focus on Keep it, B is Keep it; `BasePickerSheet`), `gameArt.ts` (art cache, `useGameArt`, monogram/hue, "Played yesterday"), `Library.module.css`. |
| `components/AssociationsPage.tsx` | Launch with game rewritten: master switch first, apps with "loads X" chips (A picks the configuration in a sheet, X on/off, Y More: What it loads / Turn on-off / Change the app / Remove, remove through the in-sheet "Keep it" confirmation), "Art only · not launched automatically", "In front now · live", the desktop fallback as "Desktop and other apps", Right now and Running now (+ Add / Already added / Browse for an .exe…). Reads the foreground app through `shellBridge.getForegroundApp` / `onForegroundApp` (SHELL's backend). `Switch` is still exported (ConfigurationDialog uses it). |
| `components/wizard/NewConfigurationFlow.tsx` | The three-step wizard, app-level state. |
| `components/SteamImportDialog.tsx` | Full page (SubPage), vocabulary, glyphs, per-set rename. |
| `components/AiMappingPage.tsx` | Settings ▸ Assistant (provider setup). |
| `components/assistant/AssistantPage.tsx` | The conversation page. |
| `utils/steamLayout.ts` | `ReportItem.input`, `ConvertedSet.displayName`, V8 wording. |
| `hooks/useProfileLibrary.ts` | `handleCreateProfile` takes `draft.text` and returns the name; `handleRenameProfile(name, next)`; `handleImportSteamLayout(conversion, renames)`. |
| `platform/desktopBridge.ts` | The new types and calls (`listBuiltinBases`, `listRecentSteamGames`, `steamGameArt`, `steamAppForExe`, `listRunningGames`, `setAiKey`, `forgetAiCredentials`, `testAiConnection`, `detectLocalAiModels`, `chatgptSignIn`, `chatgptCancelSignIn`) and the new `AiSettings` shape. |
| `dev/mockDesktop.ts` | Steam games + flat SVG art, ranked running games, a mock assistant (`?mock&noai`, `&nolocal`, `&noart`), the foreground app. |
| `App.tsx` (small edits) | `bases` route, the wizard and the assistant mounted at app level (`jsm:new-configuration`, `jsm:open-assistant`), the Library header's count, the footer's "where" after "Library · Games" (`libraryWhere`), change-base / duplicate wiring, test-mode capture guard. Home's "Ask the assistant" opens the conversation. |
| `shell/pages.ts` | One line: `bases` in `LIBRARY_PAGES` (+ `StudioTab`). Settings ▸ Assistant's purpose line changed to the design's. |
| `styles/console.css` | A sheet opened from a full-screen sub-page sits over it (`body:has([data-subpage]) > .sheet-layer`). |
| `i18n` | `app.nav.bases` (en, zh-CN). |

## The wizard (NewConfig, NewConfigGame, NewConfigTry)

- **Opens from anywhere**: `jsm:new-configuration`, Home's "New for a game", the New cover, the first-run welcome. It is a state in `App`, so a cold-load event is no longer lost (the old dialog was heard only by the lazily loaded Library page).
- **Step 1**: running games first (Steam games named from their manifest, other launchers' game folders, then plain apps), then recent Steam games with header art and "Played yesterday…", Browse for an .exe, No specific game. The first running game is chosen. Aside: art, **Name** (Y renames with the on-screen keyboard), **Launch with game** (X; off = art only). A game picked from Steam has no exe until it runs, so Launch with game is disabled for it ("Start the game once to link it"); the file carries `# @game {steamAppId,name}` for its cover art, and Library ▸ Launch with game's Running now + Add finishes the link.
- **Step 2**: one ModeCard-style card per play style (Shooter gyro aim, Shooter stick aim, Third-person action, Racing & flying, Strategy & builders, Start from…), "Best with your controller" on the first that suits it, "unavailable, needs gyro" on others. "What you get" is read from the preset's own text (glyph + words). Y shows every binding. Start from… = another configuration (a copy named for the game), a Steam layout, a file, or blank.
- **Step 3 (Try it)**: runs the draft in Test mode through `tryConfiguration` (text override; the live configuration is restored when the test ends, exactly as D13). Because Studio's pad navigation is paused while testing, the wizard watches telemetry: **hold A / X / B for 0.9 s** (progress ring) to Keep it / Change something / Back; a tap is just a button press and is logged in **What was sent** (attributed from the draft's resolved text: buttons, triggers, stick directions, the right pad as a mouse, the gyro button), shown over the live controller art. A capture layer (capture-phase key / mouse / wheel handlers) stops what the preset sends from landing on Studio's own controls for 300 ms after a pad edge (and while a chooser is held); the person's own Esc leaves the test like Back. Back restores the previous live configuration and writes nothing. Keep it creates the file (header, base, game), the Launch with game rule (paused unless X was on), applies it as tried, and opens Layout; Change something does the same and then starts press-to-find on Buttons. If the test cannot run (no controller, Steam owns the pad) the screen says why and Keep it still works.
- Verified with the mock pad: focus lands on the first running game, D-pad moves, A, X, Y, B, hold A/B, tap logging, hold-B restore, hold-A create. Covered by `tests/new_configuration_wizard_browser_regression.cjs`.

## Bases (D24): the shipped set

| Play style | Files |
|---|---|
| Shooter, gyro aim | `Shooter gyro aim - Steam Controller.txt` (gyro while the right grip is held, back buttons, four-way left pad, right pad as mouse), `Shooter gyro aim - motion controllers.txt` (DualSense / DualShock / Switch: no grips, so gyro while the left trigger is held, D-pad equipment, touchpad as mouse) |
| Shooter, stick aim | `Shooter stick aim.txt` (all controllers; STICK_POWER 2, acceleration 1.5 capped at 2) |
| Third-person action | `Third-person action.txt` (all) |
| Racing & flying | `Racing and flying.txt` (virtual Xbox, analog `X_RT`/`X_LT`), `Racing and flying - tilt.txt` (adds `MOTION_STICK_MODE = LEFT_STEER_X`, deadzone 10°, for controllers with gyro) |
| Strategy & builders | `Strategy and builders - Steam Controller.txt` (right pad mouse, four-way left pad, right stick as an 8-item wheel), `Strategy and builders.txt` (right stick is the mouse, a wheel while LB is held, touchpad as mouse where there is one) |

No Xbox/generic variant needs gyro or grips; the gyro shooter is "unavailable" on them and the first suitable preset (stick aim) is recommended. `constants/fpsTemplate.ts` is no longer reachable from the UI (the first-run welcome now opens the wizard); it is left in place for the SHELL/integrator to remove.

## Re-homed settings (D5)

| Setting / control | New home |
|---|---|
| Library header buttons Import / Import from Steam / + New configuration | The New cover on Games (New for a game, Import from Steam, Import a file) and the first-run welcome |
| Duplicate (only for the edited configuration), Rename, Delete (row cog menu) | Y More on any cover or base |
| Show in folder, Edit source | Y More: "Show in folder", "Edit the file directly" (any configuration: it is opened for editing first) |
| Associate… / Change… (the Game fact) | Y More ▸ Launch with game |
| Apply | X Make live |
| AutoloadManager modal ("+ Add app") | Add app row + Running now on Launch with game; the modal component is no longer opened (left in the tree for the integrator to delete) |
| Per-row `AppSelect` for what an app loads, remove icon | A on the row (picker sheet), Y More ▸ Remove (confirmation inside the sheet) |
| Settings ▸ Assistant's API key / model / URL / temperature | Provider cards with Test; "How careful the assistant is" replaces temperature |
| Assistant conversation | Its own page (Home's "Ask the assistant", `jsm:open-assistant`); Settings ▸ Assistant keeps only the setup |
| "Edit in Buttons" / "Use current configuration as a base" / current-text preview | Dropped from the conversation: the proposal always works on the configuration (with a draft chained on follow-ups); Keep it saves and applies, Try it first tests. "Edit in Buttons" is reachable as Keep it, then Buttons. |
| Steam import "Configuration name" for all sets | Per-set rename (Y) |

## Vocabulary (D21) applied

Layer → Mode, modeshift → "While holding", Apply → Make live / Live, Template → Base, Association / Autoload → Launch with game, Output → Sends, Imports → Built on, Layers → Modes, converted / approximated / not converted → brought over / close enough / not brought over (also in the notes written into imported files: "# - Not brought over: …", "# Converted by JSM Evolved"), "Double press" → "Double-tap" in report lines. `title=` removed from every file I own (focus captions via `data-caption`).

## Tests

Updated (library parts): `steam_import_browser_regression` (full page, glyphs, V8 words, " · " names, number on collision), `steam_layout_import_regression` (`input`, `displayName`, "Not brought over"), `game_association_browser_regression` (wizard, covers, art-only, Y ▸ Launch with game), `configurations_apply_edit_regression` (X Make live, Y More, Edit), `builtin_chords_browser_regression` (the built-in is a built-in base on Bases), `steam_workspace_regression` (Add app row/sheet), `shell_regression` (already had Bases from SHELL), `ui_ux_audit_browser_regression` and `controller_inputs_focus_browser_regression` (Bases added to the page lists), `load_config_binding_regression` (passes unchanged, now on covers).

New: `library_graph_regression.cjs` (graph, change base, shipped bases, controller variants), `new_configuration_wizard_browser_regression.cjs`, `assistant_settings_browser_regression.cjs`.

**Results against the baseline (127.0.0.1:1425 vs the current tree):**

| Test | Baseline | Now |
|---|---|---|
| steam_import_browser, steam_layout_import, game_association_browser, imported_template_save, config_includes | pass | pass |
| configurations_apply_edit | fails (Apply aside button missing) | passes |
| builtin_chords_browser | fails (needs "Global chords" tile on Home) | passes |
| load_config_binding | fails (`.profile-chip`) | passes |
| shell_regression | fails on the baseline too (the "native motion inputs have a section" assertion; it passed with the other tree's run, so it varies with server state) | passes |
| steam_workspace | fails (`.profile-chip` "Desktop") | still fails at the same line; its library lines were updated but are unreachable until the title bar's chip comes back |
| config_imports_ui | fails (`.profile-chip`) | fails earlier, inside the binding sheet (BIND's area: `Choose action` button) |
| ui_ux_audit | passes | fails only on "every visible button has a name": Sticks (13), Triggers (2) and Trackpads (8) from P4's pages; Games, Bases, Launch with game and Assistant all report 0 unnamed buttons and no overflow at 1440 / 1024 / 760 |
| controller_inputs_focus | passes | passes |
| New: library_graph, new_configuration_wizard, assistant_settings | n/a | pass |

`cargo test`: all 166 library tests pass (new ones included); the separate `main.rs` test binary can't be launched from a non-elevated shell ("requires elevation", os error 740), which is how it is on the baseline too. `tsc --noEmit` is clean.

`grid_geometry_regression` also clicks the old Configurations tile and "Edit source"; it was already stale (it clicks `.home-chip`), so I left it. Its "Edit source" step is now Y More ▸ Edit the file directly.

## Not done / limitations, with reasons

- **Speak (X) on the assistant** uses the Web Speech API where WebView2 offers it and is otherwise unavailable-with-reason ("Speech isn't available in this window. Type instead (Y)"), per D18. I could not verify recognition in a real WebView2 here; the mock browser has no recognizer, so only the unavailable path was exercised.
- **ChatGPT sign-in is built and unit-tested but not tested against OpenAI**: it needs a client id OpenAI issues, which does not exist. The endpoints, port and id are settings. The "preview" disclosure is shown. The Claude Desktop extension ("Install ▸") is unavailable-with-reason; it is a separate project (README §6).
- **Real Steam art and Credential Manager are not exercised in the browser preview** (the mock draws flat SVG art and holds hints in memory). Both are covered by Rust tests with fixture trees and a round trip; I have not looked at them against Luke's actual Steam install.
- **A game picked from "recent Steam games" has no exe** (Steam never names it), so Launch with game starts off and says why; no rule is created until the game runs and is added from Running now.
- **"Desktop gamepad" cover** is the Launch-with-game fallback configuration; it shows only when the fallback is on and names a library configuration.
- **First-run welcome** replaces the four-button welcome, and an empty library opens Library ▸ Games (as before) rather than auto-opening the wizard, so a person can see what's there first.
- **Strings are English-only** in the new components, like the other v2 components (only `app.nav.bases` was added to zh-CN).
- **AutoloadManager.tsx, constants/fpsTemplate.ts** are no longer reachable; I left them for the integrator to delete.
- The wizard's "Change something" hands off to press-to-find on Buttons rather than opening a Layout-specific "listen" state, because that is the existing surface for "press a button to jump to its row".
