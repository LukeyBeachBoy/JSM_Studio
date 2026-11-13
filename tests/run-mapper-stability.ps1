$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$native = Join-Path $repo 'JoyShockMapper/JoyShockMapper'
$work = Join-Path $repo 'build-jsm-sdl/stability-tests'
New-Item -ItemType Directory -Path $work -Force | Out-Null
$sources = @('tests/mapper_stability.cpp', 'JoyShockMapper/JoyShockMapper/src/CmdRegistry.cpp', 'JoyShockMapper/JoyShockMapper/src/DigitalButton.cpp', 'JoyShockMapper/JoyShockMapper/src/Mapping.cpp', 'JoyShockMapper/JoyShockMapper/src/operators.cpp', 'JoyShockMapper/JoyShockMapper/src/SettingsManager.cpp', 'JoyShockMapper/JoyShockMapper/src/InvertedChords.cpp', 'JoyShockMapper/JoyShockMapper/src/VirtualMenuCatalog.cpp', 'JoyShockMapper/JoyShockMapper/src/win32/PlatformDefinitions.cpp')
$includes = @("$native/include", "$repo/build-jsm-sdl/_deps/magic_enum-src/include", "$repo/build-jsm-sdl/_deps/pocket_fsm-src/include")
$arguments = @('/nologo', '/utf-8', '/EHsc', '/std:c++20', '/DNOMINMAX', '/DWIN32_LEAN_AND_MEAN', '/D_CRT_SECURE_NO_WARNINGS')
$arguments += $includes | ForEach-Object { '/I"' + $_ + '"' }
$arguments += $sources | ForEach-Object { '"' + (Join-Path $repo $_) + '"' }
$arguments += @('/Fe:mapper-stability.exe', '/link', 'user32.lib', 'shell32.lib')
$batch = @('@echo off', 'call "C:/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Auxiliary/Build/vcvars64.bat" >nul', ('cl ' + ($arguments -join ' ')), 'if errorlevel 1 exit /b 1', 'mapper-stability.exe', 'if errorlevel 1 exit /b 1', ('cl /nologo /utf-8 /EHsc /std:c++20 /DNOMINMAX /DWIN32_LEAN_AND_MEAN /I"' + $native + '/include" "' + $repo + '/tests/azeron_input_queue.cpp" /Fe:azeron-input-queue.exe'), 'if errorlevel 1 exit /b 1', 'azeron-input-queue.exe')
$batch | Set-Content -LiteralPath (Join-Path $work 'run.cmd')
$telemetry = @('if errorlevel 1 exit /b 1', ('cl /nologo /utf-8 /EHsc /std:c++20 /DNOMINMAX /DWIN32_LEAN_AND_MEAN /I"' + $native + '/include" "' + $repo + '/tests/telemetry_lifecycle.cpp" "' + $native + '/src/Telemetry.cpp" /Fe:telemetry-lifecycle.exe /link ws2_32.lib'), 'if errorlevel 1 exit /b 1', 'telemetry-lifecycle.exe')
$telemetry | Add-Content -LiteralPath (Join-Path $work 'run.cmd')
$grip = @('if errorlevel 1 exit /b 1', ('cl /nologo /utf-8 /EHsc /std:c++20 /I"' + $native + '/include" "' + $repo + '/tests/triton_grip_handoff.cpp" /Fe:triton-grip-handoff.exe'), 'if errorlevel 1 exit /b 1', 'triton-grip-handoff.exe')
$grip | Add-Content -LiteralPath (Join-Path $work 'run.cmd')
Push-Location $work
try { & cmd.exe /d /c run.cmd; if ($LASTEXITCODE -ne 0) { throw "Native stability regressions failed: $LASTEXITCODE" } }
finally { Pop-Location }

