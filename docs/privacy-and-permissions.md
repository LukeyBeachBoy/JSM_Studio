# Permissions, drivers and data

Applies to the development source reviewed on 18 October 2026. Older public releases have different launch and installation behavior. This is a behavior inventory, not an independent security audit.

## Administrator access

The app manifest now uses `asInvoker`. Opening from an ordinary Windows session does not itself request elevation. A process opened from an already elevated parent may inherit that access.

| Action | Expected access |
| --- | --- |
| Edit/save configurations; read ordinary controller input | Normal user |
| Ordinary keyboard/mouse mapping to ordinary applications | Normal user |
| Windows startup | Per-user Run entry, normal access |
| Change HidHide device hiding / allowlisting | Administrator |
| Install a kernel driver | Separate administrator approval |
| SendInput to a game running as administrator | Same or greater integrity than the target |
| Windows sign-in / secure desktop | Off by default. Separate confirmation in Settings → Startup → Windows sign-in, plus the optional FakerInput driver; admin mode alone does not enable it |

Microsoft documents the [SendInput integrity-level restriction](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput). Elevation does not fix unsupported game input or anti-cheat restrictions.

**Settings → Startup** offers an explicit administrator restart and an optional request-on-manual-launch preference. The default is off. A restart pauses mapping. Cancelling UAC leaves the existing session running. The replacement process waits for the old process to exit before acquiring the single-instance lock.

Older highest-privilege startup tasks are migrated when Windows permits removal. If migration needs elevation, the app exposes the remaining legacy task and explains the one-time restart. This migration still requires upgrade acceptance testing.

## What Windows is identifying

These are different signals:

- **App name and icon:** resource/installer metadata. They help identify the program visually.
- **Verified publisher:** Authenticode signing with a trusted certificate. A plain publisher string does not provide this.
- **SmartScreen reputation:** a separate Windows assessment. Even a signed new application can receive a warning.

Current app releases are unsigned. The project does not ask you to disable protection. Future signing must cover the shipped executable, relevant helpers and installer, with timestamping and signature verification. Driver vendors' signatures do not sign JSM Evolved.

Checksums detect a mismatch against the published file; they are not a malware verdict or protection against an attacker who controls both the release and checksum.

## Optional system components

| Component | Purpose | Persistence / limitation |
| --- | --- | --- |
| ViGEmBus 1.22.0 | Virtual Xbox 360 / DualShock 4 output | Shared driver; [end-of-life upstream](https://docs.nefarius.at/projects/ViGEm/End-of-Life/); maintenance/replacement decision remains open |
| HidHide | Hide the physical controller from games while allowing the mapper | Hiding and allowlist persist; misconfiguration can hide the controller from JSM too |
| FakerInput | Virtual keyboard/mouse output beyond the normal SendInput path | Shared driver; optional and privileged to install |
| Windows sign-in components | Optional controller access on Windows secure desktop | Separate opt-in workflow with broader access; see [its dedicated documentation](windows-controller-access.md) |

The installer asks before adding missing ViGEmBus/FakerInput drivers, with **No** selected by default. HidHide is a separate action. Removing the app leaves shared drivers in place. Use each driver's own uninstaller when no other software needs it. Any requested reboot belongs to the driver's setup.

## Network and local storage

| Data / action | Destination and trigger |
| --- | --- |
| Controller telemetry | UDP on `127.0.0.1`, between the local mapper and app; not an analytics upload |
| Configurations and preferences | Local files; app settings under the Windows app-data directory for `com.lukeybeachboy.jsmstudio`; configuration libraries can be selected separately |
| Update checks | GitHub latest stable release API at startup and when you choose Check now; prereleases must be found through the README/release page. GitHub receives normal connection information such as IP and user agent |
| View release | Explicit action opens this project's GitHub release page in your browser. The app does not download or execute an installer and stays running |
| Assistant connection/model checks | The provider/endpoint you select when testing or discovering models; a local model can use loopback |
| Assistant requests | Your prompt, conversation history, profile name and current configuration text (up to the implementation's limit) go to the configured provider |
| AI credentials | Windows Credential Manager; non-secret provider choices in local settings. Older plaintext settings are migrated when read successfully |
| Help/provider links | Opened in your browser when selected |

Core editing and mapping need no AI account or online service. A remote provider's retention and pricing are governed by that provider. A local endpoint is only as private as its server configuration. Configuration text can contain personal paths or commands; review it before using a remote assistant or sharing a bug report.

“Telemetry” in the controller code means live local input measurements. It should not be confused with a claim that the application never makes network requests.

## Remaining security work

Before broad promotion: verify the packaged normal-user flow, authenticate release binaries, verify release-link handling and downloaded-file integrity, test driver refusal/reboot/recovery, and review secure-desktop helpers separately. See the [release checklist](release-readiness.md). Do not describe the project as audited, malware-free or universally anti-cheat-safe.
