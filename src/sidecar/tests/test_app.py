from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from rvc_service import app as voice


TOKEN = "sidecar-test-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


def setup_module() -> None:
    voice.state.token = TOKEN


def test_health_requires_the_random_bearer_token() -> None:
    with TestClient(voice.create_app(), base_url="http://127.0.0.1") as client:
        assert client.get("/health").status_code == 401
        response = client.get("/health", headers=AUTH)

    assert response.status_code == 200
    assert response.json()["ok"] is True
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["cache-control"] == "no-store"


def test_payloads_are_strict_and_size_limited() -> None:
    with TestClient(voice.create_app(), base_url="http://127.0.0.1") as client:
        unknown = client.post(
            "/tts/basic",
            headers=AUTH,
            json={"text": "halo", "voice": "id-ID-GadisNeural", "unexpected": True},
        )
        oversized = client.post(
            "/tts/basic",
            headers={**AUTH, "Content-Length": str(voice.MAX_BODY_BYTES + 1)},
            content=b"{}",
        )

    assert unknown.status_code == 422
    assert oversized.status_code == 413
    assert oversized.json() == {"error": "request_too_large"}


def test_basic_tts_returns_only_generated_audio(monkeypatch: Any) -> None:
    async def fake_synthesize(_: voice.TtsRequest) -> bytes:
        return b"ID3-safe-audio"

    monkeypatch.setattr(voice, "synthesize_edge", fake_synthesize)
    with TestClient(voice.create_app(), base_url="http://127.0.0.1") as client:
        response = client.post(
            "/tts/basic",
            headers=AUTH,
            json={"text": "halo", "voice": "id-ID-GadisNeural"},
        )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("audio/mpeg")
    assert response.content == b"ID3-safe-audio"


def test_rvc_fails_closed_when_companion_runtime_is_missing() -> None:
    with TestClient(voice.create_app(), base_url="http://127.0.0.1") as client:
        response = client.post(
            "/voice/rvc",
            headers=AUTH,
            json={"text": "halo", "voice": "id-ID-GadisNeural"},
        )

    assert response.status_code == 503
    assert response.json() == {"detail": "rvc_runtime_unavailable"}


def test_ffmpeg_uses_a_fixed_argument_list_without_a_shell(
    monkeypatch: Any, tmp_path: Path
) -> None:
    calls: list[tuple[list[str], dict[str, Any]]] = []

    def fake_run(arguments: list[str], **options: Any) -> None:
        calls.append((arguments, options))

    monkeypatch.setattr(voice.subprocess, "run", fake_run)
    monkeypatch.setattr(voice.state, "ffmpeg", tmp_path / "ffmpeg.exe")
    monkeypatch.setattr(voice.state, "temp_root", tmp_path)
    source = tmp_path / "source.mp3"
    target = tmp_path / "target.wav"

    voice.run_ffmpeg(source, target)

    arguments, options = calls[0]
    assert arguments[0].endswith("ffmpeg.exe")
    assert arguments[-1] == str(target)
    assert options["shell"] is False
    assert options["check"] is True
    assert options["timeout"] == 60
