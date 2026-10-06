# Credits attribution notes

The in-app list is a thank-you, not an exhaustive contributor register or a replacement for dependency licences. Content is stored in `src/data/credits.ts` with English and Simplified Chinese copy in the existing translation resources. All research was checked on 2026-10-03.

## Project lineage and people

- [JoyShockMapper upstream credits](https://github.com/Electronicks/JoyShockMapper#credits), also bundled in `JoyShockMapper/README.md`, identify Julian “Jibb” Smart as its creator and Nicolas Lessard (Electronicks) as lead developer since v3. The same section credits Bryan Rumsey, Contributer, Sunny Ye, Romeo Calota, Garrett and Robin. These upstream art/translation contributions are acknowledged as upstream work, without claiming that the Evolved branding is theirs.
- [Upstream changelog](https://github.com/Electronicks/JoyShockMapper/blob/master/CHANGELOG.md), also present in the root `CHANGELOG.md`, credits Roy Straver for flick stick options, TauAkiou and mmmaisel for Linux work, and Nielk1 for trigger effects. `TriggerEffectGenerator.cpp` retains Nielk1's original copyright notice.
- [Evan McLean's profile](https://github.com/evan1mclean) and [JSM Custom Curve](https://github.com/evan1mclean/JSM_custom_curve) establish the Custom Curve author. Its [v2.1.0 release notes](https://github.com/evan1mclean/JSM_custom_curve/releases/tag/v2.1.0-jsm-gui) explicitly credit ceski for controller additions; [ceski-1](https://github.com/ceski-1) publishes that username. Local git history contains Evan McLean / evan.mclean and ceski commits.
- [hotuns/JSM_Studio README](https://github.com/hotuns/JSM_Studio) documents the Studio fork of Custom Curve, Tauri migration, mapper bundling and HidHide integration. [hotuns](https://github.com/hotuns) publishes Hotuns as the display name; no real-world identity is inferred.
- The local repository remote and git history establish [Luke Beach / LukeyBeachBoy](https://github.com/LukeyBeachBoy/JSM_Studio) as the developer of this Evolved fork. Generic git author labels such as root and automated-agent labels are not treated as human identities.

## Material dependencies and research

- `JoyShockMapper/JoyShockMapper/CMakeLists.txt` directly selects SDL3, JoyShockLibrary, ViGEmClient, GamepadMotionHelpers, magic_enum (jamek fork), pocket_fsm (Electronicks fork), and optional Catch2 tests. Upstream README describes older SDL2 releases; the Credits wording deliberately uses SDL without assuming the current build uses SDL2.
- `src-tauri/third_party`, driver preparation scripts and HidHide integration establish ViGEmBus and HidHide use. Credit is to [nefarius and project contributors](https://github.com/nefarius), without guessing individual identities.
- The local `JoyShock.h` contains OneEuroFilter and LowPassFilter1E, used for gyro and touchpad processing. The [original 1€ Filter research page](https://gery.casiez.net/1euro/) attributes the algorithm to Géry Casiez, Nicolas Roussel and Daniel Vogel. Credit is for the algorithm, not a claim that a particular third-party implementation was copied.
- Frontend `package.json` / lockfile and `src-tauri/Cargo.toml` / lockfile establish React, Tauri, Radix UI, i18next/react-i18next, Iconify, Lucide, Game Icons, react-markdown/unified, Vite, TypeScript, Serde and reqwest. Other dependencies and their maintainers are covered by the non-exhaustive acknowledgement.
- Bundled `src/assets/fonts/Geist[wght].woff2`, `GeistMono[wght].woff2` and `OFL.txt` establish Geist usage. The [Geist upstream project](https://github.com/vercel/geist-font) provides attribution to Vercel and its collaborators.
- [GyroWiki](http://gyrowiki.jibbsmart.com) is referenced throughout the bundled mapper documentation for gyro guidance and calibration/configuration sharing.

## Attribution limits

Garrett, Robin and Contributer retain the exact names published in JoyShockMapper's acknowledgements; their fuller identities and profile URLs were not confidently established. Hotuns and ceski retain published usernames. John “Nielk1” Klein is identified by the copyright header in the bundled TriggerEffectGenerator.cpp. Entries with several contributors link to the upstream acknowledgements or changelog, rather than invented personal profiles. Library credits name projects and contributor communities where individual authorship is distributed. Private/unpublished contributions cannot be enumerated. Original licence and copyright notices remain authoritative.
