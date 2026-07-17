from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

import faiss
import numpy as np


FEATURE_DIMENSIONS = 768
MAX_INDEX_BYTES = 1024 * 1024 * 1024
MAX_INDEX_VECTORS = 2_000_000
MAX_QUERY_FRAMES = 10_000


class WorkerError(RuntimeError):
    pass


def inspect_index(index_path: Path) -> tuple[Any, dict[str, int | bool | str]]:
    index_file = index_path.expanduser().resolve()
    if (
        index_file.is_symlink()
        or not index_file.is_file()
        or index_file.stat().st_size < 1
        or index_file.stat().st_size > MAX_INDEX_BYTES
    ):
        raise WorkerError("index_invalid")
    try:
        index = faiss.read_index(str(index_file))
    except Exception as error:
        raise WorkerError("index_unreadable") from error
    if (
        index.d != FEATURE_DIMENSIONS
        or not index.is_trained
        or index.ntotal < 1
        or index.ntotal > MAX_INDEX_VECTORS
    ):
        raise WorkerError("index_incompatible")
    return index, {
        "type": type(index).__name__,
        "dimensions": int(index.d),
        "vectors": int(index.ntotal),
        "trained": bool(index.is_trained),
    }


def search(index: Any, query_path: Path, output_path: Path, work_root: Path) -> int:
    root = work_root.expanduser().resolve()
    query_file = _confined(query_path, root, must_exist=True)
    output_file = _confined(output_path, root, must_exist=False)
    if output_file.exists() or output_file.is_symlink():
        raise WorkerError("output_exists")
    try:
        query = np.load(query_file, allow_pickle=False)
    except Exception as error:
        raise WorkerError("query_invalid") from error
    if (
        query.dtype != np.float32
        or query.ndim != 2
        or query.shape[1] != FEATURE_DIMENSIONS
        or query.shape[0] < 1
        or query.shape[0] > MAX_QUERY_FRAMES
        or not np.all(np.isfinite(query))
    ):
        raise WorkerError("query_invalid")
    neighbours = min(8, index.ntotal)
    distances, indices = index.search(query, neighbours)
    valid = indices >= 0
    safe_indices = np.clip(indices, 0, index.ntotal - 1)
    safe_distances = np.maximum(distances, 1e-6)
    weights = np.where(valid, 1.0 / np.square(safe_distances), 0.0)
    weight_sum = weights.sum(axis=1, keepdims=True)
    usable = weight_sum[:, 0] > 0
    weights[usable] /= weight_sum[usable]
    vectors = index.reconstruct_n(0, index.ntotal)
    retrieved = np.sum(vectors[safe_indices] * weights[:, :, None], axis=1).astype(
        np.float32, copy=False
    )
    retrieved[~usable] = query[~usable]
    np.save(output_file, retrieved, allow_pickle=False)
    return int(query.shape[0])


def main(arguments: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--action", required=True, choices=["inspect", "search"])
    parser.add_argument("--index", required=True)
    parser.add_argument("--input")
    parser.add_argument("--output")
    parser.add_argument("--work-root")
    try:
        options = parser.parse_args(arguments)
        faiss.omp_set_num_threads(1)
        started = time.perf_counter()
        index, metadata = inspect_index(Path(options.index))
        frames = 0
        if options.action == "search":
            if not options.input or not options.output or not options.work_root:
                raise WorkerError("arguments_invalid")
            frames = search(
                index,
                Path(options.input),
                Path(options.output),
                Path(options.work_root),
            )
        print(
            json.dumps(
                {
                    "ok": True,
                    "metadata": metadata,
                    "frames": frames,
                    "elapsedMs": round((time.perf_counter() - started) * 1000, 1),
                },
                separators=(",", ":"),
            ),
            flush=True,
        )
        return 0
    except (WorkerError, OSError, ValueError) as error:
        print(
            json.dumps(
                {"ok": False, "error": str(error)}, separators=(",", ":")
            ),
            flush=True,
        )
        return 2


def _confined(path: Path, root: Path, must_exist: bool) -> Path:
    resolved = path.expanduser().resolve(strict=False)
    try:
        resolved.relative_to(root)
    except ValueError as error:
        raise WorkerError("path_escape") from error
    if resolved.parent != root:
        raise WorkerError("path_invalid")
    if must_exist and (resolved.is_symlink() or not resolved.is_file()):
        raise WorkerError("path_invalid")
    return resolved


if __name__ == "__main__":
    sys.exit(main())
