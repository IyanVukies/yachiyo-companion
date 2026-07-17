param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Install', 'Uninstall')]
  [string]$Action
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$installer = Join-Path $root "release\Yachiyo-Companion-$version-x64-Setup.exe"
$outputRoot = [IO.Path]::GetFullPath((Join-Path $root 'output'))
$target = [IO.Path]::GetFullPath((Join-Path $outputRoot 'installed-smoke'))
$expectedPrefix = $outputRoot + [IO.Path]::DirectorySeparatorChar

if (-not $target.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing installer smoke outside output root: $target"
}

if ($Action -eq 'Install') {
  if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) {
    throw "Installer not found: $installer"
  }
  if (Test-Path -LiteralPath $target) {
    throw "Installer smoke target already exists: $target"
  }
  New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
  $process = Start-Process -FilePath $installer -ArgumentList @('/S', "/D=$target") -Wait -PassThru -WindowStyle Hidden
  if ($process.ExitCode -ne 0) {
    throw "Installer exited with code $($process.ExitCode)."
  }
  $app = Join-Path $target 'Yachiyo Companion.exe'
  $uninstaller = Join-Path $target 'Uninstall Yachiyo Companion.exe'
  if (-not (Test-Path -LiteralPath $app -PathType Leaf) -or -not (Test-Path -LiteralPath $uninstaller -PathType Leaf)) {
    throw 'Installer completed without the expected application and uninstaller.'
  }
  Get-Item -LiteralPath $app, $uninstaller | Select-Object FullName, Length, LastWriteTime
  exit 0
}

$uninstaller = Join-Path $target 'Uninstall Yachiyo Companion.exe'
if (-not (Test-Path -LiteralPath $uninstaller -PathType Leaf)) {
  throw "Uninstaller not found: $uninstaller"
}
$process = Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait -PassThru -WindowStyle Hidden
if ($process.ExitCode -ne 0) {
  throw "Uninstaller exited with code $($process.ExitCode)."
}
for ($attempt = 0; $attempt -lt 30 -and (Test-Path -LiteralPath $target); $attempt += 1) {
  Start-Sleep -Milliseconds 200
}
if (Test-Path -LiteralPath $target) {
  Remove-Item -LiteralPath $target -Recurse -Force
}
if (Test-Path -LiteralPath $target) {
  throw "Installer smoke target still exists after cleanup: $target"
}
'Installer smoke uninstall and cleanup completed.'
