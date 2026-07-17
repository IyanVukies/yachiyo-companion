$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root '.venv-rvc\Scripts\python.exe'
$entry = Join-Path $root 'src\sidecar\sidecar_main.py'
$workerEntry = Join-Path $root 'src\sidecar\faiss_worker_main.py'
$sourceRoot = Join-Path $root 'src\sidecar'
$manifest = Join-Path $root 'src\sidecar\rvc_service\runtime-manifest.json'
$dist = Join-Path $root 'build\sidecar'
$work = Join-Path $root '.cache\pyinstaller'

if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
  throw 'Python 3.11 RVC sidecar environment is missing. Follow START-HERE.md to bootstrap .venv-rvc.'
}

$env:PYTHONPATH = $sourceRoot

& $python -c "import importlib.metadata as m, json, pathlib, sys; p=pathlib.Path(sys.argv[1]); d=json.loads(p.read_text(encoding='utf-8')); assert sys.version_info[:2] == (3, 11), f'Python 3.11 required, got {sys.version}'; bad=[f'{n}: expected {v}, got {m.version(n)}' for n,v in d['packages'].items() if m.version(n) != v]; assert not bad, 'Runtime package mismatch: ' + '; '.join(bad)" $manifest
if ($LASTEXITCODE -ne 0) {
  throw 'Pinned RVC runtime verification failed.'
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
  --paths $sourceRoot `
  --copy-metadata 'edge-tts' `
  --copy-metadata 'faiss-cpu' `
  --copy-metadata 'fastapi' `
  --copy-metadata 'numpy' `
  --copy-metadata 'psutil' `
  --copy-metadata 'pydantic' `
  --copy-metadata 'scipy' `
  --copy-metadata 'soundfile' `
  --copy-metadata 'torch' `
  --copy-metadata 'torchaudio' `
  --copy-metadata 'uvicorn' `
  --hidden-import 'rvc_service.rvc_engine' `
  --exclude-module '_pytest' `
  --exclude-module 'librosa' `
  --exclude-module 'llvmlite' `
  --exclude-module 'numba' `
  --exclude-module 'pytest' `
  --exclude-module 'sklearn' `
  --exclude-module 'torch.utils.tensorboard' `
  --exclude-module 'faiss' `
  --add-data "$manifest;rvc_service" `
  $entry

if ($LASTEXITCODE -ne 0) {
  throw "PyInstaller failed with exit code $LASTEXITCODE."
}

$output = Join-Path $dist 'yachiyo-voice-sidecar\yachiyo-voice-sidecar.exe'
if (-not (Test-Path -LiteralPath $output -PathType Leaf)) {
  throw 'PyInstaller completed without producing the expected sidecar executable.'
}

$workerDist = Join-Path $dist 'yachiyo-voice-sidecar'
$workerWork = Join-Path $work 'faiss-worker'
& $python -m PyInstaller `
  --noconfirm `
  --clean `
  --onedir `
  --noconsole `
  --name 'yachiyo-faiss-worker' `
  --distpath $workerDist `
  --workpath $workerWork `
  --specpath $workerWork `
  --paths $sourceRoot `
  --collect-all 'faiss' `
  --exclude-module 'scipy' `
  --exclude-module 'sklearn' `
  --exclude-module 'torch' `
  --exclude-module 'torchaudio' `
  $workerEntry

if ($LASTEXITCODE -ne 0) {
  throw "PyInstaller FAISS worker failed with exit code $LASTEXITCODE."
}

$workerOutput = Join-Path $workerDist 'yachiyo-faiss-worker\yachiyo-faiss-worker.exe'
if (-not (Test-Path -LiteralPath $workerOutput -PathType Leaf)) {
  throw 'PyInstaller completed without producing the expected FAISS worker executable.'
}

Get-Item -LiteralPath $output, $workerOutput | Select-Object FullName, Length, LastWriteTime
