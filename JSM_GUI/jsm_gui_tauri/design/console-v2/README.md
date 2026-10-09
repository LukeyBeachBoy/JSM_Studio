# Handoff: JSM Evolved — console v2

Implementation target: `JSM_GUI/jsm_gui_tauri` (React + TypeScript + Vite + Tauri, CSS modules, tokens in `src/styles/`).

Design reference: `designs/*.dc.html` is one artboard per file, and `designs/canvas.json` lays them out. The live canvas is https://claude.ai/artifact/Bf4mVN64EPKSGpseWbEgPm.
- `Main.dc.html` holds the review: findings, scorecard, renames and the seven rules.
- `Parity.dc.html` maps every configuration value to where it now lives.
- `STYLE-FLAT.md` governs every illustration.
- To view a frame locally, serve this folder with Vite (launch config `design-console-v2`) and open it.

The HTML files are references, not production code. Rebuild them with the codebase's components, tokens and controller art.

---

## 1. Why

The review (Main.dc.html) scored console feel at about 2/5:
- Navigation is synthetic keyboard events over a mouse layout.
- The hint capsule floats over content.
- Bumpers and triggers are the reverse of console convention.
- Buttons shows 24 controls before its first binding.
- The "Editing for" bar repeats on 8 pages.
- Progressive disclosure is inverted on the tuning pages.
- The biggest choices sit in the smallest dropdowns.
- There's mapper vocabulary everywhere.
- There are 212 hover-only tooltips.
- Studio has 11 equal tabs.
- Type is sized for a desk.
- There's no help starting a new configuration.

## 2. Non-negotiables

1. **Every setting stays reachable.** It is presented as Front → Fine-tune (one group at a time) → Advanced. Check every screen against `src/constants/configKeys.ts`, the trigger and output kinds in `src/utils/bindingCommands.ts`, and `STICK_MODE_VALUES`. Parity.dc.html is the map.
2. **Flat art that matches the app** (STYLE-FLAT.md):
   - Controllers use the real SVGs in `src/assets/controllers` with the `--art-*` tokens.
   - Menus look like MenuPreview, and pad zones like the overlay.
   - Telemetry is `--telemetry`.
   - No glows, specular strips or 3D pucks.
3. **Controller art, never names** (console refinement D11 still holds). The canvas draws "LB", "A" and so on as text pills for speed; the build uses `InputGlyph` SVGs for the connected controller family.
4. **"Hold to swap"**, never "combo", for global chords.

## 3. Decisions

| # | Decision | Frames |
|---|---|---|
| V1 | **Button map flips to console convention.** LB/RB change tabs and LT/RT change sections or groups (the rail). This reverses console refinement D10. A, B, View and ☰ keep their meanings; X and Y are contextual and always named in the footer. | all |
| V2 | **Docked footer hint bar**, full width and 64px, replaces the floating capsule. Every scroll area reserves its height, so nothing scrolls under it. Left side: where you are. Right side: hints in the order A, X, Y, LT/RT, LB/RB, B. | Kit, all |
| V3 | **One header row**: game chip (configuration and controller), tabs, status chip. The mapping-status dropdown, Changes and Applied merge into one status chip (Live · saved / Unsaved · ☰ to save / Testing / Paused). ☰ opens the configuration menu (Review changes, Undo, Save). | Layout, Kit, ReviewChanges |
| V4 | **Controller scope moves into the game chip.** The "Editing for … / Use regular gamepad" bar goes. Variants are managed from Layout ▸ Y ▸ Only for this controller. | ControllerVariant, QuickMenu |
| V5 | **Configuration tabs**: Layout · Buttons · Sticks · Triggers · Trackpads · Gyro · Menus · Modes. Overview becomes Layout. D-Pad becomes a section of Buttons. Joysticks → Sticks, Virtual menus → Menus, Layers → Modes. | Layout, ButtonList |
| V6 | **Studio becomes Library and Settings.** Library tabs: Games (Configurations), Bases (templates), Launch with game (Associations). Settings categories: Controller, Hold to swap, Press timing, Hide the real controller, Look & language, Startup, Assistant, then Guides & reference, Troubleshooting log, About & credits. | Library*, Settings* |
| V7 | **Progressive disclosure pattern.** The front screen shows the choice as picture cards or presets. Fine-tune has a rail of groups (each with a one-line status) and one open group showing 3–4 settings with a live visual. The rest sits behind an Advanced row. | Sticks, Gyro, Triggers, Trackpads, *FineTune |
| V8 | **Vocabulary**, as in the Main.dc.html rename table: Mode, Changed in this mode, While holding…, Half/Full press, Hold to swap, Launch with game, Hide the real controller, Base, Live, Ignore Windows pointer speed, Match a full turn (360°). | all |
| V9 | **Focus**: a 3px accent ring plus a 7px soft ring, with no drop shadow. The focused row grows a focus caption (its full label plus one line of help), which replaces `title=` tooltips. | Kit |
| V10 | **Screen distance: Couch / Desk.** Couch uses the 40/26/20/16 type scale with bigger targets; Desk keeps today's density. | Settings, Kit |
| V11 | **Binding sheet** replaces the inline binding card. "When you…" has Press · Tap · Hold · Double-tap · More (Let go, Turbo, Press together with…, Stick diagonal). There are 8 "sends" kinds, "While holding another button…", and Fine-tune. | BindingSheet, Binding*, ControllerActions*, PickerFamily, KeyPicker |
| V12 | **Show config names** (Settings ▸ Look & language) shows the JSM key beside every friendly label. | SettingsLook |
| V13 | **Assistant**: the conversation comes first; the provider moves to Settings ▸ Assistant. See §6. | Assistant, SettingsAssistant |

## 4. Phases (each one ships on its own and keeps the app working)

| Phase | Scope | Frames |
|---|---|---|
| **P1 Foundations** ✅ | V1 button map, V2 docked footer, V9 focus ring and captions, V10 density tokens and setting, V12 setting plumbing | Kit, Settings |
| **P2 Information architecture** ✅ | V3 header and status chip, V4 controller scope in the game chip, V5 tabs (rename and merge), V6 Library and Settings, Home v2 | Home, Layout header, Library*, Settings* |
| **P3 Layout & bindings** ✅ | Layout (replaces Overview), Buttons list, binding sheet and pickers, on-screen keyboard, quick menu | Layout, ButtonList, Binding*, KeyPicker, ControllerActions*, PickerFamily, TextEntry, IconPicker, QuickMenu |
| **P4 Sticks, triggers, trackpads** ✅ | Mode cards and Fine-tune per mode | Sticks, Stick*, Triggers*, Trackpads*, GripSensors |
| **P5 Gyro** ✅ | Three questions, Fine-tune groups, Advanced | Gyro* |
| **P6 Modes, menus, review** ✅ | Modes, mode editor, Menus editor, Review changes, light & sounds, sound library, variants | Modes, Mode*, MenuEditor*, ReviewChanges, ControllerLight, SoundLibrary, ControllerVariant |
| **P7 Library flows & assistant** ✅ | New configuration wizard (presets), Steam import review, library detail, Assistant sign-in | NewConfig*, SteamImport, LibraryDetail, SettingsAssistant |

Status (2026-10-08): all seven phases are built. How they were built, the decisions taken where the artboards were silent (D1–D24) and what could not be done are in `IMPLEMENTATION.md` and `notes/<AREA>.md` (BIND, PICK, LAYOUT, P4, GYRO, MODES, LIBRARY, SHELL).

## 5. Behaviour that doesn't exist today (decide or build)

- Start in the tray as a switch; "Last one live" as the first configuration loaded; Check now for updates; Copy the log.
- Press-timing presets (Relaxed / Default / Quick).
- Press a real button to jump to its row (Buttons).
- On the New configuration "Try it" step, hold A, X or B to choose (a tap tests the button).
- New configuration presets by play style (Shooter with gyro aim, and so on), shipped as bases.
- Screen distance (Couch / Desk) and Show config names.
- Assistant sign-in (§6).

## 6. Assistant sign-in (researched 2026-10-07)

- **Claude:** Anthropic does not allow third-party apps to offer Claude.ai login or to use Free/Pro/Max plan credentials (code.claude.com legal & compliance). Inside the app, Claude needs a Console API key; build a guided key setup. The allowed alternative is a Claude Desktop extension (a local MCP server, `.mcpb`), so users drive the mapper from Claude Desktop on their own plan. That is a separate project.
- **ChatGPT:** "Sign in with ChatGPT" offers plan usage to open-source partners (developers.openai.com/siwc). It needs:
  - PKCE with a loopback redirect on `127.0.0.1`.
  - The Responses API only: `stream: true`, `store: false`, and no temperature.
  - The "Continue with ChatGPT" button text and a disclosure.

  **Confirm eligibility with OpenAI before building.**
- **Local models** (Ollama / LM Studio) are an OpenAI-compatible preset with no key.

## 7. Tests

Many browser tests assert exact names and keys: page titles, tab labels, PageUp/PageDown, "Editing for", hint text, Home tiles. Rename in both places, and update the button-map assertions in the phase that changes them.
