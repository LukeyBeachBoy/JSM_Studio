$ErrorActionPreference = 'Stop'
$driverDir = Join-Path $PSScriptRoot '../src-tauri/third_party/ViGEmBus'
$installer = Join-Path $driverDir 'ViGEmBus_1.22.0_x64_x86_arm64.exe'
$expectedHash = '89220A7865076B342892F98865F3499FB7C4CFD673159E89D352C360FD014C6A'
New-Item -ItemType Directory -Path $driverDir -Force | Out-Null
if (-not (Test-Path -LiteralPath $installer)) {
    Invoke-WebRequest -Uri 'https://github.com/nefarius/ViGEmBus/releases/download/v1.22.0/ViGEmBus_1.22.0_x64_x86_arm64.exe' -OutFile $installer
}
if ((Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash -ne $expectedHash) {
    throw 'ViGEmBus installer checksum mismatch. Refusing to bundle it.'
}
Write-Output 'Verified ViGEmBus 1.22.0 installer.'
