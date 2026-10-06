$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path $PSScriptRoot -Parent
. (Join-Path $scriptRoot 'scripts\stop-installer-blockers.ps1') -AppRoot 'C:\Test\App' -BuilderProcessId $PID
function Item($id, $parent, $name, $exe, $command = '') {
    [pscustomobject]@{ ProcessId=$id; ParentProcessId=$parent; Name=$name; ExecutablePath=$exe; CommandLine=$command }
}
$fixture = @(
    (Item 1 0 'terminal.exe' 'C:\terminal.exe'),
    (Item 2 1 'node.exe' 'C:\node.exe' 'build-installer.mjs'),
    (Item 3 2 'powershell.exe' 'C:\powershell.exe'),
    (Item 10 1 'node.exe' 'C:\node.exe' 'npm run dev'),
    (Item 11 10 'node.exe' 'C:\node.exe' 'node "C:\Test\App\node_modules\vite\bin\vite.js"'),
    (Item 12 11 'esbuild.exe' 'C:\Test\App\node_modules\@esbuild\win32-x64\esbuild.exe'),
    (Item 13 10 'cargo.exe' 'C:\cargo.exe'),
    (Item 14 13 'app.exe' 'C:\Test\App\src-tauri\target\debug\app.exe'),
    (Item 15 14 'JoyShockMapper.exe' 'C:\Test\App\src-tauri\bin\SDL\JoyShockMapper.exe'),
    (Item 20 1 'node.exe' 'C:\node.exe' 'C:\Other\node_modules\vite\bin\vite.js'),
    (Item 21 20 'esbuild.exe' 'C:\Other\node_modules\@esbuild\esbuild.exe'),
    (Item 22 1 'node.exe' 'C:\node.exe' 'C:\Test\App\node_modules-other\vite.js'),
    (Item 23 1 'app.exe' 'C:\Test\App\src-tauri\target-other\app.exe'),
    (Item 24 1 'Code.exe' 'C:\Code.exe' 'C:\Test\App'),
    (Item 25 1 'JoyShockMapper.exe' 'C:\Program Files\JSM Evolved\JoyShockMapper.exe'),
    (Item 30 1 'node.exe' 'C:\node.exe' 'C:/Test/App/node_modules/vite/bin/vite.js'),
    (Item 31 1 'rustc.exe' 'C:\rustc.exe' '--out-dir C:\Test\App\src-tauri\target\release\deps'),
    (Item 32 1 'Code.exe' 'C:\Code.exe' 'C:\Test\App\src-tauri\target\debug\app.exe')
)
function Check($items, $modules, $expected) {
    $actual = @(Get-InstallerBlockers -Processes $items -AppRoot 'C:\Test\App' -ProtectedIds @(2,3) -IncludeModules $modules |
        ForEach-Object { [int]$_.ProcessId } | Sort-Object)
    if (($actual -join ',') -ne ($expected -join ',')) { throw "Expected $expected; got $actual" }
}
Check $fixture $true @(10,11,12,13,14,15,30,31)
Check $fixture $false @(10,11,12,13,14,15,31)
# With no running output executable, --skip-install leaves dev servers alone.
Check @($fixture | Where-Object { $_.ProcessId -notin @(14,15,31) }) $false @()
# Even if the current builder was launched from node_modules, its ancestors
# and the cleanup subprocess must never be selected.
$fixture[1].CommandLine = 'C:\Test\App\node_modules\builder.js'
$fixture[0].ExecutablePath = 'C:\Test\App\src-tauri\target\debug\terminal.exe'
Check $fixture $true @(10,11,12,13,14,15,30,31)
Write-Host 'PASS: scoped process trees, output blockers, skip-install, path boundaries and ancestor protection'
