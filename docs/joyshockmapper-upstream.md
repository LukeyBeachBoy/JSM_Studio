# JoyShockMapper upstream workflow

`JSM_Studio` consumes the `jsm-studio` branch of the separate
`hotuns/JoyShockMapper` repository as a Git submodule.

The repository layout is:

```text
Electronicks/JoyShockMapper
            |
            v
hotuns/JoyShockMapper/main
            |
            v
hotuns/JoyShockMapper/jsm-studio
            |
            v
hotuns/JSM_Studio/JoyShockMapper
```

`main` tracks the upstream `master` branch. `jsm-studio` contains the
custom curves and the controller-selection/telemetry interfaces required by
the Tauri application.

## Clone and initialize

```powershell
git clone git@github.com:hotuns/JSM_Studio.git
cd JSM_Studio
git submodule update --init --recursive
```

The submodule is intentionally pinned to a commit. Do not edit its source
directly from the JSM Studio repository; make JoyShockMapper changes in
`hotuns/JoyShockMapper` first.

## Update from Electronicks

In a separate clone of `hotuns/JoyShockMapper`:

```powershell
git fetch upstream
git switch main
git merge --ff-only upstream/master
git switch jsm-studio
git merge main
```

Resolve and test any conflicts in the JoyShockMapper repository, then push
the integration branch:

```powershell
git push origin main
git push origin jsm-studio
```

Update the submodule in JSM Studio:

```powershell
git submodule update --remote --merge JoyShockMapper
```

## Rebuild the bundled runtime

After changing the submodule commit, rebuild the SDL runtime and record the
source commit used for the bundled executable:

```powershell
cd JSM_GUI/jsm_gui_tauri
npm run build:joyshockmapper
```

This updates:

```text
src-tauri/bin/SDL/JoyShockMapper.exe
src-tauri/bin/SDL/SDL3.dll
src-tauri/bin/SDL/JoyShockMapper.commit
```

Before committing, verify that `JoyShockMapper.commit` matches:

```powershell
git -C ..\..\JoyShockMapper rev-parse HEAD
Get-Content src-tauri\bin\SDL\JoyShockMapper.commit
```

Then commit the submodule pointer and bundled runtime together in JSM
Studio.
