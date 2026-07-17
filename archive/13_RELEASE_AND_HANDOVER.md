# Release and Handover

## Build outputs

Target:

```text
release/
├── Yachiyo Companion Setup.exe
├── win-unpacked/
└── checksums.txt
```

Nama output dapat disesuaikan, tetapi harus mudah ditemukan.

## Release profiles

### Development

- Mock Hermes tersedia.
- Debug logging.
- Asset lab.
- DevTools terkendali.

### Personal

- Real Hermes settings.
- External Mao/Kobo assets.
- No debug secrets.
- Voice diagnostics.
- Unsigned build diperbolehkan dengan warning dokumentasi.

### Public-safe

- Kobo excluded.
- Only licensed redistributable assets.
- Basic TTS default.
- License review required.
- No personal endpoint or key.

## User handover

`START-HERE.md` harus menjelaskan:

1. Cara install.
2. Cara memasukkan Mao.
3. Cara memasukkan Kobo.
4. Cara mengisi Hermes URL.
5. Cara mengisi API key tanpa menaruhnya di chat.
6. Cara test koneksi.
7. Cara test suara.
8. Cara mengaktifkan RVC.
9. Cara mematikan click-through.
10. Cara reset settings.
11. Cara mengambil diagnostic report.

## Troubleshooting priority

Berikan troubleshooting berbasis gejala:

- Avatar tidak muncul.
- Mao tidak termuat.
- Tidak ada suara.
- Basic TTS ada, RVC tidak.
- Hermes offline.
- Aplikasi tidak dapat diklik.
- Window hilang di monitor lain.
- CPU terlalu tinggi.
- Audio terlambat.
- Installer diperingatkan Windows.

## Final report

`FINAL_VERIFICATION.md` harus mencantumkan:

- Environment.
- Version.
- Build date.
- Tests.
- Asset detection result.
- Hermes test status.
- Basic TTS status.
- RVC status.
- Live2D status.
- Proactive status.
- Security checks.
- Known limitations.
- Exact output path.

## Maintenance

- Pin dependencies.
- Catat upgrade SDK.
- Sediakan asset adapter agar Mao dapat diganti.
- Sediakan voice provider adapter.
- Jangan melakukan auto-update dependency tanpa test.
