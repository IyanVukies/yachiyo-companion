from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import psutil
import pytest
import soundfile as sf
import torch

import rvc_service.rvc_engine as rvc_engine_module
from rvc_service.faiss_worker import inspect_index
from rvc_service.rvc_engine import RvcEngine, RvcInferenceError, RvcOptions, resolve_device


def test_auto_device_uses_cpu_and_explicit_cuda_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(torch.cuda, "is_available", lambda: False)
    monkeypatch.setattr(torch.cuda, "device_count", lambda: 0)

    device, half = resolve_device("auto")
    assert str(device) == "cpu"
    assert half is False
    with pytest.raises(RvcInferenceError, match="cuda_unavailable"):
        resolve_device("cuda")


def test_silence_produces_valid_48khz_wav_without_loading_models(tmp_path: Path) -> None:
    source = tmp_path / "hening 日本語 dengan spasi.wav"
    target = tmp_path / "hasil hening.wav"
    sf.write(source, np.zeros(48_000, dtype=np.float32), 48_000, subtype="PCM_16")
    engine = object.__new__(RvcEngine)
    engine.process = psutil.Process()
    engine.device = torch.device("cpu")
    engine.cold_start_ms = 0.0

    result = engine.convert_file(source, target, RvcOptions(), False)
    output, sample_rate = sf.read(target)

    assert sample_rate == 48_000
    assert output.shape == (48_000,)
    assert np.max(np.abs(output)) == 0
    assert result.metrics["silence"] is True


def test_short_and_malformed_audio_fail_with_stable_codes(tmp_path: Path) -> None:
    short = tmp_path / "short.wav"
    malformed = tmp_path / "malformed.wav"
    sf.write(short, np.zeros(100, dtype=np.float32), 48_000)
    malformed.write_bytes(b"not a wave")
    engine = object.__new__(RvcEngine)
    engine.process = psutil.Process()
    engine.device = torch.device("cpu")
    engine.cold_start_ms = 0.0

    with pytest.raises(RvcInferenceError, match="rvc_audio_too_short"):
        engine.convert_file(short, tmp_path / "short-out.wav", RvcOptions(), False)
    with pytest.raises(RvcInferenceError, match="rvc_audio_malformed"):
        engine.convert_file(malformed, tmp_path / "bad-out.wav", RvcOptions(), False)


def test_missing_checkpoint_fails_with_a_stable_code(tmp_path: Path) -> None:
    with pytest.raises(RvcInferenceError, match="rvc_checkpoint_invalid"):
        RvcEngine(
            tmp_path / "model missing.pth",
            tmp_path / "index missing.index",
            tmp_path / "hubert missing.pth",
            tmp_path / "rmvpe missing.pt",
            "cpu",
            tmp_path,
        )


def test_supplied_faiss_index_is_rvc_v2_compatible() -> None:
    root = Path(__file__).resolve().parents[3]
    index_path = root / "assets/source/kobo/kobo/added_IVF454_Flat_nprobe_1_kobov2_v2.index"
    if not index_path.is_file():
        pytest.skip("Supplied Kobo index is external to source control.")
    _, metadata = inspect_index(index_path)
    assert metadata == {
        "type": "IndexIVFFlat",
        "dimensions": 768,
        "vectors": 17_711,
        "trained": True,
    }


def test_frozen_faiss_worker_starts_with_a_fresh_pyinstaller_environment(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    sidecar = tmp_path / "sidecar"
    worker = sidecar / "yachiyo-faiss-worker" / "yachiyo-faiss-worker.exe"
    worker.parent.mkdir(parents=True)
    worker.touch()
    index = tmp_path / "voice.index"
    index.touch()
    work = tmp_path / "work"
    work.mkdir()

    engine = object.__new__(RvcEngine)
    engine.index_path = index
    engine.work_root = work
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "executable", str(sidecar / "yachiyo-voice-sidecar.exe"))
    bundle_directory = str(sidecar / "_internal")
    monkeypatch.setattr(sys, "_MEIPASS", bundle_directory, raising=False)
    monkeypatch.setenv("YACHIYO_SIDECAR_TOKEN", "must-not-reach-worker")
    dll_directories: list[str | None] = []
    monkeypatch.setattr(
        rvc_engine_module,
        "_set_windows_dll_directory",
        dll_directories.append,
    )

    def completed(command: list[str], **options: object) -> SimpleNamespace:
        assert command[0] == str(worker)
        environment = options["env"]
        assert isinstance(environment, dict)
        assert environment["PYINSTALLER_RESET_ENVIRONMENT"] == "1"
        assert environment["OMP_NUM_THREADS"] == "1"
        assert environment["OPENBLAS_NUM_THREADS"] == "1"
        assert environment["MKL_NUM_THREADS"] == "1"
        assert environment["NUMEXPR_NUM_THREADS"] == "1"
        assert "YACHIYO_SIDECAR_TOKEN" not in environment
        return SimpleNamespace(
            returncode=0,
            stdout='{"ok":true,"metadata":{"dimensions":768,"vectors":1}}',
            stderr="",
        )

    monkeypatch.setattr(subprocess, "run", completed)
    result = engine._run_faiss_worker("inspect")
    assert result["ok"] is True
    assert dll_directories == [None, bundle_directory]


@pytest.mark.skipif(
    os.environ.get("YACHIYO_RUN_RVC_INTEGRATION") != "1",
    reason="Set YACHIYO_RUN_RVC_INTEGRATION=1 for the real checkpoint benchmark.",
)
def test_real_kobo_checkpoint_generates_non_silent_audio(tmp_path: Path) -> None:
    root = Path(__file__).resolve().parents[3]
    model_root = root / "assets/source/kobo/kobo"
    runtime_root = root / ".runtime-cache/models"
    source = tmp_path / "ucapan Indonesia.wav"
    duration = 1.2
    sample_rate = 48_000
    timeline = np.arange(round(duration * sample_rate), dtype=np.float32) / sample_rate
    audio = 0.2 * np.sin(2 * np.pi * 220 * timeline)
    sf.write(source, audio, sample_rate, subtype="PCM_16")
    engine = RvcEngine(
        model_root / "kobov2.pth",
        model_root / "added_IVF454_Flat_nprobe_1_kobov2_v2.index",
        runtime_root / "hubert_fairseq_base_ls960.pth",
        runtime_root / "rmvpe.pt",
        "cpu",
        tmp_path,
    )
    target = tmp_path / "hasil Kobo.wav"
    result = engine.convert_file(source, target, RvcOptions(), True)
    output, output_rate = sf.read(target)

    assert output_rate == 48_000
    assert len(output) > 48_000
    assert float(np.sqrt(np.mean(np.square(output)))) > 0.005
    assert result.metrics["device"] == "cpu"
    assert result.metrics["conversionMs"] > 0
