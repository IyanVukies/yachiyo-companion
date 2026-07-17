from __future__ import annotations

import asyncio
import importlib.util
import inspect
import os
import secrets
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Annotated, Any, Literal

import edge_tts
import uvicorn
from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.trustedhost import TrustedHostMiddleware

MAX_BODY_BYTES = 64 * 1024
MAX_AUDIO_BYTES = 24 * 1024 * 1024
ALLOWED_HOSTS = ["127.0.0.1", "localhost"]


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
        self.ffmpeg = resolve_executable(os.environ.get("YACHIYO_FFMPEG", ""), "ffmpeg")
        self.ffprobe = resolve_executable(os.environ.get("YACHIYO_FFPROBE", ""), "ffprobe")
        self.rvc_engine: Any | None = None
        self.rvc_model_path: Path | None = None
        self.lock = asyncio.Lock()


def create_app() -> FastAPI:
    application = FastAPI(
        title="Yachiyo Voice Sidecar",
        version="0.1.0",
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
        if content_length and int(content_length) > MAX_BODY_BYTES:
            return JSONResponse(status_code=413, content={"error": "request_too_large"})
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
        audio = await convert_rvc(payload)
        return Response(content=audio, media_type="audio/wav")

    @application.post("/engine/reload")
    async def reload_engine() -> dict[str, bool]:
        state.rvc_engine = None
        state.rvc_model_path = None
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
    rvc_package = importlib.util.find_spec("rvc_python") is not None
    rmvpe = find_companion("rmvpe.pt") is not None
    content_vec = find_companion("hubert_base.pt") is not None or find_companion("contentvec") is not None
    return {
        "ok": True,
        "python": sys.version.split()[0],
        "edge_tts": True,
        "ffmpeg": state.ffmpeg is not None,
        "ffprobe": state.ffprobe is not None,
        "rvc": bool(rvc_package and model and index and rmvpe and content_vec and state.ffmpeg),
        "rvc_package": rvc_package,
        "rmvpe": rmvpe,
        "content_vec": content_vec,
        "model": model is not None,
        "index": index is not None,
        "device": "cpu",
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


async def convert_rvc(payload: RvcRequest) -> bytes:
    capabilities = capability_report()
    if not capabilities["rvc"]:
        raise HTTPException(status_code=503, detail="rvc_runtime_unavailable")
    model, index = voice_files()
    if model is None or index is None or state.ffmpeg is None:
        raise HTTPException(status_code=503, detail="rvc_assets_unavailable")

    async with state.lock:
        source_audio = await synthesize_edge(payload)
        with tempfile.TemporaryDirectory(dir=state.temp_root, prefix="yachiyo-") as temp:
            temp_root = Path(temp).resolve()
            source_mp3 = temp_root / "source.mp3"
            source_wav = temp_root / "source.wav"
            output_wav = temp_root / "output.wav"
            source_mp3.write_bytes(source_audio)
            await asyncio.to_thread(run_ffmpeg, source_mp3, source_wav)
            await asyncio.to_thread(
                run_rvc,
                source_wav,
                output_wav,
                model,
                index,
                payload.parameters,
            )
            if not output_wav.is_file() or output_wav.stat().st_size == 0:
                raise HTTPException(status_code=503, detail="rvc_empty_output")
            result = output_wav.read_bytes()
            if len(result) > MAX_AUDIO_BYTES:
                raise HTTPException(status_code=413, detail="audio_too_large")
            return result


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
    parameters: RvcParameters,
) -> None:
    try:
        from rvc_python.infer import RVCInference
    except ImportError as error:
        raise RuntimeError("RVC runtime unavailable") from error

    device = "cpu" if parameters.device in {"auto", "cpu"} else "cuda:0"
    if state.rvc_engine is None or state.rvc_model_path != model:
        state.rvc_engine = RVCInference(device=device)
        state.rvc_engine.load_model(str(model))
        state.rvc_model_path = model

    method = state.rvc_engine.infer_file
    signature = inspect.signature(method)
    candidates: dict[str, Any] = {
        "input_path": str(source),
        "audio_path": str(source),
        "input_file": str(source),
        "output_path": str(target),
        "output_file": str(target),
        "index_path": str(index),
        "f0method": parameters.f0_method,
        "f0_method": parameters.f0_method,
        "f0up_key": parameters.pitch,
        "pitch": parameters.pitch,
        "index_rate": parameters.index_rate,
        "protect": parameters.protect,
    }
    kwargs = {name: value for name, value in candidates.items() if name in signature.parameters}
    if not any(name in kwargs for name in ("input_path", "audio_path", "input_file")):
        method(str(source), str(target), **kwargs)
    else:
        method(**kwargs)


def voice_files() -> tuple[Path | None, Path | None]:
    if state.voice_root is None:
        return None, None
    checkpoint = next(state.voice_root.rglob("kobov2.pth"), None)
    index = next(
        state.voice_root.rglob("added_IVF454_Flat_nprobe_1_kobov2_v2.index"), None
    )
    return safe_asset(checkpoint), safe_asset(index)


def find_companion(name: str) -> Path | None:
    roots = [state.voice_root, Path(__file__).resolve().parent]
    for root in roots:
        if root is None:
            continue
        found = next(root.rglob(name), None)
        if found and found.is_file():
            return found
    return None


def safe_asset(path: Path | None) -> Path | None:
    if path is None or state.voice_root is None:
        return None
    resolved = path.resolve()
    try:
        resolved.relative_to(state.voice_root)
    except ValueError:
        return None
    return resolved if resolved.is_file() else None


def resolve_optional_root(value: str) -> Path | None:
    if not value:
        return None
    path = Path(value).expanduser().resolve()
    return path if path.is_dir() else None


def resolve_temp_root(value: str) -> Path:
    path = Path(value).expanduser().resolve() if value else Path(tempfile.gettempdir()) / "Yachiyo"
    path.mkdir(parents=True, exist_ok=True)
    return path


def resolve_executable(configured: str, name: str) -> Path | None:
    if configured:
        path = Path(configured).expanduser().resolve()
        if path.is_file():
            return path
    found = shutil.which(name)
    return Path(found).resolve() if found else None


state = State()
app = create_app()


def main() -> None:
    if not state.token:
        raise SystemExit("YACHIYO_SIDECAR_TOKEN is required")
    port = int(os.environ.get("YACHIYO_PORT", "0"))
    if port < 1 or port > 65535:
        raise SystemExit("YACHIYO_PORT must be a valid non-zero port")
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_level="warning",
        access_log=False,
        proxy_headers=False,
        server_header=False,
    )


if __name__ == "__main__":
    main()
