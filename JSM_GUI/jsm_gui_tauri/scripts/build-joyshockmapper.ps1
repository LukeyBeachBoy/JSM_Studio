$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$sourceDir = Join-Path $projectRoot "JoyShockMapper"
$buildDir = Join-Path $projectRoot "build-jsm-sdl"
$bundleDir = Join-Path $PSScriptRoot "..\src-tauri\bin\SDL"

if (-not (Test-Path -LiteralPath (Join-Path $sourceDir ".git"))) {
  throw "JoyShockMapper submodule is not initialized. Run: git submodule update --init --recursive"
}

$cmakeCommand = Get-Command "cmake" -ErrorAction SilentlyContinue
$cmakePath = if ($cmakeCommand) { $cmakeCommand.Source } else { $null }

if (-not $cmakePath) {
  $candidatePaths = @(
    (Join-Path ${env:ProgramFiles} "Microsoft Visual Studio\18\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe"),
    (Join-Path ${env:ProgramFiles} "Microsoft Visual Studio\17\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe"),
    (Join-Path ${env:ProgramFiles} "Microsoft Visual Studio\2022\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe"),
    (Join-Path ${env:ProgramFiles} "CMake\bin\cmake.exe")
  )

  $cmakePath = $candidatePaths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}

if (-not $cmakePath) {
  throw "CMake was not found. Install CMake or Visual Studio C++ tools, then rerun this command."
}

$sourceCommit = (& git -C $sourceDir rev-parse HEAD).Trim()
& $cmakePath -S $sourceDir -B $buildDir -DSDL=ON
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& $cmakePath --build $buildDir --config Release --target JoyShockMapper --parallel 2
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$builtBinary = Get-ChildItem -LiteralPath $buildDir -Recurse -Filter "JoyShockMapper.exe" -File |
  Where-Object { $_.FullName -match "[\\/]Release[\\/]JoyShockMapper\.exe$" } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $builtBinary) {
  throw "The Release JoyShockMapper.exe was not found under $buildDir."
}

New-Item -ItemType Directory -Path $bundleDir -Force | Out-Null
Copy-Item -LiteralPath $builtBinary.FullName -Destination (Join-Path $bundleDir "JoyShockMapper.exe") -Force

$builtSdl = Join-Path $builtBinary.DirectoryName "SDL3.dll"
if (Test-Path -LiteralPath $builtSdl) {
  Copy-Item -LiteralPath $builtSdl -Destination (Join-Path $bundleDir "SDL3.dll") -Force
}

$sourceCommit | Set-Content -LiteralPath (Join-Path $bundleDir "JoyShockMapper.commit") -NoNewline
Write-Output "Bundled JoyShockMapper commit $sourceCommit"
