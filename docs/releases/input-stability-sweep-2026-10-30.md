# Input stability sweep — 30 October 2026

The sweep followed configuration slots, Studio focus handover, native Azeron
input, keyboard repeats, virtual controller lifetime, and connection telemetry.
Existing checkout edits and the installed configuration library were preserved.

## Findings and changes

| Area | Verified code defect | Change |
| --- | --- | --- |
| Alt+Tab from Studio | The focus guard covered global Hold to swap chords, while Desktop maps Alt and Tab as ordinary separate held keys. Focus handover could end the per-controller fallback and cancel Alt. | Automatic focus loads now wait in the native mapper until mapped modifiers are released. The latest focus destination wins; a deliberate configuration load cancels the pending handover. Native AutoLoad uses the same protection. |
| Slot and layer controller churn | Virtual controller assignments had immediate bus side effects while shared, model, device and imported settings were still being parsed. Intermediate schemes could unplug/recreate a pad even when the final scheme was unchanged. | Reconcile virtual output once at the outer configuration transaction boundary, using each device's effective scheme. Reuse a healthy target of the same type. |
| Virtual controller hangs and failure handling | Creation/destruction occurred under the lock also taken by notification callbacks. Failed initialization could leak an attached target, and the existing target was discarded before a replacement succeeded. | Create and destroy outside the callback lock. Swap only a valid replacement into place; retain the old target on failure. Free allocated ViGEm targets even if initialization reports an error. |
| Stray key release | Ending a device chord that was never active still cancelled its ordinary held bindings. | Make an absent device-chord end inert. |
| Input bursts after stalls | The native queue could replay historical button/analog snapshots after a long configuration stall. Legacy turbo advanced only one missed interval per tick, producing catch-up repeats. | Discard a queued batch older than 50 ms, release its old outputs, and resume the latest state. Turbo skips missed intervals and schedules the new pulse release from its actual emission. |
| Connection telemetry | Before any sample was sent, subtracting the minimum clock timestamp could overflow. The idle worker then incorrectly believed a recent packet existed and never emitted its first heartbeat. Configuration and shutdown also changed socket state without the sender's lock. | Check the never-sent sentinel before doing clock subtraction, and serialize configuration/shutdown with sending. The standalone no-controller mapper smoke test now receives telemetry. |
| Configuration loading | Assignments probed the filesystem twice as though they were filenames, command lookup scanned the registry, and several regexes were compiled repeatedly. Filename comment stripping also removed a character before an adjacent comment. | Skip file probes for assignment lines, use indexed command lookup, cache the parser regexes, and trim comments without truncating the filename. |
| Azeron menu validation | The generated frontend native-input registry omitted JOY1–JOY32 and their released conditions, despite those inputs existing in the native enum. | Regenerate the registry from the native enum. |

The burst fixes cover demonstrated queue/repeat failure modes. They do not prove
that every observed burst of plain WASD text came from those paths: Windows key
repeat, the target application's message processing, and physical stick motion
still need to be distinguished in a live retest.

## Validation

- Native Release mapper build passed.
- Rust backend tests: 203 passed, two intentionally ignored.
- `tests/run-mapper-stability.ps1`: actual parser and button FSM checks passed,
  including 100 repeated loads, Alt/Tab modifier ownership, latest-focus and
  explicit-load cancellation, absent swaps, simulated four-second turbo stalls,
  target reuse, failed-target rollback, cleanup, and callback lock discipline.
- Actual telemetry emitter checks passed for the first idle heartbeat, 1,000
  concurrent configuration/send iterations, shutdown and restart.
- Native input queue checks passed, including deterministic stale-batch handling,
  rapid taps, analog coalescing, disconnect/mode release, overflow and 100,000
  producer/consumer edges.
- Existing chord lifecycle, AutoLoad retry, restore-growth, profile adoption,
  turbo serialization, managed-controller and virtual HID regressions passed.
- Native input registry generation and enum/menu contract checks passed.
- `npm run build:web` passed, with existing bundle-size/import warnings.
- Existing Azeron menu and Cyborg browser fixtures passed; desktop and narrow
  screenshots were inspected. These are browser checks, not installed-app proof.
- `tests/inverted_chord_mapper_regression.cjs` passed against the rebuilt mapper
  in manual connection mode. Its initial telemetry timeout also occurred with
  the prior bundled binary; diagnosing it exposed the heartbeat overflow above.

## Delivery and remaining verification

The complete app was subsequently packaged and installed as **0.7.189** at the
user's request. Installer SHA-256:
`68C385D14401CF05035FDBAC5B0DB2B43F118476107B1AD9262DC13289CFEA59`.
The installed app and five native/helper files match the packaged build (the
app executable has Tauri's expected NSIS bundle marker). All 177 existing
configuration files were unchanged by installation. A complete configuration
backup and verification evidence are in ignored
`build-jsm-sdl/stability-install-0.7.189/`.

The installed app was reopened. Exactly one installed app and mapper were
running; the mapper answered commands from the normal Roaming configuration
library with telemetry enabled on port 8974. GUI preferences, slots, global
chords and controller enrollment remained unchanged after startup. This is
installation/startup proof, not physical controller or gameplay verification.

Live checks remaining: repeated Desktop/Cyberpunk slot changes while watching
Steam's controller list; hold Alt and tap/hold Tab on the first attempt from
Studio; test plain WASD direction transitions with text focused; and repeat
with the actual controller/game running. A real scheme change between Desktop
(`NONE`) and Cyberpunk (`XBOX`) is still expected to change the virtual device;
repeated churn after that transition is not.
