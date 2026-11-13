# Slot confirmation — 0.7.185

Adds a default-on **Show slot-change confirmation** preference under Settings → Configuration slots. A successful switch displays the slot number, slot name and configuration in a compact bottom-right toast for three seconds. Rapid switches replace the message. The window ignores clicks and cannot take focus. It is created lazily and receives switch events without subscribing to controller telemetry or adding a polling loop.

Existing settings migrate with confirmations enabled; an explicitly disabled preference persists. Unsuccessful switches and reselecting the active slot do not notify.

## Validation

- TypeScript checking, installer build and all six targeted Rust slot tests passed.
- Browser regressions passed for setting persistence, minimum 900×600 settings layout, light/dark themes, long names, reduced motion, latest-message replacement and stale-event rejection.
- Installed 0.7.185: switched Desktop/Gaming through the native UI and observed the native confirmation with the correct content at screen coordinates 2180,1308, size 360×112. Observed automatic dismissal, the off switch suppressing confirmations, and re-enabling restoring them.
- Restored the original Gaming slot with confirmations enabled. All 77 captured profile files, slot assignments and global stick defaults were unchanged. One installed app and one mapper remained running; no temporary debugging listener remained.

Native rapid-switch timer overlap, exclusive-fullscreen gameplay visibility and physical hotkey gestures were not exercised in this validation. Native UI inspection reported no controller connected at the time; the existing hotkey path shares the successful slot activation handler.

Installer: `JSM Evolved_0.7.185_x64-setup.exe`.

SHA-256: `73EE2E6D18FDC098C8E69DA9A130AE505B0ACBF418528A616696253ABCADB145`.
