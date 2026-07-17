# Testing and Acceptance

## Test layers

### Unit tests

- Settings schema.
- URL validation.
- Secret redaction.
- Structured response parser.
- Sentence segmentation.
- Proactive policy.
- Reminder deduplication.
- Avatar state transition.
- RVC parameter validation.

### Integration tests

- Renderer ↔ preload IPC.
- Main ↔ settings store.
- Hermes mock streaming.
- Voice sidecar health.
- Basic TTS.
- RVC fallback.
- Asset validator.
- Temp file cleanup.

### End-to-end tests

- First launch.
- Onboarding.
- Avatar window.
- Chat mock.
- Voice test.
- Reminder test.
- Restart persistence.
- Offline mode.
- Missing Mao.
- Missing Kobo.
- Sidecar crash.
- Click-through recovery.

## Mandatory failure scenarios

- Mao ZIP tidak ada.
- Mao ZIP korup.
- Entry model tidak ditemukan.
- Texture hilang.
- Hermes URL salah.
- API key salah.
- Hermes timeout.
- Hermes stream terputus.
- Edge TTS gagal.
- FFmpeg tidak ada.
- RVC model gagal dimuat.
- FAISS index gagal.
- GPU tidak tersedia.
- Python sidecar crash.
- Settings file korup.
- Monitor yang menyimpan posisi avatar dilepas.

## Definition of Done

### Installation

- Installer atau portable executable tersedia.
- Tidak memerlukan terminal untuk penggunaan normal.
- Uninstall atau removal jelas.

### Avatar

- Fallback tampil.
- Mao tampil jika aset tersedia.
- Window transparan.
- Drag, show/hide, always-on-top, click-through bekerja.
- Emergency click-through recovery bekerja.
- Expression dan motion dapat dites.
- Lip-sync bergerak.

### Chat

- Mock chat streaming bekerja.
- Real Hermes dapat dikonfigurasi.
- Stop dan retry bekerja.
- Error tidak crash.

### Voice

- Basic TTS bekerja.
- RVC bekerja jika dependency dan aset tersedia.
- Fallback otomatis.
- Stop speaking.
- Sentence queue.
- Audio temporary dibersihkan.

### Proactive

- Manual notification.
- Quiet hours.
- Daily limit.
- Snooze.
- Dismiss.
- Persistence.

### Security

- No hardcoded secret.
- No API key in logs.
- Renderer isolated.
- IPC validated.
- Non-local HTTP warning.
- Diagnostic sanitized.

### Documentation

Wajib dibuat:

- `START-HERE.md`.
- `README.md`.
- `ARCHITECTURE.md`.
- `SECURITY.md`.
- `TROUBLESHOOTING.md`.
- `LIVE2D-MODEL-GUIDE.md`.
- `VOICE-MODEL-GUIDE.md`.
- `HERMES-VPS-GUIDE.md`.
- `CHANGELOG.md`.
- `FINAL_VERIFICATION.md`.

## Completion evidence

Sol harus memberikan:

- Perintah test yang dijalankan.
- Ringkasan hasil.
- Lokasi installer.
- Screenshot bila dapat.
- Daftar fitur yang diverifikasi.
- Daftar limitation tersisa.
- Pernyataan jujur untuk test yang tidak dapat dilakukan.
