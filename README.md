# Yachiyo Companion

Yachiyo Companion is a Windows desktop companion for an OpenAI-compatible Hermes Agent. Version 0.1.0 includes a polished animated fallback avatar, streaming mock chat, optional Basic TTS, a hardened local voice sidecar, tray controls, reminders, onboarding, diagnostics, external Live2D/RVC asset adapters, and an NSIS installer.

The application starts in local mock mode and needs no API key. A real Hermes connection is configured only inside Settings. The supplied Mao and Kobo assets remain external to the installer.

## Current capability status

| Capability                                  | Status                                                                              |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| Windows installer and unpacked app          | Verified                                                                            |
| Animated fallback avatar and RMS lip-sync   | Verified                                                                            |
| Local mock Hermes streaming/errors/cancel   | Verified                                                                            |
| Real Hermes adapter and settings            | Implemented; awaiting the user's endpoint/key                                       |
| Edge Basic TTS, 48 kHz mono conversion      | Verified                                                                            |
| Browser/Windows TTS fallback                | Implemented                                                                         |
| Mao asset validation                        | 8 expressions, 7 motions, physics, pose, eye blink, and `ParamA` verified           |
| Mao rendering                               | Adapter built; blocked because proprietary Cubism Core was not supplied             |
| Kobo RVC                                    | Model/index verified; fallback active because RVC, RMVPE, and ContentVec are absent |
| Tray, reminders, persistence, clean restart | Verified in Electron E2E                                                            |

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

Prerequisites: Node.js 22+, npm 11+, and Python 3.11+ or 3.13 for the sidecar.

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

The sidecar environment used for this release is `.venv-sidecar`. Its pinned inputs are in `src/sidecar/rvc_service/requirements*.txt`.

## Technology

- Electron 43, React 19, Vite 7, strict TypeScript 5.9
- FastAPI/Python sidecar packaged with PyInstaller
- Edge TTS plus bundled FFmpeg/FFprobe
- Official Live2D Cubism Web Framework tag `5-r.5`; proprietary Core remains user-supplied
- Vitest and Playwright Electron automation

## Distribution

This is an unsigned personal build. Kobo is not bundled and must not be presented as an official voice. Mao and Cubism use remain subject to Live2D's terms. The bundled FFmpeg binary is GPL-3.0-or-later and carries its license/readme in the app payload. Review [SECURITY.md](SECURITY.md) and [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) before any public distribution.
