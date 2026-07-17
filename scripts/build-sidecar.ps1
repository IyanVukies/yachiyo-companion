$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root '.venv-sidecar\Scripts\python.exe'
$entry = Join-Path $root 'src\sidecar\rvc_service\app.py'
$dist = Join-Path $root 'build\sidecar'
$work = Join-Path $root '.cache\pyinstaller'

if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
  throw 'Python sidecar environment is missing. Follow START-HERE.md to bootstrap .venv-sidecar.'
}

& $python -m PyInstaller `
  --noconfirm `
  --clean `
  --onedir `
  --noconsole `
  --name 'yachiyo-voice-sidecar' `
  --distpath $dist `
  --workpath $work `
  --specpath $work `
  $entry

if ($LASTEXITCODE -ne 0) {
  throw "PyInstaller failed with exit code $LASTEXITCODE."
}

$output = Join-Path $dist 'yachiyo-voice-sidecar\yachiyo-voice-sidecar.exe'
if (-not (Test-Path -LiteralPath $output -PathType Leaf)) {
  throw 'PyInstaller completed without producing the expected sidecar executable.'
}

Get-Item -LiteralPath $output | Select-Object FullName, Length, LastWriteTime
