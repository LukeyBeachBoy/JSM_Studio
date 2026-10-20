# Releases and in-app updates

The current app checks [this fork's GitHub releases](https://github.com/LukeyBeachBoy/JSM_Studio/releases) at startup and when Check now is selected. **View release** opens the release page in your browser. Read its notes and choose a download there; the app stays running and does not download or execute an installer. The implementation is `src-tauri/src/services/updates.rs`.

This is **not** the Tauri signed updater protocol. `createUpdaterArtifacts` is false; the current workflow does not publish `latest.json` or updater signatures. App Authenticode signing remains separate, unfinished work.

The release workflow builds a **draft prerelease**, after controller regression checks and Windows Rust tests. It attaches:

- the Windows x64 NSIS setup executable;
- `SHA256SUMS.txt`, calculated from the uploaded installer;
- `SOURCE-REVISIONS.txt`, identifying app/mapper commits and the workflow run.

The version tag must match the app's configured version. The draft description deliberately asks the maintainer to supply version-specific changes and completed acceptance checks. It must not be published unchanged.

A checksum proves correspondence with the file listed by the release, not publisher identity or absence of malware. Automatic installation has been removed pending an authenticated updater design. Release links are restricted to this project's HTTPS release pages; invalid destinations fall back to its releases listing.

GitHub's latest-release endpoint does not offer draft/prerelease candidates as stable upgrades. A tested prerelease needs a deliberate download; promoting a release is a separate maintainer decision. Starting in 0.7.156, Startup settings labels this as a stable-release check and provides **Browse all releases** for preview downloads.

See [release readiness](release-readiness.md) before promoting anything.
