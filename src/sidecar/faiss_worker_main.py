"""Dedicated process entry point for the isolated FAISS index worker."""

from __future__ import annotations

from rvc_service.faiss_worker import main


if __name__ == "__main__":
    raise SystemExit(main())
