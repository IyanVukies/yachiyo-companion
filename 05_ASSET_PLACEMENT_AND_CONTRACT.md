# Asset Placement and Contract

## Tujuan

Dokumen ini menentukan lokasi aset yang akan dimasukkan pengguna. Paket plan tidak menyertakan aset.

## Folder yang harus disediakan proyek

```text
project-assets/
├── live2d/
├── voice/
└── README-PLACE-ASSETS-HERE.md
```

Folder `project-assets/` harus masuk `.gitignore` kecuali README placeholder.

## Opsi penempatan Live2D

### Opsi A — ZIP asli

```text
project-assets/live2d/mao_en.zip
```

Sol harus:

1. Mendeteksi ZIP.
2. Memvalidasi path traversal sebelum extract.
3. Extract ke cache/build directory, bukan menimpa ZIP.
4. Mencari `runtime/mao_pro.model3.json`.
5. Memvalidasi seluruh path yang direferensikan.

### Opsi B — Folder yang sudah diekstrak

```text
project-assets/live2d/mao/
└── runtime/
    └── mao_pro.model3.json
```

Aplikasi harus menerima keduanya.

## Opsi penempatan model suara

### Opsi A — ZIP asli

```text
project-assets/voice/kobo.zip
```

### Opsi B — File diekstrak

```text
project-assets/voice/kobo/
├── kobov2.pth
└── added_IVF454_Flat_nprobe_1_kobov2_v2.index
```

## Kontrak Live2D yang diketahui

Verifikasi ulang saat runtime:

- Model name: Niziiro Mao.
- Entry: `runtime/mao_pro.model3.json`.
- Cubism 5.
- Eight expressions.
- Seven motions.
- Physics.
- Pose.
- Eye blink.
- Lip-sync parameter: `ParamA`.
- Runtime texture 4096×4096.
- `.cmo3` dan `.can3` tidak dikemas dalam release.

Jika detail tidak cocok, jangan crash. Catat perbedaan ke diagnostics dan gunakan data aktual.

## Kontrak RVC yang diketahui

Verifikasi ulang saat sidecar start:

- Checkpoint: `kobov2.pth`.
- Index: `added_IVF454_Flat_nprobe_1_kobov2_v2.index`.
- RVC v2.
- 48 kHz target.
- F0/pitch model aktif.

Jika model tidak tersedia:

- Voice mode otomatis turun ke Basic TTS.
- UI menunjukkan “Model suara karakter belum dipasang”.
- Sediakan tombol “Buka folder aset”.

## Asset validation

Buat validator yang memeriksa:

### Live2D

- Entry JSON dapat dibaca.
- Semua referenced paths ada.
- Texture dapat dimuat.
- MOC compatible.
- Expressions dan motions dapat diparse.
- LipSync group atau `ParamA` tersedia.

### RVC

- `.pth` ada dan dapat dimuat.
- `.index` ada dan dapat dibaca.
- Runtime dependency tersedia.
- RMVPE dan HuBERT/ContentVec tersedia.
- FFmpeg tersedia.
- Health inference test dapat berjalan.

## Packaging policy

- Untuk penggunaan personal, aset dapat disalin ke local install directory.
- Jangan memasukkan model suara dalam installer yang akan dipublikasikan.
- Buat opsi “external asset mode”, yaitu aset tetap berada di folder lokal yang dipilih pengguna.
- Simpan hanya path lokal dan hash file.
