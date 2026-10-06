param(
    [Parameter(Mandatory = $true)][string]$AppRoot,
    [Parameter(Mandatory = $true)][int]$BuilderProcessId,
    [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'

function Get-InstallerBlockers {
    param([object[]]$Processes, [string]$AppRoot, [int[]]$ProtectedIds, [bool]$IncludeModules)

    $base = [IO.Path]::GetFullPath($AppRoot).TrimEnd('\', '/')
    $outputRoots = @('src-tauri\target', 'src-tauri\bin', 'build-jsm-sdl', 'native\console-injector\build') |
        ForEach-Object { $base + '\' + $_ + '\' }
    $modules = $base + '\node_modules\'
    $byId = @{}
    foreach ($item in $Processes) { $byId[[int]$item.ProcessId] = $item }
    $protected = [Collections.Generic.HashSet[int]]::new()
    foreach ($id in $ProtectedIds) {
        while ($id -gt 0 -and $protected.Add($id)) {
            if (-not $byId.ContainsKey($id)) { break }
            $id = [int]$byId[$id].ParentProcessId
        }
    }
    $selected = [Collections.Generic.HashSet[int]]::new()
    foreach ($item in $Processes) {
        $id = [int]$item.ProcessId
        if ($protected.Contains($id)) { continue }
        $exe = ([string]$item.ExecutablePath).Replace('/', '\')
        $command = ([string]$item.CommandLine).Replace('/', '\')
        $matches = $false
        $buildTool = $item.Name -in @('node.exe', 'cargo.exe', 'rustc.exe', 'cmake.exe', 'MSBuild.exe', 'cl.exe', 'link.exe', 'ninja.exe', 'makensis.exe')
        foreach ($folder in $outputRoots) {
            if ($exe.StartsWith($folder, [StringComparison]::OrdinalIgnoreCase)) { $matches = $true }
            if ($buildTool -and $command.IndexOf($folder, [StringComparison]::OrdinalIgnoreCase) -ge 0) { $matches = $true }
        }
        if ($IncludeModules -and ($exe.StartsWith($modules, [StringComparison]::OrdinalIgnoreCase) -or
            $command.IndexOf($modules, [StringComparison]::OrdinalIgnoreCase) -ge 0)) { $matches = $true }
        if ($matches) { [void]$selected.Add($id) }
    }
    # Stop dev/build supervisors too, so they cannot immediately respawn a
    # selected esbuild, mapper or Tauri executable. Never climb into terminals.
    foreach ($id in @($selected)) {
        $parent = [int]$byId[$id].ParentProcessId
        $visited = [Collections.Generic.HashSet[int]]::new()
        while ($byId.ContainsKey($parent) -and -not $protected.Contains($parent)) {
            if (-not $visited.Add($parent)) { break }
            $item = $byId[$parent]
            if ($item.Name -notin @('node.exe', 'npm.exe', 'cargo.exe', 'rustc.exe', 'tauri.exe')) { break }
            [void]$selected.Add($parent)
            $parent = [int]$item.ParentProcessId
        }
    }
    # Their children also hold compiler caches or loaded DLLs. The snapshot
    # keeps selection scoped to these trees, not every node/cargo process.
    do {
        $added = $false
        foreach ($item in $Processes) {
            $id = [int]$item.ProcessId
            if (-not $protected.Contains($id) -and $selected.Contains([int]$item.ParentProcessId)) {
                if ($selected.Add($id)) { $added = $true }
            }
        }
    } while ($added)
    $Processes | Where-Object { $selected.Contains([int]$_.ProcessId) }
}

# Dot sourcing allows the selection logic to be tested without terminating apps.
if ($MyInvocation.InvocationName -eq '.') { return }

for ($attempt = 0; $attempt -lt 3; $attempt++) {
    $snapshot = @(Get-CimInstance Win32_Process)
    $blockers = @(Get-InstallerBlockers -Processes $snapshot -AppRoot $AppRoot `
        -ProtectedIds @($BuilderProcessId, $PID) -IncludeModules (-not $SkipInstall))
    if ($blockers.Count -eq 0) { exit 0 }
    foreach ($item in $blockers) {
        # Parent supervisors first; child cleanup follows in this same pass.
        if ($item.Name -in @('node.exe', 'npm.exe', 'cargo.exe', 'tauri.exe')) {
            $item | Add-Member -NotePropertyName StopOrder -NotePropertyValue 0
        } else { $item | Add-Member -NotePropertyName StopOrder -NotePropertyValue 1 }
    }
    foreach ($item in ($blockers | Sort-Object StopOrder)) {
        $running = Get-Process -Id $item.ProcessId -ErrorAction SilentlyContinue
        if (-not $running) { continue }
        # A PID can be recycled between enumeration and termination.
        if ([Math]::Abs(($running.StartTime.ToUniversalTime() - $item.CreationDate.ToUniversalTime()).TotalMilliseconds) -gt 1) { continue }
        Write-Host ('Stopping installer blocker: {0} (PID {1})' -f $item.Name, $item.ProcessId)
        try {
            Stop-Process -InputObject $running -Force
            $running.WaitForExit(5000) | Out-Null
        } catch {
            if (Get-Process -Id $item.ProcessId -ErrorAction SilentlyContinue) {
                throw ('Cannot stop {0} (PID {1}): {2}' -f $item.Name, $item.ProcessId, $_.Exception.Message)
            }
        }
    }
    Start-Sleep -Milliseconds 200
}
$remaining = @(Get-InstallerBlockers -Processes @(Get-CimInstance Win32_Process) -AppRoot $AppRoot `
    -ProtectedIds @($BuilderProcessId, $PID) -IncludeModules (-not $SkipInstall))
if ($remaining.Count) {
    throw ('Installer blockers are still running: ' + (($remaining | ForEach-Object { '{0} (PID {1})' -f $_.Name, $_.ProcessId }) -join ', '))
}
