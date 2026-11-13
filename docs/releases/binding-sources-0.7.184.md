# Binding source indicators — 0.7.184

Controller artwork, layout callouts and binding rows now distinguish inherited base bindings (blue hollow diamond/dashed outline), game-owned bindings (gold circle/solid outline) and selected-layer overrides (the layer colour/square). A shared legend explains these markers. Tooltips and binding details name their source. Controls combining assignments from several sources show a mixed marker.

The read model preserves explicit ownership, clears, physical button aliases and controller-instance scopes. Selecting a layer leaves unchanged base/game markers intact. It is memoized independently of telemetry and does not rewrite configuration files or alter mapper input processing.

Validation:
- TypeScript and full Windows installer build passed.
- Provenance unit regression covered inheritance, explicit identical values, clears, shared aliases, metadata, mixed sources, inactive layers and identical-controller isolation.
- Browser checks passed for Steam, DualSense, Cyborg, Xbox and Nintendo artwork in dark/light themes and at narrow width.
- Existing layer-context, shared UX and panel-dismissal regressions passed.
- Installed 0.7.184, confirmed its source legend in the native app, and verified one app/mapper process pair. All 76 profile files, preferences and StudioDefaults.txt were unchanged. No controller was detected, so physical input was not tested.

Local reports: `build-jsm-sdl/base-provenance-build.log`, `base-provenance-preservation.json`, `base-provenance-installed.json`. Browser screenshots: `tests/tmp/sources-*.png`.
