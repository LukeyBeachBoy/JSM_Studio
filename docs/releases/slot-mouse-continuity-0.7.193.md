# Slot and hold-to-swap mouse continuity — 0.7.193

The physical-controller reconnect fixed in 0.7.192 was followed by shorter mouse
stalls when switching between mixed Xbox/KBM and KBM configurations.

Studio slot and device-chord loads now suppress ordinary assignment echoes while
holding the configuration lock. Warnings, errors and the final slot/chord summary
remain available. This avoids repainting the hidden native console hundreds of
times during a swap.

After Studio starts using slot/chord transitions, a virtual pad that becomes unused
is neutralized and retained separately from the active output. KBM mappings have
no active gamepad pointer and cannot submit gamepad input. Returning to the same
output scheme reuses the existing target instead of causing another Windows/Steam
device-discovery pass. Closing the physical controller or mapper frees the target.
Standalone virtual-controller assignments retain their previous detach behavior.
Temporary configuration entry also releases the previous gamepad report, and
feedback from an inactive target is ignored.

Validation:

- Native parser/output lifecycle regressions passed, including 100 Xbox/KBM
  round trips with one target, neutralization, failure rollback and cleanup.
- Real mapper slot/reset-hook regression and managed-controller census tests
  passed. Azeron input-queue and telemetry lifecycle regressions passed.
- Installed 0.7.193 mapper hash matched the bundled build. A live Steam Controller
  remained present through both slot loads and four chord press/release pairs.
  Windows XInput slot 0 remained connected and reported neutral buttons, triggers
  and axes in the KBM configuration.
- Instrumented native chord loading fell from approximately 28 ms to 10 ms.
  Final installed telemetry showed maximum slot-loading gaps of 30/22 ms and
  chord-entry gaps of 10–18 ms in this sample, without the earlier 100 ms gaps.

The user's continuous touchpad-circle/gyro test still paused on 0.7.193. Sample
gaps measure mapper telemetry continuity; they do not prove fresh hardware input
or perceived smoothness. A subsequent physical trace showed pad coordinates
freezing for approximately 70–80 ms while gyro reports continued, specifically
when moving between Cyberpunk's grip range 306 and the chord/Desktop range 318.
See the follow-up calibration-handoff correction in 0.7.194.
