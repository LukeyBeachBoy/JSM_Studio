# Individual controller layouts — 0.7.164

The Buttons page, navigation tabs, modifier choices, input capture and live previews follow the selected controller. Unsupported bindings remain in the game file for other controllers without appearing as editable physical inputs. Common gamepad controls retain their semantic commands (face positions, Guide, Menu, View) across glyph families. Cyborg numbered buttons remain a separate input namespace.

A visible controller selector distinguishes connected devices, including two of the same model. Identify listens for a button press without navigating the UI. Disconnecting the selected controller keeps its layout selected for offline editing; another connected controller cannot supply its live input.

Configuration precedence is shared game settings → model layout → physical controller layout. Physical layouts use `# @controller type-24-device-<identity> KEY = value` rows in the same game file. For example, one Steam Controller can inherit gyro sensitivity while another overrides it to zero. Bindings, settings, layer definitions and generated layer files remain scoped independently. Hold-to-swap temporarily masks only that controller and returns to its own layout.

Identity derives from the driver's serial and device path, not enumeration order. Where firmware exposes a receiver/port identity rather than a unique controller serial, keep that controller on the same receiver/port. Devices without either identifier receive a session-only identity; their settings are never guessed onto another device after restart. The short identifier displayed in the selector distinguishes otherwise identical names.

Closing a binding panel with Escape, its backdrop, or its close button preserves the underlying page, scroll and focus. A subsequent page-level Back retains normal navigation.

Validation:
- Native setting/chord scope regression covers two identical models with different values and changed logical handles.
- Frontend serialization/projection tests preserve shared and model layouts while editing one physical device.
- Browser tests cover filtered Cyborg controls, distinct same-model bindings, Identify, disconnect/reorder isolation, model layouts, and panel dismissal.
- Rust tests cover device-specific layer projection and selecting the controller that opened an overlay menu.
- Two identical physical controllers and actual local multiplayer gameplay have not been available for hardware validation.

The separate Steam Controller charging-puck wake report was not reproduced during a controlled restart of 0.7.163: a passive receiver monitor recorded no controller input reports. No wake fix is claimed by this release; confirmation of the docked condition is pending.

Installed acceptance:
- Silent installer exited successfully; installed version is 0.7.164.
- Installer SHA-256: `DA3BD7A14651321E6B77C6D1A5E4598DB0EFC9D2B1AE279D0E93C801F30776CE`.
- Installed mapper, SDL and recovery helper hashes match the packaged files.
- Live installed Cyborg identity `type-25-device-15396090e6767cd4` remained stable. A temporary isolated profile with outputs disabled verified physical-device override precedence over model settings in 264 telemetry samples, then restored AppNavigation.txt. Native status was active; no configuration errors were reported.
- Azeron store.db and Cyberpunk.txt remained byte-for-byte unchanged before/after installation and the live check.
- Rust suite: 187 passed, 1 ignored. Native context and frontend layout/serialization regressions passed. Browser regressions passed for physical-device selection, model layouts, ring/rotation/vectors, and all three binding-panel dismissal methods.
- Steam Controller remained absent from telemetry after the installation restart. The earlier charging-puck wake report still needs confirmation of the docked condition.
