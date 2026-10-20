[CmdletBinding(SupportsShouldProcess)]
param()
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $projectRoot 'src-tauri\target\release\jsm-gui-app-tauri.exe'
$target = Join-Path $env:LOCALAPPDATA 'JSM Evolved\JSM Evolved.exe'
$helper = Join-Path $env:ProgramFiles 'JSM Evolved\Accessibility\jsm-keyboard-accessibility.exe'
if (-not (Test-Path -LiteralPath $source)) { throw 'Build the release Studio executable first.' }
if (-not (Test-Path -LiteralPath $target)) { throw 'The existing per-user Studio installation was not found.' }
if ((Get-AuthenticodeSignature $helper).Status -ne 'Valid') { throw 'Install the verified signed keyboard helper first.' }
if (-not $PSCmdlet.ShouldProcess($target, 'Back up and replace Studio; restart Studio and its mapper')) { return }
$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this script in an elevated PowerShell session.'
}
$apps = @(Get-CimInstance Win32_Process -Filter "Name='JSM Evolved.exe'" | Where-Object { $_.ExecutablePath -eq $target })
$ids = @($apps | Select-Object -ExpandProperty ProcessId)
$mappers = @(Get-CimInstance Win32_Process -Filter "Name='JoyShockMapper.exe'" | Where-Object { $_.ParentProcessId -in $ids })
$backup = $target + '.before-keyboard-accessibility.bak'
Copy-Item -LiteralPath $target -Destination $backup -Force
try {
  foreach ($app in $apps) { Stop-Process -Id $app.ProcessId -Force }
  foreach ($mapper in $mappers) { Stop-Process -Id $mapper.ProcessId -Force -ErrorAction SilentlyContinue }
  foreach ($processId in @($ids) + @($mappers | Select-Object -ExpandProperty ProcessId)) {
    Wait-Process -Id $processId -Timeout 10 -ErrorAction SilentlyContinue
  }
  # Termination is asynchronous, and WebView processes may briefly retain an
  # image handle after Studio exits. Retry only sharing violations.
  $deadline = (Get-Date).AddSeconds(10)
  while ($true) {
    try { Copy-Item -LiteralPath $source -Destination $target -Force; break }
    catch [System.IO.IOException] {
      if (($_.Exception.HResult -band 0xffff) -ne 32 -or (Get-Date) -ge $deadline) { throw }
      Start-Sleep -Milliseconds 200
    }
  }
  if ((Get-FileHash $target).Hash -ne (Get-FileHash $source).Hash) { throw 'Executable verification failed.' }
} catch {
  Copy-Item -LiteralPath $backup -Destination $target -Force
  Start-Process -FilePath $target -ArgumentList '--autostart' -WindowStyle Hidden
  throw
}
Start-Process -FilePath $target -ArgumentList '--autostart' -WindowStyle Hidden
Write-Host "Updated Studio. Rollback executable: $backup"
