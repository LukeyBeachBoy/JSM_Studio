# Reusable virtual menus

JSM Evolved's menu library creates named radial wheels, touch grids and hotbars independently of physical pad modes. Open the **Virtual menus** navigation tab. The full page contains the library, action editor, menu controls and screen-position preview; a detail sheet holds advanced appearance settings. A definition owns its actions, labels, icons, geometry and placement. Menu controls independently choose navigation, automatic activation, selection and cancellation. Descriptive dropdowns show controller glyphs and explain the choices.

Create a menu, then bind **Hold Weapon Wheel** to LB in its ordinary binding card: choose the **Virtual menus** action category. The reference flow is **hold LB → navigate the right pad → release LB to select**. The left pad keeps its normal behavior. Grip Sense and the other native bindable buttons are available as activation/confirm/cancel inputs. Multiple ordinary binding cards can open the same menu, and it can have several navigation sources. Existing automatic activation configurations remain editable. Selecting another layout preserves existing actions; switching away from a hotbar asks the user to remove incompatible D-pad/face-button attachments first, preserving their intent.

## Joystick shortcut and reservations

The Joysticks mode picker keeps **Radial menu (wheel)** discoverable. It opens a choice to create a radial menu or use an existing one, then opens that exact definition in the Virtual menus editor. New wheels start hidden, with direct stick navigation, continuous selection and Always available activation: deflect to hold an action, return to centre to release it. No opening binding is needed.

Joysticks shows the shared preview and an Edit menu card. Always-available controls are marked **Reserved for menu** on Joysticks and Overview, with an explicit movement/camera explanation. Direction bindings, WASD shortcuts and ordinary stick-output tuning are hidden while reserved. Choosing another mode detaches the always-available stick control, retains the menu definition and restores ordinary mode editing. Menus activated by commands or buttons are described as temporary takeovers.

A shifted stick creates a native Hold attachment for its trigger instead of writing a chorded VIRTUAL_MENUS assignment. Controls created this way follow modeshift rename/removal; independently configured menu controls remain independent. An always-available base menu also reserves the stick during ordinary modeshifts, so its activation must be changed before a shifted movement/camera mode can use the stick.

Legacy radial profiles are not rewritten on load. **Use the virtual menu editor** explicitly converts simple wheels, copying raw action bindings, labels, icons, segment count, deadzone and overlay placement, including legacy appearance defaults. Original segment assignments remain in source for recovery. Physical chord/simultaneous/conditional segment assignments block conversion with an explanation because menu actions cannot reproduce those physical input relationships; the legacy editor remains available for those profiles.

Renderer regressions cover creation, edit navigation, both reservation surfaces, save/reload, detachment without deletion, existing-menu reuse and legacy conversion. Utility regressions cover native catalog serialization, unsupported-data preservation and modeshift lifecycle. Physical hardware and installed-app validation remain separate.

## Binding commands

Quoted native binding actions run on the controller that produced the binding, independently of the overlay:

- `L = "MENU_HOLD menu1"`: open while LB is pressed; release selects if configured. Multiple holders coexist; only the last release closes it.
- `R = "MENU_OPEN menu1"`: open and leave open.
- `S = "MENU_TOGGLE menu1"`: open or cancel the menu.
- `E = "MENU_CLOSE menu1"`: close without selecting.

Choose **Binding commands** as menu activation for these commands. Navigation, confirm and cancel remain menu-local controls; they do not appear as ordinary bindings. A cancel clears active menu commands, and a new press can reopen the menu. Reloading the catalog clears latched/held command state. The menu's name is shown in binding cards; its stable identity is retained in source. Deleting a menu leaves referencing commands inactive. Deleting the last or partially configured menu leaves an editable empty catalog.

## Native behavior

### Activation, highlighting, execution and visibility

Activation makes a menu's controls available; it does not necessarily show an overlay or run an action. Navigation changes the highlighted candidate. **Select action** determines when that candidate's native commands run. **Show overlay** controls presentation independently:

| Choice | Visible while |
| --- | --- |
| When activated | The native menu is active, even without navigation. Always available stays active unless canceled or displaced. |
| While activated and navigating | The menu is active and its pad has contact, its stick is beyond the configured deadzone, or a previous/next hotbar button is held. |
| While navigating with an action highlighted | Both conditions above hold and there is a highlighted action, including an optional centre action. |
| Never | Never in game; the editor preview, native controls and commands remain available. |

These are current conditions, not a one-time reveal latch: stopping navigation hides both navigation-dependent modes. A remembered hotbar item or a retained highlight alone cannot reveal them. Navigation state comes from native telemetry rather than renderer hit tests; older mappers without that field cannot display the navigation-dependent modes. Existing `touch` and `ring` presentation values represent the first and third choices; `navigate` and `never` add the others. `ring` now requires navigation as well as a highlight.

Automatic Hold activates while its configured input state matches. If that state is **Released**, activation ends on press/contact, so activation-release selection executes then. Automatic Toggle changes activation whenever the input enters its configured state; **When toggled off** executes the highlight on the deactivating transition. Always available requires another execution rule and permanently reserves its navigation source while active.

Binding commands differ: Open latches activation; Toggle closes by cancellation, without executing the highlight; Close also cancels. Hold release executes only when the last holder ends and no latch keeps the menu active. Their duration follows the regular binding's configured event and behavior, rather than necessarily the physical button's entire press.

Click/confirm executes on a new confirm press and leaves activation intact. Lift/return executes the previous highlight on pad contact ending or stick centering. Continuous holds the highlighted action while pad contact or stick deflection continues; digital hotbars hold their remembered action throughout activation. Individual action bindings can further define tap, hold, turbo or toggle output behavior.

Direct Joystick retains its last highlight at rest, except that an explicit radial centre action replaces it. Joystick cursor clears the highlight at rest without a centre action. Lift/return selection deliberately executes the previous action even when cursor return clears the current highlight. Touching an empty radial centre clears the pad highlight. Visibility never changes these selection decisions.

Legacy physical pad/stick overlays also offer Never, with their existing navigation and action-region visibility rules. Their activation and action timing still come from physical input modes rather than named-menu commands.

- Activation: binding commands (default for new menus), automatic hold, toggle or always available. Toggle with activation-release selection commits on the second activation press.
- Navigation: independent left/right pad, left/right stick, or D-pad/face buttons for hotbars. DualSense uses the single pad through the right-pad source.
- Stick navigation mode: **Joystick** retains direct highlighting. **Joystick cursor** (radial wheels and touch grids) shows the same dot and trail as trackpad navigation. Deflection positions it outwards from the centre; the centre deadzone snaps it back to the hub. With activation-release selection and no centre action, returning to rest clears the highlighted action, so releasing the opener closes without selecting or requiring a cancel binding. This also handles rest and opener release arriving in one input poll. An explicit radial centre action remains selectable; lift/return selection deliberately commits the previous action.
- Radial centre: optional ordinary binding, label and icon, independent of the segment count. Without a centre action, pad contact in the centre or Joystick cursor at rest clears the highlight; direct Joystick retains it at rest. A stick returning to centre in lift/return selection still commits the previous segment; click or activation-release can choose an explicit centre action. Continuous centre selection requires actual pad contact rather than an untouched neutral stick. Switching to a non-radial layout retains the centre binding for a later return to the wheel.
- Selection: click/confirm, contact release or stick centering, activation release, or continuously hold the highlighted Mapping.
- Cancel: closes without selecting. A held activation must be released before opening that canceled menu again.
- Hotbars: directional edges move one item, wrap and remember the item per controller. Default confirmation uses pad click, stick click or D-pad up.
- One source has one menu owner. A fresh activation takes priority; ties use the later attachment. A displaced held menu remains canceled until its activation is released. Always-available menus act as fallback.
- Navigation and active menu confirm/cancel inputs are consumed. The activation button's ordinary binding remains available. Existing outputs are released through the normal native state machine when a catalog changes.

Actions are native `Mapping` objects processed by `DigitalButton`. Click and release selection tap an item; continuous selection holds it. The shared command editor exposes multiple outputs, release/tap/hold/turbo events, toggle/instant/explicit-release behavior, Cycle parameters and existing command/haptic/sound controls. Hold/turbo need a held item to have useful duration. Physical-button chord/simultaneous/diagonal and double-press assignments are not offered on a menu item because they require a separately registered input mapping.

Face-button hotbars use the spatial west/east buttons to cycle and north to confirm. South may be chosen as a toggle activation input. This is an intentional spatial mapping rather than a literal copy of Valve's letter-based guide; activation remains independent.

## Configuration and compatibility

`VIRTUAL_MENUS = HEX:<UTF-8 catalog statements>` is one native assignment. Hex protects Unicode labels, embedded `#` and quoted binding text from the legacy line parser. This is ordinary configuration data, so existing layer composition can atomically replace a catalog without introducing another runtime settings system. Its decoded statements are:

```text
DEFINE weapons RADIAL 8 8 0.2
ACTION weapons 0 H
ACTION weapons 1 1
ACTION weapons 2 "CYCLE 1 | 2 | 3"
PRESENTATION weapons {"name":"Weapon Wheel","placement":{...},"actions":[...]}
SOURCE weapons RIGHT HOLD L ACTIVATION_RELEASE NONE NONE
SOURCE weapons RSTICK HOLD L ACTIVATION_RELEASE NONE NONE JOYSTICK_CURSOR
```

Stick sources accept an optional final `JOYSTICK` or `JOYSTICK_CURSOR` token. Omitting it preserves existing direct navigation. Cursor mode is supported on radial wheels and touch grids; the native cursor position accompanies selected-item telemetry and is rendered in both the overlay and editor preview.

`PRESENTATION` is renderer data; it never processes controller input. Runtime definitions, actions and attachments are parsed and validated before publishing an immutable catalog. An invalid replacement retains the old catalog and produces a configuration error. Limits are 16 menus, 25 segments/items plus an optional centre per menu, 32 attachments and 200,000 decoded bytes.

The expert macros `VIRTUAL_MENU`, `VIRTUAL_MENU_ACTION` and `VIRTUAL_MENU_SOURCE` can build the same catalog. The GUI imports these forms and consolidates them only when the user edits named menus. Legacy pad/stick menus remain independent. Unsupported future catalog statements disable graphical editing while preserving source. Unknown presentation and per-action display fields survive edits; presentation cannot override an authoritative native ACTION binding. Unrelated source lines and their CRLF/LF endings are preserved by the menu writer.

Virtual-controller dependency analysis and Xbox/DS4 conversion inspect menu actions, including the optional centre and Cycle steps. The overlay renders native selected-item telemetry and never fires actions or recomputes a release decision.

## Verification boundaries

Native routing/catalog/runtime harnesses and renderer config/layer/browser tests pass. The runtime harness compiles the real Mapping parser, DigitalButton state machine and JoyShock menu methods with hardware/OS-output stubs. It verifies keyboard/gamepad dispatch, same-poll source/confirm ownership, independent face-button hotbar cycling and confirmation, centre dispatch and release of held/toggled actions on catalog replacement. Other tests cover ownership priority, cancellation, selection styles, hotbar wrap/memory, transaction failures, Cycle parsing, Unicode/quoted bindings, future-field preservation, dependency conversion, independent attachments and save/reload. Browser controller navigation and renderer live highlighting use simulated telemetry.

Actual OS/virtual-driver emission, game transitions, both physical pads, Grip Sense activation, haptics and physical controller navigation still require integration/physical validation. The same-poll input census covers physical digital inputs and raw pad contacts (Steam left MISC4/right TOUCH; DualSense TOUCH), including released activation conditions. Analog/derived activation inputs use the engine’s existing latch order; first-poll leakage checks for triggers, pad-derived cells and motion conditions remain an integration task. The installed mapper has not been replaced. These menus are an in-progress feature, not a claim that the complete Steam Input parity task is finished.
