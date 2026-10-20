# Unsigned prerelease status — 20 October 2026

**0.7.155 is available for early Windows testing.**
[Download and release notes](https://github.com/LukeyBeachBoy/JSM_Studio/releases/tag/v0.7.155) ·
[CI build](https://github.com/LukeyBeachBoy/JSM_Studio/actions/runs/39443880940) ·
[Detailed validation and limits](releases/0.7.155.md).

- [x] Sign-in input Off by default, separate confirmation, native consent
  enforcement, held-button protection and reset-to-Off behavior.
- [x] Update actions open a validated GitHub release page; no installer execution.
- [x] Matching mapper source published and pinned in the public app repository.
- [x] Linux controller/editor regression CI and Windows build/backend/consent CI.
- [x] Unsigned NSIS prerelease built from a clean GitHub checkout, with installer
  checksum and exact source revisions attached to the release.
- [x] Public README screenshots, project history, comparison, permission guidance
  and direct prerelease link match the download.
- [ ] Fresh install, upgrade/uninstall, driver approval/refusal and native UAC
  checks on the exact public installer.
- [ ] Physical-controller/game and lock/unlock acceptance, with model/firmware/
  transport recorded separately for each controller.
- [ ] Outside setup feedback and a short real-controller demonstration before a
  broad Reddit launch. A targeted request for early testers must retain the
  unsigned/experimental status and these limitations.

The release's **SHA256SUMS.txt** and **SOURCE-REVISIONS.txt** identify the public
artifact. Earlier local 0.7.155 installers are superseded; their hashes are not
checksums for the public download. Browser tests and README screenshots use sample
input and do not establish physical-controller or installer acceptance.

The plan below is retained as a historical audit trail. Its original findings
refer to the state before publication; the checklist above is the current status.

---

# Reddit release plan — rechecked 20 October 2026

**Decision: not ready for a broad “download it now” introduction yet.** The recent editor work is meaningful, and the normal-access manifest is present in the installed executable. The remaining work is principally release consistency, two permission/update behaviors, and testing the exact installer people will download. Aim first for a clearly labelled Windows testing release.

This section supersedes the 18 October status below. This pass inspected current source, public GitHub, local artifacts and existing screenshots, and reran selected tests. It did not install a package, exercise a physical controller, push source or publish a release.

## What changed since the previous pass

- Mode-shift editing now shares more of the normal stick, trigger and trackpad controls. Mouse-area selection and inherited settings have received focused fixes.
- The editor distinguishes the configuration being edited from the one actually live. Controller-driven profile selection and overlay updates have received further work.
- The installed app executable now matches the current built executable, both version **0.7.154**. Its manifest requests `asInvoker`, so mandatory elevation is no longer embedded in that executable.
- The public repository description and Issues are already corrected/enabled. Do not spend another pass fixing those.

| Surface checked | Current evidence | Consequence |
| --- | --- | --- |
| [Public repository](https://github.com/LukeyBeachBoy/JSM_Studio) | Public README still links downloads to `hotuns/JSM_Studio` and describes running as administrator | A visitor still sees the old trust and positioning problems |
| [Latest public release](https://github.com/LukeyBeachBoy/JSM_Studio/releases/tag/v0.7.22) | v0.7.22, published 10 September | The new UI and permission changes are not the public download |
| Local README | Purpose, audience, lineage, screenshots, comparison and trust FAQ are drafted | Good starting point; needs to match a tested release before promotion |
| Installed and built app executable | 0.7.154; identical SHA-256; modified 20 October, 13:25 UTC; unsigned | Confirms executable parity, not a complete installation or bundled mapper validation |
| Newest local installer | Also 0.7.154; modified 18 October, 17:57 UTC; unsigned | Same version conceals different build dates; it cannot establish that today's fixes are packaged |
| Public CI | Latest inspected run failed compiling `input_guards_harness.cpp`, with missing haptic fixture declarations | Local repaired harnesses pass, but public green CI still needs the corresponding source |
| Working trees | Extensive uncommitted app and mapper changes | Select and review release contents; do not sweep personal tooling and generated files into a release commit |

Artifact identifiers recorded during this pass:

```text
Installed/built JSM Evolved.exe 0.7.154
SHA-256 1ff7662ac0f4d02bcaab3411ade907f32bc7b6b2be47e0c4677af89064285f65

18 October JSM Evolved_0.7.154_x64-setup.exe
SHA-256 6169bda69d0e8380aa2d02e1ef90d4942f7d61f700fbba15a35cfbe50a997a85
```

## Ordered changes before posting

### 1. Resolve the two trust behaviors before freezing a candidate

**Make Windows sign-in genuinely opt-in, or leave it out of this release.** The documentation and permission screen call it a separate choice. In the inspected source, runtime seeds `Windows Sign-in.txt`; the mapper callback calls `captureWindowsSignIn`; and that function sends restricted key input while locked whenever `VirtualHidInput::available()` succeeds. No separate user enable setting gates that path. A driver already installed by another application can satisfy availability.

Add an off-by-default preference enforced in the native path, explain its scope before enabling, and make disabling it release held state. Include upgrade defaults and an already-present driver in the tests. The existing parser restricts keys and the code explicitly avoids logging PIN sequences; this finding is about consent and behavior matching the documentation, not evidence of credential collection.

Source: `src-tauri/src/runtime.rs`, mapper `src/main.cpp`, `src/win32/WindowsSessionInput.cpp` and `src/win32/VirtualHidInput.cpp`.

**Stop executing unverified downloaded updates.** `src-tauri/src/services/updates.rs` currently downloads an installer to a predictable temporary filename, launches it and exits the app, without verifying a signature or digest. For the first testing release, the smallest useful change is to open the project's release page instead. A later automatic updater should verify authenticated artifacts, stage them safely, and keep the app running on failure or cancellation. Publishing a checksum is useful for checking a download, but does not by itself authenticate its publisher.

**Done when:** ordinary mapping remains available without either advanced feature; sign-in cannot activate without its own consent; the update button either opens the release page or uses a verified update path.

### 2. Freeze and build one traceable candidate

Review the intended changes in both repositories, publish the mapper revision first, and then pin it in the app. Use a new version after 0.7.154 so today's installed binary cannot be confused with the older installer. Build the entire package from those committed revisions, including the mapper and native helpers.

Add the recent mode-shift, mouse-area and chord-profile regressions to CI. Include the relevant browser checks for live-profile/overlay transitions and shared mode-shift controls in candidate validation. The existing controller workflow does not cover all these newer regressions.

**Done when:** public CI is green for the exact app/mapper revisions; a fresh checkout builds the candidate; release notes record both revisions and the installer hash. Do not reuse old release notes or an existing same-version artifact.

### 3. Validate the download-to-first-game experience

Test the exact candidate installer in a clean Windows account or VM, then test real input on hardware:

| Journey | Required result |
| --- | --- |
| Fresh install, decline optional drivers | Installation completes clearly; normal launch has no UAC; first setup explains which outputs remain available |
| Approve/cancel driver setup; driver already present | State and recovery instructions are accurate; optional-driver failure does not leave an unexplained half-working app |
| Administrator restart, accept and deny | Denial preserves the session; acceptance leaves one app/mapper; normal startup remains the default |
| Upgrade and Windows startup | Profiles survive; legacy elevated tasks migrate correctly; sign-in startup/tray preferences behave as described |
| Basic controller flow | Detect controller, choose a starter profile, change one binding, apply, test in a game, and return to editing without a stale live-profile label |
| Mode shift, trackpad and overlays | Shared settings survive edits; correct profile is live; focus, scrolling and overlays remain usable at the minimum supported window size |
| Driver/HidHide combinations | Test with and without relevant drivers, normal/elevated target apps, and one active mapper; document duplicate-input recovery |
| Uninstall/reinstall | App startup entries are removed; shared drivers are preserved; profile retention/removal is clear |
| Windows sign-in, if included | Explicit enable/disable, lock/unlock, held buttons, disconnect/reconnect and key release work; no sensitive input enters logs or telemetry |

Record controller model, firmware, connection, Windows version, candidate version and result. At minimum, validate the exact controller/transport demonstrated in the post. Mark other combinations untested; distinguish Steam Controller 2015 from 2026. A clean VM cannot prove controller behavior.

**Done when:** a new tester can reach a working mapping without guessing about permissions or drivers, and the release notes name the combinations actually tested.

### 4. Finish the public presentation using that candidate

The local README already has the requested comparison table and a sensible explanation of the audience. The public page still does not deliver them. Finish these specific details:

- Lead with one clear use case: JSM aiming and editable profiles in a visual, controller-friendly editor. Follow with a short, true personal origin paragraph; confirm the author's actual experience rather than inventing an anecdote.
- Replace development-preview caveats with accurate candidate status once appropriate. Use three readable screenshots of the actual candidate: configuration overview, a distinctive trackpad/mode-shift workflow, and an in-game overlay. Keep sample-data images labelled if retained.
- Record a short, uncut real-controller demonstration. Show the change and its result, with the tested controller/connection identified. This is stronger evidence against “AI slop” than extra badges or adjectives.
- Keep the existing ☑️ / ◐ / ❌ comparison, including Steam Input's advantages. Recheck the linked primary sources before publication; do not add speculative negative columns for reWASD or DS4Windows. State the specific reason to switch, without claiming universal superiority.
- Make Windows-only, controller coverage, driver requirements, Steam coexistence, mixed mouse/gamepad limitations, optional AI/data handling and unsigned/signed status easy to find.
- Use a direct link to the new candidate release. GitHub's `/releases/latest` can continue pointing at an older stable release when the new build is a prerelease.
- Publish the issue templates and a short known-issues list. Ask reports to include version, controller/transport and reproduction steps.

**Done when:** an unauthenticated visitor sees matching screenshots, claims, download version, setup instructions and support links. No inherited download links remain.

### 5. Choose signing deliberately, then publish a testing release

The app and installer are still **NotSigned**. Product metadata and the icon improve identification but cannot remove “Unknown publisher” by authenticating the author.

For the polished public launch described in the original brief, obtain trusted Authenticode signing and timestamp the installer and owned executables; verify their signatures and observe SmartScreen on the final download. Signing is not a guarantee that SmartScreen will never warn.

An explicitly **unsigned early-testing release** is a reasonable narrower launch if that limitation is prominently disclosed. Signing is therefore a launch-scope decision rather than an absolute technical requirement for asking a small group to test. Do not advise disabling Windows protection or describe an unsigned prompt as authenticated.

Publish the matching source, candidate, checksums, notes and test matrix. Download it through the public page in an unauthenticated session and repeat the first-run smoke test. Have one to three people unfamiliar with the app try setup before inviting a larger audience.

**Done when:** the public download passes the recorded checks and outside testers can follow the instructions. The Reddit post identifies development status, actual hardware coverage, lineage and limitations, and asks for specific feedback.

## Fresh validation in this recheck

| Check rerun on 20 October | Result |
| --- | --- |
| TypeScript `tsc --noEmit` | Passed |
| Rust library tests | 177 passed, 1 ignored, 0 failed |
| C++ touch regression harness | All 12 harnesses passed |
| Mode-shift and mouse-area regression scripts | Passed |
| Applied-profile and chord-profile-adoption regression scripts | Passed |
| Current built executable manifest/signature | `asInvoker`; unsigned |
| Installed/built executable comparison | Matching version and SHA-256 |

These are source checks and artifact inspection. Browser regression scripts, clean installation, UAC interactions and physical controller tests were **not rerun in this pass**. Existing screenshots were reviewed; they do not substitute for fresh native acceptance. No new production build or installer was produced.

The inspected public failure is [Controller regression checks, 9 October](https://github.com/LukeyBeachBoy/JSM_Studio/actions/runs/37887830730). Its stale fixture failure should not be described as a new failure in today's tested source.

## Work that can wait

A Linux port, exhaustive competing-product matrix, support claims for every controller, a broader feature set and latency marketing are not prerequisites for a focused Windows testing post. Resolve the mismatches above, package the improvements already made, and make the first-use experience credible.

---

# Historical baseline — 18 October 2026

The following records the earlier pass. Its version, artifact and priority statements are historical; use the plan above for current release decisions.

Updated 18 October 2026. This records evidence for the current working tree, not a claim that the public download has caught up.

## Completed in this readiness pass

- [x] Replace the inherited README with purpose, audience, project lineage, actual UI screenshots, feature comparison, compatibility limits, and answers about AI, Linux, drivers and trust.
- [x] Correct download links to this fork and explicitly identify the older public v0.7.22 release.
- [x] Add setup, permission/privacy and current release documentation.
- [x] Enable GitHub Issues and correct the public repository description; add local bug/feature templates.
- [x] Change the application manifest to normal access and remove automatic elevated startup-task creation.
- [x] Add first-run permission guidance, optional elevated manual launch and explicit administrator restart.
- [x] Preserve a running session on denied elevation; wait for the previous process during an accepted restart.
- [x] Explain legacy startup-task migration and remove the per-installation Run entry on uninstall.
- [x] Ask before installing missing ViGEmBus/FakerInput drivers, with No as the default.
- [x] Open HidHide installers/configuration through explicit Windows elevation from a normal session.
- [x] Add publisher metadata; inspect the compiled app's embedded icon and normal-access manifest.
- [x] Make future release builds draft prereleases, add Windows Rust tests, checksum attachments and exact app/mapper revisions, and remove reused v0.7.22 release notes.
- [x] Repair stale touch/grip test fixtures without changing production input behavior.

## Evidence obtained

| Check | Result / scope |
| --- | --- |
| Production frontend build | Passed TypeScript and Vite; existing bundle-size warnings remain |
| Rust library tests | 177 passed, 1 ignored; no failures |
| Touch harness | All 12 compiled C++ harnesses passed |
| Remaining controller workflow checks | SDL patch, touch integration, grip harness, firmware assertions and five JS regression scripts passed locally |
| Browser preview | Welcome-to-settings navigation; opt-in persistence across reload; default normal access; explicit restart confirmation; 900 px minimum layout examined |
| Local installer | Built `JSM Evolved_0.7.153_x64-setup.exe`, 17.6 MiB; not installed in this pass |
| Embedded executable | `asInvoker`, JSM icon, product JSM Evolved, company Luke Beach, version 0.7.153 |
| Authenticode | **NotSigned** |
| Public GitHub CI | Has not run these local changes; prior public failures remain until source is published and CI reruns |

Installer SHA-256:
```text
2a09150a784c2f4bf9e3334bda4d8b0938ee85271779339b90be769560d0d2f3
```

Screenshots in `docs/images` come from the actual browser renderer using its sample configuration mode. They are not a recording of a physical controller or proof of a successful Windows install.

The installer includes the other existing changes in this working tree. The normal-user change affects mapper access, HidHide and optional secure-desktop paths, so the earlier installed-app tests cannot stand in for tests of this package.

## Release blockers

| Priority | Remaining work | Acceptance evidence |
| --- | --- | --- |
| P0 | Test fresh install and upgrade on Windows | No UAC for ordinary launch; correct icon/name; config persistence; optional-driver refusal does not break basic mapping |
| P0 | Exercise administrator restart | Accept and deny Windows consent; exactly one app and mapper afterward; saved state retained; launch preference off/on; no prompt loop |
| P0 | Test Windows startup and migration | Fresh account; old JSM Studio and JSM Evolved tasks; standard/admin accounts; restart; tray preference; uninstall removes only this app's Run entry |
| P0 | Validate input without full-time admin | Physical controller, normal game, elevated game, with and without FakerInput; HidHide already configured versus first setup; no duplicate input |
| P0 | Publish a matching source/release candidate | Commit mapper changes and make that submodule revision available before updating the app pointer; successful public CI; download links, notes and screenshots match actual artifact |
| P0 | Decide and implement release signing | Trusted Authenticode certificate, timestamping and verified signatures for shipped binaries/installer; independently assess SmartScreen behavior |
| P0 | Review updater authenticity/staging | Verify downloaded artifacts before execution; validate release/asset selection and safe staging; deny/fail without closing the app |
| P1 | Test optional drivers and recovery | Accept/decline/cancel; already installed; requested reboot; HidHide recovery; app uninstall preserves shared drivers |
| P1 | Review ViGEmBus dependence | Document EOL exposure and replacement/maintenance strategy; keep virtual-gamepad limitations visible |
| P1 | Repeat secure-desktop acceptance | Explicit opt-in; lock/unlock; device removal; stuck-key recovery; no sensitive capture/log leakage; separate from ordinary mapping |
| P1 | Publish controller/transport matrix | Record hardware, firmware, connection, Windows/game/app version and result; distinguish supported code from physically tested combinations |
| P1 | Record one real demonstration | Uncut install/first configuration/gameplay example, including a limitation; no fabricated performance claims |
| P1 | Check support and language polish | Templates visible after publish; current UI terms; translations for new permission copy; known-issues list reflects the candidate |

Code signing is an external credential/provisioning task. Metadata and a local certificate are not substitutes for a publicly trusted publisher identity.

## Reddit post preparation

Once the release gates are met, keep the post specific:

1. A short real-controller clip showing the problem and useful result.
2. Who it helps: people who want JSM's engine/text profiles in a visual controller-friendly editor.
3. What comes from upstream, with explicit credits.
4. Windows-only and unsigned/signed status as actually shipped, plus optional drivers.
5. A concrete request for testing particular controller/connection combinations.

Avoid “better than Steam Input,” “zero latency,” “supports everything,” or “completely safe” without the corresponding evidence. The project is more credible when its limits and download state are easy to find.

No Reddit post, release publication, or source push occurred in this readiness pass. Public changes were limited to the repository description and enabling Issues.
