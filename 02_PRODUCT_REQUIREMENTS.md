# Product Requirements

## 1. Persona utama

Pengguna personal nonteknis yang ingin berinteraksi dengan Hermes melalui avatar desktop.

## 2. Core user journeys

### A. First launch

1. Pengguna membuka aplikasi.
2. Onboarding menjelaskan bahwa aplikasi dapat berjalan dengan fallback.
3. Aplikasi memeriksa aset Mao dan Kobo.
4. Pengguna memasukkan Hermes URL dan API key melalui form lokal.
5. Pengguna menguji koneksi.
6. Pengguna memilih Basic TTS atau RVC Voice.
7. Pengguna menguji suara.
8. Pengguna mengatur quiet hours dan auto-start.
9. Avatar muncul di desktop.

### B. Chat teks

1. Pengguna membuka panel chat.
2. Pengguna mengetik pesan.
3. Hermes merespons secara streaming.
4. Teks ditampilkan.
5. Respons dipotong per kalimat untuk antrean suara.
6. Avatar menunjukkan state thinking lalu speaking.
7. Audio final menggerakkan lip-sync.

### C. Voice interaction

1. Pengguna menekan tombol push-to-talk.
2. Aplikasi merekam suara.
3. Audio dikirim ke STT yang dipilih.
4. Transkrip ditampilkan sebelum atau bersamaan dengan pengiriman.
5. Hermes menjawab.
6. Jawaban diputar melalui pipeline suara.

Always-listening tidak wajib untuk v1.

### D. Proactive reminder

1. Scheduler atau Hermes event menghasilkan reminder.
2. Policy engine memeriksa quiet hours, cooldown, fullscreen, dan limit harian.
3. Jika aman, avatar memberi visual notification.
4. Pengguna dapat membuka, snooze, atau dismiss.
5. Reminder disimpan agar tidak terkirim berulang.

### E. Offline/failure mode

1. Hermes tidak dapat dihubungi.
2. Avatar tetap hidup.
3. Pengguna melihat status offline yang sederhana.
4. Settings dan reminder lokal tetap bisa dibuka.
5. Basic TTS test tetap tersedia jika internet/provider mendukung.
6. Aplikasi tidak crash.

## 3. Fitur wajib v1

### Desktop companion

- Transparent frameless window.
- Always-on-top.
- Drag untuk memindahkan avatar.
- Multi-monitor support.
- Persisted window position.
- Show/hide.
- Click-through mode.
- Safe escape from click-through.
- Tray icon.
- Single-instance lock.
- Start with Windows.

### Avatar

- Mao ketika aset tersedia.
- Fallback avatar ketika Mao tidak tersedia.
- Idle animation.
- Blink.
- Motion dan expression preview.
- State: idle, listening, thinking, speaking, happy, concerned, confused, reminder, success, error.
- Lip-sync melalui `ParamA`.

### Chat

- Streaming text.
- Stop generation.
- Retry.
- Copy.
- Clear conversation.
- Connection indicator.
- Keyboard shortcut.
- Compact panel.

### Voice

- Mode:
  1. RVC Voice.
  2. Basic TTS.
  3. Disabled.
- Test voice.
- Stop speaking.
- Queue per kalimat.
- Fallback otomatis.
- Voice diagnostics.

### Proactive

- Morning greeting.
- Upcoming reminder.
- Inactivity check-in.
- Evening review.
- Custom reminder.
- Quiet hours.
- Minimum interval.
- Daily message limit.
- Snooze.
- Duplicate suppression.

### Settings

- Hermes base URL.
- Hermes model name.
- Secure API key storage.
- Request timeout.
- Voice mode.
- TTS voice.
- RVC parameters.
- Quiet hours.
- Auto-start.
- Always-on-top.
- Click-through.
- Logging level.
- Reset.
- Export sanitized diagnostics.

## 4. UX requirements

- Bahasa antarmuka utama: Indonesia.
- Tidak memerlukan terminal.
- Tidak menampilkan stack trace kepada pengguna.
- Error harus menjawab:
  - Apa yang gagal?
  - Apakah data aman?
  - Fitur apa yang masih dapat dipakai?
  - Tindakan berikutnya apa?
- Mendukung scaling Windows 125%, 150%, dan 200%.
- Main interface bukan dashboard.
- Kontrol utama jelas dan sedikit.
