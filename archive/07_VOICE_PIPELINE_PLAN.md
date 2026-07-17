# Voice Pipeline Plan

## Ringkasan

Model `kobov2.pth` adalah RVC, bukan TTS. Pipeline target:

```text
Hermes text
→ Edge TTS source audio
→ normalize to mono WAV 48 kHz
→ RVC v2 conversion
→ final WAV playback
→ amplitude analysis
→ Live2D ParamA
```

## Voice modes

### 1. RVC Voice

- Edge TTS source.
- RVC conversion.
- Final audio.
- Lip-sync dari final audio.

### 2. Basic TTS

- Edge TTS source langsung diputar.
- Digunakan ketika RVC tidak tersedia atau gagal.

### 3. Disabled

- Tidak ada audio.
- Chat teks tetap berfungsi.

## Default TTS

Default:

- Provider: Edge TTS.
- Voice: `id-ID-GadisNeural`.
- Speed: 1.00.
- Pitch: 0.
- Volume: 100%.

Voice dasar sebaiknya tidak terlalu ekspresif agar RVC stabil.

## Python sidecar

Jalankan voice engine sebagai process terpisah.

### Tanggung jawab sidecar

- Health endpoint.
- Dependency check.
- Load RVC model.
- Generate TTS source audio.
- Convert audio format.
- RVC inference.
- Return final audio.
- Structured error.
- Graceful shutdown.

### Suggested endpoints

```text
GET  /health
GET  /capabilities
POST /tts/basic
POST /voice/rvc
POST /voice/test
POST /engine/reload
```

Gunakan random localhost port atau authenticated IPC token untuk mengurangi risiko akses lokal tanpa izin.

## Dependencies

Sol harus memilih versi yang kompatibel dan mem-pin:

- Python runtime.
- PyTorch.
- RVC inference code.
- FAISS.
- Edge TTS.
- FFmpeg.
- FFprobe.
- RMVPE.
- HuBERT atau ContentVec.
- Audio processing library.
- FastAPI/Uvicorn atau alternatif ringan.

Jangan memakai dependency latest secara buta. Buat lockfile atau version manifest.

## GPU and CPU strategy

### GPU path

- Deteksi CUDA/DirectML yang benar-benar tersedia.
- Jalankan smoke test.
- Gunakan GPU hanya jika stabil.

### CPU fallback

- Model tetap dapat berjalan, walaupun lebih lambat.
- Tampilkan status “Mode CPU”.
- Batasi panjang sentence chunk.
- Jangan membekukan UI.

### Failure fallback

Jika sidecar gagal:

1. Restart maksimal sesuai policy.
2. Turun ke Basic TTS.
3. Jangan kehilangan respons teks.
4. Tampilkan tombol retry.
5. Catat log yang sudah disanitasi.

## Sentence queue

- Buffer streaming Hermes sampai tanda akhir kalimat.
- Jangan memproses per token.
- Mulai kalimat pertama secepat mungkin.
- Proses kalimat berikutnya selama audio saat ini diputar.
- Batasi panjang chunk.
- Support cancel dan clear queue.
- Setelah cancel, hapus temporary audio.

## RVC settings screen

Sediakan:

- RVC enabled.
- Pitch adjustment.
- Index rate.
- Protect consonants.
- F0 method, default RMVPE.
- Device.
- Test phrase.
- Compare Basic vs RVC.
- Reset default.

Sol harus memilih nilai konservatif dan mencatatnya.

## Audio storage

- Gunakan temp directory aplikasi.
- Nama file random.
- Hapus otomatis.
- Jangan menyimpan semua percakapan audio secara default.
- Jangan mengunggah audio selain ke provider yang dipilih.

## Input voice/STT

v1 menggunakan push-to-talk.

Fallback priority:

1. STT melalui Hermes jika endpoint tersedia.
2. STT lokal jika berhasil dipaketkan.
3. Text-only.

Always listening dan wake word ditunda.

## Acceptance criteria

- Basic TTS dapat dibunyikan.
- RVC model dapat diload atau fallback jelas.
- Audio tidak pecah pada test phrase.
- Stop voice bekerja cepat.
- Antrean kalimat tidak tumpang tindih.
- Avatar speaking selama audio.
- `ParamA` mengikuti amplitude audio final.
