# Architecture

Yachiyo separates untrusted UI content, local desktop authority, network access, model assets, and voice processing into explicit boundaries.

```text
React renderer (sandboxed, no Node)
        │ narrow validated IPC
        ▼
context-isolated preload bridge
        │ invoke / subscribed events
        ▼
Electron main process
  ├─ settings + encrypted secret vault
  ├─ Hermes client + random-port mock server
  ├─ proactive scheduler + tray/window control
  ├─ asset validator + read-only yachiyo-asset protocol
  └─ authenticated random-port voice sidecar
        │
        ├─ Edge TTS → FFmpeg mono 48 kHz WAV
        ├─ HuBERT + RMVPE + Kobo RVC v2
        ├─ confined FAISS helper process
        └─ 48 kHz WAV → WebAudio → Mao ParamA
```

## Process responsibilities

### Renderer

The renderer owns presentation and transient interaction state. It renders onboarding, chat, reminders, settings, Avatar Lab, fallback animation, WebAudio playback, and RMS-driven lip-sync. It has no Node.js access and cannot read files or secrets directly.

### Preload

The sandbox-compatible CommonJS preload exposes one frozen `window.yachiyo` object. Every method maps to an allowlisted IPC channel; no raw `ipcRenderer`, filesystem API, shell, or arbitrary command primitive is exposed.

### Main process

The main process owns all privileged operations:

- atomic settings and corruption recovery;
- Electron `safeStorage` API-key encryption;
- network requests and streaming normalization;
- native asset dialogs, one-time selection tokens, ZIP/folder validation, and hash calculation;
- tray, always-on-top, click-through, recovery shortcut, auto-start, and window placement;
- reminders and native notifications;
- sidecar lifecycle and cleanup.

### Voice sidecar

Electron starts the packaged FastAPI sidecar on a reserved loopback port with a random 256-bit bearer token. Requests use strict Pydantic models, host/token checks, body limits, fixed executable paths, and shell-free subprocess calls. Temporary audio is kept beneath the app data directory and removed after use.

The RVC path is fully sidecar-owned: Edge TTS creates Indonesian source speech, FFmpeg normalizes it to mono 48 kHz, TorchAudio HuBERT extracts v2 features, RMVPE extracts pitch, a confined FAISS helper retrieves Kobo index vectors, and the v2 synthesizer produces the final WAV. The renderer receives audio bytes and bounded metrics only. It never imports Python, PyTorch, model files, or native inference libraries.

HuBERT/RMVPE setup is manifest-driven and data-only. Exact origins, sizes, and SHA-256 hashes are compiled into the sidecar. The frozen FAISS helper has an independent native-library boundary and one-thread OpenMP/OpenBLAS limits; the Torch parent retains normal CPU parallelism. A conversion failure returns a stable error to Electron, which retries Basic TTS and never crashes the desktop process.

Long renderer replies are split at sentence boundaries and played sequentially. WebAudio's analyser drives `ParamA`; Electron accepts completion metrics only for a request ID it issued, preventing arbitrary renderer playback claims.

## Live2D path

The official Cubism Web Framework source is pinned at tag `5-r.5`. `scripts/build-live2d.mjs` bundles a narrow renderer adapter and copies the official shaders/license. The proprietary Core is never bundled automatically.

Validated Mao files are exposed read-only as `yachiyo-asset://live2d/...`. The protocol permits only GET plus `.json`, `.moc3`, and `.png` beneath the validated runtime root. Core has a separate exact-file route. The renderer loads the Core first, then dynamically imports the Framework adapter.

## Asset selection transaction

1. The renderer requests only an asset kind and picker mode; it cannot submit a filesystem path.
2. Electron main opens the matching native folder/file dialog and validates the returned result.
3. Main returns the selected path for immediate display plus a random, one-time token that expires after five minutes.
4. The renderer shows a scanning state and applies that token. Main consumes it, scans the proposed Mao/Core/Kobo source, persists the native-dialog selection atomically, and returns refreshed settings and inventory. An invalid asset remains selected with an explicit invalid state so it is diagnosable after restart.
5. Cancellation, malformed dialog results, invalid assets, and runtime limitations return visible messages instead of being ignored.

General settings updates are forbidden from changing asset paths. ZIP selection has a separate file action, while folder selection accepts the documented extracted roots. The renderer sandbox, path confinement, and ZIP extraction limits remain unchanged.

## Persistence

App data lives in Electron's Windows user-data directory unless `YACHIYO_DATA_DIR` is set for testing. Settings and reminders use atomic replace writes. The Hermes key is separate encrypted data. Conversation history is disabled by default and is not persisted by the current build.

## Startup and shutdown

1. Acquire the single-instance lock.
2. Load settings and start the random-port mock server.
3. Validate external assets.
4. Start and health-check the voice sidecar.
5. register hardened session permissions, create the desktop window/tray, and start reminders.
6. On quit, stop reminders/sidecar/mock server, unregister the global shortcut/protocol, destroy the tray, and exit cleanly.

## Main source map

- `src/main`: privileged services, IPC, tray, and desktop window
- `src/preload`: frozen bridge
- `src/renderer`: React application
- `src/shared`: schemas, policies, types, and redaction
- `src/sidecar`: FastAPI voice service
- `src/live2d-adapter`: isolated Cubism integration build input
- `tests`: unit, integration, renderer, and Electron E2E tests
