# Troubleshooting

## The app opens with the fallback avatar

This is expected on a clean install. Open **Atur → Aset**, select the Mao folder, select the official Core file if you have accepted its license, save, and rescan.

If Mao is detected but fallback remains active, **Cubism Core resmi** will usually show as missing. The supplied Mao asset does not include it.

## Mao is marked invalid

- Select the folder that contains `runtime\mao_pro.model3.json`, or the supported ZIP.
- Keep all model JSON, MOC3, PNG, physics, pose, expression, and motion files in their original relative locations.
- Do not select `.cmo3` or `.can3`; those editor files are not runtime entries.
- Open Avatar Lab to read the exact issue codes and inventory.

## Cubism Core is rejected

The file must be the official Web SDK file named exactly `live2dcubismcore.min.js`, and it must contain the expected Cubism Core runtime markers. Obtain it from Live2D after accepting the applicable terms. Do not use an unofficial replacement or a Core from another platform.

## There is no sound

1. Open **Atur → Suara** and choose **Basic**.
2. Confirm Windows output volume/device.
3. Choose **Tes suara**.
4. Check the status detail: packaged Basic TTS should report the sidecar ready.
5. Edge TTS needs network access. If unavailable, Yachiyo attempts browser/Windows speech; installed voice availability varies.
6. Restart the app if a previous sidecar was terminated by security software.

## Basic TTS works but RVC does not

That is the verified state of this release. The Kobo checkpoint/index are present, but an inference package, HuBERT/ContentVec weights, and RMVPE weights were not supplied. Yachiyo fails closed to Basic TTS. See [VOICE-MODEL-GUIDE.md](VOICE-MODEL-GUIDE.md).

## Hermes is offline

- Switch to **Mock lokal** to confirm the UI remains healthy.
- In **Atur → Hermes**, check the HTTPS base URL and exact model name.
- Choose **Tes koneksi**.
- A 401/403 means the key was rejected; re-enter it locally.
- A timeout usually means firewall, DNS, reverse proxy, VPN, or VPS routing trouble.
- The app appends `/v1` when the base URL does not already end with it.

## The app cannot be clicked

Press **Ctrl+Shift+F12**. This disables click-through and brings the window back. The same action is available from the tray menu.

## The window disappeared

Click the tray icon, then use **Atur → Desktop → Reset posisi**. Display changes are corrected automatically when possible.

## Notifications do not appear

- Use **Ingat → Kirim notifikasi tes**.
- Quiet hours default to 23:00–07:00 Asia/Jakarta.
- Daily limits, minimum gaps, and duplicate suppression may intentionally hold a reminder.
- Check Windows notification settings and Focus Assist.

## CPU or GPU usage is high

- Keep avatar scale near 1.0.
- Use the fallback avatar if the GPU driver struggles with WebGL.
- Disable voice or RVC experimentation.
- Update the Intel graphics driver from the PC manufacturer.

## Audio is delayed

Edge TTS and optional conversion happen before playback. Network latency is the common cause. Shorter replies reduce delay. RVC is deliberately unavailable rather than adding an unverified slow CPU path.

## Windows warns about the installer

Version 0.1.0 is unsigned. Verify the installer filename and SHA-256 hash in `release\checksums.txt`. Do not bypass a warning if the hash differs.

## Reset everything

Open **Atur → Tentang → Reset semua pengaturan**. If the UI cannot open, exit from the tray and remove only the Yachiyo Companion user-data directory after backing it up. Never delete unrelated Windows application-data folders.
