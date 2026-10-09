param(
    [Parameter(Mandatory = $true)][string]$AppRoot,
    [Parameter(Mandatory = $true)][int]$BuilderProcessId,
    [switch]$SkipInstall,
    [switch]$ElevatedRetry
)

$ErrorActionPreference = 'Stop'

# CIM hides executable paths for elevated apps. Limited query access still
# identifies their exact location, without opening them for termination.
function Initialize-InstallerProcessPaths {
    if ('InstallerProcessPaths' -as [type]) { return }
    Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class InstallerProcessPaths {
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool QueryFullProcessImageName(IntPtr process, uint flags, StringBuilder name, ref int size);
    [DllImport("kernel32.dll")]
    static extern bool CloseHandle(IntPtr handle);
    public static string GetPath(int pid) {
        var handle = OpenProcess(0x1000, false, pid);
        if (handle == IntPtr.Zero) return null;
        try {
            var name = new StringBuilder(32768);
            int size = name.Capacity;
            return QueryFullProcessImageName(handle, 0, name, ref size) ? name.ToString() : null;
        } finally { CloseHandle(handle); }
    }
}
'@
}

function Get-InstallerProcessSnapshot {
    Initialize-InstallerProcessPaths
    foreach ($item in (Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, ExecutablePath, CommandLine, CreationDate)) {
        if (-not $item.ExecutablePath) {
            $item.ExecutablePath = [InstallerProcessPaths]::GetPath([int]$item.ProcessId)
        }
        $item
    }
}

function Test-InstallerAccessDenied {
    param($Record)
    $exception = $Record.Exception
    while ($exception) {
        if ($exception -is [System.ComponentModel.Win32Exception] -and $exception.NativeErrorCode -eq 5) { return $true }
        $exception = $exception.InnerException
    }
    return $Record.CategoryInfo.Category -eq [System.Management.Automation.ErrorCategory]::PermissionDenied
}

function Get-InstallerBlockers {
    param([object[]]$Processes, [string]$AppRoot, [int[]]$ProtectedIds, [bool]$IncludeModules)

    $base = [IO.Path]::GetFullPath($AppRoot).TrimEnd('\', '/')
    $outputRoots = @('src-tauri\target', 'src-tauri\bin', 'native\console-injector\build') |
        ForEach-Object { $base + '\' + $_ + '\' }
    # The mapper's CMake output is at the repository root, outside AppRoot.
    $outputRoots += [IO.Path]::GetFullPath((Join-Path $base '..\..\build-jsm-sdl')) + '\'
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
    $snapshot = @(Get-InstallerProcessSnapshot)
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
                if (-not $ElevatedRetry -and (Test-InstallerAccessDenied $_)) {
                    Write-Host 'An elevated build output is running. Windows will ask permission to close this checkout''s build blockers.'
                    $cleanupArgs = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
                        '-File', ('"' + $PSCommandPath + '"'), '-AppRoot', ('"' + $AppRoot + '"'),
                        '-BuilderProcessId', $BuilderProcessId, '-ElevatedRetry')
                    if ($SkipInstall) { $cleanupArgs += '-SkipInstall' }
                    # Re-enumerate and scope selection in the elevated helper;
                    # never pass a stale PID list to a privileged process.
                    $cleanup = Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList $cleanupArgs
                    if ($cleanup.ExitCode -ne 0) { throw 'Elevated installer blocker cleanup failed. Close this checkout''s running app and rerun.' }
                    exit 0
                }
                throw ('Cannot stop {0} (PID {1}): {2}' -f $item.Name, $item.ProcessId, $_.Exception.Message)
            }
        }
    }
    Start-Sleep -Milliseconds 200
}
$remaining = @(Get-InstallerBlockers -Processes @(Get-InstallerProcessSnapshot) -AppRoot $AppRoot `
    -ProtectedIds @($BuilderProcessId, $PID) -IncludeModules (-not $SkipInstall))
if ($remaining.Count) {
    throw ('Installer blockers are still running: ' + (($remaining | ForEach-Object { '{0} (PID {1})' -f $_.Name, $_.ProcessId }) -join ', '))
}
