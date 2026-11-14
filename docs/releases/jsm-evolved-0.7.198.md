# JSM Evolved 0.7.198

Both gyro Sensitivity views now place horizontal and vertical steadying floors, cutoff speed and recovery threshold beside the response graph. The Filters view shows signed horizontal and vertical motion before and after smoothing on aligned time and value scales. Pause retains the sample window so changing a filter setting updates the comparison against the same input.

The Windows installer `JSM Evolved_0.7.198_x64-setup.exe` is 18,720,158 bytes. Its SHA-256 is `657631B6786F48859B25575CC642159F3D8982600592387521FFB4D32CA2EB70`. Its product and file versions both read `0.7.198`.

The build used native mapper commit `2724d4bbfe57a060de609a87c29d4fcaad112a01`. All four native bundle resources matched their build outputs. All 739 frozen source files matched after packaging, and the desktop executable contains the names of all 38 generated JavaScript assets.

The smoothing comparison, both Sensitivity surfaces, graph updates, settings routes, scoped edits and 1,008 native/frontend parity samples passed. Browser checks used simulated controller input. Installed-app and physical-controller testing remain open.

A supplemental controller navigation audit found that pressing Left on some Rumble preset cards jumps to the group list and skips a nearer card at desktop and compact widths. The cause and the first affected version are unverified.
