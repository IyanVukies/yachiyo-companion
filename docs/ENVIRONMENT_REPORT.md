# Environment Report

Inspected on 2026-07-17 in `D:\Tegar\Self Project\Yachiyo_Companion`.

## Windows host

- OS API version: Microsoft Windows NT 10.0.26200.0 (64-bit)
- CPU: 12th Gen Intel Core i7-1255U, 12 logical processors
- Physical memory: approximately 15.7 GB
- Display adapter: Intel Iris Xe Graphics
- NVIDIA tooling: `nvidia-smi` unavailable
- WMI/CIM hardware queries were denied in the managed shell; equivalent read-only registry/.NET checks supplied the facts above.

## Development tools

- Node.js: 22.17.1
- npm / npx: 11.12.1
- Git: 2.52.0.windows.1
- Python: 3.13.3
- Additional Python: 3.11.9 via `py -3.11`
- FFmpeg / FFprobe: not installed system-wide
- Existing Git repository: none

## Compatibility strategy

- Node 22.17 satisfies the selected Vite/Electron toolchain.
- TypeScript remains on the mature 5.9 line instead of the new 7.x line to reduce tooling incompatibility.
- The production FastAPI/RVC sidecar is frozen from Python 3.11.9. Python 3.13 is not used by the packaged inference runtime.
- FFmpeg/FFprobe are supplied through pinned application dependencies or the sidecar build rather than changing the system PATH.
- RVC `auto` resolves to CPU on this machine. The final frozen proof measured a 7.49 s cold engine load, 15.56 s cold conversion, 12.60 s warm conversion, and approximately 1.73 GB peak sidecar RAM. UI and chat remain isolated from inference.
