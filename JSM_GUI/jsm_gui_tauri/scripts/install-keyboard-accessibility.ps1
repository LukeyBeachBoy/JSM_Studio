param(
  [switch]$Install,
  [string]$CertificateThumbprint
)
$ErrorActionPreference = 'Stop'
$sourceDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'native\keyboard-accessibility'
$buildDir = Join-Path $sourceDir 'build'
$sdkDir = Join-Path $buildDir 'webview2'
if (-not (Test-Path (Join-Path $sdkDir 'build\native\include\WebView2.h'))) {
  New-Item -ItemType Directory -Path $buildDir -Force | Out-Null
  $sdkZip = Join-Path $buildDir 'webview2.zip'
  Invoke-WebRequest 'https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/1.0.4258.31/microsoft.web.webview2.1.0.4258.31.nupkg' -OutFile $sdkZip
  if ((Get-FileHash $sdkZip -Algorithm SHA256).Hash -ne '56F7F4B8BF9AEE4B8EFEFBBDD4F67D5F74EBD1B100ED0806DA71BF76AF481AA9') {
    throw 'Microsoft WebView2 SDK checksum mismatch.'
  }
  Expand-Archive -LiteralPath $sdkZip -DestinationPath $sdkDir -Force
}
& cmake -S $sourceDir -B $buildDir
if ($LASTEXITCODE -ne 0) { throw 'Keyboard helper configuration failed.' }
& cmake --build $buildDir --config Release
if ($LASTEXITCODE -ne 0) { throw 'Keyboard helper build failed.' }
$binary = Join-Path $buildDir 'Release\jsm-keyboard-accessibility.exe'
$signTool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" |
  Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
if (-not $signTool) { throw 'Windows SDK signtool.exe was not found.' }
if ($CertificateThumbprint) {
  $certificate = Get-Item "Cert:\CurrentUser\My\$CertificateThumbprint"
} else {
  # A dedicated, non-exportable local key. This is a local opt-in installation,
  # not a public release certificate or a change to Windows UIAccess policy.
  $subject = 'CN=JSM Evolved Local Keyboard Accessibility'
  $certificate = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert |
    Where-Object { $_.Subject -eq $subject -and $_.NotAfter -gt (Get-Date).AddDays(30) } |
    Sort-Object NotAfter -Descending | Select-Object -First 1
  if (-not $certificate) {
    $certificate = New-SelfSignedCertificate -Type CodeSigningCert -Subject $subject `
      -CertStoreLocation Cert:\CurrentUser\My -KeyExportPolicy NonExportable `
      -HashAlgorithm SHA256 -NotAfter (Get-Date).AddYears(3)
  }
}
& $signTool sign /sha1 $certificate.Thumbprint /s My /fd SHA256 $binary
if ($LASTEXITCODE -ne 0) { throw 'Keyboard helper signing failed.' }
$publicCertificate = Join-Path $buildDir 'keyboard-accessibility.cer'
Export-Certificate -Cert $certificate -FilePath $publicCertificate | Out-Null
Write-Host "Signed helper: $binary"
Write-Host "Certificate: $($certificate.Thumbprint)"
if ($Install) {
  # Run this script elevated when installing. Do not relax secure-location or
  # signature checks, or copy the private key into the installation directory.
  $principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Installation requires an elevated PowerShell session.'
  }
  Import-Certificate -FilePath $publicCertificate -CertStoreLocation Cert:\LocalMachine\Root | Out-Null
  Import-Certificate -FilePath $publicCertificate -CertStoreLocation Cert:\LocalMachine\TrustedPublisher | Out-Null
  $destination = Join-Path $env:ProgramFiles 'JSM Evolved\Accessibility'
  New-Item -ItemType Directory -Path $destination -Force | Out-Null
  $runningHelpers = @(Get-Process jsm-keyboard-accessibility -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -eq (Join-Path $destination 'jsm-keyboard-accessibility.exe')
  })
  $runningHelpers | Stop-Process -Force
  foreach ($processId in @($runningHelpers | Select-Object -ExpandProperty Id)) {
    Wait-Process -Id $processId -Timeout 10 -ErrorAction SilentlyContinue
  }
  Copy-Item -LiteralPath $binary -Destination (Join-Path $destination 'jsm-keyboard-accessibility.exe') -Force
  Copy-Item -LiteralPath $publicCertificate -Destination $destination -Force
  $webRoot = Join-Path (Split-Path -Parent $PSScriptRoot) 'dist'
  if (-not (Test-Path (Join-Path $webRoot 'keyboard.html'))) { throw 'Run npm run build:web before installing the helper.' }
  $webDestination = Join-Path $destination 'web'
  New-Item -ItemType Directory -Path $webDestination -Force | Out-Null
  Copy-Item -Path (Join-Path $webRoot '*') -Destination $webDestination -Recurse -Force
  $signature = Get-AuthenticodeSignature (Join-Path $destination 'jsm-keyboard-accessibility.exe')
  if ($signature.Status -ne 'Valid') { throw "Installed signature is $($signature.Status)." }
  Write-Host "Installed verified helper: $destination"
}
