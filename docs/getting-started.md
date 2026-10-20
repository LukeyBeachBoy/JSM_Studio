# First setup

This guide describes the [0.7.155 Windows prerelease](https://github.com/LukeyBeachBoy/JSM_Studio/releases/tag/v0.7.155). It is unsigned testing software. The older stable v0.7.22 JSM Studio installer predates this interface and these permission choices. Read the [test status and limitations](releases/0.7.155.md) and back up your library before upgrading.

## 1. Choose the download

Use [LukeyBeachBoy/JSM_Studio releases](https://github.com/LukeyBeachBoy/JSM_Studio/releases). Download the Windows x64 setup executable. Source archives are for building, not installing. Back up existing configurations before upgrading.

App binaries are currently unsigned. A Windows “Unknown publisher” label reflects that; changing the app's logo or file metadata cannot make it a verified publisher. Do not disable antivirus or UAC. If you are uncomfortable installing an unsigned build, wait for a signed release.

## 2. Choose only the drivers you need

The new installer asks before installing missing ViGEmBus or FakerInput drivers. Both choices default to **No**, including unattended installation. Already installed shared drivers are left alone.

| Component | When you need it | What happens |
| --- | --- | --- |
| ViGEmBus | Output as a virtual Xbox 360 / DualShock 4 controller | Separate administrator approval; shared driver remains after app uninstall |
| FakerInput | Advanced virtual keyboard/mouse output, including the optional sign-in workflow | Separate administrator approval; shared driver remains after app uninstall |
| HidHide | Games see both the real and virtual controller, causing double input | Separate in-app setup; hiding/allowlisting needs administrator access |
| None of these | Ordinary keyboard/mouse mapping to ordinary Windows applications | Uses Windows input APIs |

Declining a driver limits the corresponding output, not configuration editing. The app's installation directory contains the ViGEmBus and FakerInput installers under `third_party` if you decide to add them later. HidHide setup is under **Settings → Hide the real controller**. ViGEmBus is no longer maintained upstream; see [permissions and dependencies](privacy-and-permissions.md).

Keep a mouse and keyboard available during first setup. Do not start with Windows sign-in or secure-desktop features; get ordinary game input working first.

Controller input on the Windows lock screen is Off by default, even if FakerInput
is already installed. If you later want it, review and confirm **Settings → Startup
→ Windows sign-in**. You can turn it off there without restarting the app.

## 3. Make one simple configuration work

1. Open JSM Evolved normally. The welcome screen explains permissions and links to **Settings → Startup**.
2. Connect the controller and choose it in the controller settings. Check that the input view responds.
3. Choose or create a configuration from **Library**. Begin with a few keyboard/mouse bindings or a simple gamepad configuration if its driver is installed.
4. Test the controls, then use **Save** to retain edits. Applying a configuration and saving a file are separate operations.
5. Start the game and test its menus and aiming. Add an automatic game rule after the basic configuration works.

Keep Steam Input or another mapper from simultaneously mapping the same controller while testing. If two actions occur for one press, check competing mapping and real/virtual device visibility before changing sensitivity.

For Steam imports, read the conversion review before creating files. “Approximated” means you should test it; “Not converted” means it needs replacement. See [import coverage](steam-layout-import.md).

## 4. Use admin only for a specific reason

**Settings → Startup → Restart as administrator** explains the interruption and asks Windows for approval. Save or discard pending configuration changes first. Cancelling Windows approval leaves the existing session running.

**Request admin on launch** is off by default. Enabling it affects fresh manual launches; **Start with Windows** remains a normal-access launch. Opening a second copy focuses the already-running app, so use the explicit restart control to change that session's privileges.

Use the same Windows account. Supplying a different administrator account opens that account's separate settings and library. To return to normal access, turn the launch preference off, quit from the tray, and reopen normally.

An older installation may have created a privileged scheduled startup task. The app attempts to migrate it to normal startup. If removal needs permission, Startup explains the one-time administrator restart required.

## Troubleshooting and removal

- **Works on desktop, fails in one game:** check whether the game is elevated, whether it accepts your output mode, and whether another mapper is active.
- **Controller disappears:** use HidHide's configuration tool to undo hiding or correct the mapper allowlist. Closing JSM does not automatically undo a driver setting.
- **No virtual controller:** verify ViGEmBus installation and finish any requested reboot.
- **No gyro:** confirm the controller and its connection mode expose motion data.
- **Uninstall:** quit the app from the tray and use Windows Installed apps. Shared drivers require their own uninstall entries; do not remove a driver another mapper needs. Back up your library before manually deleting app data.

[Report a reproducible issue](https://github.com/LukeyBeachBoy/JSM_Studio/issues/new/choose), with the app version, controller, connection and output mode. Do not attach unreviewed logs containing private information.
