# Cyberpunk dream curve verification — 13 November 2026

The saved Cyberpunk profile and its Gaming-slot snapshot both contain the intended floor-plus-Quadratic setup. Their SHA-256 hashes match: `b6c94e9703c1f9267e82e8a02754bfe7c7eae4f5cbbe79bad4c4bf6890755e3b`. Neither file was changed by this verification.

Source: `%APPDATA%/com.lukeybeachboy.jsmstudio/jsm-runtime/profiles-library/Cyberpunk.txt`, and `.slots/slot-1.txt` alongside it. The Steam Controller projection preserves the settings; the separate Azeron controller variant retains its explicit gyro-off setting.

## What was implemented

```text
GYRO_CUTOFF_SPEED = 0
GYRO_STEADYING_FLOOR = 2 2
GYRO_CUTOFF_RECOVERY = 5
MIN_GYRO_SENS = 5 3
MAX_GYRO_SENS = 21 6
MIN_GYRO_THRESHOLD = 0
MAX_GYRO_THRESHOLD = 80
ACCEL_CURVE = QUADRATIC
```

For controller rotation speed `v` in degrees per second:

```text
t = clamp(v / 80, 0, 1)
u = clamp(v / 5, 0, 1)
b = 6u⁵ − 15u⁴ + 10u³
horizontal RWS = 2 + b × ((5 + 16 × t²) − 2)
vertical RWS   = 2 + b × ((3 +  3 × t²) − 2)
```

This gives nonzero sensitivity during very slow motion, smoothly blending into the original Quadratic response by 5°/s. The blend has zero first and second derivatives at both ends: the floor starts flat and the join matches the Quadratic curve's slope and curvature. The response at every speed at or above 5°/s is exactly unchanged. Zero physical motion still produces zero output. The floor is capped at the base curve's sensitivity; a positive hard cutoff still blocks movement. A zero floor on both axes preserves the older velocity-attenuation path.

| Controller speed | Horizontal RWS | Vertical RWS |
| ---: | ---: | ---: |
| 0 (gain limit) | 2 | 2 |
| 1°/s | 2.173905 | 2.057947 |
| 3°/s | 4.063038 | 2.685440 |
| 5°/s | 5.0625 | 3.011719 |
| 20°/s | 6 | 3.1875 |
| 40°/s | 9 | 3.75 |
| 60°/s | 14 | 4.6875 |
| 80°/s | 21 | 6 |

The comment requests a nonzero starting sensitivity with Quadratic behavior, but does not define a unique equation. Following the user's request to remove the sharp bend, the earlier linear blend was replaced with quintic smootherstep. This creates an S-shaped low-speed transition; the remainder stays Quadratic rather than becoming a single sigmoid. It does not literally combine the Natural and Quadratic functions. No temporal averaging or sample history is introduced. The 5°/s transition and 2 RWS vertical floor were choices made in the original test setup. They remain tuning choices, not values prescribed by the comment.

## Graph corrections

The solid sensitivity lines already followed the native floor calculation. The UI now makes that easier to understand:

- Removed the unrelated, normalised output-speed trace from this sensitivity chart. Its independent scale looked like another sensitivity/live-input curve.
- Added horizontal/vertical/live legend entries and a Sensitivity (RWS) axis label.
- Explained the floor, recovery threshold and location of its controls.
- Clarified that minimum values and drag handles edit the base curve before steadying; handle readouts now show the edited setting instead of the effective floor.
- Fixed a hidden-vertical-line case: differing steadying floors now show both lines even if their base sensitivity ranges match.
- Native and frontend positive-floor calculations now use the same quintic blend. The UI explains its smooth S-shaped recovery, and the comparison image distinguishes the former linear transition from the smooth one.

## Evidence and limits

- Compiled the native curve/helper code and compared 1,008 native/frontend samples, including asymmetric 5→21 and 3→6 axes, multiple floors, thresholds and all curve types.
- Added endpoint slope/curvature checks, 5,000 monotonicity/bounds samples, and exact fast-response comparisons. These checks reject the former corner rather than only comparing two copies of the same formula.
- Loaded a read-only copy of the actual saved Cyberpunk profile into an isolated browser fixture, projected its Steam Controller variant, and compared every plotted SVG point with the independent equation above.
- Verified base-handle readout, floor-only axis differences, Back navigation, and dark/light layouts at 1440×900 and 900×600. Captures and the exact values/hash are under `tmp/cyberpunk-dream-curve/`.
- Production web build, focused zero-warning component lint, existing graph/steadying-editor/gyro-route regressions and scoped whitespace checks passed. Existing production chunk-size/mixed-import warnings remain. The source design detector returned no findings; screenshot inspection and current Web Interface Guidelines review covered the changed graph UI.
- Before the smoothing change, installed app version 0.7.195 matched the former bundled mapper (`90f6d2d1bae68cbd1d2719cf65acbb233514c72e60a87d385378dcb3ac1d3b3b`). The native Release mapper has now been rebuilt and bundled with the new smooth transfer. The installed app remains unchanged; the rebuilt bundle is not installation evidence.

These checks establish source numerical behavior and browser rendering. They do not establish the currently installed mapper binary's behavior, physical-controller feel, Cyberpunk calibration or real-gameplay performance. No installer or saved configuration was changed.
