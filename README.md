# Yachiyo Companion

Yachiyo Companion is a Windows desktop companion for an OpenAI-compatible Hermes Agent. Version 0.2.1 adds reliable end-to-end Hermes VPS configuration, runtime chat, connection status, endpoint normalization, streaming, and safe diagnostics while preserving the Mao Live2D and Kobo RVC v2 pipeline from 0.2.0.

The application starts in local mock mode and needs no API key. A real Hermes connection is configured only inside Settings. The supplied Mao and Kobo assets remain external to the installer.

## Current capability status

| Capability                                  | Status                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------- |
| Windows installer and unpacked app          | Verified                                                                              |
| Animated fallback avatar and RMS lip-sync   | Verified                                                                              |
| Local mock Hermes streaming/errors/cancel   | Verified                                                                              |
| Real Hermes adapter and settings            | Implemented; awaiting the user's endpoint/key                                         |
| Edge Basic TTS, 48 kHz mono conversion      | Verified                                                                              |
| Browser/Windows TTS fallback                | Implemented                                                                           |
| Mao asset selection and validation          | Folder/ZIP auto-scan, visible inventory, persistence, and root normalization verified |
| Mao rendering and `ParamA` input            | Verified with the user-supplied official Cubism Core                                  |
| Kobo RVC v2                                 | Real 48 kHz conversion verified on CPU; Basic fallback remains automatic              |
| RVC setup/progress/device/tuning            | Pinned HuBERT/RMVPE setup and Basic/RVC comparison implemented                        |
| Tray, reminders, persistence, clean restart | Verified in Electron E2E                                                              |

## Start here

- Nontechnical installation and setup: [START-HERE.md](START-HERE.md)
- Architecture: [ARCHITECTURE.md](ARCHITECTURE.md)
- Security and privacy: [SECURITY.md](SECURITY.md)
- Troubleshooting: [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- Live2D setup: [LIVE2D-MODEL-GUIDE.md](LIVE2D-MODEL-GUIDE.md)
- Voice and RVC setup: [VOICE-MODEL-GUIDE.md](VOICE-MODEL-GUIDE.md)
- Hermes VPS setup: [HERMES-VPS-GUIDE.md](HERMES-VPS-GUIDE.md)
- Final evidence: [FINAL_VERIFICATION.md](FINAL_VERIFICATION.md)

## Development

Prerequisites: Node.js 22+, npm 11+, and Python 3.11 for the RVC sidecar build.

```powershell
npm install
npm run dev
```

Useful gates:

```powershell
npm run verify
npm run test:sidecar
npm run test:e2e
npm run smoke:sidecar
npm run package
```

The sidecar environment used for this release is `.venv-rvc`. Its exact Windows wheel closure is in `src/sidecar/rvc_service/requirements-runtime-windows-py311.lock`; runtime model origins and hashes are in `runtime-manifest.json`.

## Technology

- Electron 43, React 19, Vite 7, strict TypeScript 5.9
- FastAPI/Python sidecar packaged with PyInstaller
- Edge TTS, bundled FFmpeg/FFprobe, PyTorch/TorchAudio, RMVPE, and FAISS
- Official Live2D Cubism Web Framework tag `5-r.5`; proprietary Core remains user-supplied
- Vitest and Playwright Electron automation

## Distribution

This is an unsigned personal build. Kobo is not bundled and must not be presented as an official voice. Mao and Cubism use remain subject to Live2D's terms. The bundled FFmpeg binary is GPL-3.0-or-later and carries its license/readme in the app payload. Review [SECURITY.md](SECURITY.md) and [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) before any public distribution.
