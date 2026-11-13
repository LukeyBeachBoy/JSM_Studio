# Azeron automatic native-controller hiding — 0.7.175

Explicitly enrolled Azeron Cyborg keypads (`16d0:12f7` in
`ManagedControllers.txt`) now receive HidHide repair before the mapper launches
and on a five-second reconnect check. This includes the USB XnaComposite XInput
interface, which hiding only HID interfaces previously missed. Discovery uses
PnP ancestry and device class, including new USB-port instance IDs.

The editor/mapper retain access. Keyboard, mouse, configurator, composite-parent
and hub interfaces are excluded, as are unrelated controllers. Existing driver
rules are preserved and unchanged rules are not rewritten. Choosing **Show to
games** persists an automatic-hiding opt-out; **Hide from games** enables it
again. Clearing a stale port entry does not disable repair for connected keypads.

HidHide must be installed; changing its rules needs administrator access. Saved
rules persist through Windows restarts. The app does not elevate silently,
install drivers, change inverse mode, restart hardware/Steam or alter profiles.

Validation: 13 HidHide unit tests; 21 runtime tests; an opt-in live test on the
connected Azeron discovered exactly the two gaming HID interfaces plus the
XInput USB interface, adopted existing rules, reloaded state and verified the
next pass was a no-op. The test restored its temporary allowed-app entry and
original blacklist. A browser test verified automatic-hiding copy and manual
opt-out/opt-in. Physical unplug/replug and a full Windows reboot were not run.
