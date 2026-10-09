# UX review follow-up — 2026-10-09

The existing work was committed and pushed first: mapper `41f010d`, app checkpoint `155875e`, and merge with the remote app branch `7175919`. The review was then worked through in severity order. Some remedies were already in the checkpoint; this pass checked those implementations and fixed the remaining gaps.

Browser results below use the development desktop mock, real browser keyboard/mouse input, and simulated pad telemetry. They do not certify physical controller or native overlay behavior.

## Blockers

| Review | Current behavior and evidence |
|---|---|
| B1 | Test has a visible Stop button; B, Esc and the stop button exit. Test start does not announce a save. `ux_review_followup_browser_regression.cjs` checks pad and mouse exits. |
| B2 | Chord capture owns triggers only on the capture step; LT/RT do not silently change the held button on other steps. `chords_hold_listener_browser_regression.cjs` passes, including preserving an LB-started chord. |
| B3 | Shared overlay recovery retains focus in the top dialog and restores a valid landing when an opener disappears. Nested binding pickers retain their More view. Inline delete prompts participate in the same trap. Binding-focus, wizard, association, import, change-review and delete regressions pass. |
| B4 | Right from the last tab reaches status, then Options. Explicitly asserted in the follow-up regression. |
| B5 | Home lands on Edit layout; the first A/Enter acts. Tested with and without a controller. |
| B6 | Home B/Esc stays on Home. Tested. |

## Major: shared navigation and controls

| Review | Resolution |
|---|---|
| L1 | The shared/controller layout choice drives the edited document and header/menu scope; binding badges describe actual controller differences. The checkpoint already contained this correction. |
| I1, I12 | Fine-tune columns retain their own navigation regions. Down cannot open the rail by accident; Left returns to the active group; rail/group stepping retains coherent focus. Input-front regressions pass. |
| I2, I3 | Row-owned hints win over page hints. Reset chips are mouse actions; mouse steppers retain row focus and captions. Input-front regressions pass. |
| L2 | Button section stepping lands on the first row of the new section. The checkpoint's BindingList implements this. |
| L3, S14 | PickerPage uses SubPage with a hint capsule. Shared focus repair handles closing search and nested pickers. Binding-focus and footer-action regressions pass. |
| S1, S2 | Configuration Options has its own hints and scrolling, meaningful menu labels and a visible Home entry point. The Home follow-up and menu-button regressions pass. |

## Major: legacy screens and input fronts

| Review | Resolution |
|---|---|
| I4 | Wheel chooser uses SubPage; opening a new wheel records its source, so Back returns to that input page. Stick/menu browser regression passes. |
| I5 | On-screen menu arrangement uses the shared sub-page and row family. |
| I6 | Trigger calibration is unavailable on unsupported controllers; its starting side is passed to the calibration page. |
| S6 | Launch with game uses SubPage, starts on Browse instead of the remove icon, and uses concise switch copy. Association regression passes. |
| M1 | Opened by and More are separate pages with contextual rows and correct initial focus. Their browser regression passes. |
| M7 | Hold to swap describes swapping configurations; Change buttons uses the shared sub-page frame. |
| I7, I8 | Gyro uses the input-front frame and exposes Tilt directly. Gyro navigation regression passes. |
| I9 | Advanced input pages share AdvancedParts. |
| I10 | Click required is a direct switch. Off writes OFF rather than inheriting an enabled default. Input-front regression passes. |
| I11 | Input-front Back hints name Layout. |
| I13 | Zone selection/captions follow the active zone and omit config syntax by default. Input-front regression passes. Native screen drawing remains a hardware check. |
| I14 | Unavailable PlayStation touchpad card is excluded from navigation on a two-pad controller. |

## Major: shell, bindings, naming and feedback

| Review | Resolution |
|---|---|
| S3, S4 | A mouse click selects a Library game/base; explicit Edit or Copy performs the action. Keyboard/pad activation retains its intended action. Follow-up regression passes. |
| S5 | Inactive Home configurations expose Make live; Quick tune only claims live changes for a clean live configuration. Home and Library use the same game classification. |
| S7 | Empty review says All changes saved, has no noninteractive focus landing or zero-count discard/save actions. Mouse Revert no longer moves between pointer down/up. Review regression passes. |
| S8 | Wizard hold hints match its choices, the compact layout keeps choices accessible, and name collisions show the copy name plus Open existing. Wizard regression covers creating and keeping a configuration. |
| S9, S10 | Save emits one resulting-state message; transient toasts clear with context and dock above the footer rather than over the test banner. Menu-save regression passes. |
| S11 | Guides retain LT/RT Categories; LB/RB step topics or matches. Duplicate header removed. Settings regression passes. |
| S12 | Light opened from Settings returns to Settings, including its sound-library breadcrumb. Down from colour reaches settings below. Follow-up regression passes. |
| S13 | Narrow Settings keeps a visible horizontal category rail. Tested at 900 px. |
| S15 | Startup no longer repeats the version; the mock reads the current app version. Settings regression passes. |
| S16, L10 | Layer names and step hints replace mode leftovers on the relevant current paths. |
| S17 | Keyboard Home chip avoids Home/Home; disabled Test is omitted; Caps Lock works and is named in Rename; Tab wraps inside the app; mock Rename has a real implementation. Physical keyboard/native rename remains unverified. |
| L4 | Binding sheets opened from Layout retain Layout as their return target. |
| L5 | Self-paired bindings are not described as chords. Binding-focus regression asserts double-tap summaries. |
| L6, L7 | Fine-tune is action-specific; controller actions requiring values open their chooser before committing. Binding-add-flow regression passes. |
| L8 | Find indexes binding aliases, including user-facing action names. |
| L9 | Button help describes the current binding flow. |
| L11 | Current pickers use the shared human-readable input names and glyphs. Raw config names remain an explicit Look & language option. |
| M2 | Preview labels fit their rendered slice sizes, with unreadable labels omitted rather than overlapped. |
| M3 | Slice click selects; double-click/Enter opens its action. Slice-click regression passes. Shared focus recovery also covers outside-click closure. |
| M4 | Layer cards and menu rail entries expose a More affordance on hover/focus. Layer click opens its changes page. |
| M5 | Both inline delete confirmations trap focus, begin on Keep it, and support Esc/Back cancellation. Delete regression passes. |
| M6 | Button capture names B/Esc cancellation and does not capture B as the chosen button. Physical capture remains unverified. |

## Minor and polish

- Shortened base-card, Launch with game, Hold to swap, colour, sound trim, full-turn and accent copy. Removed repeated instructions where the footer already supplies the action.
- Home's four-action state and Quick tune fit at 1100×700. Screenshots were inspected in dark/cyan and light/amber. Light's settled 900 px sub-page was also inspected.
- Screen distance has one home in Look & language. Startup version duplication is removed. Recent-command chips stay within their container.
- Binding rows show a mouse-only right-click hint without restoring an overlay button. Menus and Layers use their visible More affordances.
- Library order is stable after Make live; imported profiles request selection/focus on the created cover. Troubleshooting lands on Copy the log rather than the log viewport.
- Steam captions use the filename rather than its full path. Sound decode failures give an actionable message rather than an internal sound identifier.
- Fine-tune visuals use theme tokens. The existing menu-template, keyboard and guide components also use theme-aware surfaces.

## Validation and limits

Passed: production `build:web` (TypeScript + Vite), TypeScript no-emit, lint for changed TypeScript files, and whitespace checks. Vite still reports existing chunk-size/dynamic-import warnings. The repository-wide lint baseline contains unrelated errors and warnings; it is not claimed clean.

Passing browser suites from this pass: UX follow-up, chord hold listener, binding focus, input review fixes, change review, game association, shell/settings, Steam import, footer hint clicks, Menu tap/hold, new configuration wizard, menus Opened by/More, Layers delete trap, menu slice clicks, configurations apply/edit, mouse paths, gyro navigation and stick virtual menus. Binding action add-flow checks also pass.

The native installer build attempt stopped in driver preparation because its shell could not resolve `Get-FileHash`; no installer was produced or installed. The production web build subsequently passed outside filesystem sandbox restrictions.

Still requiring a real app/controller/game check: built-in-base Keep it, physical keyboard Rename, Layers button capture, native screen-area drawing feedback, Show in game, and physical Test exit. These are validation gaps, not results supplied by the mock.
