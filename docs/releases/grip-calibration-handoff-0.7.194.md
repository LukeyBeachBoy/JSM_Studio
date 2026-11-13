# Preserve touch input during calibration handoffs — 0.7.194

Physical circle testing on 0.7.193 exposed a firmware-side pause that ordinary
mapper telemetry timing did not detect: raw touchpad coordinates stayed identical
for roughly 70–80 ms while gyro readings continued. Cyberpunk used grip range 306;
Quick Access and Desktop both used 318. The pause accompanied transitions between
the different calibration values, while Desktop/Quick Access stayed continuous.

The mapper now defers grip calibration writes while either touchpad has contact,
and until both pads have been contact-free for 100 ms. Profile mappings still
switch immediately. On release, the mapper recomputes pending writes from the
currently active profile, so an intermediate held chord's calibration is never
replayed after the user has already returned to the original profile. Profile
values are preserved; only the timing of firmware writes changes.

The native regression covers a continuous gesture across repeated configuration
changes, short contact dropouts, delayed application of the final profile and
avoiding obsolete or duplicate writes. Installed 0.7.194 matched the bundled
mapper hash. The user confirmed that both Quick Access press/release and
Desktop/Gaming slot transitions were smooth during the continuous-circle test.

Steam no longer announces virtual controller hotplug on these transitions: the
0.7.193 output-lifecycle change deliberately retains a neutral virtual pad during
KBM configurations and reuses it when gamepad output resumes.
