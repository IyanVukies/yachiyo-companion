"""Stable entry point for source and PyInstaller sidecar builds."""

from __future__ import annotations

import multiprocessing

from rvc_service.app import main


if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()
