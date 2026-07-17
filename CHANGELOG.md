# Changelog

## 0.2.3 - 2026-07-18

Live2D main-menu visibility hotfix.

### Fixed

- Give the Live2D-only transform wrapper an explicit stage-relative size so Mao no longer collapses to a zero-width element after avatar positioning was introduced.
- Keep fallback-avatar intrinsic sizing unchanged and align the Live2D wrapper bounds with the visible canvas for accurate drag, bubble placement, and viewport safety.
- Require installed-build regression coverage to verify visible CSS dimensions and a nontrivial canvas backing store instead of trusting the runtime-ready label alone.

## 0.2.2 - 2026-07-18

Companion UX and Windows lifecycle patch.

### Added

- Normalized avatar X/Y positioning, safe viewport clamping, direct drag edit mode, lock/reset/center controls, live preview, and restart persistence.
- A compact Companion composer and adaptive streaming response bubble backed by the same conversation state as a dedicated Full Chat view.
- A lightweight static floating launcher with restore, drag, edge snap, native context menu, multi-monitor-safe position persistence, and status indicators.
- Configurable minimize/close behavior, main-window always-on-top separation, tray restore actions, and a configurable `Ctrl+Shift+Y` global restore shortcut.

### Fixed

- Minimize now follows the selected lifecycle instead of leaving a hard-to-find frameless window behind other applications.
- Presentation changes preserve the active Hermes request, streaming response, draft, voice playback, lip-sync, and conversation history.
- Stateful control-envelope filtering prevents `<yachiyo_control>` tags and payloads from reaching visible text, history, copy, TTS, RVC, or partial error output, including tags split across SSE chunks.

### Architecture and compatibility

- Hermes, conversation state, Live2D, TTS/RVC, and the voice sidecar remain single-instance; the launcher receives only bounded status/actions and no conversation content or credentials.
- Existing settings are upgraded through schema defaults without discarding Hermes, asset, voice, reminder, or privacy configuration.
- The Kobo RVC runtime remains version `0.2.0`; this patch changes the Electron application only.

## 0.2.1 - 2026-07-17

Hermes VPS integration reliability release.

### Root cause

- Connection testing stopped after `GET /models`, so it could report success without proving the selected model could complete a chat request.
- The home badge used a separate in-memory status that was reset on Save and was not rechecked at startup; a successful test therefore did not reliably update the visible runtime state.
- A failed chat left an empty assistant placeholder in history. The next request was rejected by IPC validation before it could reach Hermes.
- Endpoint construction, SSE deadlines, and parser failures were handled on separate paths, which made URL, authentication, connection, model, response, and streaming failures hard to distinguish.

### Fixed

- Unified OpenAI-compatible Hermes endpoint normalization for base URLs with or without `/v1` and trailing slashes, and consistently trims raw API keys before adding one `Bearer` prefix.
- Applies an atomic saved-settings/key snapshot to every runtime chat, reconnects at startup, and synchronizes explicit connection states with the renderer without deleting configuration when the SSH tunnel is unavailable.
- Binds encrypted credentials to their normalized destination so a concurrent Save or interrupted write cannot send a key to a different endpoint.
- Strengthened connection testing to verify both `/v1/models` and a non-streaming `/v1/chat/completions` response, including the selected model and non-empty assistant content.
- Hardened SSE parsing, full-body timeout/cancellation, bounded response sizes, one-time non-stream fallback, safe retries, and distinct model/response/stream error categories.
- Added safe live diagnostics, provider markers without prompts or credentials, and Electron/UI/HTTP regression coverage through restart and automatic reconnect.

## 0.2.0 — 2026-07-17

Kobo RVC v2 inference release.

### Added

- Complete Python 3.11 RVC v2 pipeline: Edge TTS Indonesian source audio, FFmpeg mono 48 kHz normalization, TorchAudio HuBERT features, RMVPE pitch, Kobo checkpoint synthesis, FAISS retrieval, and final 48 kHz WAV output.
- Pinned CPU runtime with automatic CUDA detection, strict runtime health, official HuBERT/RMVPE downloads with fixed origins, sizes, SHA-256 hashes, and atomic verification.
- Basic/RVC comparison panel with pitch, index rate, protection, RMVPE, and device controls.
- Visible runtime setup progress and errors, sentence-by-sentence long-reply processing, conversion metrics, WebAudio completion proof, and `ParamA` lip-sync measurements.
- Dedicated frozen FAISS helper with path confinement and bounded native threading.

### Reliability and security

- RVC failures are contained in the sidecar and automatically fall back to Basic TTS without crashing Electron.
- PyTorch checkpoint and runtime weights load with `weights_only=True`; model files, ZIPs, IPC, secrets, renderer sandboxing, and path boundaries remain fail-closed.
- Fixed sidecar replacement so stale child exits cannot overwrite a newly started sidecar.
- Added malformed/short/silent/missing-file, runtime hash, fallback, sentence queue, playback, source Electron, packaged Electron, and installed NSIS regressions.

### Verified performance on the release machine

- Final frozen CPU proof: 7.49 s cold engine load, 15.56 s cold conversion, 12.60 s warm conversion, and approximately 1.73 GB peak sidecar RAM.
- The proof generated non-silent mono 48 kHz Kobo WAV files. Installed-app playback and final release hashes are recorded in `FINAL_VERIFICATION.md`.

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
