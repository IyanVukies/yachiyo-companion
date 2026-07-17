$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root '.venv-sidecar\Scripts\python.exe'
$sidecarRoot = Join-Path $root 'src\sidecar'
$tempRoot = Join-Path $root '.cache\python-temp'
$pytestRoot = Join-Path $root ('.cache\pytest-sidecar-' + [Guid]::NewGuid().ToString('N'))

if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
  throw 'Python sidecar environment is missing. Follow START-HERE.md to bootstrap .venv-sidecar.'
}

$env:PYTHONPATH = $sidecarRoot
$env:TEMP = $tempRoot
$env:TMP = $tempRoot

try {
  & $python -m pytest (Join-Path $sidecarRoot 'tests') -q -p no:cacheprovider --basetemp=$pytestRoot
  if ($LASTEXITCODE -ne 0) {
    throw "Sidecar tests failed with exit code $LASTEXITCODE."
  }
}
finally {
  if (Test-Path -LiteralPath $pytestRoot) {
    Remove-Item -LiteralPath $pytestRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
