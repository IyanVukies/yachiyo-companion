# Changelog

## 0.1.1 — 2026-07-17

Asset-selection reliability release.

### Fixed

- Native folder selections are shown immediately, validated automatically, persisted atomically, and restored after restart.
- Mao accepts either the parent folder containing `runtime\mao_pro.model3.json` or the `runtime` folder itself and normalizes both to the runtime model root.
- Mao and Kobo now expose visible scanning, success, cancellation, and plain-language validation feedback, plus explicit **Ganti folder** and **Scan ulang** actions.
- The asset inventory now reports the model entry, expressions, motions, textures and dimensions, physics, pose, EyeBlink IDs, LipSync IDs, and Kobo model metadata.
- Mao reports `core-missing` until an official compatible Cubism Core is selected and reports `ready` only after both assets validate.
- ZIP support is now reachable through a separate **Pilih ZIP** action instead of being claimed without a usable picker.

### Security and verification

- Asset paths remain main-process-owned through one-time native-dialog selection tokens; renderer settings cannot bypass validated IPC.
- Existing renderer sandboxing, context isolation, path confinement, ZIP traversal/size protections, and secret handling remain enabled.
- Added renderer, IPC, validator, persistence, source Electron, packaged Electron, and installed-build regressions, including paths with spaces and non-ASCII characters.
- Hardened the sidecar test runner with a guarded, run-scoped temporary directory so clean release workspaces are deterministic.

## 0.1.0 — 2026-07-17

Initial personal Windows release.

### Added

- Frameless transparent Electron desktop companion with tray, always-on-top, click-through recovery, positioning, auto-start setting, and branded Windows icon.
- Calm React onboarding, animated fallback avatar, chat, Avatar Lab, reminders, settings, status, and diagnostics UI.
- Local random-port/token Hermes mock with streaming and deterministic failure scenarios.
- OpenAI-compatible Hermes streaming client with cancellation, conservative retry, normalized errors, and allowlisted avatar metadata.
- Encrypted Hermes key vault through Electron `safeStorage`.
- Persistent local proactive scheduler with Asia/Jakarta quiet hours, gaps, limits, deduplication, snooze, and dismiss.
- Authenticated FastAPI voice sidecar, Edge Basic TTS, fixed FFmpeg/FFprobe conversion, browser speech fallback, and RVC fail-closed behavior.
- Secure extracted-folder/ZIP asset validation and structural PyTorch metadata inspection without unpickling.
- Pinned official Cubism Web Framework `5-r.5` adapter, shaders, read-only asset protocol, pointer look, motion/expression controls, and `ParamA` input.
- Vitest, Python pytest, Electron Playwright, packaged-executable smoke, screenshots, and release documentation.

### Known limitations

- Proprietary Cubism Core was not supplied, so Mao rendering could not be executed or visually verified.
- Kobo lacks RVC runtime, RMVPE, ContentVec, and license/provenance files, so Basic TTS remains the safe fallback.
- Real Hermes awaits user configuration and was intentionally not tested.
- Installer is unsigned and intended for personal evaluation.
