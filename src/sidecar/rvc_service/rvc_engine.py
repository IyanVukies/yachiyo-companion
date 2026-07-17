from __future__ import annotations

import gc
import json
import math
import os
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import numpy as np
import psutil
import soundfile as sf
import torch
import torch.nn.functional as functional
import torchaudio
from scipy import signal

from .vendor.rvc.infer_pack.models import SynthesizerTrnMs768NSFsid
from .vendor.rvc.rmvpe import RMVPE


INPUT_SAMPLE_RATE = 48_000
FEATURE_SAMPLE_RATE = 16_000
OUTPUT_SAMPLE_RATE = 48_000
FRAME_SAMPLES = 160
FEATURE_DIMENSIONS = 768
MAX_INPUT_SECONDS = 35.0
MAX_INDEX_VECTORS = 2_000_000
MAX_CHECKPOINT_BYTES = 512 * 1024 * 1024
MAX_INDEX_BYTES = 1024 * 1024 * 1024
MAX_WEIGHT_TENSORS = 2_000

HUBERT_CONFIG: dict[str, Any] = {
    "extractor_mode": "group_norm",
    "extractor_conv_layer_config": [
        (512, 10, 5),
        (512, 3, 2),
        (512, 3, 2),
        (512, 3, 2),
        (512, 3, 2),
        (512, 2, 2),
        (512, 2, 2),
    ],
    "extractor_conv_bias": False,
    "encoder_embed_dim": 768,
    "encoder_projection_dropout": 0.1,
    "encoder_pos_conv_kernel": 128,
    "encoder_pos_conv_groups": 16,
    "encoder_num_layers": 12,
    "encoder_num_heads": 12,
    "encoder_attention_dropout": 0.1,
    "encoder_ff_interm_features": 3072,
    "encoder_ff_interm_dropout": 0.0,
    "encoder_dropout": 0.1,
    "encoder_layer_norm_first": False,
    "encoder_layer_drop": 0.05,
    "aux_num_out": None,
}


class RvcInferenceError(RuntimeError):
    """A stable public error code for an RVC inference failure."""


@dataclass(frozen=True)
class RvcOptions:
    pitch: int = 0
    index_rate: float = 0.5
    protect: float = 0.33
    device: Literal["auto", "cpu", "cuda"] = "auto"


@dataclass(frozen=True)
class ConversionResult:
    metrics: dict[str, float | str | bool]


class RvcEngine:
    def __init__(
        self,
        checkpoint_path: Path,
        index_path: Path,
        hubert_path: Path,
        rmvpe_path: Path,
        requested_device: Literal["auto", "cpu", "cuda"] = "auto",
        work_root: Path | None = None,
    ) -> None:
        started = time.perf_counter()
        self.process = psutil.Process()
        self.device, self.is_half = resolve_device(requested_device)
        if self.device.type == "cpu":
            torch.set_num_threads(max(1, min(8, os.cpu_count() or 1)))
        self.checkpoint_path = _bounded_file(
            checkpoint_path, MAX_CHECKPOINT_BYTES, "rvc_checkpoint_invalid"
        )
        self.index_path = _bounded_file(index_path, MAX_INDEX_BYTES, "rvc_index_invalid")
        self.hubert_path = _bounded_file(
            hubert_path, MAX_CHECKPOINT_BYTES, "hubert_model_invalid"
        )
        self.rmvpe_path = _bounded_file(
            rmvpe_path, MAX_CHECKPOINT_BYTES, "rmvpe_model_invalid"
        )
        self.work_root = (work_root or Path(tempfile.gettempdir()) / "Yachiyo").resolve()
        self.work_root.mkdir(parents=True, exist_ok=True)

        self.net_g, self.speaker_count = self._load_synthesizer()
        self.hubert = self._load_hubert()
        self.rmvpe = RMVPE(str(self.rmvpe_path), self.is_half, self.device)
        self.index_metadata = self._inspect_index()
        self.high_pass_b, self.high_pass_a = signal.butter(
            N=5, Wn=48, btype="high", fs=FEATURE_SAMPLE_RATE
        )
        self.cold_start_ms = (time.perf_counter() - started) * 1000

    @property
    def device_name(self) -> str:
        if self.device.type == "cuda":
            return torch.cuda.get_device_name(self.device)
        return "CPU"

    def close(self) -> None:
        for name in ("net_g", "hubert", "rmvpe"):
            if hasattr(self, name):
                delattr(self, name)
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        gc.collect()

    def convert_file(
        self,
        source: Path,
        target: Path,
        options: RvcOptions,
        cold_start: bool,
    ) -> ConversionResult:
        wall_started = time.perf_counter()
        cpu_started = _cpu_seconds(self.process)
        peak_before = _peak_rss(self.process)
        timings = {"featureMs": 0.0, "pitchMs": 0.0, "indexMs": 0.0, "inferMs": 0.0}

        audio, sample_rate = _read_audio(source)
        source_duration = len(audio) / sample_rate
        if source_duration > MAX_INPUT_SECONDS:
            raise RvcInferenceError("rvc_audio_too_long")
        if len(audio) < 320:
            raise RvcInferenceError("rvc_audio_too_short")
        audio = _resample_to_features(audio, sample_rate)
        if not np.all(np.isfinite(audio)):
            raise RvcInferenceError("rvc_audio_malformed")

        peak = float(np.max(np.abs(audio))) if audio.size else 0.0
        if peak < 1e-5:
            silent = np.zeros(round(source_duration * OUTPUT_SAMPLE_RATE), dtype=np.float32)
            sf.write(target, silent, OUTPUT_SAMPLE_RATE, subtype="PCM_16", format="WAV")
            return ConversionResult(
                self._metrics(
                    wall_started,
                    cpu_started,
                    peak_before,
                    source_duration,
                    len(silent) / OUTPUT_SAMPLE_RATE,
                    timings,
                    cold_start,
                    silence=True,
                )
            )
        if peak > 0.95:
            audio = audio * (0.95 / peak)
        if len(audio) > 32:
            audio = signal.filtfilt(self.high_pass_b, self.high_pass_a, audio).astype(
                np.float32, copy=False
            )

        padded = np.pad(audio, (FEATURE_SAMPLE_RATE, FEATURE_SAMPLE_RATE), mode="reflect")
        frame_count = padded.shape[0] // FRAME_SAMPLES

        pitch_started = time.perf_counter()
        pitch, pitch_f = self._extract_pitch(padded, frame_count, options.pitch)
        timings["pitchMs"] = (time.perf_counter() - pitch_started) * 1000

        feature_started = time.perf_counter()
        features, original_features = self._extract_features(padded, options.protect)
        timings["featureMs"] = (time.perf_counter() - feature_started) * 1000

        if options.index_rate > 0:
            index_started = time.perf_counter()
            features = self._apply_index(features, options.index_rate)
            timings["indexMs"] = (time.perf_counter() - index_started) * 1000

        features = functional.interpolate(
            features.permute(0, 2, 1), scale_factor=2, mode="nearest"
        ).permute(0, 2, 1)
        if original_features is not None:
            original_features = functional.interpolate(
                original_features.permute(0, 2, 1), scale_factor=2, mode="nearest"
            ).permute(0, 2, 1)

        frame_count = min(frame_count, features.shape[1], pitch.shape[1], pitch_f.shape[1])
        if frame_count < 1:
            raise RvcInferenceError("rvc_features_empty")
        features = features[:, :frame_count]
        pitch = pitch[:, :frame_count]
        pitch_f = pitch_f[:, :frame_count]

        if original_features is not None:
            original_features = original_features[:, :frame_count]
            voiced = pitch_f.clone()
            voiced[pitch_f > 0] = 1
            voiced[pitch_f <= 0] = options.protect
            voiced = voiced.unsqueeze(-1)
            features = features * voiced + original_features * (1 - voiced)
            features = features.to(original_features.dtype)

        infer_started = time.perf_counter()
        frame_length = torch.tensor([frame_count], device=self.device).long()
        speaker = torch.tensor([0], device=self.device).long()
        with torch.inference_mode():
            converted = self.net_g.infer(
                features, frame_length, pitch, pitch_f, speaker
            )[0][0, 0]
        converted_audio = converted.detach().cpu().float().numpy()
        timings["inferMs"] = (time.perf_counter() - infer_started) * 1000

        crop = OUTPUT_SAMPLE_RATE
        if converted_audio.size <= crop * 2:
            raise RvcInferenceError("rvc_output_too_short")
        converted_audio = converted_audio[crop:-crop]
        expected_samples = max(1, round(source_duration * OUTPUT_SAMPLE_RATE))
        if converted_audio.size > expected_samples:
            converted_audio = converted_audio[:expected_samples]
        output_peak = float(np.max(np.abs(converted_audio)))
        if not math.isfinite(output_peak):
            raise RvcInferenceError("rvc_output_malformed")
        if output_peak > 0.99:
            converted_audio = converted_audio * (0.99 / output_peak)
        target.parent.mkdir(parents=True, exist_ok=True)
        sf.write(
            target,
            converted_audio.astype(np.float32, copy=False),
            OUTPUT_SAMPLE_RATE,
            subtype="PCM_16",
            format="WAV",
        )
        if not target.is_file() or target.stat().st_size <= 44:
            raise RvcInferenceError("rvc_output_empty")

        output_duration = converted_audio.size / OUTPUT_SAMPLE_RATE
        return ConversionResult(
            self._metrics(
                wall_started,
                cpu_started,
                peak_before,
                source_duration,
                output_duration,
                timings,
                cold_start,
                silence=False,
            )
        )

    def _load_synthesizer(self) -> tuple[SynthesizerTrnMs768NSFsid, int]:
        try:
            checkpoint = torch.load(
                self.checkpoint_path, map_location="cpu", weights_only=True
            )
        except Exception as error:
            raise RvcInferenceError("rvc_checkpoint_unreadable") from error
        if not isinstance(checkpoint, dict):
            raise RvcInferenceError("rvc_checkpoint_invalid")
        if (
            checkpoint.get("version") != "v2"
            or checkpoint.get("sr") != "48k"
            or checkpoint.get("f0") != 1
        ):
            raise RvcInferenceError("rvc_checkpoint_incompatible")
        config = checkpoint.get("config")
        weights = checkpoint.get("weight")
        if (
            not isinstance(config, list)
            or len(config) != 18
            or not isinstance(weights, dict)
            or len(weights) > MAX_WEIGHT_TENSORS
            or "emb_g.weight" not in weights
            or not isinstance(weights["emb_g.weight"], torch.Tensor)
        ):
            raise RvcInferenceError("rvc_checkpoint_invalid")
        if any(not isinstance(value, torch.Tensor) for value in weights.values()):
            raise RvcInferenceError("rvc_checkpoint_invalid")
        config = list(config)
        speaker_count = int(weights["emb_g.weight"].shape[0])
        if speaker_count < 1 or speaker_count > 10_000 or config[-1] != 48_000:
            raise RvcInferenceError("rvc_checkpoint_invalid")
        config[-3] = speaker_count
        try:
            model = SynthesizerTrnMs768NSFsid(*config, is_half=self.is_half)
            del model.enc_q
            incompatible = model.load_state_dict(weights, strict=False)
            unexpected = [key for key in incompatible.unexpected_keys if not key.startswith("enc_q.")]
            missing = [key for key in incompatible.missing_keys if not key.startswith("enc_q.")]
            if unexpected or missing:
                raise RvcInferenceError("rvc_checkpoint_weights_incompatible")
            model.eval().to(self.device)
            model = model.half() if self.is_half else model.float()
            return model, speaker_count
        except RvcInferenceError:
            raise
        except Exception as error:
            raise RvcInferenceError("rvc_checkpoint_weights_incompatible") from error

    def _load_hubert(self) -> torch.nn.Module:
        try:
            state_dict = torch.load(
                self.hubert_path, map_location="cpu", weights_only=True
            )
            if not isinstance(state_dict, dict) or len(state_dict) > 500:
                raise RvcInferenceError("hubert_model_invalid")
            model = torchaudio.models.wav2vec2_model(**HUBERT_CONFIG)
            model.load_state_dict(state_dict, strict=True)
            model.eval().to(self.device)
            return model.half() if self.is_half else model.float()
        except RvcInferenceError:
            raise
        except Exception as error:
            raise RvcInferenceError("hubert_model_invalid") from error

    def _inspect_index(self) -> dict[str, Any]:
        result = self._run_faiss_worker("inspect")
        metadata = result.get("metadata")
        if (
            not isinstance(metadata, dict)
            or metadata.get("dimensions") != FEATURE_DIMENSIONS
            or not isinstance(metadata.get("vectors"), int)
            or metadata["vectors"] < 1
            or metadata["vectors"] > MAX_INDEX_VECTORS
        ):
            raise RvcInferenceError("rvc_index_incompatible")
        return metadata

    def _extract_pitch(
        self, audio: np.ndarray, frame_count: int, semitones: int
    ) -> tuple[torch.Tensor, torch.Tensor]:
        f0 = np.asarray(self.rmvpe.infer_from_audio(audio, thred=0.03), dtype=np.float32)
        if f0.size < frame_count:
            f0 = np.pad(f0, (0, frame_count - f0.size), mode="constant")
        f0 = f0[:frame_count] * (2 ** (semitones / 12))
        f0_mel = 1127 * np.log1p(f0 / 700)
        mel_min = 1127 * np.log1p(50 / 700)
        mel_max = 1127 * np.log1p(1100 / 700)
        positive = f0_mel > 0
        f0_mel[positive] = (f0_mel[positive] - mel_min) * 254 / (mel_max - mel_min) + 1
        f0_mel[f0_mel <= 1] = 1
        f0_mel[f0_mel > 255] = 255
        coarse = np.rint(f0_mel).astype(np.int64)
        return (
            torch.from_numpy(coarse).unsqueeze(0).to(self.device).long(),
            torch.from_numpy(f0).unsqueeze(0).to(self.device).float(),
        )

    def _extract_features(
        self, audio: np.ndarray, protect: float
    ) -> tuple[torch.Tensor, torch.Tensor | None]:
        tensor = torch.from_numpy(audio).unsqueeze(0).to(self.device)
        tensor = tensor.half() if self.is_half else tensor.float()
        with torch.inference_mode():
            layers, _ = self.hubert.extract_features(tensor, num_layers=12)
        features = layers[-1]
        original = features.clone() if protect < 0.5 else None
        return features, original

    def _apply_index(self, features: torch.Tensor, rate: float) -> torch.Tensor:
        query = features[0].detach().cpu().float().numpy().astype(np.float32, copy=False)
        with tempfile.TemporaryDirectory(dir=self.work_root, prefix="faiss-") as temporary:
            temp_root = Path(temporary).resolve()
            input_path = temp_root / "query.npy"
            output_path = temp_root / "retrieved.npy"
            np.save(input_path, query, allow_pickle=False)
            self._run_faiss_worker(
                "search", input_path=input_path, output_path=output_path, work_root=temp_root
            )
            try:
                retrieved = np.load(output_path, allow_pickle=False)
            except Exception as error:
                raise RvcInferenceError("rvc_index_worker_failed") from error
        if retrieved.shape != query.shape or retrieved.dtype != np.float32:
            raise RvcInferenceError("rvc_index_worker_failed")
        indexed = torch.from_numpy(retrieved).unsqueeze(0).to(self.device)
        indexed = indexed.half() if self.is_half else indexed.float()
        return indexed * rate + features * (1 - rate)

    def _run_faiss_worker(
        self,
        action: Literal["inspect", "search"],
        input_path: Path | None = None,
        output_path: Path | None = None,
        work_root: Path | None = None,
    ) -> dict[str, Any]:
        if getattr(sys, "frozen", False):
            worker = (
                Path(sys.executable).resolve().parent
                / "yachiyo-faiss-worker"
                / "yachiyo-faiss-worker.exe"
            )
            if worker.is_symlink() or not worker.is_file():
                raise RvcInferenceError("rvc_index_worker_missing")
            command = [str(worker)]
        else:
            command = [sys.executable, "-m", "rvc_service.faiss_worker"]
        command.extend(["--action", action, "--index", str(self.index_path)])
        if action == "search":
            if input_path is None or output_path is None or work_root is None:
                raise RvcInferenceError("rvc_index_worker_failed")
            command.extend(
                [
                    "--input",
                    str(input_path),
                    "--output",
                    str(output_path),
                    "--work-root",
                    str(work_root),
                ]
            )
        environment = os.environ.copy()
        environment.pop("YACHIYO_SIDECAR_TOKEN", None)
        environment.update(
            {
                "OMP_NUM_THREADS": "1",
                "OPENBLAS_NUM_THREADS": "1",
                "MKL_NUM_THREADS": "1",
                "NUMEXPR_NUM_THREADS": "1",
            }
        )
        restore_dll_directory: str | None = None
        if getattr(sys, "frozen", False):
            # The FAISS helper is a separate PyInstaller application with its own
            # bundled native libraries. Treat it as a fresh top-level instance
            # instead of letting it inherit this sidecar's private bootloader state.
            environment["PYINSTALLER_RESET_ENVIRONMENT"] = "1"
            if sys.platform == "win32":
                bundle_directory = getattr(sys, "_MEIPASS", None)
                if not isinstance(bundle_directory, str) or not bundle_directory:
                    raise RvcInferenceError("rvc_index_worker_failed")
                restore_dll_directory = bundle_directory
        try:
            if restore_dll_directory is not None:
                _set_windows_dll_directory(None)
            try:
                completed = subprocess.run(
                    command,
                    check=False,
                    shell=False,
                    cwd=self.work_root,
                    env=environment,
                    capture_output=True,
                    text=True,
                    timeout=90,
                    encoding="utf-8",
                )
            finally:
                if restore_dll_directory is not None:
                    _set_windows_dll_directory(restore_dll_directory)
            payload = json.loads(completed.stdout.strip())
        except (OSError, subprocess.SubprocessError, json.JSONDecodeError) as error:
            raise RvcInferenceError("rvc_index_worker_failed") from error
        if completed.returncode != 0 or not isinstance(payload, dict) or payload.get("ok") is not True:
            raise RvcInferenceError("rvc_index_worker_failed")
        return payload

    def _metrics(
        self,
        wall_started: float,
        cpu_started: float,
        peak_before: int,
        source_duration: float,
        output_duration: float,
        timings: dict[str, float],
        cold_start: bool,
        silence: bool,
    ) -> dict[str, float | str | bool]:
        wall_seconds = max(time.perf_counter() - wall_started, 1e-6)
        cpu_seconds = max(0.0, _cpu_seconds(self.process) - cpu_started)
        cores = max(1, psutil.cpu_count(logical=True) or 1)
        peak_rss = max(peak_before, _peak_rss(self.process))
        return {
            "coldStartMs": round(self.cold_start_ms if cold_start else 0.0, 1),
            "conversionMs": round(wall_seconds * 1000, 1),
            "featureMs": round(timings["featureMs"], 1),
            "pitchMs": round(timings["pitchMs"], 1),
            "indexMs": round(timings["indexMs"], 1),
            "inferMs": round(timings["inferMs"], 1),
            "cpuPercent": round(min(100.0, cpu_seconds / wall_seconds / cores * 100), 1),
            "peakRamMb": round(peak_rss / (1024 * 1024), 1),
            "sourceDurationMs": round(source_duration * 1000, 1),
            "audioDurationMs": round(output_duration * 1000, 1),
            "device": str(self.device),
            "deviceName": self.device_name,
            "silence": silence,
        }


def resolve_device(
    requested: Literal["auto", "cpu", "cuda"],
) -> tuple[torch.device, bool]:
    cuda_available = bool(torch.cuda.is_available() and torch.cuda.device_count() > 0)
    if requested == "cuda" and not cuda_available:
        raise RvcInferenceError("cuda_unavailable")
    use_cuda = requested == "cuda" or (requested == "auto" and cuda_available)
    device = torch.device("cuda:0" if use_cuda else "cpu")
    return device, use_cuda


def device_report() -> dict[str, Any]:
    cuda_available = bool(torch.cuda.is_available() and torch.cuda.device_count() > 0)
    devices = ["cpu"]
    cuda_name: str | None = None
    if cuda_available:
        devices.append("cuda")
        cuda_name = torch.cuda.get_device_name(0)
    return {
        "selected": "cuda:0" if cuda_available else "cpu",
        "cudaAvailable": cuda_available,
        "cudaName": cuda_name,
        "devices": devices,
        "torch": torch.__version__,
        "torchCuda": torch.version.cuda,
    }


def _set_windows_dll_directory(path: str | None) -> None:
    """Set the inherited Windows DLL search directory around a frozen helper."""
    import ctypes

    if ctypes.windll.kernel32.SetDllDirectoryW(path) == 0:
        raise OSError(ctypes.get_last_error(), "SetDllDirectoryW failed")


def _bounded_file(path: Path, maximum: int, error_code: str) -> Path:
    resolved = path.expanduser().resolve()
    try:
        size = resolved.stat().st_size
    except OSError as error:
        raise RvcInferenceError(error_code) from error
    if not resolved.is_file() or resolved.is_symlink() or size < 1 or size > maximum:
        raise RvcInferenceError(error_code)
    return resolved


def _read_audio(path: Path) -> tuple[np.ndarray, int]:
    try:
        info = sf.info(path)
        if info.frames < 1 or info.channels < 1 or info.channels > 8 or info.samplerate < 8_000:
            raise RvcInferenceError("rvc_audio_malformed")
        if info.frames / info.samplerate > MAX_INPUT_SECONDS + 1:
            raise RvcInferenceError("rvc_audio_too_long")
        audio, sample_rate = sf.read(path, dtype="float32", always_2d=True)
    except RvcInferenceError:
        raise
    except Exception as error:
        raise RvcInferenceError("rvc_audio_malformed") from error
    mono = audio.mean(axis=1, dtype=np.float32)
    return np.asarray(mono, dtype=np.float32), int(sample_rate)


def _resample_to_features(audio: np.ndarray, sample_rate: int) -> np.ndarray:
    if sample_rate == FEATURE_SAMPLE_RATE:
        return audio.astype(np.float32, copy=False)
    divisor = math.gcd(sample_rate, FEATURE_SAMPLE_RATE)
    result = signal.resample_poly(
        audio, FEATURE_SAMPLE_RATE // divisor, sample_rate // divisor
    )
    return np.asarray(result, dtype=np.float32)


def _cpu_seconds(process: psutil.Process) -> float:
    times = process.cpu_times()
    return float(times.user + times.system)


def _peak_rss(process: psutil.Process) -> int:
    memory = process.memory_info()
    return int(getattr(memory, "peak_wset", memory.rss))
