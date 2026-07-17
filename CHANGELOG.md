# Changelog

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
