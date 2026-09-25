# Steam Input UI transformation — 2026-09-20

## Audit and boundaries

React 18 + TypeScript runs in Tauri 2, built with Vite. CSS modules style local
components; `App.css` imports shared tokens, forms, panels, layout and overlays.
Radix supplies selects, menus, sliders and dialogs. i18next supplies translation.
No routing library or external state store: `App.tsx` owns the active page and
composes React hooks, context and lazy panels. Keep this architecture.

The shell, primary navigation and utility header currently live in `App.tsx`
(the TopBar and SideNav files are styles, not React components). Routes are
Overview, Buttons, D-Pad, Triggers, Joysticks, Trackpads, Gyro, Trackpad tuning,
Grip sensors, Menu Layout, Press timing & more, AI Assistant, Settings, Debug
Console, Global Chords, Device Visibility, and Documentation. Configurations,
Auto-switch, layer management, calibration and the source editor are additional
modal/floating destinations. All must remain reachable.

`OverviewPage` and `ControllerStatusSvg` render the real hardware and bindings.
`KeymapControls` assembles physical input pages. `ButtonMappingCard`,
`ButtonBindingsCard`, `BindingCommandCard`, `BindingEditor` and `InputModeshifts`
share normal/shifted binding edits. `StickSettingsCard`, `TouchpadSettingsSection`
and related sections contain behavior-specific settings. `NumberField`, Radix
wrappers, `AdvancedDisclosure`, `InputGlyph` and `PageSideNav` are reusable.
Gyro is split across `GyroBehaviorControls`, `SensitivityControls`, and
`NoiseSteadyingControls` with live telemetry inside those panels.

`useKeyboardNav` already handles spatial arrows, dialogs, page stepping, scroll
and focus restoration. `Slider` has an explicit adjustment mode. The native
AppNavigation mapping supplies controller-to-keyboard events; capture already intercepts keyboard events in the capture phase. Extend this shared navigation rather than adding a
second Gamepad API consumer. Check disabled nodes, closed disclosures, modal
page stepping and capture ownership.

Behavior boundary: `useProfileLibrary`, `useKeymapConfig`, configuration/layer
serializers and `desktopBridge` own draft/persistence/application semantics.
Rust services own hardware/runtime and native JoyShockMapper processes inputs.
Do not alter these engines or formats. Existing dirty working-tree changes in
these files belong to earlier work. Save and Apply remain separate operations;
profile switches retain the existing unsaved-change guard.

## Implementation sequence

1. **Shell and design system.** Consolidate semantic color/type/control/focus
   tokens. Separate Configuration and Studio navigation contexts. Retain every
   destination, move occasional header tools into a menu/contextual destination,
   add a page header and persistent input hints. Files: App, styles, SideNav,
   ControllerGlyphBar. Validate destination reachability and Save/Apply behavior.
2. **Shared surfaces and input pages.** Refine existing binding rows, numeric
   controls, select surfaces, section headings and disclosures together. Keep
   physical grouping and behavior-specific settings. Give the overview diagram
   more room; keep callout navigation and diagnostics disclosure. Files: shared
   styles, NumberField, Keymap, Overview. Validate button/trigger/pad editing.
3. **Category action picker.** Use existing virtual-output options and keyboard
   token definitions. Provide Gamepad, Mouse, Keyboard, Numpad, System and JSM
   actions, plus existing configuration switching. Layer actions stay in their
   real metadata-backed input editor. Keep advanced syntax/conditions/behavior
   in the existing editor and preserve unsafe/raw commands. Validate selection,
   cancellation, focus return and round-trip behavior.
4. **Gyro and focus.** Wider setting rows, contextual calibration, explicit
   diagnostic disclosure. Strengthen shared focus scopes and persistent hints;
   keep capture isolated and keyboard escape available. Validate dialog trapping,
   disabled controls, slider adjustment, and capture ownership.
5. **Verification.** TypeScript/web build, relevant existing regressions plus
   behavioral coverage for new navigation/picker workflows. Render representative
   pages at 1440×900 and 1024×720, inspect screenshots against supplied references,
   check overflow and reduced motion. Report physical-controller testing separately.

## Reference decisions

Supplied comparisons favor a flat charcoal content canvas, blue-grey sidebar,
rectangular selected rows, grouped bindings with outputs aligned right, and a
quiet persistent footer. Use 22px page headings, 16px sections, 14px labels and
44–52px primary rows. Preserve compact secondary controls and the existing system
font. Avoid another dependency or a parallel component framework.

## Validation log

**2026-09-20, picked up from Codex's uncommitted work.** Codex implemented
stages 1-4 in one session (shell/design tokens, shared surfaces, the
`ActionPicker` category picker, and gyro/focus work) and stopped before stage
5 (verification) — the palette landed exactly as specified (`--bg-1: #1b2027`,
`--sidebar-bg: #252d36`, `--bg-2: #292f38`, `--bg-btn: #414953`,
`--state-selected/-focused: #35536b`, 22/16/14/12px type scale), the
Configuration/Studio nav split, the category action picker (Gamepad / Mouse /
Keyboard / Numpad / Layers / System / JSM / Configurations), and progressive
disclosure (bindings start collapsed behind "Choose an action", "Advanced
command settings" gears, and per-section disclosures like "Threshold &
release tuning") were all in the working tree but untested against the
existing suite.

Verification, finishing stage 5:

- `tsc --noEmit`, `npm run build:web`: clean.
- 47 browser/node regressions (`tests/*.cjs`): all pass. Five pre-existing
  tests failed before fixes, all because they drove the *old* UI shape rather
  than because anything stopped working:
  - `editor_feedback_regression.cjs`, `select_help_panel_fit_regression.cjs`:
    the trigger mode select is now labelled "Left/Right trigger behavior"
    (was hardcoded to that English string, dropping the `l2FullPullMode` /
    `r2FullPullMode` i18n keys entirely -- restored `t()` and retranslated
    both keys instead of leaving Chinese users with English text), and
    "Soft press point" / "Flicker guard" now live behind a "Threshold &
    release tuning" disclosure. Fixed by opening it first.
  - `select_help_panel_fit_regression.cjs` also asserted a fixed table of
    "this width -> this side" for the select's help panel. The wider settings
    rows from the redesign shift exactly where that breakpoint falls (a
    layout detail, not a regression), so the stale table was replaced with
    geometry-based invariants: the panel never overlaps the list it
    describes, on whichever side it picked, and the widest/narrowest tested
    widths still exercise the "room on the right" and "no room, drop below"
    ends of the fallback. Found and separately flagged (not fixed, out of
    scope here): the "drop below" placement overflows the window by ~8px at
    a couple of narrow widths (540-560px, 480px) because of a fixed 280px
    minimum width -- pre-existing, unrelated to this redesign, spawned as
    task `task_8986d773`.
  - `grid_geometry_regression.cjs`: "Edit config" moved from a standalone
    header button into the "Configuration tools" (•••) menu. Fixed by opening
    the menu first.
  - `shifted_binding_imports_regression.cjs`, `usability_audit_regression.cjs`:
    both read a binding's output value immediately after opening its summary;
    that field now folds behind the row's "Advanced command settings" gear.
    Fixed by opening it first.
- 41 Rust unit tests (`cargo test --release`, library target): all pass, no
  regressions from the layer/config work underneath. The `jsm-gui-app-tauri`
  binary test target needs elevation to launch on this machine and could not
  run either way; unrelated to this change.
- Fixed one incidental bug found while verifying: `ControllerGlyphBar`'s
  D-pad hint cluster was missing its own `key`, which is what produced the
  console warning steam_workspace_regression.cjs's `errors` assertion would
  otherwise have had to tolerate.
- Visual sweep at 1440x900 and 1024x720 across Overview, Buttons, Triggers,
  Trackpads, Gyro (all three tabs), D-Pad, Joysticks, Layers, Configurations,
  Application associations, Debug Console and Settings: consistent with the
  supplied Steam Input references (flat charcoal canvas, blue-grey sidebar,
  grouped rows with outputs aligned right, quiet persistent footer with
  controller hints), no overflow, no console errors.
- Physical-controller testing not done (no controller attached to this
  machine) -- the keyboard/mouse-driven navigation, capture ownership, and
  modal-trapping paths are covered by `tests/steam_workspace_regression.cjs`
  and `tests/layers_browser_regression.cjs`, but the actual gamepad input
  path (AppNavigation mapping -> `useKeyboardNav`) still wants a hardware
  pass before this ships.

**2026-09-20, second pass: structural component redesign, not just tokens.**
Luke's own read of the first pass: "you've just changed the theme... the
bones of the app still look the same." He shared the ChatGPT conversation
that produced this brief, including its illustrative mockups (rendered as
styled chat content, not image attachments, so they had to be viewed in the
live share page rather than read as text). Those mockups showed concrete
patterns the first pass hadn't picked up:

- Every value (a key, a trigger mode, "Enabled") sits in its own rounded
  **pill**, not plain text or a thin dropdown-style box.
- Physical inputs get a **big circular glyph badge**, not a small icon.
- The focused/open row gets a **full outline ring** around the row, not just
  a background tint.
- Page titles are a clear size step above everything else, with a small
  muted uppercase eyebrow above them.
- The Overview's controller diagram is the dominant visual element, with
  large individual rounded cards for its summaries and category shortcuts,
  not a dense list.

Changed to match, as real component/token changes rather than an override
layer bolted onto the old geometry:

- `Keymap.module.css`: `.commandOutputSummary` (the binding value, shared by
  every closed row and every open command card) rebuilt from a bordered
  "keycap" box into a pill matching `.commandTriggerBadge`'s existing pill.
  `.buttonGlyph` and `.binding-summary svg` sized up (28px/24px -> 36px/32px).
  `.commandCard` and `.keymapRow` get the same focus ring as everything else.
- `tokens.css`: `--radius-card` 4px -> 12px, `--radius-control` 3px -> 8px
  (the old values read as a technical/sharp desktop app; every reference
  mockup uses generously rounded surfaces), `--row-height` 48px -> 56px,
  `--font-page-title` 22px -> 26px, plus `--radius-pill` and `--focus-ring`
  tokens so the pill and outline treatment has one definition to change later.
- `controller-workspace.css`: `.binding-summary` / `.setting-row` focus and
  open states now combine a lighter fill with `--focus-ring` (a 2px inset
  box-shadow, so it follows the row's rounded corners exactly, rather than a
  plain CSS outline which does not) instead of a flat background swap alone.
  `.context-eyebrow` capitalised and tracked; `.context-page-header h1`
  heavier and tighter.
- `OverviewPage.module.css`: diagram widened again (510px -> 620px), and the
  anatomical callouts and bottom category-navigation tiles rebuilt as actual
  cards -- solid background, generous padding, bigger glyphs, focus ring on
  hover/focus -- instead of a compact bordered-on-hover list.

Deliberately not changed: `InputGlyph.tsx`'s SVGs already draw a filled
physical-button shape (a circle for face buttons, a paddle outline, a
trapezoid for shoulders, ...), which is the right per-input badge shape and
already close to what the mockups show once sized up -- no need for a second
circular background behind an already-circular glyph. The Overview's
anatomical grouping (inputs arranged in physical clusters around the
diagram, from the original usability-audit work) was kept rather than
flattened into the mockup's simpler linear card list: Steam Input's own
reference screenshots group the same way ("LEFT SHOULDER & GRIP" /
"RIGHT SHOULDER & GRIP"), and collapsing it would have thrown away real,
tested functionality (search, filters, per-layer views) for a closer match
to an illustrative mockup that says of itself "not an exact reproduction."
The 22px page-title spec from Part 16 of the brief was nudged to 26px rather
than jumping to the mockups' full ~32px hero scale, since Part 16 is Luke's
final, explicit instruction to the implementer and the mockups are earlier
and self-described as illustrative.

**Verified:** all 47 browser/node regressions still pass unchanged after
this pass (including the geometry-based help-panel invariants added
earlier, which had to keep holding under the new row heights and radii --
confirms that fix was measuring the real thing rather than fixed pixels).
`tsc` and the web build stay clean. Visual sweep at 1440x900 and 1024x720
across Overview, Buttons, Triggers, Trackpads, Joysticks, Gyro, Layers and
the action picker: no overflow, consistent pill/badge/outline treatment
throughout. Not verified: physical controller, and a real product-photo or
higher-fidelity controller render for the Overview hero (still the existing
schematic SVG, just larger) was out of scope for a CSS/component pass.

**2026-09-20, third pass: the shell itself, not just its rows.** Luke's next
round of feedback named two things the previous pass hadn't touched: the
"Mapping on" control read as a literal HTML checkbox-styled toggle switch
("screams this is a website wrapped into a Tauri app"), and every page with
more than one group (Buttons' five, Gyro's three, Joysticks'/Trackpads' two
sides, Trackpad tuning's five anchors) drew its own separate in-page nav
widget beside the app's actual sidebar -- a horizontal pill-tab strip for
some pages, a vertical rail (`PageSideNav`) for others -- which is exactly
"the secondary sidebar" he wants gone.

**Mapping toggle.** `App.tsx`'s `renderUtilityBar` and `App.css`: the
`<label><input type=checkbox><span class=slider></label>` construct replaced
with a single `<button role="switch" aria-checked>` styled as a status pill
(a dot + label, matching the value-pill language the rest of the app now
uses) rather than a sliding-thumb switch. Same semantics, same
`handleToggleMappingEnabled` call, same disabled-while-busy state -- only the
markup and its visual metaphor changed.

**Sidebar sub-navigation.** Considered two shapes for "the sidebar updates
dynamically": full drill-down replacement (Steam's own literal description --
click a page, the sidebar shows only that page's options, with a back
action to return) versus an accordion (the active top-level item's groups
appear nested under it in place, every other item still visible and one
click away). Went with the accordion: full replacement would have made
`tests/steam_workspace_regression.cjs`'s free navigation between top-level
pages (`nav('Gyro')` then `nav('Triggers')` with no back step in between)
impossible without rewriting that flow, and in daily use -- Luke tuning a
profile, jumping between Buttons and Gyro and back -- a mandatory back click
between top-level pages is friction the brief's own text doesn't actually
ask for ("Steam Input's editing sidebar is much smaller and more contextual"
describes the top-level list, not a drill-down). The accordion delivers the
same outcome the request names -- one sidebar, no second nav surface, only
the relevant sub-options showing -- without that regression.

Mechanically: `PrimaryNav` (`App.tsx`) takes a new `subNavByTab` map; the
active top-level item's entry, if any, renders a nested `<nav>` of sub-items
directly beneath it (`SideNav.module.css`'s new `.navItemGroup` /
`.navSubList` / `.navSubItem`). `App.tsx` computes that map once, per tab:

- Buttons / Joysticks: KeymapControls already renders every group of a
  multi-group page stacked in one scrollable column (`mappingListContent`);
  its removed `<aside>` jump-bar chips were the only other thing that knew
  which anchor belonged to which group. Gave each anchor a stable
  `id="mapping-section-<key>"` and moved the click target into the sidebar;
  a new shared hook, `useSectionScrollSpy` (extracted from `PageSideNav`'s
  own scroll-spy effect), tracks which one is nearest the top so the sidebar
  highlights the section actually in view.
- Trackpads / Trackpad tuning: same mechanism, reusing the existing
  `TRACKPAD_ANCHORS` / `trackpadRailItems` ids `PageSideNav` used to scroll
  to -- only the rendering location moved, not the anchors or the "both
  pads stay visible while scrolling" behavior findings 7-8 of the usability
  audit asked for.
- Gyro: real content-swap tabs already existed (`gyroSubTab`); only the
  three buttons moved from a `.page-subnav` pill row in the content area
  into the sidebar, and the now-empty `page-with-subnav` wrapper came out.
- D-Pad / Triggers: exactly one group each, so no sub-list renders --
  matches `PageSideNav`'s own former `items.length < 2` guard.

**Removed as dead code once nothing referenced it any more:**
`PageSideNav.tsx` / `.module.css` (both call sites replaced), KeymapControls'
`mappingListSidebar` / `mappingListJumpBar` / `mappingListJumpChip` /
`mappingListSidebarTitle` classes and the `scrollToListSection` /
`listSectionRefs` machinery behind them, and the `page-with-rail` /
`page-rail-content` layout classes.

**Verified:** 47/47 browser-node regressions pass, including
`steam_workspace_regression.cjs`'s free `nav()` calls between top-level pages
(confirms the accordion choice) and `editor_feedback_regression.cjs`'s
`getByRole('navigation', {name: 'Trackpad tuning sections'})` (confirms the
relocated sub-nav kept the same accessible name in its new home). One test
broke and was fixed: `binding_row_labels_regression.cjs` asserted zero
elements matching `[class*=dot]` on the whole page to catch a stray
touch-preview cursor; the new mapping-status dot (`mapping-status-dot`) is
an unrelated header element that happens to contain the substring "dot", so
the check was scoped to `.main-pane` (page content, excludes the header)
rather than renaming the status dot to dodge a coincidental substring match.
`tsc` and the web build stay clean. Visual sweep confirms Buttons, Gyro and
Trackpads all show their groups nested under the active sidebar item with no
separate in-page nav row or rail, D-Pad/Triggers show no sub-list, and the
mapping status pill matches the value-pill visual language established in
the second pass. Not verified: physical controller, and the narrow
(<1060px) drawer's sub-item layout is functional but not specifically
polished -- lower priority since this is a desktop app.

**2026-09-20, fourth pass: found the actual mockups.** The ChatGPT link's
"images" turned out to be styled chat content (rounded cards, real slider
bars, circular badges), not plain text or picture attachments -- a plain-text
read of the page (what the earlier passes worked from) collapses all of that
back to bare words, which is why they read as already covered. Screenshotting
the live conversation page surfaced four concrete patterns still missing:

1. **NumberField/slider rows.** The mockup's "Gyro Sensitivity" card shows
   label + a value **pill** top-right, a thick full-width slider, and a
   description sitting directly underneath -- always visible, not behind a
   click. `NumberField.module.css` already had a `.hint` class doing exactly
   this, entirely unused; some earlier pass had replaced always-visible
   description text with the click-to-open `HelpButton` "?" dialog and never
   removed the dead rule. Rendered it (`{help && <p className={styles.hint}>`),
   restyled `.valueWrap`/`.valueInput` as a pill, and thickened
   `Slider.module.css`'s track (5px -> 8px) and thumb. Kept the "?" button
   alongside rather than removing it -- `tests/editor_feedback_regression.cjs`
   and `sidebar_regression.cjs` click it by that exact accessible name, and it
   is genuinely used by fields whose `settingHelp()` lookup fails to match
   (some labels, e.g. "Static Sens (X)", have no entry in `settingHelp.ts` and
   so still show no inline hint -- a content gap, not a layout one, and worth
   a separate pass over that lookup table if it matters).
2. **Sidebar sub-items.** The "Gyroscope" mockup's own nav list is big,
   evenly padded, chevron-on-the-right buttons -- what the previous pass built
   (`.navSubItem`) was a small, indented, borderless 34px row. Enlarged to
   42px with the same `--bg-2` surface as a real row, added the chevron.
3. **Footer.** Glyphs sized up (15px/11px -> 22px/16px) and the bar itself
   grown (40px -> 56px min-height, 12px -> 14px text, wider gaps) to read as
   a deliberate console action bar rather than a thin status strip. Left it
   as a full-width sticky bar rather than the mockup's inset floating capsule
   -- that would need shell layout changes (margin/positioning) beyond a
   component-level pass, and the size/weight change is most of the visual gap.
4. **Not done: the "Quick Access Menu" collapsed multi-command summary**
   (`2 commands · Long press` instead of listing each one). Every current
   binding row, single- or multi-command, still lists each trigger inline.
   Changing that touches the binding-summary text several tests assert
   exact strings against, and wasn't unambiguously what this round of
   feedback was pointing at (the four screenshots supplied were the footer,
   the binding-summary card, the gyro sub-nav, and the gyro slider card) --
   flagging it rather than guessing at a rewrite of shared summary text.

**Verified:** 47/47 browser-node regressions pass unchanged, `tsc` and the
web build stay clean. Visual sweep on Gyro (all three tabs), Trackpad tuning
and the footer confirms the pill/slider/description pattern, the chunkier
sidebar sub-items, and the bigger footer glyphs all render as intended and
match the reference screenshots closely. Not verified: physical controller.

**2026-09-20 follow-through:** closed the remaining safe, code-verifiable
items from `docs/TODO.md`. Profile serialization now anchors ordinary comments
to the following setting and remains stable on repeated Save; the new
`comment_roundtrip_regression.cjs` covers directives, section banners and
trailing notes. Added the fixed `EIGHT_WAY` touch-grid shape across native
routing, editor controls, preview and overlay hit testing, with native boundary
and compiled overlay parity coverage. The responsive Steam workspace sweep,
web build and representative browser regressions remain green. Hardware-only
items (cursor visibility heuristic, slow-pan gameplay feel, grip relocation,
custom icon import and physical stick-wheel firing) remain explicitly marked
in the TODO ledger rather than being claimed from synthetic tests.
