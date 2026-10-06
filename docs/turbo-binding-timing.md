# Per-action turbo timing

Choose Turbo on an action row to open its settings, or reopen them with the row cog (Y). Turbo interval is in milliseconds and affects only that output. Use configuration timing removes the override. The configured hold time still controls when turbo begins.

Profiles store an override on the turbo event suffix: `N = SPACE+{60} J+{200}` repeats Space every 60 ms and J every 200 ms. A plain `K+` continues to use native `TURBO_PERIOD`, including held setting overrides. Copies, duplicate actions, layers and modeshift binding expressions retain their intervals.

The extended suffix requires this Studio mapper build; older upstream mapper versions cannot load it. Reset the action to configuration timing to return to the standard `+` suffix.

Each physical input/controller owns independent repeat timers. Timers follow the elapsed-time grid, run at controller polling resolution, and skip missed repeats rather than emitting a catch-up burst. Pending pulse callbacks complete before input release, then output releases run normally.

Validation: `node tests/turbo_binding_regression.cjs`, `node tests/turbo_binding_browser_regression.cjs`, and `python JoyShockMapper/tests/run_turbo_harness.py`. The browser uses an isolated mock profile; the native harness uses the actual parser and scheduler methods with simulated output callbacks. Physical-controller validation remains separate.
