$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root '.venv-sidecar\Scripts\python.exe'
$sidecarRoot = Join-Path $root 'src\sidecar'
$cacheRoot = [IO.Path]::GetFullPath((Join-Path $root '.cache'))
$runRoot = [IO.Path]::GetFullPath((Join-Path $cacheRoot ('sidecar-tests-' + [Guid]::NewGuid().ToString('N'))))
$expectedPrefix = $cacheRoot + [IO.Path]::DirectorySeparatorChar
$tempRoot = Join-Path $runRoot 'python-temp'
$pytestRoot = Join-Path $runRoot 'pytest'

if (-not $runRoot.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing sidecar test temp directory outside cache root: $runRoot"
}

if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
  throw 'Python sidecar environment is missing. Follow START-HERE.md to bootstrap .venv-sidecar.'
}

$env:PYTHONPATH = $sidecarRoot
$env:TEMP = $tempRoot
$env:TMP = $tempRoot

try {
  New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
  & $python -m pytest (Join-Path $sidecarRoot 'tests') -q -p no:cacheprovider --basetemp=$pytestRoot
  if ($LASTEXITCODE -ne 0) {
    throw "Sidecar tests failed with exit code $LASTEXITCODE."
  }
}
finally {
  if (Test-Path -LiteralPath $runRoot) {
    Remove-Item -LiteralPath $runRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
