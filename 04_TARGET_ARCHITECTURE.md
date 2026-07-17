# Target Architecture

## Ringkasan

Gunakan arsitektur modular dengan empat proses utama:

```text
┌───────────────────────────────────────────────┐
│ Electron Main Process                         │
│ window, tray, auto-start, IPC, persistence    │
└──────────────────────┬────────────────────────┘
                       │ validated IPC
┌──────────────────────▼────────────────────────┐
│ Renderer Process                              │
│ React UI, Live2D canvas, chat, settings        │
└───────────────┬────────────────┬──────────────┘
                │                │
                │ HTTP/SSE       │ localhost HTTP
                │                │
┌───────────────▼───────┐  ┌────▼─────────────────┐
│ Hermes VPS            │  │ Python Voice Sidecar │
│ reasoning + memory    │  │ TTS/RVC/audio        │
└───────────────────────┘  └──────────────────────┘
```

## Technology baseline

### Desktop

- Electron.
- React.
- Vite.
- TypeScript strict.
- State management sederhana.
- Electron Builder.
- Vitest.
- Playwright atau Spectron replacement yang masih aktif.
- ESLint.
- Prettier.

### Live2D

- Official Cubism SDK for Web yang kompatibel dengan model Cubism 5.
- Adapter `AvatarEngine`.
- Renderer hanya di renderer process.
- Tidak mengizinkan model mengontrol filesystem.

### Voice sidecar

- Python.
- FastAPI atau server lokal ringan.
- PyTorch.
- RVC inference implementation.
- Edge TTS sebagai default source TTS.
- FFmpeg/FFprobe.
- RMVPE.
- HuBERT/ContentVec.
- FAISS.
- Startup health check.
- Restart policy.
- CPU fallback.

### Persistence

- Gunakan store lokal terstruktur.
- Secret melalui OS credential manager jika memungkinkan.
- Jangan menyimpan API key dalam file plaintext.
- Conversation history dapat disimpan opsional.
- Reminder lokal menggunakan persistent scheduler store.

## Service boundaries

### `HermesClient`

Tanggung jawab:

- Connection test.
- Chat request.
- Streaming parsing.
- Timeout.
- Abort.
- Retry.
- Error normalization.
- Structured response parsing.

### `AvatarService`

Tanggung jawab:

- Load/unload model.
- Fallback avatar.
- State transition.
- Motion scheduling.
- Expression mapping.
- Lip-sync value input.
- Crash-safe recovery.

### `VoiceService`

Tanggung jawab:

- Mode selection.
- Sentence queue.
- Basic TTS.
- RVC request.
- Audio playback.
- Stop.
- Lip-sync amplitude events.
- Fallback.

### `ProactiveService`

Tanggung jawab:

- Schedule.
- Policy.
- Cooldown.
- Quiet hours.
- Deduplication.
- Delivery.
- Snooze/dismiss.

### `SettingsService`

Tanggung jawab:

- Schema validation.
- Migration.
- Secure secrets.
- Defaults.
- Recovery from corruption.
- Reset/export.

## IPC principles

- `contextIsolation: true`.
- `nodeIntegration: false`.
- Narrow preload API.
- Typed IPC contracts.
- Validate every payload.
- Renderer cannot access arbitrary filesystem or shell.
- Block untrusted navigation and new windows.

## Suggested folder structure

```text
src/
├── main/
│   ├── windows/
│   ├── tray/
│   ├── ipc/
│   ├── startup/
│   └── security/
├── preload/
├── renderer/
│   ├── app/
│   ├── components/
│   ├── screens/
│   ├── avatar/
│   ├── chat/
│   └── settings/
├── services/
│   ├── hermes/
│   ├── voice/
│   ├── proactive/
│   ├── settings/
│   └── diagnostics/
├── shared/
│   ├── contracts/
│   ├── schemas/
│   └── types/
├── sidecar/
│   └── rvc_service/
└── tests/
```
