# Azeron native takeover — 0.7.162

The Windows SDL mapper now takes temporary native control of the Cyborg V2
(`16d0:12f7`). The selected onboard profile no longer determines which buttons
or stick input JSM can read. Quit Azeron Software while using JSM; takeover and
connection problems are shown beside the controller drawing.

Physical buttons use stable positions numbered 1–26. The fifth-way switch uses
20 plus the four directions, stick click is 21, the lower side thumb button is
22 and the upper one is 25. Button 26 no longer shares an input with thumb 25.
Existing per-controller game layouts and the Cyberpunk Driving layer remain in
the same config as the Steam Controller layout.

The mapper reads calibration endpoints and offsets but does not write profiles,
calibration or firmware. It restores onboard mode on stop. A hidden, separately
packaged recovery helper survives the GUI process job and restores onboard mode
after a crash or a stalled native-input worker. Takeover requires that helper.
Initialization serializes firmware/calibration requests and retries missing
responses. Competing JSM sessions cannot claim the device during restoration.
Console telemetry now replaces invalid ANSI/truncated bytes while preserving
valid UTF-8, so a console message cannot invalidate the whole input packet.

## Verification on 27 October 2026

- Native Release build, frontend build, protocol unit tests and existing Azeron/
  multi-controller regression passed. Rust: 184 passed, 1 ignored.
- Browser tests passed for numbered artwork, click/keyboard targets, stick and
  button feedback, takeover status, narrow layout, and independent Steam/Cyborg
  editing in the same Cyberpunk config.
- Connected device: firmware 100. Native mode and raw analog reports confirmed
  on hardware. The final build produced 525 readable telemetry packets with the
  unassigned onboard profile selected, including 519 active Cyborg samples and
  one initial connecting sample, with no config errors. This check contained
  idle input only. The original onboard profile was restored.
- A subsequent user-operated native capture recorded 9,674 samples over 92
  seconds (one connecting, 9,673 active). The requested upper/lower thumb presses
  arrived in order as JOY25 and JOY22. JOY1–9, JOY14–19, JOY22–26 and all four
  hat directions were observed, with all buttons released at the end. JOY10–13,
  JOY20 and JOY21 were not exercised in this capture.
- The user had a restrictor ring fitted initially and removed it near the end.
  Both stick axes reached -1.0 and +1.0 in the later motion segment; the final
  resting reading was (-0.0100, +0.0038). No calibration or onboard profile was
  changed for this capture. Normal JSM operation was restored and native control
  confirmed active alongside the Steam Controller in `AppNavigation.txt`.
  Physical input is verified for the controls exercised; gameplay remains untested.
- The console-encoding regression covers ANSI bytes, valid multibyte Unicode,
  truncated tails, overlong sequences and invalid Unicode scalar values.
- Forced mapper termination and process suspension both restored onboard mode.
  The installed GUI's kill-on-close process job also restored onboard mode and
  left no mapper/recovery process behind. Relaunch regained native control.
- Final installed telemetry showed Steam Controller type 24 and Cyborg type 25;
  Cyborg reported `nativeInputStatus: active`. The foreground configuration was
  `profiles-library/applied-preview.txt`; this is not a Cyberpunk gameplay test.
- Installed mapper, SDL and recovery helper SHA-256 hashes matched the build.
  Cyberpunk config and Azeron settings database remained byte-for-byte unchanged.

Installer: `JSM Evolved_0.7.162_x64-setup.exe` (17.7 MiB).
SHA-256: `FD06C34AB803D7157D46E22FFB76C5DA7EF163F7EA3089BC35B7D8453828E165`.

Local evidence: `build-jsm-sdl/azeron-protocol-reference/native-smoke.json`,
`native-stall.json`, `native-physical-capture.json`, `installed-check.json`, and
`installed-final-telemetry.json`, `physical-input-live.jsonl`,
`physical-input-results.json`, and `physical-input-restored.json`.
Proprietary protocol-reference extracts stay
in the ignored build folder and are excluded from the application/installer.
