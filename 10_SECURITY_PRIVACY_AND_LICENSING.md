# Security, Privacy, and Licensing

## Security baseline

### Electron

- `contextIsolation: true`.
- `nodeIntegration: false`.
- Minimal preload API.
- Content Security Policy.
- Block arbitrary navigation.
- Block arbitrary new windows.
- No `eval`.
- No renderer shell execution.
- Typed and validated IPC.
- Single-instance lock.
- Dependency audit.

### Secrets

- Hermes API key disimpan di OS credential manager jika memungkinkan.
- Tidak berada di source code.
- Tidak berada di Git.
- Tidak muncul di logs.
- Tidak masuk diagnostic export.
- Voice provider key, jika ada di masa depan, mengikuti aturan sama.

### Sidecar

- Bind hanya ke localhost.
- Gunakan session token acak.
- Jangan menerima arbitrary file path tanpa validation.
- Batasi request size.
- Hanya menerima audio/temp path milik aplikasi.
- Shutdown bersama aplikasi.
- Log disanitasi.

### Network

- HTTPS untuk Hermes remote.
- Warning untuk plain HTTP non-localhost.
- Jangan membuka port VPS otomatis.
- Jangan menonaktifkan firewall.
- Jangan menonaktifkan certificate validation.

## Privacy

- Mikrofon hanya aktif ketika push-to-talk.
- Indikator recording wajib terlihat.
- Audio temporary dihapus.
- Conversation history opsional.
- Diagnostic export tidak boleh berisi:
  - API key.
  - Full headers.
  - Raw conversation tanpa izin.
  - Raw voice recording.
  - Precise personal data.

## Licensing: Live2D Mao

Mao adalah sample data Live2D, bukan aset bebas tanpa syarat.

Sol harus:

- Membaca license/readme dari paket aktual.
- Menyediakan About/Credits.
- Tidak mengklaim desain sebagai milik pengguna.
- Tidak memisahkan dan menjual aset mentah.
- Tidak mengemas file editor yang tidak diperlukan.
- Menyimpan salinan license yang diwajibkan.

## Licensing: Kobo RVC

Status lisensi model suara belum dapat diverifikasi dari file model saja.

Risiko:

- Bisa meniru suara talent/individu tertentu.
- Bisa melanggar terms sumber suara.
- Tidak boleh diasumsikan aman untuk distribusi.

Policy proyek:

- Personal local experiment only.
- Jangan commit.
- Jangan upload.
- Jangan bundle ke public installer.
- Jangan digunakan untuk impersonation.
- Jangan digunakan untuk konten menipu.
- Tampilkan label “Unofficial local voice experiment”.
- Buat mode untuk mengganti dengan voice model berlisensi jelas.

## Distribution mode

### Personal build

Dapat memakai external local asset path.

### Public build

- Exclude Kobo.
- Exclude aset yang tidak boleh didistribusikan.
- Default ke Basic TTS atau voice berlisensi.
- Review license sebelum release.

## Disclaimer

Dokumen ini bukan nasihat hukum. Sol harus menandai ketidakpastian lisensi dan tidak mengarang izin yang tidak ada.
