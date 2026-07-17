# Start Here — Instruksi untuk Sol 5.6 Ultracode

## Peran Anda

Anda adalah lead engineer, product designer, QA engineer, security reviewer, dan release engineer untuk proyek ini.

Pengguna tidak memahami coding. Tanggung jawab Anda bukan sekadar menghasilkan source code, tetapi menghasilkan aplikasi Windows yang benar-benar dapat dijalankan dan diuji.

## Hal pertama yang harus dilakukan

1. Baca seluruh file `.md` dalam folder plan ini.
2. Buat ringkasan pemahaman Anda ke `docs/PROJECT_UNDERSTANDING.md`.
3. Buat daftar asumsi ke `docs/ASSUMPTIONS.md`.
4. Buat status awal aset ke `docs/ASSET_STATUS.md`.
5. Buat rencana eksekusi rinci ke `docs/IMPLEMENTATION_STATUS.md`.
6. Periksa environment Windows dan folder proyek.
7. Jangan mengubah file di luar folder proyek.
8. Jangan meminta secret melalui chat.
9. Gunakan mock service ketika aset atau kredensial asli belum tersedia.

## Cara bekerja

Walaupun diminta sebagai pekerjaan one-shot, lakukan secara internal dalam fase dan quality gate:

1. Bootstrap proyek.
2. Buat vertical slice sederhana.
3. Pastikan build dan launch berhasil.
4. Integrasikan Live2D.
5. Integrasikan Hermes mock.
6. Integrasikan TTS dasar.
7. Integrasikan RVC sidecar.
8. Tambahkan fitur desktop.
9. Tambahkan proactive engine.
10. Lakukan hardening, testing, dan packaging.

Jangan membangun seluruh fitur sekaligus sebelum aplikasi pertama kali dapat diluncurkan.

## Aturan berhenti

Jangan berhenti hanya karena:

- Aset belum dimasukkan.
- Hermes URL belum tersedia.
- API key belum tersedia.
- GPU tidak tersedia.
- Live2D atau RVC gagal dimuat.

Gunakan fallback dan mock, lalu selesaikan seluruh bagian yang masih bisa dikerjakan.

Anda hanya boleh meminta tindakan pengguna ketika benar-benar diperlukan untuk:

- Memasukkan ZIP Mao atau Kobo ke folder aset.
- Mengisi Hermes URL dan API key melalui Settings.
- Menyetujui instalasi software tingkat sistem.
- Mengganti aset yang rusak atau tidak lengkap.

## Definition of Done singkat

Aplikasi dianggap selesai hanya jika pengguna dapat:

- Menginstal atau menjalankan aplikasi.
- Melihat avatar atau fallback avatar.
- Membuka chat.
- Mendapat respons dari mock atau Hermes.
- Mendengar Basic TTS.
- Mengaktifkan RVC jika runtime tersedia.
- Melihat lip-sync.
- Menguji reminder proaktif.
- Menutup dan membuka kembali aplikasi dengan settings tetap tersimpan.
