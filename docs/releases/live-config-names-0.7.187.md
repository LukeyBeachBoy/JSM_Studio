# Live configuration names — 0.7.187

The live configuration badge resolves slot snapshots and generated layer stacks
to the configuration they belong to. It shows Cyberpunk or Desktop instead of
slot-1 or a numeric layer hash, including controller-specific layer files.

Clicking the badge opens the source configuration. Live/saved comparison still
uses the running slot snapshot, so an older snapshot is not mistaken for a newer
saved source. The Layers page uses the same identity resolution. The full badge
name is available on hover when the title bar truncates it in a narrow window.

Validation:
- Applied-profile regression: slot identity, scoped and combined layers,
  preview/navigation files, unresolved slots, and genuine numeric user filenames.
- Controller active-profile browser regression: device switching, badge
  navigation, snapshot freshness, and 1440×900 / 900×600 layouts.
- Profile refresh browser regression: refresh clean editors on focus or slot
  activation, retain unsaved drafts, reject late reads after edits or selection
  changes, and keep saved source separate from runtime snapshots.
- TypeScript, production frontend build, and Windows installer build.
- Isolated native AppNavigation regression passed outside the sandbox; the
  sandboxed attempt could not receive test telemetry.

Installation is deferred at the user's request while Cyberpunk is running.
Controller calibration has not been edited.

## Desktop Slot 2 repair

The real Desktop source and Slot 2 snapshot were missing the Cyborg layout;
they contained only the older Steam Controller configuration. The prior
reWASD import was recovered from `build-jsm-sdl/desktop-import/Desktop.txt`.
Only its 54 Cyborg-scoped lines were appended to the actual source and snapshot
through the verified non-virtualized storage path. Existing bytes were retained.
Backups, before/after hashes and preservation checks are in ignored
`build-jsm-sdl/desktop-slot-recovery/`.

Global preferences, calibration, slot assignments, Cyberpunk and Slot 1 were
unchanged by the repair. The user had switched away from Slot 2 during recovery,
so the current running mapping was left alone. The repaired snapshot loads on
the next Desktop slot activation without requiring the pending UI update.

After switching back, the user confirmed Alt+Tab worked. Read-only queries of
the installed mapper confirmed JOY3 = TAB, JOY22 = ESC and LUP = W. Reopening
Desktop in the installed editor displayed the recovered bindings and WASD.
The pending update also refreshes a clean editor from disk on window focus and
when that same configuration is applied by a slot. It never replaces unsaved
edits or changes the selected configuration in response to a late disk read.
