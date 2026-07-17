from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path
from typing import Any

from rvc_service.runtime_manager import RuntimeManager


class FakeResponse:
    def __init__(self, url: str, payload: bytes) -> None:
        self._url = url
        self._payload = payload
        self._offset = 0
        self.headers = {"Content-Length": str(len(payload))}

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *_: Any) -> None:
        return None

    def geturl(self) -> str:
        return self._url

    def read(self, size: int) -> bytes:
        chunk = self._payload[self._offset : self._offset + size]
        self._offset += len(chunk)
        return chunk


def test_setup_downloads_only_manifest_urls_and_reports_progress(tmp_path: Path) -> None:
    hubert = b"safe-hubert-state-dict"
    rmvpe = b"safe-rmvpe-state-dict"
    manifest = write_manifest(tmp_path, hubert, rmvpe)
    payloads = {
        "https://download.pytorch.org/torchaudio/models/test-hubert.pth": hubert,
        "https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/commit/test-rmvpe.pt": rmvpe,
    }
    requested: list[str] = []

    def open_request(request: Any, timeout: float) -> FakeResponse:
        assert timeout == 45.0
        requested.append(request.full_url)
        return FakeResponse(request.full_url, payloads[request.full_url])

    runtime = RuntimeManager(tmp_path / "runtime", manifest, open_request)
    assert runtime.status()["state"] == "setup-required"
    started = runtime.start_setup()
    assert started["state"] == "downloading"
    snapshot = wait_for_terminal(runtime)

    assert snapshot["state"] == "ready"
    assert snapshot["progress"] == 100.0
    assert snapshot["downloadedBytes"] == len(hubert) + len(rmvpe)
    assert requested == list(payloads)
    assert (tmp_path / "runtime" / "hubert.pth").read_bytes() == hubert
    assert (tmp_path / "runtime" / "rmvpe.pt").read_bytes() == rmvpe
    assert not list((tmp_path / "runtime").glob("*.part"))


def test_setup_rejects_hash_mismatch_without_replacing_asset(tmp_path: Path) -> None:
    expected = b"expected"
    manifest = write_manifest(tmp_path, expected, expected)

    def open_request(request: Any, _: float) -> FakeResponse:
        return FakeResponse(request.full_url, b"tampered")

    runtime = RuntimeManager(tmp_path / "runtime", manifest, open_request)
    runtime.start_setup()
    snapshot = wait_for_terminal(runtime)

    assert snapshot["state"] == "error"
    assert snapshot["error"] == "download_hash_mismatch"
    assert not (tmp_path / "runtime" / "hubert.pth").exists()


def write_manifest(root: Path, hubert: bytes, rmvpe: bytes) -> Path:
    path = root / "runtime-manifest.json"
    path.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "runtimeVersion": "test",
                "assets": [
                    {
                        "id": "hubert",
                        "label": "HuBERT",
                        "filename": "hubert.pth",
                        "url": "https://download.pytorch.org/torchaudio/models/test-hubert.pth",
                        "sha256": hashlib.sha256(hubert).hexdigest(),
                        "bytes": len(hubert),
                    },
                    {
                        "id": "rmvpe",
                        "label": "RMVPE",
                        "filename": "rmvpe.pt",
                        "url": "https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/commit/test-rmvpe.pt",
                        "sha256": hashlib.sha256(rmvpe).hexdigest(),
                        "bytes": len(rmvpe),
                    },
                ],
                "packages": {},
            }
        ),
        encoding="utf-8",
    )
    return path


def wait_for_terminal(runtime: RuntimeManager) -> dict[str, Any]:
    deadline = time.monotonic() + 3
    snapshot = runtime.status()
    while snapshot["state"] in {"checking", "downloading"} and time.monotonic() < deadline:
        time.sleep(0.01)
        snapshot = runtime.status()
    return snapshot
