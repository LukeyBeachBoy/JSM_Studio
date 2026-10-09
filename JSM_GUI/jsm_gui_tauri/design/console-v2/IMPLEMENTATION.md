# Console v2: implementation guide (P3–P7 and the P1/P2 gaps)

Read this before touching any file. It sets out:

- the kit every screen is built from;
- the button map;
- the design decisions taken where the artboards left questions open;
- who owns which files;
- how to work in a tree that seven other agents are editing at the same time.

Reference material:

- The design: `design/console-v2/README.md` and `designs/*.dc.html` (`Parity.dc.html` maps every setting).
- Flat art rules: `STYLE-FLAT.md`.
- The audits, one per phase, listing exactly what is missing with file and line references: `C:\Users\luker\AppData\Local\Temp\claude\C--Users-luker-code-JSM-Studio\482e1eb4-3603-4c0a-8f54-5dcebaeaa631\scratchpad\audit\` (`P1P2.md`, `P3.md`, `P4.md`, `P5.md`, `P6.md`, `P7.md`, plus `txt/*.txt` text dumps of the artboards). They were written on 2026-10-07; line numbers drift as files change, so search for the quoted text.

## 1. The kit (`src/components/ui/console/`)

| Piece | Use it for |
|---|---|
| `SubPage` | Any full-screen sub-page: Fine-tune, Advanced, While holding, the pickers, wizards, Review changes, Steam import, editors. It provides:<br>• a breadcrumb header and the status chip (from `ShellContext`);<br>• its own docked footer (`HintCapsule`);<br>• focus trap, B/Escape to close, focus restored on close;<br>• `onStep` for LT/RT, with `stepLabel` naming them in the footer. Sub-pages can stack. |
| `ContextActions` | Mounted once in `App`. Gives a mouse the X / Y actions a pad has: a right-click menu (no hover button: it covered row content) on any element that declares `X:` / `Y:` in `data-hints`. It walks up `[data-hints]` ancestors and dispatches `jsm:pad`. Nothing to wire per row. |
| `FineTune` + `stepGroup` | The rail of groups (a one-line status each, `changed` drawn in the accent) beside the open group and its live visual (470px). Use it inside a `SubPage` with `stepLabel="Group"`. |
| `AdvancedParts` | Advanced: parts side by side, stepped with LT/RT (`stepLabel="Part"`). |
| `ModeCards` | Picture cards for the "front" (the Sticks, Triggers and Trackpads fronts, Gyro's questions, presets), and `variant="compare"` for the big explained choices (Fine-tune "How Space is sent"). A uses a card. The current card is outlined. An optional `more` card. |
| `ValueRow` | A number that ◂ ▸ changes directly (`hero` for the big value, pill and bar). Shift+arrow on the keyboard takes the fine step, A types a number on the on-screen keyboard, Y is Use Default, and `onX` is the row's own action (Try it, Feel it). |
| `SegmentedRow` | A few named choices, all visible, changed with ◂ ▸ (presets: "Quick start · Even · Precise centre · Custom"). |
| `OpenRow` | A row that opens something: fold rows ("Chords · None ▸"), "Fine-tune · Default ▸", "Advanced ▸". |
| `SummaryRow` (`ui/SummaryRow.tsx`) | Still fine for toggles, dropdown choices with descriptions, and rows that adjust after A. |
| `Sheet` (`ui/Sheet.tsx`) | Side sheets: the quick menu, the binding sheet (`inPlace`). |
| `requestValueEntry` (`nav/textEntry.ts`) | The on-screen keyboard for a value with no field: rename, type a number, a command. It takes a header: `title`, `eyebrow`, `hint`, `suggestions`, `numeric`. |
| `ShellSection.status` / `.count` (`shell/SectionList.tsx`) | The rail's second line ("Left stick · Move") and count ("Menu buttons · 1 of 4"). |
| `pickers/KindPicker.tsx` | The binding sheet's eight "sends" kinds. See §5. |

To see the kit by hand, open `?mock` and run `window.dispatchEvent(new Event('jsm:kit'))` (`src/dev/KitPlayground.tsx`).

Do not build a second version of any of these. If a piece needs a prop, add it, keep it backward compatible, and say so in your notes.

## 2. Button map and footer (these hold on every screen)

- **LB/RB:** tabs (pages), or families inside a picker.
- **LT/RT:** sections, groups, parts or steps, whichever the page has. Name it in the footer: "Section", "Group", "Part", "Step", "Mode", "Category", "Topic".
- **A:** the primary action, named for what it does ("Use Moving", "Change", "Choose key").
- **B:** back, close or cancel.
- **X:** second action ("Try it", "Feel it", "Hear it", "Clear", "Listen for a key").
- **Y:** always opens a menu of the rest ("More…") and never does something destructive directly. The one exception: on a value row, Y is Use Default.
- **◂ ▸:** changes the focused row's value. Rows opt in with `data-arrows="horizontal"`; the kit's rows already do.
- **Footer order** is fixed by `HintCapsule`: ◂ ▸, A, X, Y, LT/RT, LB/RB, Menu, View, B. Declare hints in any order with `data-hints="A:…;X:…;Y:…;B:…"` on the focusable element (or an ancestor).
- **View** goes Home. **Menu** opens the configuration menu (save, review, undo).
- **Focus captions** replace tooltips. Put `data-caption="Full label · one line of help"` on focusable elements. Don't add new `title=` attributes. Convert the `title=` attributes in the files you own to `data-caption` (keep `aria-label` for accessibility).
- **Glyphs** follow the connected controller: pass `family` (from `useShell().family`) to `ButtonGlyph`/`InputGlyph`.
- **Unavailable controls stay focusable and say why:** `aria-disabled="true"` plus `data-reason="…"`. Never `disabled` on something the pad should be able to reach and learn from.

## 3. Decisions (taken; build to these, don't stop to ask)

| # | Decision |
|---|---|
| D1 | **Write-through.** Every change writes at once ("changes are live while you're here"). There is no preview-then-keep step. Mode cards: moving focus shows the card's caption; A writes. |
| D2 | **Fine steps.** Keyboard: Shift+arrow. Pad: A on a value row types an exact number. LB is never a fine-step modifier (it changes tabs). |
| D3 | Inside a SubPage, LB/RB do nothing. |
| D4 | The Sticks, Triggers and Trackpads tabs drop the eyebrow/title/purpose page header. The rail plus the "<Left stick> is for…" heading replace it. Other tabs keep theirs until their phase says otherwise. |
| D5 | **Every setting keeps a home.** If the design omits a setting that exists in code (an audit lists these as "must stay reachable"), put it in the nearest Fine-tune group, Advanced part or Y "More" menu. Never remove its UI without a new home, and list each re-homing in your notes. |
| D6 | **Tilt** lives under Gyro ▸ Fine-tune ▸ Direction ▸ Advanced ▸ Tilt (a part, or a sub-page built on the same rail). Buttons ▸ Tilt gestures links there. |
| D7 | **Presets** map to numbers chosen from today's defaults. Document every value in your notes. A preset shows "Custom" when the current numbers match none. Press timing (hold / double / together, in seconds):<br>• Relaxed: 0.25 / 0.25 / 0.06<br>• Default: 0.15 / 0.15 / 0.05<br>• Quick: 0.12 / 0.12 / 0.04 |
| D8 | **Trigger calibration.** The mapper reports no progress, so the guided screen drives `CALIBRATE_TRIGGERS` with timed steps and says the result is kept for this controller. Don't claim it is saved into the configuration. |
| D9 | **Stick card mapping:**<br>• Flick to turn = `FLICK`.<br>• More ▸ "Flick only" = `FLICK_ONLY`, "Turn only" = `ROTATE_ONLY`, "Aim + flick" = `HYBRID_AIM`.<br>• "Touch stick" (pad card) = the pad mode that drives the touch stick (read the mapper; document what it writes).<br>• The targets the designs never draw — gamepad left/right stick, the four angle-to-axis variants, steering left/right — go in that mode's Fine-tune as a SegmentedRow. |
| D10 | **"Turn the zones"** (Trackpads) writes the per-pad `LEFT/RIGHT_TOUCHPAD_ROTATION` for this configuration. Its caption says it also turns the mouse and the touch stick. |
| D11 | **Mode shift** (was "While holding…", renamed 2026-10-08) for sticks, triggers, pads, gyro and tilt lives in each front's Y "More" menu. It opens a sub-page listing the input's mode shifts ("LB held" rows, editor "Mode shift · LB"), with the same held-button picker as the binding sheet's Chords. The pads' Touch and Click bindings are front rows (like Triggers' half/full rows) and are also in Y. |
| D12 | **Mode templates** ("+ Build", "+ Photo") create an empty mode with that name and the next colour. |
| D13 | **"Try it" / "Show in game"** use Test mode with a text override (`applyConfig({textOverride})`, `startTest`):<br>• A mode's Try it runs the configuration with that mode's changes folded into Default.<br>• A menu's Show in game opens that menu on a button the overlay shows.<br>• Investigate the mapper commands; if something truly can't work, make the control unavailable-with-reason and say why in your notes. |
| D14 | **LED live preview** sends `LIGHT_BAR = xRRGGBB` through the existing console-command bridge while previewing, and restores the configuration's own value on leaving. |
| D15 | "Volume on a button" is stored per sound as `defaultGainDb` in the sound library's metadata. It is the default when binding the sound; per-binding gain still overrides it. |
| D16 | **Menus always save to the Default mode** (fixes the bug where editing a menu while a mode is selected wrote the whole catalogue into that mode). |
| D17 | **Mode colours** follow the design tokens' order. |
| D18 | **Assistant:**<br>• **Claude:** a guided Console API key (open the key page, paste with Y). No Claude.ai login.<br>• **Models on this PC:** Ollama and LM Studio, probed, with no key.<br>• **Any OpenAI-compatible endpoint.**<br>• **"Continue with ChatGPT":** a full PKCE loopback flow built behind a client-id setting. Without an OpenAI-issued client id, the button is unavailable-with-reason ("Needs OpenAI's approval for this app").<br>• Keys live in Windows Credential Manager; the UI only sees `{hasKey, keyHint}`.<br>• Speech (X): the Web Speech API where WebView2 offers it, otherwise unavailable-with-reason. |
| D19 | **Updates:** "Check now" asks GitHub's latest-release API for `LukeyBeachBoy/JSM_Studio` and compares it with the app version. The banner, About and Startup all share that status. Don't add the Tauri updater plugin. |
| D20 | **Startup:** "Start in the tray" is a stored switch. "What loads first" offers Last one live / Desktop gamepad / a named configuration, and the startup file honours it. |
| D21 | **Vocabulary (V8)** applies to every string you touch, and to the i18n keys you own:<br>• Layer → **Layer** (Steam's Action Layer; was "Mode" until 2026-10-08)<br>• modeshift / chord on a button → **Chords** (Steam's chorded press; was "While holding…")<br>• a stick / pad / trigger / gyro changed while a button is held → **Mode shift** (was "While holding…")<br>• global chord → Hold to swap (never "combo")<br>• Titles are short nouns, subtitles one line<br>• Soft/Full pull → Half/Full press<br>• Apply → Make live / Live<br>• Template → Base<br>• Association / Autoload → Launch with game<br>• Device visibility → Hide the real controller<br>• Double press → Double-tap<br>• Release (activation) → Let go<br>• Simultaneous → Press together with…<br>• Diagonal → Stick diagonal<br>• Real-world calibration → Match a full turn (360°)<br>• Ignore Windows mouse acceleration → Ignore Windows pointer speed<br>• gyro conditions → When gyro is on<br><br>JSM key names stay as they are. Show config names (V12) shows them beside the friendly labels. |
| D22 | Trigger "Calibrate" is in the Triggers front's Y menu. |
| D23 | **Steam art and recent games** come from a new Rust service that reads Steam's `librarycache` and `localconfig.vdf` LastPlayed, built on `steam_layouts.rs`'s `steam_roots()` / `library_folders()` / `app_name()`. Library covers and the wizard use it; a generated flat cover is the fallback. |
| D24 | **Bases** are files without `RESET_MAPPINGS` (`utils/config.ts`), plus the shipped preset bases: Rust `include_str!`, seeded into `jsm-runtime/bases/`, read-only like the built-ins. |

## 4. Ownership (who edits what)

The eight areas run in parallel. **Edit only the files your area owns.** You can read anything.

| Area | Owns |
|---|---|
| **BIND** (P3: binding sheet, Buttons list) | `components/keymap/ButtonMappingCard.tsx`, `ButtonBindingsCard.tsx`, `BindingCommandCard.tsx`, `BindingEditor.tsx`, `InputModeshiftPanel.tsx`, `AddModeshiftSheet.tsx`, `BindingDetailsPopover.tsx`, `ShiftedBinding*`, `triggerKinds.ts`, `components/PressToFind*`, `nav/usePressToFind.ts`, new `components/keymap/binding/*`; the `buttons` entries of `CONTROL_TAB_SECTIONS` / `SUB_NAV_GROUPS` and the Buttons rail counts in App.tsx; `Keymap.module.css` (shared with P4: add rules at the end and don't rewrite others). |
| **PICK** (P3: pickers, icon picker, on-screen keyboard) | `components/keymap/ActionPicker.tsx` + `.css`, `components/keymap/pickers/*` (KindPicker's internals), `IconPicker.tsx`, `jsmActionGroups.ts`, `actionCatalog.ts`, `CycleBindingFields.tsx`, `HapticOutputPicker.tsx`, `components/TextEntryOverlay.*`, `nav/textEntry.ts` (keep the request API compatible). |
| **LAYOUT** (P3: Layout page, quick menu; P6's mode strip) | `components/OverviewPage.tsx` + `.module.css`, `ControllerStatusSvg.*` (the back view), `NoController.*`, `utils/bindingClipboard.ts`; the mode strip's activation text; the mode indicator on the other tabs (the footer's "where" text, built in App.tsx). |
| **P4** (Sticks, Triggers, Trackpads, Grips) | `components/KeymapControls.tsx` (sticks, triggers and trackpads parts; leave the buttons part to BIND), `keymap/StickSection.tsx`, `PadSection.tsx`, `TouchpadStickSection.tsx`, `PadFeedbackRows.tsx`, `MouseFeelSheet.tsx`, `TouchpadSettingsSection.tsx`, `TouchpadGridSection.tsx`, `GripSensorsSheet.tsx`, `hooks/useStickModeExtras.tsx`, `StickModeExtras.tsx`, `SourceModeTuning.tsx` (GYRO reads it and must not edit it), `AdaptiveTriggerEditor.tsx`, `utils/adaptiveTriggers.ts`, `useStickConfig.ts`, new `components/sticks|triggers|trackpads/*`; the joysticks/triggers/touchpad entries in App.tsx. |
| **GYRO** (P5) | `components/GyroPage.tsx` and every gyro-only component (`GyroBehaviorControls`, `SensitivityControls`, `NoiseSteadyingControls`, `GyroRotationFeedback`, `GyroActivationConditions`, `GyroVirtualStick`, `MotionInputTuning`, `TiltActivationControls`, `AccelCurveView.tsx` + its touchpad side, `RwcGuideModal`), `utils/gyro*`, `utils/accelCurve*`, new `components/gyro/*`; the gyro entries in App.tsx. |
| **MODES** (P6 except the mode strip and the title bar) | `components/LayersPage.tsx`, `LayerBar.tsx`, `Layers.css`, `ChangeReview.*`, `hooks/useConfigHistory*`, `VirtualMenuLibrary*` and the menu editor components, `MenuPreview`/`VirtualMenuPreview` (shared art: keep their props compatible), `ControllerLightSettings.*`, `SoundLibraryDialog.*`, `SoundTrimEditor`, `MidiTrimEditor`, `ControllerLayoutScope.*`, `utils/layers.ts`, `utils/virtualMenus.ts`, `utils/configChanges*`, `utils/controllerLayouts.ts`, `hooks/useKeymapConfig.ts` (the menu save fix), new `components/modes|menus|review|light|sounds/*`. |
| **LIBRARY** (P7) | `components/ProfileManager.tsx`, `ConfigurationDialog.tsx`, `hooks/useProfileLibrary.ts`, `SteamImportDialog.*`, `utils/steamLayout.ts`, the associations page component, `AiMappingPage.*`, new `components/library|wizard|assistant/*`, `src-tauri/src/services/ai.rs`, new Rust services (bases, steam library art, credentials); the `bases` route (add it to `shell/pages.ts` with one Edit). |
| **SHELL** (the P1/P2 gaps) | `shell/TitleBar.tsx` (including removing the "Editing layer" dropdown), `PageTabs.tsx`, `HintCapsule.tsx`, `hintLabels.ts`, `SectionList.tsx`, `shell/pages.ts` (except LIBRARY's one line), `styles/design-tokens.css`, `components.css`, `forms.css`, `ui/SummaryRow.*`, `ui/console/Rows.tsx` (ConfigName only), `ConfigName.tsx`, `HomePage.*`, `AppearancePage.*`, `ControllerPreferences.*`, the Hold to swap page, `TimingPage.*`, the Hide the real controller page, `HelpDocsPage.*`, `MapperConsole.*`, `MappingDebugPage.*`, the credits page, a new Startup page, `UpdateBanner.*`, `hooks/useDisplayPrefs.ts`, and the Rust backend for updates, tray, startup, HidHide allow-list, foreground exe, Hold to swap order and recent commands. SHELL also sweeps vocabulary and `title=` in files nobody else owns. |

Files everyone may touch, **but only with the Edit tool and small targeted replacements**:

- `src/App.tsx`
- `src/i18n/resources/en.ts` and `zh-CN.ts` (add or rename only your own keys)
- `src/dev/mockDesktop.ts`
- `src/platform/desktopBridge.ts`
- `styles/shell.css`, `console.css`
- `src-tauri/src/lib.rs`, `commands.rs`, `Cargo.toml`
- `tests/*`, for tests of your area

Never rewrite one of these whole. Never use a script that reads, changes and writes one of them. If an Edit fails because the file changed, Read it again and retry.

## 5. The KindPicker contract (BIND ↔ PICK)

- The binding sheet opens `<KindPicker kind={…} {...ActionPickerProps} />` (`components/keymap/pickers/KindPicker.tsx`) and gets `onSelect(patch)` / `onClose()` back, exactly as `ActionPicker` does. `SEND_KINDS` lists the eight kinds with their labels.
- Today, each kind opens `ActionPicker` on the matching family.
- PICK replaces what's behind each kind with its own full-screen picker, built on SubPage, and keeps the props and callbacks the same.
- BIND never imports `ActionPicker` directly for the kind grid.
- `ActionPicker` stays as "Search every action" (Y) and for nested editors that restrict kinds.

## 6. Working rules

- **Every control needs a mouse path.** A pad or keyboard shortcut is an extra, never the only way. `SubPage` has a visible ‹ Back; `ValueRow` types on a click of the value and sets on a click or drag of the bar; ◂ ▸ shown on a row are real buttons (`tabIndex={-1}` `data-nav-skip`, the pad skips them); X / Y actions come from `ContextActions` (right-click) and the clickable footer. `tests/mouse_paths_browser_regression.cjs` covers it.
- **No** `git stash`, `checkout`, `reset`, `restore`, `commit` or `push`. Don't revert anyone's changes. Don't edit memory files, CLAUDE.md, AGENTS.md or settings.
- **Keep the tree compiling.** Write a new component completely before wiring it in. Type-check with `npx tsc --noEmit -p .` in `JSM_GUI/jsm_gui_tauri`. Errors in files you don't own belong to another agent: ignore them and retry later. Don't "fix" their files.
- **Line endings:** many files are CRLF. The Edit tool preserves them. Never use `sed -i` on source files.
- **Dev server:** `http://127.0.0.1:1420/?mock` is already running; don't start or stop servers. If it is unreachable, wait and retry. A broken import from another agent can blank it for a minute.
  - Pad: `window.__pad.press(['S'])` presses A (S=A, E=B, W=X, N=Y, L/R=bumpers, UP/DOWN/LEFT/RIGHT; also L3, R3, LSL, RSL, LSR, RSR, GRIP_L, GRIP_R).
  - Triggers: `window.__pad.trigger('left'|'right', 0..1)`.
  - Playwright lives at `C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright` (launch with `{ channel: 'msedge', headless: true }`).
  - Put scratch scripts and screenshots in `C:\Users\luker\AppData\Local\Temp\claude\C--Users-luker-code-JSM-Studio\482e1eb4-3603-4c0a-8f54-5dcebaeaa631\scratchpad\<area>\`.
- **Verify every screen with the mock pad,** not only with clicks: focus landing, D-pad movement, A/B/X/Y, LT/RT, ◂ ▸ and the footer hints. Screenshot and look at what you built.
- **Tests:**
  - Update the `tests/*.cjs` that assert your area's old labels and structure.
  - Tests that install their own `window.electronAPI` mocks run against `http://127.0.0.1:1420` without `?mock`; others take `?mock`.
  - A pre-redesign baseline runs on `http://127.0.0.1:1425`, with its original tests in `…\scratchpad\base\tests\`. A test that already fails there is a pre-existing failure; note it and move on. Your goal: nothing that passes on the baseline fails because of you.
- **Rust:** `cargo test` in `JSM_GUI/jsm_gui_tauri/src-tauri`. Builds serialize on cargo's lock, so expect waits. Don't touch `src-tauri/bin/` or the JoyShockMapper submodule unless your area truly needs a mapper change; if so, say so in your notes instead of rebuilding the bundled exe.
- **Notes:** write `design/console-v2/notes/<AREA>.md`, covering:
  - what you built, file by file;
  - every re-homed setting (D5);
  - preset numbers (D7);
  - tests updated, and tests failing as on the baseline;
  - anything you couldn't do, and exactly why.

  The integrator merges these into `docs/TODO.md`; don't edit `docs/TODO.md` yourself.
