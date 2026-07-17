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
        └─ optional RVC → fail-closed Basic fallback
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
- ZIP/folder validation and hash calculation;
- tray, always-on-top, click-through, recovery shortcut, auto-start, and window placement;
- reminders and native notifications;
- sidecar lifecycle and cleanup.

### Voice sidecar

Electron starts the packaged FastAPI sidecar on a reserved loopback port with a random 256-bit bearer token. Requests use strict Pydantic models, host/token checks, body limits, fixed executable paths, and shell-free subprocess calls. Temporary audio is kept beneath the app data directory and removed after use.

## Live2D path

The official Cubism Web Framework source is pinned at tag `5-r.5`. `scripts/build-live2d.mjs` bundles a narrow renderer adapter and copies the official shaders/license. The proprietary Core is never bundled automatically.

Validated Mao files are exposed read-only as `yachiyo-asset://live2d/...`. The protocol permits only GET plus `.json`, `.moc3`, and `.png` beneath the validated runtime root. Core has a separate exact-file route. The renderer loads the Core first, then dynamically imports the Framework adapter.

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
