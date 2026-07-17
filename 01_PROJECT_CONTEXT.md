# Project Context

## Latar belakang

Pengguna telah memiliki personal assistant berbasis **Hermes Agent** yang saat ini terutama digunakan melalui Telegram. Pengguna ingin membuat asisten tersebut lebih hidup dengan:

- Bentuk visual berupa avatar Live2D.
- Suara karakter.
- Interaksi desktop.
- Respons proaktif tanpa selalu menunggu pengguna bertanya terlebih dahulu.
- Pengalaman seperti desktop companion yang berada di layar Windows.

Nama produk sementara adalah **Yachiyo Companion**.

## Sistem yang sudah ada

### Hermes Agent

Hermes berada di VPS dan tetap menjadi:

- Reasoning engine.
- Memory system.
- Tool-using agent.
- Sumber respons dan konteks personal.
- Sistem yang dapat terhubung ke Telegram.

Aplikasi desktop tidak boleh menggantikan Hermes atau membuat “otak” kedua yang tidak sinkron.

### Telegram

Telegram tetap dapat digunakan ketika pengguna tidak berada di depan komputer. Aplikasi desktop adalah kanal tambahan, bukan pengganti penuh Telegram.

### Live2D

Pengguna sudah memiliki paket model **Niziiro Mao**. Aset tidak disertakan dalam paket plan ini dan akan dimasukkan sendiri oleh pengguna.

Karakteristik yang sudah diketahui dari pemeriksaan sebelumnya:

- Runtime Live2D Cubism 5.
- Entry file: `runtime/mao_pro.model3.json`.
- Satu tekstur 4096×4096.
- Delapan ekspresi.
- Tujuh motion.
- Physics dan pose.
- Eye blink tersedia.
- Parameter lip-sync utama: `ParamA`.
- File editor `.cmo3` dan `.can3` tidak diperlukan untuk runtime.

Sol wajib memverifikasi ulang karakteristik ini dari aset aktual saat tersedia.

### Model suara

Pengguna memiliki paket model suara yang berisi:

- `kobov2.pth`
- `added_IVF454_Flat_nprobe_1_kobov2_v2.index`

Paket tersebut adalah model **RVC voice conversion**, bukan TTS.

Karakteristik yang diketahui:

- RVC v2.
- Model 48 kHz.
- Membutuhkan source speech dari TTS.
- Membutuhkan runtime RVC, feature extractor, pitch extractor, FFmpeg, dan dependency Python.

Penggunaan model suara ini harus dibatasi untuk eksperimen personal sampai lisensi atau izin penggunaannya dapat diverifikasi.

## Lingkungan pengguna

- Sistem operasi utama: Windows 11.
- Pengguna tidak memiliki pengalaman coding.
- Target awal: penggunaan personal.
- Target perangkat: laptop atau desktop Windows biasa.
- GPU mungkin tersedia atau mungkin tidak.
- Aplikasi harus memiliki fallback CPU dan fallback Basic TTS.

## Prinsip pengalaman

Yachiyo harus terasa:

- Hidup, tetapi tidak mengganggu.
- Imut dan ekspresif, tetapi bukan berlebihan.
- Membantu secara proaktif, tetapi tetap menghormati quiet hours.
- Mudah dikendalikan.
- Aman ketika layanan jaringan atau voice engine gagal.
