# Scope and Non-Goals

## In scope untuk v1

- Windows desktop application.
- Electron + React + Vite + TypeScript.
- Live2D Mao dengan Cubism SDK resmi yang kompatibel.
- Fallback avatar.
- Hermes OpenAI-compatible API client.
- Streaming text chat.
- Basic TTS.
- RVC voice conversion melalui Python sidecar.
- Lip-sync dari final audio.
- Push-to-talk dengan fallback.
- Local proactive scheduler.
- Tray, always-on-top, click-through, auto-start.
- Settings persistence.
- Packaging Windows.
- Mock services untuk testing.
- Dokumentasi nonteknis.

## In scope jika environment mendukung

- GPU acceleration untuk RVC.
- STT lokal.
- Secure credential manager.
- Fullscreen or Do Not Disturb detection.
- WebSocket/SSE bridge untuk event push dari Hermes.

## Tidak wajib untuk v1

- Always-listening wake word.
- Full Telegram synchronization.
- Calendar/email integration nyata.
- Mobile application.
- macOS/Linux packaging.
- Auto-update publik.
- Code signing certificate.
- Marketplace distribution.
- Live2D rigging atau pembuatan model baru.
- Training TTS atau RVC.
- Cloud database baru.
- Full 3D avatar.
- Facial tracking webcam.
- Motion capture.
- Multiple character profiles.

## Explicit non-goals

- Tidak boleh menjalankan command lokal berdasarkan output LLM.
- Tidak boleh mengekspos Hermes API secara publik tanpa proteksi.
- Tidak boleh memasukkan secret dalam source code.
- Tidak boleh mendistribusikan model suara Kobo sebagai bagian produk publik.
- Tidak boleh menyatakan suara sebagai suara resmi talent atau karakter tertentu.
- Tidak boleh mengubah file sistem di luar kebutuhan dependency yang disetujui.
