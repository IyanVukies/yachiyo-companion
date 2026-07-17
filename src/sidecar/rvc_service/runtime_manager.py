from __future__ import annotations

import copy
import hashlib
import json
import os
import threading
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable


CHUNK_BYTES = 1024 * 1024
MAX_RUNTIME_ASSET_BYTES = 512 * 1024 * 1024
ALLOWED_DOWNLOAD_HOSTS = frozenset(
    {
        "download.pytorch.org",
        "download-r2.pytorch.org",
        "huggingface.co",
        "cdn-lfs.huggingface.co",
        "cas-bridge.xethub.hf.co",
    }
)


class RuntimeSetupError(RuntimeError):
    """A public-safe runtime setup failure."""


@dataclass(frozen=True)
class RuntimeAsset:
    asset_id: str
    label: str
    filename: str
    url: str
    sha256: str
    size: int


class _PinnedRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(
        self,
        request: urllib.request.Request,
        file_pointer: Any,
        code: int,
        message: str,
        headers: Any,
        new_url: str,
    ) -> urllib.request.Request | None:
        _validate_download_url(new_url)
        return super().redirect_request(
            request, file_pointer, code, message, headers, new_url
        )


class RuntimeManager:
    def __init__(
        self,
        root: Path,
        manifest_path: Path | None = None,
        opener: Callable[[urllib.request.Request, float], Any] | None = None,
    ) -> None:
        self.root = root.expanduser().resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        if self.root.is_symlink():
            raise RuntimeSetupError("runtime_root_invalid")
        self.manifest_path = (
            manifest_path or Path(__file__).with_name("runtime-manifest.json")
        ).resolve()
        self.manifest = _read_manifest(self.manifest_path)
        self.assets = _parse_assets(self.manifest)
        self.total_bytes = sum(asset.size for asset in self.assets)
        self._lock = threading.RLock()
        self._worker: threading.Thread | None = None
        self._checked = False
        self._opener = opener or self._open_request
        self._snapshot: dict[str, Any] = {
            "state": "checking",
            "stage": "Memeriksa aset runtime RVC…",
            "progress": 0.0,
            "downloadedBytes": 0,
            "totalBytes": self.total_bytes,
            "currentAsset": None,
            "error": None,
            "assets": {
                asset.asset_id: {
                    "label": asset.label,
                    "state": "checking",
                    "bytes": asset.size,
                }
                for asset in self.assets
            },
        }

    def status(self) -> dict[str, Any]:
        with self._lock:
            should_check = not self._checked and not self._worker_alive()
        if should_check:
            self.verify_assets()
        with self._lock:
            return copy.deepcopy(self._snapshot)

    def paths(self) -> dict[str, Path] | None:
        snapshot = self.status()
        if snapshot["state"] != "ready":
            return None
        return {asset.asset_id: self._target(asset) for asset in self.assets}

    def start_setup(self) -> dict[str, Any]:
        with self._lock:
            if self._worker_alive():
                return copy.deepcopy(self._snapshot)
            if self._checked and self._snapshot["state"] == "ready":
                return copy.deepcopy(self._snapshot)
            self._snapshot.update(
                {
                    "state": "downloading",
                    "stage": "Menyiapkan runtime RVC…",
                    "currentAsset": None,
                    "error": None,
                }
            )
            self._worker = threading.Thread(
                target=self._setup_worker,
                name="yachiyo-rvc-setup",
                daemon=True,
            )
            self._worker.start()
            return copy.deepcopy(self._snapshot)

    def verify_assets(self) -> dict[str, Any]:
        with self._lock:
            if self._worker_alive() and self._worker is not threading.current_thread():
                return copy.deepcopy(self._snapshot)
            self._snapshot.update(
                {
                    "state": "checking",
                    "stage": "Memverifikasi hash runtime RVC…",
                    "currentAsset": None,
                    "error": None,
                }
            )

        valid_bytes = 0
        all_valid = True
        for asset in self.assets:
            target = self._target(asset)
            valid = _file_matches(target, asset)
            all_valid = all_valid and valid
            if valid:
                valid_bytes += asset.size
            self._set_asset_state(asset, "ready" if valid else "missing")

        with self._lock:
            self._checked = True
            self._snapshot.update(
                {
                    "state": "ready" if all_valid else "setup-required",
                    "stage": (
                        "Runtime RVC siap."
                        if all_valid
                        else "Unduh aset resmi HuBERT dan RMVPE untuk mengaktifkan RVC."
                    ),
                    "progress": _progress(valid_bytes, self.total_bytes),
                    "downloadedBytes": valid_bytes,
                    "currentAsset": None,
                    "error": None,
                }
            )
            return copy.deepcopy(self._snapshot)

    def _setup_worker(self) -> None:
        try:
            valid_bytes = 0
            for asset in self.assets:
                target = self._target(asset)
                if _file_matches(target, asset):
                    valid_bytes += asset.size
                    self._set_asset_state(asset, "ready")
                    self._set_progress(valid_bytes, asset.label)
                    continue
                self._set_asset_state(asset, "downloading")
                valid_bytes = self._download_asset(asset, target, valid_bytes)
                self._set_asset_state(asset, "ready")

            with self._lock:
                self._checked = False
            self.verify_assets()
        except Exception as error:
            with self._lock:
                self._checked = True
                self._snapshot.update(
                    {
                        "state": "error",
                        "stage": "Penyiapan RVC gagal. Basic TTS tetap dapat digunakan.",
                        "currentAsset": None,
                        "error": _public_error(error),
                    }
                )

    def _download_asset(
        self, asset: RuntimeAsset, target: Path, complete_bytes: int
    ) -> int:
        _validate_download_url(asset.url)
        part = target.with_suffix(target.suffix + ".part")
        if part.exists() or part.is_symlink():
            part.unlink(missing_ok=True)
        digest = hashlib.sha256()
        downloaded = 0
        request = urllib.request.Request(
            asset.url,
            headers={
                "Accept": "application/octet-stream",
                "Accept-Encoding": "identity",
                "User-Agent": "Yachiyo-Companion/0.2.0",
            },
            method="GET",
        )
        try:
            with self._opener(request, 45.0) as response:
                _validate_download_url(response.geturl())
                length_header = response.headers.get("Content-Length")
                if length_header:
                    content_length = int(length_header)
                    if content_length != asset.size:
                        raise RuntimeSetupError("download_size_mismatch")
                with part.open("xb") as output:
                    while True:
                        chunk = response.read(CHUNK_BYTES)
                        if not chunk:
                            break
                        downloaded += len(chunk)
                        if downloaded > asset.size:
                            raise RuntimeSetupError("download_too_large")
                        digest.update(chunk)
                        output.write(chunk)
                        self._set_progress(complete_bytes + downloaded, asset.label)
                    output.flush()
                    os.fsync(output.fileno())
            if downloaded != asset.size:
                raise RuntimeSetupError("download_incomplete")
            if digest.hexdigest().lower() != asset.sha256:
                raise RuntimeSetupError("download_hash_mismatch")
            os.replace(part, target)
            return complete_bytes + asset.size
        except (OSError, urllib.error.URLError, ValueError) as error:
            raise RuntimeSetupError("download_unavailable") from error
        finally:
            part.unlink(missing_ok=True)

    def _target(self, asset: RuntimeAsset) -> Path:
        target = (self.root / asset.filename).resolve(strict=False)
        try:
            target.relative_to(self.root)
        except ValueError as error:
            raise RuntimeSetupError("runtime_path_escape") from error
        if target.parent != self.root:
            raise RuntimeSetupError("runtime_path_invalid")
        return target

    def _set_asset_state(self, asset: RuntimeAsset, value: str) -> None:
        with self._lock:
            self._snapshot["assets"][asset.asset_id]["state"] = value

    def _set_progress(self, downloaded: int, label: str) -> None:
        bounded = max(0, min(downloaded, self.total_bytes))
        with self._lock:
            self._snapshot.update(
                {
                    "state": "downloading",
                    "stage": f"Mengunduh {label} dari sumber resmi…",
                    "progress": _progress(bounded, self.total_bytes),
                    "downloadedBytes": bounded,
                    "currentAsset": label,
                    "error": None,
                }
            )

    def _worker_alive(self) -> bool:
        return self._worker is not None and self._worker.is_alive()

    @staticmethod
    def _open_request(request: urllib.request.Request, timeout: float) -> Any:
        opener = urllib.request.build_opener(_PinnedRedirectHandler())
        return opener.open(request, timeout=timeout)


def _read_manifest(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeSetupError("runtime_manifest_invalid") from error
    if not isinstance(data, dict) or data.get("schemaVersion") != 1:
        raise RuntimeSetupError("runtime_manifest_invalid")
    return data


def _parse_assets(manifest: dict[str, Any]) -> tuple[RuntimeAsset, ...]:
    raw_assets = manifest.get("assets")
    if not isinstance(raw_assets, list) or not raw_assets:
        raise RuntimeSetupError("runtime_manifest_invalid")
    assets: list[RuntimeAsset] = []
    seen: set[str] = set()
    for raw in raw_assets:
        if not isinstance(raw, dict):
            raise RuntimeSetupError("runtime_manifest_invalid")
        try:
            asset = RuntimeAsset(
                asset_id=str(raw["id"]),
                label=str(raw["label"]),
                filename=str(raw["filename"]),
                url=str(raw["url"]),
                sha256=str(raw["sha256"]).lower(),
                size=int(raw["bytes"]),
            )
        except (KeyError, TypeError, ValueError) as error:
            raise RuntimeSetupError("runtime_manifest_invalid") from error
        if (
            not asset.asset_id.isascii()
            or not asset.asset_id.replace("-", "").isalnum()
            or Path(asset.filename).name != asset.filename
            or len(asset.sha256) != 64
            or any(character not in "0123456789abcdef" for character in asset.sha256)
            or asset.size < 1
            or asset.size > MAX_RUNTIME_ASSET_BYTES
            or asset.asset_id in seen
        ):
            raise RuntimeSetupError("runtime_manifest_invalid")
        _validate_download_url(asset.url)
        seen.add(asset.asset_id)
        assets.append(asset)
    return tuple(assets)


def _validate_download_url(value: str) -> None:
    parsed = urllib.parse.urlsplit(value)
    if (
        parsed.scheme != "https"
        or parsed.hostname not in ALLOWED_DOWNLOAD_HOSTS
        or parsed.username is not None
        or parsed.password is not None
        or parsed.port not in (None, 443)
        or parsed.fragment
    ):
        raise RuntimeSetupError("download_origin_rejected")


def _file_matches(path: Path, asset: RuntimeAsset) -> bool:
    try:
        if path.is_symlink() or not path.is_file() or path.stat().st_size != asset.size:
            return False
        digest = hashlib.sha256()
        with path.open("rb") as source:
            for chunk in iter(lambda: source.read(CHUNK_BYTES), b""):
                digest.update(chunk)
        return digest.hexdigest().lower() == asset.sha256
    except OSError:
        return False


def _progress(downloaded: int, total: int) -> float:
    return round((downloaded / total) * 100, 1) if total else 0.0


def _public_error(error: Exception) -> str:
    if isinstance(error, RuntimeSetupError):
        return str(error)
    return "runtime_setup_failed"
