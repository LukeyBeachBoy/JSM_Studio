# Manage only selected controllers

The SDL mapper supports `ManagedControllers.txt` in its runtime directory
(`%APPDATA%/com.lukeybeachboy.jsmstudio/jsm-runtime` for JSM Evolved).
When this file exists, only its listed USB vendor/product pairs are opened and
remapped. Unlisted devices cannot inherit the active profile or create a virtual
controller. Selection persists through profile changes and reconnects.

Example for Steam Controller 2026, including USB, Bluetooth and both dongles:

```text
# Explicitly managed controller models (hexadecimal VID:PID)
28de:1302
28de:1303
28de:1304
28de:1305
```

Restart the mapper after editing the file. Add another device's VID:PID only when
you intend JSM to manage it. This selects hardware models, not individual units
of the same model. Listing a device in the discovery UI does not enroll it.
An empty or malformed file manages no devices; an absent file retains the legacy
behavior for existing standalone users. The file is independent of profiles and
StudioDefaults, so profile saves do not overwrite the selection.
