# Live2D Implementation Plan

## Tujuan

Menampilkan Niziiro Mao secara stabil sebagai transparent desktop avatar dengan state, expression, motion, dan lip-sync.

## Renderer strategy

Gunakan official Live2D Cubism SDK for Web yang mendukung Cubism 5. Hindari wrapper lama yang tidak menjamin kompatibilitas fitur model.

Sol harus memverifikasi:

- Lisensi SDK.
- Cara bundling Cubism Core.
- Kompatibilitas Electron renderer.
- CSP yang diperlukan.
- Build path production.

## Tahapan implementasi

### Phase 1 — Fallback avatar

Sebelum Mao dimuat, buat fallback SVG/Canvas yang:

- Berkedip.
- Bernapas.
- Menggerakkan mulut.
- Memiliki state idle, thinking, speaking, error.

Ini memastikan UI dan voice pipeline dapat diuji tanpa aset.

### Phase 2 — Model loader

Buat `Live2DModelLoader` yang:

- Menerima path `.model3.json`.
- Memuat model secara async.
- Menampilkan progress.
- Memvalidasi referenced assets.
- Timeout.
- Fallback pada error.
- Menulis error yang dapat dipahami.

### Phase 3 — Motion and expression inventory

Baca daftar aktual dari `.model3.json`.

Buat halaman internal `Avatar Lab`:

- Tombol untuk setiap expression.
- Tombol untuk setiap motion.
- Informasi durasi.
- Toggle loop.
- Reset.
- Input manual parameter untuk debugging.
- Test `ParamA`.

Nama emosi tidak boleh ditebak permanen sebelum preview visual.

### Phase 4 — State machine

State minimum:

- idle
- listening
- thinking
- speaking
- happy
- concerned
- confused
- reminder
- success
- error

Aturan:

- Satu state aktif.
- Motion prioritas tinggi dapat menginterupsi idle.
- Interaction motion berjalan one-shot kecuali benar-benar idle motion.
- Setelah motion selesai, kembali ke idle.
- Expression dapat bertahan terpisah dari motion.
- Error tidak boleh membuat motion queue terkunci.

### Phase 5 — Lip-sync

Input lip-sync berasal dari audio final setelah RVC.

Pipeline:

1. Audio player menghasilkan amplitude/RMS.
2. Nilai dinormalisasi 0–1.
3. Terapkan smoothing attack/release.
4. Mapping ke `ParamA`.
5. Ketika audio berhenti, nilai kembali ke nol secara halus.

Fallback Basic TTS yang tidak memberi raw buffer harus memakai approximate mouth animation berdasarkan timing audio.

### Phase 6 — Desktop behavior

- Transparent background.
- Avatar hit area.
- Drag window melalui area aman.
- Click-through toggle.
- Emergency shortcut untuk mematikan click-through.
- Always-on-top.
- Prevent focus stealing.
- Multi-monitor bounds correction.
- Persist scale dan position.

## Performance target

- Idle CPU serendah mungkin.
- FPS adaptif.
- Pause rendering ketika hidden.
- Jangan decode ulang texture setiap state.
- Texture dan model dimuat sekali.
- Hindari memory leak saat reload.
- Renderer crash tidak merusak settings.

## Acceptance criteria

- Mao tampil tanpa background.
- Model tidak terpotong.
- Scale dapat diatur.
- Delapan ekspresi terdeteksi.
- Tujuh motion terdeteksi.
- Physics berjalan.
- Eye blink berjalan.
- `ParamA` menggerakkan mulut.
- Missing asset menghasilkan fallback, bukan crash.
