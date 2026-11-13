# Configuration slots

JSM Evolved supports four persistent configuration slots from Settings → Configuration slots. Each has a name, assigned configuration, optional physical hotkey, and controller scope. The slot bar selects the live slot. Library → Apply to Slot updates a selected slot without selecting it unless it is already live.

**Show slot-change confirmation** is on by default in Settings → Configuration slots, including for existing installations. Successful slot changes show the slot number, name and configuration in a compact bottom-right toast for three seconds. It follows the foreground monitor's work area, stays clear of the taskbar, and does not take focus or intercept clicks. A new switch replaces the current confirmation; reselecting the active slot and failed switches stay silent. Turning the option off dismisses any current confirmation. Like other desktop overlays, visibility over exclusive-fullscreen games is not guaranteed.

Gaming/Desktop setup assigns the current live configuration to slot 1 and Desktop to slot 2. Mouse Back + Up selects Gaming; Mouse Back + Down selects Desktop. Slots 3 and 4 remain available. Hotkeys require all selected inputs to be physically held, in any order, without a timing window. They fire once until an input is released. Controller inputs in a hotkey must belong to the same matching physical controller; mouse side buttons can join that hotkey.

Partial hotkeys leave ordinary mappings and profile layers active. A global Hold to swap trigger that is a strict subset of a slot hotkey is temporarily suspended for the matching controller while slots are enabled. This prevents the old Mouse Back global profile from replacing the current game before the direction is pressed. Disabling slots restores that trigger; its saved definition is retained. Complete digital controller hotkeys are consumed by the mapper before ordinary bindings; trigger and touch gestures currently remain available to their ordinary bindings.

Per-game Auto-apply offers a destination slot. Existing rules default to slot 1. A foreground match updates that slot's configuration. Only a match targeting the active slot changes the live mapping. Leaving a game does not clear its slot, and the legacy fallback is suspended while slots are enabled. Native AutoLoad is disabled while the application's slot-aware foreground worker handles these rules.

Slot assignments and active selection are saved in the application's canonical configuration directory as `slots.json`. Applied configuration snapshots live under `profiles-library/.slots/slot-N.txt`, keeping live edits independent between slots. Source configurations are retained. Applying a configuration normally replaces the active slot. Renaming a source updates slot references; a deleted source produces an explicit missing-configuration error.

Verification includes native tests for unordered hotkeys, edge rearming, controller scope, disabled/disconnected devices, foreground destinations, and filter masks; a C++ mapper filter regression; and a browser regression for setup, switching, hotkey editing, Auto-apply destinations, and minimum window width. Physical controller gestures require hardware confirmation.

## Local delivery: 0.7.182

Built and installed on 2026-10-28. The upgrade hash-checked all 65 pre-existing profile and backup files without changes. Installed UI switching preserved the live Cyberpunk content and its Weapons layer, loaded Desktop, and returned to Cyberpunk. A temporary foreground Edge rule updated slot 1 while Desktop remained active in slot 2; the rule was removed afterward. Restarting with Desktop selected retained both assignments, hotkeys, and the selected slot, then returned successfully to Gaming. A final launch from Codex handed itself to the normal storage context and showed the same slots, with one app and one child mapper. Temporary WebView diagnostics were closed.

Gaming is assigned Cyberpunk, Desktop is assigned Desktop, and their Cyborg hotkeys are Mouse Back + Up and Mouse Back + Down. Cyberpunk's executable rule is enabled for slot 1. Other existing rule preferences were retained. Native tests: 201 passed, 2 ignored; frontend build, slot browser regression, C++ filter regression, installed switching, foreground routing, and restart checks passed. No physical gesture or gameplay output is claimed as tested.

Installer SHA-256: `1CF034EF47D5CCBEC7CBFA22B4648E7C8B4E6946C9C03836D66BDF7A9D38584A`.
Local evidence is under ignored `build-jsm-sdl/install-slots-0.7.182.json`, `slots-foreground-verified.json`, and `slots-*.png`.
