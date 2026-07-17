# Implementation Roadmap

## Strategy

One-shot berarti Sol menyelesaikan seluruh pekerjaan dalam satu run agent, tetapi implementasi harus dibagi menjadi fase dengan quality gate.

## Phase 0 — Environment and discovery

Tasks:

- Periksa Node, package manager, Git, Python, build tools.
- Periksa lokasi aset.
- Periksa GPU/CPU.
- Buat `docs/ENVIRONMENT_REPORT.md`.
- Buat dependency strategy.
- Buat `.gitignore`.

Gate:

- Project folder aman.
- Tidak ada destructive operation.
- Build toolchain diketahui.

## Phase 1 — Bootstrap desktop shell

Tasks:

- Electron + React + Vite + TypeScript.
- Main/preload/renderer separation.
- Transparent window.
- Tray.
- Settings store.
- Basic navigation.
- Fallback avatar.

Gate:

- Development app launch.
- Build renderer.
- Tray bekerja.
- Fallback avatar tampil.

## Phase 2 — Desktop controls

Tasks:

- Drag.
- Always-on-top.
- Click-through.
- Emergency shortcut.
- Show/hide.
- Multi-monitor.
- Persist position.
- Auto-start.

Gate:

- Semua kontrol diuji manual/automation.
- Tidak ada kondisi avatar tidak dapat dikembalikan.

## Phase 3 — Hermes mock vertical slice

Tasks:

- Mock server.
- Chat panel.
- Streaming.
- Cancel.
- Error states.
- Conversation view.

Gate:

- End-to-end mock chat lulus.
- Offline dan 401 lulus.

## Phase 4 — Basic TTS

Tasks:

- Edge TTS integration.
- Sentence queue.
- Playback.
- Stop.
- Approximate lip-sync fallback.

Gate:

- Test voice berbunyi.
- Queue tidak overlap.
- Stop cepat.

## Phase 5 — Live2D Mao

Tasks:

- Asset detector.
- SDK integration.
- Load Mao.
- Avatar Lab.
- Expression/motion inventory.
- Physics, eye blink.
- ParamA lip-sync.

Gate:

- Mao tampil.
- Semua expression dan motion dapat dipreview.
- Missing Mao fallback lulus.

## Phase 6 — RVC sidecar

Tasks:

- Python environment.
- Dependency pinning.
- FFmpeg.
- RMVPE.
- HuBERT/ContentVec.
- Model load.
- API sidecar.
- Basic vs RVC compare.
- CPU fallback.

Gate:

- Health check.
- Model load.
- Test phrase converted.
- Failure fallback ke Basic TTS.

## Phase 7 — Real Hermes

Tasks:

- Settings.
- Secure key storage.
- Test connection.
- Real streaming.
- Structured metadata.
- Retry.

Gate:

- Real endpoint test jika kredensial tersedia.
- Jika tidak, mock tetap lengkap dan onboarding siap.

## Phase 8 — Proactive engine

Tasks:

- Local scheduler.
- Quiet hours.
- Limits.
- Snooze/dismiss.
- Manual test.
- Notification motion.

Gate:

- Policy tests lulus.
- Persist restart lulus.

## Phase 9 — Onboarding and nontechnical UX

Tasks:

- First-launch wizard.
- Asset status.
- Connection test.
- Voice test.
- Plain-language errors.
- Help links.
- Settings reset.

Gate:

- Pengguna dapat setup tanpa terminal.

## Phase 10 — Hardening and packaging

Tasks:

- Security review.
- Dependency audit.
- Tests.
- Installer.
- Unpacked build.
- Diagnostics.
- Documentation.
- Screenshots.

Gate:

- Final acceptance checklist lulus.
- `FINAL_VERIFICATION.md` dibuat.
