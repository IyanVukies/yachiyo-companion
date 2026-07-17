from __future__ import annotations

import asyncio
import base64
import importlib.metadata
import importlib.util
import json
import os
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Annotated, Any, Literal

import edge_tts
import uvicorn
from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .runtime_manager import RuntimeManager


MAX_BODY_BYTES = 64 * 1024
MAX_AUDIO_BYTES = 24 * 1024 * 1024
ALLOWED_HOSTS = ["127.0.0.1", "localhost"]
RUNTIME_PACKAGE_NAMES = (
    "torch",
    "torchaudio",
    "numpy",
    "scipy",
    "soundfile",
    "psutil",
)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class RvcParameters(StrictModel):
    pitch: int = Field(default=0, ge=-24, le=24)
    index_rate: float = Field(default=0.5, ge=0, le=1)
    protect: float = Field(default=0.33, ge=0, le=0.5)
    f0_method: Literal["rmvpe", "harvest", "crepe", "pm"] = "rmvpe"
    device: Literal["auto", "cpu", "cuda"] = "auto"


class TtsRequest(StrictModel):
    text: str = Field(min_length=1, max_length=2_000)
    voice: str = Field(default="id-ID-GadisNeural", min_length=1, max_length=160)
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    pitch: float = Field(default=0, ge=-50, le=50)
    volume: float = Field(default=1.0, ge=0, le=1)


class RvcRequest(TtsRequest):
    parameters: RvcParameters = Field(default_factory=RvcParameters)


class State:
    def __init__(self) -> None:
        self.token = os.environ.get("YACHIYO_SIDECAR_TOKEN", "")
        self.voice_root = resolve_optional_root(os.environ.get("YACHIYO_VOICE_ROOT", ""))
        self.temp_root = resolve_temp_root(os.environ.get("YACHIYO_TEMP_ROOT", ""))
        self.runtime_root = resolve_runtime_root(os.environ.get("YACHIYO_RUNTIME_ROOT", ""))
        self.ffmpeg = resolve_executable(os.environ.get("YACHIYO_FFMPEG", ""), "ffmpeg")
        self.ffprobe = resolve_executable(os.environ.get("YACHIYO_FFPROBE", ""), "ffprobe")
        self.runtime = RuntimeManager(self.runtime_root)
        self.rvc_engine: Any | None = None
        self.rvc_engine_key: tuple[str, ...] | None = None
        self.engine_is_cold = False
        self.last_metrics: dict[str, Any] | None = None
        self.lock = asyncio.Lock()


def create_app() -> FastAPI:
    application = FastAPI(
        title="Yachiyo Voice Sidecar",
        version="0.2.0",
        debug=False,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        dependencies=[Depends(require_token)],
    )
    application.add_middleware(TrustedHostMiddleware, allowed_hosts=ALLOWED_HOSTS)

    @application.middleware("http")
    async def secure_headers_and_size(request: Request, call_next: Any) -> Response:
        content_length = request.headers.get("content-length")
        try:
            if content_length and int(content_length) > MAX_BODY_BYTES:
                return JSONResponse(status_code=413, content={"error": "request_too_large"})
        except ValueError:
            return JSONResponse(status_code=400, content={"error": "content_length_invalid"})
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = "no-store"
        response.headers["Referrer-Policy"] = "no-referrer"
        return response

    @application.exception_handler(Exception)
    async def safe_error(_: Request, error: Exception) -> JSONResponse:
        if isinstance(error, HTTPException):
            return JSONResponse(status_code=error.status_code, content={"error": str(error.detail)})
        return JSONResponse(status_code=500, content={"error": "voice_engine_error"})

    @application.get("/health")
    async def health() -> dict[str, Any]:
        return capability_report()

    @application.get("/capabilities")
    async def capabilities() -> dict[str, Any]:
        return capability_report()

    @application.get("/runtime/status")
    async def runtime_status() -> dict[str, Any]:
        return state.runtime.status()

    @application.post("/runtime/setup")
    async def runtime_setup() -> dict[str, Any]:
        return state.runtime.start_setup()

    @application.get("/metrics")
    async def metrics() -> dict[str, Any]:
        return {"last": state.last_metrics}

    @application.post("/tts/basic")
    async def basic_tts(payload: TtsRequest) -> Response:
        audio = await synthesize_edge(payload)
        return Response(content=audio, media_type="audio/mpeg")

    @application.post("/voice/test")
    async def test_voice(payload: TtsRequest) -> Response:
        audio = await synthesize_edge(payload)
        return Response(content=audio, media_type="audio/mpeg")

    @application.post("/voice/rvc")
    async def rvc_voice(payload: RvcRequest) -> Response:
        audio, conversion_metrics = await convert_rvc(payload)
        return Response(
            content=audio,
            media_type="audio/wav",
            headers={"X-Yachiyo-Metrics": encode_metrics(conversion_metrics)},
        )

    @application.post("/engine/reload")
    async def reload_engine() -> dict[str, bool]:
        close_engine()
        return {"ok": True}

    return application


async def require_token(authorization: Annotated[str | None, Header()] = None) -> None:
    if not state.token or authorization is None:
        raise HTTPException(status_code=401, detail="unauthorized")
    supplied = authorization.removeprefix("Bearer ") if authorization.startswith("Bearer ") else ""
    if not secrets.compare_digest(supplied, state.token):
        raise HTTPException(status_code=401, detail="unauthorized")


def capability_report() -> dict[str, Any]:
    model, index = voice_files()
    package_ready = all(
        importlib.util.find_spec(name) is not None for name in RUNTIME_PACKAGE_NAMES
    ) and faiss_worker_available()
    runtime = state.runtime.status()
    runtime_paths = state.runtime.paths() if runtime["state"] == "ready" else None
    device = basic_device_report()
    engine_import_ready = False
    if package_ready and runtime_paths is not None and model is not None and index is not None:
        try:
            from .rvc_engine import device_report

            device = device_report()
            engine_import_ready = True
        except Exception:
            device = basic_device_report()
    rvc_ready = bool(
        package_ready
        and engine_import_ready
        and runtime_paths
        and model
        and index
        and state.ffmpeg
        and state.ffprobe
    )
    return {
        "ok": True,
        "python": sys.version.split()[0],
        "edge_tts": True,
        "ffmpeg": state.ffmpeg is not None,
        "ffprobe": state.ffprobe is not None,
        "rvc": rvc_ready,
        "rvc_package": package_ready,
        "rmvpe": bool(runtime_paths and runtime_paths.get("rmvpe")),
        "content_vec": bool(runtime_paths and runtime_paths.get("hubert")),
        "model": model is not None,
        "index": index is not None,
        "device": device["selected"],
        "device_info": device,
        "runtime": runtime,
        "versions": package_versions(),
    }


async def synthesize_edge(payload: TtsRequest) -> bytes:
    rate = round((payload.speed - 1) * 100)
    pitch = round(payload.pitch)
    volume = round((payload.volume - 1) * 100)
    communicator = edge_tts.Communicate(
        payload.text,
        payload.voice,
        rate=f"{rate:+d}%",
        pitch=f"{pitch:+d}Hz",
        volume=f"{volume:+d}%",
    )
    chunks: list[bytes] = []
    size = 0
    try:
        async for chunk in communicator.stream():
            if chunk["type"] != "audio":
                continue
            data = chunk["data"]
            size += len(data)
            if size > MAX_AUDIO_BYTES:
                raise HTTPException(status_code=413, detail="audio_too_large")
            chunks.append(data)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=503, detail="edge_tts_unavailable") from error
    if not chunks:
        raise HTTPException(status_code=503, detail="edge_tts_empty")
    return b"".join(chunks)


async def convert_rvc(payload: RvcRequest) -> tuple[bytes, dict[str, Any]]:
    capabilities = capability_report()
    if not capabilities["rvc"]:
        raise HTTPException(status_code=503, detail="rvc_runtime_unavailable")
    if payload.parameters.f0_method != "rmvpe":
        raise HTTPException(status_code=422, detail="rvc_f0_method_unsupported")
    model, index = voice_files()
    runtime_paths = state.runtime.paths()
    if model is None or index is None or runtime_paths is None or state.ffmpeg is None:
        raise HTTPException(status_code=503, detail="rvc_assets_unavailable")

    async with state.lock:
        total_started = time.perf_counter()
        tts_started = time.perf_counter()
        source_audio = await synthesize_edge(payload)
        tts_ms = (time.perf_counter() - tts_started) * 1000
        with tempfile.TemporaryDirectory(dir=state.temp_root, prefix="yachiyo-") as temp:
            temp_root = Path(temp).resolve()
            source_mp3 = temp_root / "source.mp3"
            source_wav = temp_root / "source-48k-mono.wav"
            output_wav = temp_root / "output-rvc.wav"
            source_mp3.write_bytes(source_audio)
            try:
                await asyncio.to_thread(run_ffmpeg, source_mp3, source_wav)
                conversion_metrics = await asyncio.to_thread(
                    run_rvc,
                    source_wav,
                    output_wav,
                    model,
                    index,
                    runtime_paths,
                    payload.parameters,
                )
            except HTTPException:
                raise
            except Exception as error:
                code = getattr(error, "args", ["rvc_conversion_failed"])[0]
                safe_code = code if isinstance(code, str) and code.startswith(("rvc_", "cuda_")) else "rvc_conversion_failed"
                raise HTTPException(status_code=503, detail=safe_code) from error
            if not output_wav.is_file() or output_wav.stat().st_size <= 44:
                raise HTTPException(status_code=503, detail="rvc_empty_output")
            result = output_wav.read_bytes()
            if len(result) > MAX_AUDIO_BYTES:
                raise HTTPException(status_code=413, detail="audio_too_large")
            metrics = {
                **conversion_metrics,
                "ttsMs": round(tts_ms, 1),
                "totalMs": round((time.perf_counter() - total_started) * 1000, 1),
                "outputBytes": len(result),
            }
            state.last_metrics = metrics
            return result, metrics


def run_ffmpeg(source: Path, target: Path) -> None:
    assert state.ffmpeg is not None
    subprocess.run(
        [
            str(state.ffmpeg),
            "-hide_banner",
            "-loglevel",
            "error",
            "-nostdin",
            "-y",
            "-i",
            str(source),
            "-ac",
            "1",
            "-ar",
            "48000",
            "-c:a",
            "pcm_s16le",
            str(target),
        ],
        check=True,
        shell=False,
        timeout=60,
        cwd=state.temp_root,
        capture_output=True,
    )


def run_rvc(
    source: Path,
    target: Path,
    model: Path,
    index: Path,
    runtime_paths: dict[str, Path],
    parameters: RvcParameters,
) -> dict[str, Any]:
    from .rvc_engine import RvcEngine, RvcOptions

    key = (
        str(model),
        str(index),
        str(runtime_paths["hubert"]),
        str(runtime_paths["rmvpe"]),
        parameters.device,
    )
    if state.rvc_engine is None or state.rvc_engine_key != key:
        close_engine()
        state.rvc_engine = RvcEngine(
            model,
            index,
            runtime_paths["hubert"],
            runtime_paths["rmvpe"],
            parameters.device,
            state.temp_root,
        )
        state.rvc_engine_key = key
        state.engine_is_cold = True
    options = RvcOptions(
        pitch=parameters.pitch,
        index_rate=parameters.index_rate,
        protect=parameters.protect,
        device=parameters.device,
    )
    conversion = state.rvc_engine.convert_file(
        source, target, options, state.engine_is_cold
    )
    state.engine_is_cold = False
    return conversion.metrics


def close_engine() -> None:
    if state.rvc_engine is not None:
        try:
            state.rvc_engine.close()
        except Exception:
            pass
    state.rvc_engine = None
    state.rvc_engine_key = None
    state.engine_is_cold = False


def voice_files() -> tuple[Path | None, Path | None]:
    if state.voice_root is None:
        return None, None
    checkpoint = next(state.voice_root.rglob("kobov2.pth"), None)
    index = next(
        state.voice_root.rglob("added_IVF454_Flat_nprobe_1_kobov2_v2.index"), None
    )
    return safe_asset(checkpoint), safe_asset(index)


def safe_asset(path: Path | None) -> Path | None:
    if path is None or state.voice_root is None:
        return None
    resolved = path.resolve()
    try:
        resolved.relative_to(state.voice_root)
    except ValueError:
        return None
    return resolved if resolved.is_file() and not resolved.is_symlink() else None


def package_versions() -> dict[str, str | None]:
    manifest_packages = state.runtime.manifest.get("packages", {})
    result: dict[str, str | None] = {}
    if not isinstance(manifest_packages, dict):
        return result
    for distribution in manifest_packages:
        try:
            result[str(distribution)] = importlib.metadata.version(str(distribution))
        except importlib.metadata.PackageNotFoundError:
            result[str(distribution)] = None
    return result


def basic_device_report() -> dict[str, Any]:
    return {
        "selected": "cpu",
        "cudaAvailable": False,
        "cudaName": None,
        "devices": ["cpu"],
        "torch": package_versions().get("torch"),
        "torchCuda": None,
    }


def faiss_worker_available() -> bool:
    if getattr(sys, "frozen", False):
        worker = (
            Path(sys.executable).resolve().parent
            / "yachiyo-faiss-worker"
            / "yachiyo-faiss-worker.exe"
        )
        return worker.is_file() and not worker.is_symlink()
    return importlib.util.find_spec("faiss") is not None


def encode_metrics(metrics: dict[str, Any]) -> str:
    payload = json.dumps(metrics, ensure_ascii=True, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")


def resolve_optional_root(value: str) -> Path | None:
    if not value:
        return None
    path = Path(value).expanduser().resolve()
    return path if path.is_dir() else None


def resolve_temp_root(value: str) -> Path:
    path = Path(value).expanduser().resolve() if value else Path(tempfile.gettempdir()) / "Yachiyo"
    path.mkdir(parents=True, exist_ok=True)
    return path


def resolve_runtime_root(value: str) -> Path:
    path = (
        Path(value).expanduser().resolve()
        if value
        else Path(tempfile.gettempdir()).resolve() / "Yachiyo" / "voice-runtime" / "0.2.0"
    )
    path.mkdir(parents=True, exist_ok=True)
    return path


def resolve_executable(configured: str, name: str) -> Path | None:
    if configured:
        path = Path(configured).expanduser().resolve()
        if path.is_file() and not path.is_symlink():
            return path
    found = shutil.which(name)
    return Path(found).resolve() if found else None


state = State()
app = create_app()


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] == "--runtime-check":
        raise SystemExit(runtime_check())
    if not state.token:
        raise SystemExit("YACHIYO_SIDECAR_TOKEN is required")
    try:
        port = int(os.environ.get("YACHIYO_PORT", "0"))
    except ValueError as error:
        raise SystemExit("YACHIYO_PORT must be a valid non-zero port") from error
    if port < 1 or port > 65535:
        raise SystemExit("YACHIYO_PORT must be a valid non-zero port")
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_level="warning",
        log_config=None,
        access_log=False,
        proxy_headers=False,
        server_header=False,
    )


def runtime_check() -> int:
    """Offline support diagnostic; never reads voice files or credentials."""
    try:
        from .rvc_engine import device_report

        print(json.dumps({"ok": True, "device": device_report()}, separators=(",", ":")))
        return 0
    except Exception as error:
        cause = error.__cause__ or error.__context__
        print(
            json.dumps(
                {
                    "ok": False,
                    "errorType": type(error).__name__,
                    "error": str(error)[:500],
                    "causeType": type(cause).__name__ if cause else None,
                    "cause": str(cause)[:500] if cause else None,
                },
                separators=(",", ":"),
            )
        )
        return 2


if __name__ == "__main__":
    main()
