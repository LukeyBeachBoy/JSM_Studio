# Building a Windows installer

From the repository root, double-click **build-installer.cmd**, or run:

```powershell
.\build-installer.cmd
```

The window stays open so you can read the result or any error. The script works
regardless of your current directory. No administrator terminal is needed.

For a terminal command that exits without waiting for a key:

```powershell
node scripts/build-installer.mjs
```

## One-time setup

- Windows x64 and **Node.js LTS with npm** (Node 22.12 or later). Enable the
  installer's PATH option, then reopen your terminal.
- **Git for Windows**, available on PATH.
- **Rust** installed through rustup, with the Windows x64 MSVC toolchain.
- **Visual Studio 2022 or newer / Build Tools**, with **Desktop development with
  C++**, MSVC, and the Windows SDK.
- **CMake 3.28 or newer**, available on PATH (the native build scripts can also
  locate CMake bundled with supported Visual Studio Community installations).
- Internet access to restore npm, Cargo, CMake dependencies, the pinned ViGEmBus
  installer, and Tauri packaging tools when they are not cached.

For a fresh clone, initialize the pinned JoyShockMapper source once:

```powershell
git submodule update --init --recursive
```

## What gets built

The script builds the files **currently on disk**, including saved, uncommitted
changes from you or an assistant. Save your work first and avoid editing source
files during a build. It does not pull remote changes, change branches, commit,
publish a release, or run the installer. Update source separately when wanted;
see [the JoyShockMapper workflow](joyshockmapper-upstream.md).

1. Checks Git/Rust availability and version consistency.
2. Runs `npm ci` using `package-lock.json`. This replaces `node_modules` so frontend
   dependencies match the lockfile; it does not upgrade dependency versions.
3. Runs the existing Tauri release build, whose `beforeBuildCommand` verifies the
   pinned ViGEmBus package, compiles JoyShockMapper with SDL, copies its executable
   and SDL3 runtime into the bundle, rebuilds the console injector, and builds the
   TypeScript/Vite frontend.
4. Compiles the Rust/Tauri backend and packages the application, native binaries,
   HidHide resources, and ViGEmBus into an NSIS `.exe` installer.
5. Checks that a fresh installer was produced and writes a `.sha256` file beside
   it. The final output prints the full path, size, and SHA-256 hash.

The C++ and Rust compilers use their normal incremental caches: unchanged objects
can be reused, while changed sources are rebuilt. No stage is skipped by default.
The bundled mapper is this checkout's SDL implementation.

## Output and versions

The installer and checksum are written to:

```text
JSM_GUI/jsm_gui_tauri/src-tauri/target/release/bundle/nsis/
  JSM Studio_<version>_x64-setup.exe
  JSM Studio_<version>_x64-setup.exe.sha256
```

By default the current version is kept; rebuilding the same version replaces its
installer and checksum. To assign a new version:

```powershell
.\build-installer.cmd --version 0.7.77
```

`--version X.Y.Z` updates `package.json`, both root version entries in
`package-lock.json`, `tauri.conf.json`, `Cargo.toml`, and the app entry in
`Cargo.lock`. These edits remain even if a later build stage fails; review them
with your other source changes. Choose a higher version for a distinct update.

For a quicker repeat build **only if dependencies have not changed**:

```powershell
.\build-installer.cmd --skip-install
```

This skips only `npm ci`; frontend, native code, Rust, and packaging still run.
Run without the option after changes to either npm package file.

## Troubleshooting

- **Node.js/npm not found:** install Node.js LTS with npm and reopen the terminal.
  The launcher requires Node.js on PATH.
- **JoyShockMapper submodule not initialized:** run the initialization command
  above. Existing local submodule edits are built as they are.
- **CMake/compiler/Windows SDK missing:** install the C++ workload and CMake;
  a Visual Studio Developer PowerShell can help with custom toolchain setups.
- **Version files disagree:** rerun with `--version X.Y.Z` to synchronize them.
- **Dependency download blocked:** restore network access and rerun. The driver
  checksum check remains enabled.
- **TypeScript, C++, or Rust compile error:** the build stops with a nonzero exit
  code. Fix the reported source error and rerun; an older installer is not a
  successful result of that attempt.
- **Locked output file:** close any locally running development executable or
  installer using the build output, then rerun.

The wrapper normalizes Windows environment variable casing to avoid MSBuild's
duplicate `Path`/`PATH` error and includes the standard Windows PowerShell modules
so `Get-FileHash` can verify dependencies.

A successful build verifies compilation and packaging. Install and launch the
result separately to check upgrades, driver installation, and controller behavior.
