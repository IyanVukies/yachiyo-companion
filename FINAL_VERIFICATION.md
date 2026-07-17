# Final Verification

## Release identity

- Product: Yachiyo Companion
- Version: 0.1.0
- Build date: 2026-07-17
- Target: Windows x64
- Environment: Windows 10.0.26200 x64, Intel Core i7-1255U, 12 logical CPUs, 15.7 GiB RAM, Intel Iris Xe
- Toolchain: Node 22.17.1, npm 11.12.1, Python 3.13.3, Electron 43.1.1

## Executed verification

| Check                    | Result | Evidence                                                                                    |
| ------------------------ | ------ | ------------------------------------------------------------------------------------------- |
| Dependency install/audit | Pass   | 541 npm packages; 0 known vulnerabilities                                                   |
| Strict TypeScript        | Pass   | Node/preload/shared and renderer projects                                                   |
| ESLint                   | Pass   | zero warnings allowed                                                                       |
| Prettier                 | Pass   | full workspace formatting check                                                             |
| JavaScript tests         | Pass   | 8 files, 32 tests                                                                           |
| Python sidecar tests     | Pass   | 5 tests                                                                                     |
| Renderer/Electron build  | Pass   | main, CJS sandbox preload, renderer, Cubism adapter/shaders                                 |
| Source-tree Electron E2E | Pass   | onboarding, bridge/CSP, protocol traversal, mock chat/error, reminders, restart/persistence |
| Voice sidecar smoke      | Pass   | token 401 check; Edge TTS + FFmpeg/FFprobe; 30,240-byte output                              |
| Packaged executable E2E  | Pass   | `app.isPackaged`, clean missing assets, bundled sidecar, external assets, tray hide/show    |
| NSIS packaging           | Pass   | assisted installer plus `win-unpacked`                                                      |
| NSIS install/uninstall   | Pass   | contained silent install, installed-copy E2E, silent uninstall, and clean process state     |

## Asset verification

### Mao

- External folder detected from the actual supplied tree.
- 8 expressions and 7 motions enumerated.
- Physics, pose, 4096×4096 texture, eye-blink IDs, and `ParamA` verified structurally.
- Read-only custom-protocol model fetch returned JSON version 3.
- Encoded traversal probe returned 404.
- Cubism Core: **not supplied**.
- Actual Mao rendering/expressions/motions/physics/blink/`ParamA`: **not executable without Core; not claimed**.

### Kobo

- Checkpoint and index detected from the actual nested folder.
- Safe structural metadata: RVC v2, 48k, f0 enabled, 500 epochs.
- RVC package, RMVPE, and ContentVec: **absent**.
- Conversion status: **not available; Basic TTS fallback verified**.
- Checkpoint/index are excluded from the installer.

## Hermes

- Local random-port/token mock: verified.
- Streaming success and deterministic 401/429/500/slow/drop/malformed/long/JSON paths: covered by integration/E2E tests.
- Real Hermes: **not tested**, as requested; no endpoint, account, or key was provided. Configuration remains available only through Settings.

## Desktop and proactive behavior

- Tray object created in the packaged app.
- Hide-to-tray and restore behavior exercised.
- The NSIS-installed executable was tested from `output/installed-smoke`, then its uninstaller removed the contained install with no residual app/sidecar process.
- Settings persisted across a graceful full process restart.
- Fallback avatar, chat panel, settings, and asset status visually reviewed from screenshots.
- Test notification flow passed; quiet hours, dedupe, gap, limit, snooze, and dismiss logic are tested locally.
- Global click-through recovery shortcut is registered as `Ctrl+Shift+F12`; direct OS-level key injection was not used.

## Security checks

- Renderer sandbox, context isolation, no Node integration.
- CommonJS sandbox preload exposes a frozen narrow bridge; page has no `require` or `process`.
- Strict CSP and permission handlers active.
- Secret vault, log redaction, and diagnostics redaction tested/inspected.
- API key is absent from renderer settings and diagnostics.
- ZIP/path limits and actual reference confinement implemented.
- Sidecar is loopback-only, random-token authenticated, body/host validated, and shell-free.
- No supplied `.pth` was unpickled or executed.

## Known limitations

- Installer is unsigned and may trigger SmartScreen.
- Proprietary Cubism Core is an external user requirement.
- RVC dependencies and model license/provenance are unresolved.
- Edge Basic TTS depends on an online Microsoft speech service; browser/Windows fallback availability varies.
- Intel Iris Xe was the only GPU; no NVIDIA/CUDA path was available.
- Renderer's main JavaScript bundle is approximately 663 kB before compression; functional performance was acceptable in the tested 460×720 window.
- Public redistribution requires Live2D, model-rights, FFmpeg/FFprobe source/license, privacy, and code-signing review.

## Release artifacts

- Installer: `release\Yachiyo-Companion-0.1.0-x64-Setup.exe`
- Unpacked executable: `release\win-unpacked\Yachiyo Companion.exe`
- Block map: `release\Yachiyo-Companion-0.1.0-x64-Setup.exe.blockmap`
- Checksums: `release\checksums.txt`

Final artifact details:

| Artifact          |       Bytes | SHA-256                                                            |
| ----------------- | ----------: | ------------------------------------------------------------------ |
| Installer         | 229,202,664 | `D764C9782BCB356FF4682F9AB7A960BD276D448596C7D2C7B8C7688F519E363C` |
| Block map         |     239,241 | `C98FD042DCE314BF3CBC2A7CAFB4BD86E1F26D5CF9DCEC86C93572799DF89976` |
| Unpacked app EXE  | 225,821,696 | `C8E15B266D8C37AB002BCA965C1B46D7DA3C70F55BBE4A8C2926A044D9598BFF` |
| `app.asar`        |  34,009,264 | `12236642A54EB95023CF230A6C85174C2A579D93CF4FF4B1265B9E9C51882967` |
| Voice sidecar EXE |   6,889,585 | `D8E161A68E93E608541C60ABA4BBB1AB156783C6CC2D8C9776AA47413C38EBFD` |

Windows `Get-AuthenticodeSignature` reports `NotSigned` for the installer, app executable, and sidecar. Product metadata reports Yachiyo Companion 0.1.0.

## Screenshots

- `docs\screenshots\01-onboarding.png`
- `docs\screenshots\02-main-fallback.png`
- `docs\screenshots\03-mock-chat.png`
- `docs\screenshots\04-asset-status.png`
- `docs\screenshots\05-restart-persistence.png`
- `docs\screenshots\06-packaged-fallback.png`
