# Start Here

This guide is for installing and using Yachiyo Companion without a terminal.

## 1. Install

1. Open `release\Yachiyo-Companion-0.2.0-x64-Setup.exe`.
2. Choose an installation folder and finish setup.
3. Windows may show a SmartScreen warning because this personal build is not code-signed. Confirm the filename and SHA-256 value in `release\checksums.txt` before choosing **Run anyway**.
4. Open **Yachiyo Companion** from the desktop or Start menu.

The app starts with Hermes mock, the animated fallback avatar, microphone off, and no API key.

## 2. Complete onboarding

Use **Lanjut** twice, review the detected capabilities, then choose **Buka Yachiyo**. Missing optional assets do not prevent use.

## 3. Select the supplied assets

Open **Atur → Aset**.

- For **Niziiro Mao**, choose either the extracted root folder containing `runtime\mao_pro.model3.json`, the `runtime` folder itself, or **Pilih ZIP** for `assets\source\mao_en.zip`.
- For **Kobo RVC**, choose its extracted root folder or use its separate **Pilih ZIP** action for `assets\source\kobo.zip`. The detector handles the supplied extra nested `kobo` folder.
- The chosen path appears immediately and is scanned automatically. Use **Scan ulang** to repeat validation or **Ganti folder** to choose another source.
- A structurally valid Mao source shows `core-missing` until Cubism Core is selected. `ready` means that both Mao and the official Core validated.

The personal installer intentionally does not copy Mao or Kobo. Keeping them external avoids redistributing assets with unresolved or separate license terms.

## 4. Optional: enable Mao rendering

The supplied files do not contain Live2D Cubism Core. Mao cannot render until you personally accept Live2D's terms and obtain the official Web Core file.

1. Obtain `live2dcubismcore.min.js` from the official Cubism SDK for Web.
2. Open **Atur → Aset → Cubism Core resmi**.
3. Select that exact file. Yachiyo saves it and rescans automatically.

Do not rename an unrelated script. Yachiyo checks the exact filename and expected Core markers. See [LIVE2D-MODEL-GUIDE.md](LIVE2D-MODEL-GUIDE.md).

## 5. Test chat

1. Choose **Chat**.
2. Type a message and choose **Kirim**.
3. The **Mock lokal** badge confirms no remote Hermes or key is being used.

Useful mock checks include `/mock 500`, `/mock 429`, `/mock slow`, and `/mock malformed`.

## 6. Add the real Hermes connection

Open **Atur → Hermes**, choose **Hermes VPS**, then enter:

- the HTTPS base URL;
- the model name;
- the API key.

Choose **Tes koneksi** before **Simpan**. Enter the key only in this settings screen—never in chat, a screenshot, or a diagnostics file. See [HERMES-VPS-GUIDE.md](HERMES-VPS-GUIDE.md).

## 7. Test voice

Open **Atur → Suara**.

- **Basic** uses the packaged local sidecar and Edge TTS, then normalizes audio with FFmpeg. It may require internet access to Microsoft's speech service.
- **Mati** disables speech.
- **RVC** uses HuBERT, RMVPE, the selected Kobo RVC v2 checkpoint, and its FAISS index entirely inside the Python sidecar. If any stage fails, Basic is selected automatically without crashing the app.

If the runtime status says **perlu setup**, choose **Siapkan RVC** and leave the app open while the two pinned model assets download and verify. Then compare **Tes Basic** and **Tes RVC Kobo**. CPU mode works without NVIDIA; `auto` selects CUDA only when a compatible runtime is available. See [VOICE-MODEL-GUIDE.md](VOICE-MODEL-GUIDE.md).

## 8. Test a reminder

Choose **Ingat → Kirim notifikasi tes**. Quiet hours, minimum gaps, deduplication, and daily limits are enforced locally.

## 9. Recover the window

- If clicks pass through the app, press **Ctrl+Shift+F12**.
- If the app is hidden, click its tray icon.
- To restore a misplaced window, use the tray menu or **Atur → Desktop → Reset posisi**.

## 10. Reset or collect diagnostics

- Reset: **Atur → Tentang → Reset semua pengaturan**.
- Safe report: **Atur → Privasi → Ekspor diagnostik aman**.

The diagnostics report excludes API keys, tokens, raw absolute asset paths, conversations, and audio. For symptom-based help, use [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
