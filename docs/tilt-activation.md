# Tilt and gyro activation

The Gyro page's **Tilt** section controls gravity-based angle from a neutral
holding position. Gyro controls rotation speed or relative angular travel.
They share the sensors but have independent configuration and activation.

**Set up tilt steering** in the gyro joystick panel is a setup shortcut to the
Tilt section, not a second steering binding. It selects left-stick tilt steering,
enables tilt and disables gyro aiming. Gyro angular deflection remains a distinct
rotation-based joystick mode.

Tilt has the same four activation modes as gyro:

| Editor mode | Native setting |
| --- | --- |
| Always on | `TILT_OFF = NONE` |
| Hold to enable | `TILT_ON = R3` (or another input) |
| Hold to disable | `TILT_OFF = R3` (or another input) |
| Always off | `TILT_ON = NONE` |

`TILT_ON = ALL MISC5 !MISC6` enables tilt while the left Grip Sense is touched
and the right is released. `ANY` needs at least one matching input. These use
the same condition parser as gyro and support native held settings such as
`L,TILT_ON = R3`. The latest local activation assignment wins.

Disabling tilt releases its direction, ring, lean and scroll actions, stops
pending flick output and clears its previous virtual-stick output before
physical sticks and gyro are processed. Resuming cursor-area/hybrid modes
starts from the current sample to avoid applying movement accumulated while
disabled. It preserves tilt bindings and settings, gyro activation, raw sensor
passthrough and the neutral orientation. Existing profiles without tilt
activation settings retain always-on tilt behaviour.

User-facing labels say **Tilt inputs**, **Tilt ring** and **Set tilt neutral**.
Existing native `MOTION_*`, `MUP`/`MDOWN`/`MLEFT`/`MRIGHT`/`MRING`, `LEAN_*` and
`SET_MOTION_STICK_NEUTRAL` commands remain compatible.

Validation: `tests/tilt_activation_regression.cjs`,
`tests/gyro_tilt_tuning_browser_regression.cjs`,
`tests/gyro_steering_browser_regression.cjs`, and
`JoyShockMapper/tests/run_tilt_activation_harness.py`.
Synthetic and renderer checks do not establish physical-controller behaviour.
