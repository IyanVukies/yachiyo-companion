# Final Verification

## Release identity

- Product: Yachiyo Companion
- Version: 0.1.1
- Build date: 2026-07-17
- Target: Windows x64
- Environment: Windows 10.0.26200 x64
- Toolchain: Node 22.17.1, npm 11.12.1, Python 3.13.3, Electron 43.1.1
- Hermes mode used for verification: local mock only

## Outcome

The installed-build asset-selection defect is fixed. A native folder or ZIP choice is displayed immediately, scanned automatically with a visible loading state, validated in Electron main, persisted atomically, and returned as refreshed renderer state. Cancellation and invalid selections produce visible feedback.

Mao accepts both the parent containing `runtime\mao_pro.model3.json` and the direct `runtime` folder. Both normalize to the actual runtime model root. ZIP selection is exposed through a separate **Pilih ZIP** action for Mao and Kobo. The supplied Mao model correctly reports `core-missing` because proprietary Cubism Core was not provided; `ready` is reserved for a valid Mao source plus a compatible selected Core.

## Executed verification

| Check                       | Result | Evidence                                                                               |
| --------------------------- | ------ | -------------------------------------------------------------------------------------- |
| Strict TypeScript           | Pass   | Node/main/preload/shared and renderer projects                                         |
| ESLint                      | Pass   | Zero warnings allowed                                                                  |
| Prettier                    | Pass   | Full workspace formatting check                                                        |
| Vitest                      | Pass   | 10 files, 47 tests                                                                     |
| Targeted asset regressions  | Pass   | 4 files, 19 renderer/IPC/validator/persistence tests                                   |
| Python sidecar tests        | Pass   | 5 tests; repeated cleanly after run-scoped temp hardening                              |
| Production Electron build   | Pass   | Main, CommonJS preload, renderer, and Live2D adapter                                   |
| Source Electron E2E         | Pass   | 1 test; native cancellation, ZIP, parent-root normalization, Kobo, restart persistence |
| Packaged executable E2E     | Pass   | 1 test against `release\win-unpacked\Yachiyo Companion.exe`                            |
| Installed executable E2E    | Pass   | 1 test against the NSIS-installed 0.1.1 executable; full process restart included      |
| NSIS package                | Pass   | Installer and block map created from the verified payload                              |
| Install/uninstall lifecycle | Pass   | Silent isolated install, installed-copy test, silent uninstall, target removed         |

The final release pipeline reran TypeScript, lint, formatting, all 47 Vitest tests, the 5 Python tests, renderer build, sidecar build, and NSIS packaging before artifact hashes were recorded.

## Verified asset transaction

| Layer             | Verified behavior                                                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| React settings    | Shows the selected path immediately, scanning spinner/message, plain success/error/cancel feedback, normalized root, and detailed inventory          |
| Preload bridge    | Frozen narrow API exposes typed choose/apply/rescan calls; no filesystem or raw IPC primitive                                                        |
| Validated IPC     | Strict asset-kind/mode schemas, trusted sender validation, strict UUID token parsing, and asset-path changes rejected from general settings          |
| Native dialog     | Folder, ZIP, and Core use explicit matching dialog modes and filters; cancelled/malformed results are returned visibly                               |
| Selection handoff | Main creates a random one-time token with a five-minute expiry; renderer cannot submit an arbitrary path                                             |
| Validator         | Proposed source is scanned before persistence; explicit invalid paths never silently fall back to development assets                                 |
| Persistence       | Native-dialog selection is written atomically after scanning; invalid asset state remains diagnosable without changing secrets or unrelated settings |
| Renderer refresh  | Apply returns refreshed settings/assets; restart tests confirm persisted paths and states                                                            |

The pending-token cache is bounded, tokens are consumed once, and voice sidecar restart is limited to Kobo changes.

## UX and asset acceptance

### Mao

- Parent-folder, direct-runtime-folder, and ZIP inputs passed.
- Paths containing spaces and Japanese characters passed and rendered correctly.
- The selected source remains visible during scanning and after validation failure.
- Explicit **Ganti folder**, **Pilih ZIP**, and **Scan ulang** actions are present.
- Cancellation is visible and preserves the previous selection.
- Invalid assets remain selected and show a plain-language error.
- Restart persistence passed in both source and installed Electron tests.
- Actual supplied inventory:
  - model entry: `mao_pro.model3.json`;
  - expressions: 8;
  - motions: 7;
  - texture: one 4096×4096 PNG;
  - physics: present;
  - pose: present;
  - EyeBlink IDs: `ParamEyeLOpen`, `ParamEyeROpen`;
  - LipSync IDs: `ParamA`.
- Actual state without Core: `core-missing`.
- Invalid Core returns `invalid`; a compatible Core contract fixture transitions the combined status to `ready`.
- Actual Core execution/rendering was not claimed because the proprietary file was not supplied.

### Kobo

- Extracted-folder and ZIP inputs passed, including the supplied nested `kobo` directory.
- Equivalent visible path, loading, success/error, normalized-root, inventory, replace, ZIP, and rescan feedback is present.
- Checkpoint: `kobov2.pth`.
- Index: `added_IVF454_Flat_nprobe_1_kobov2_v2.index`.
- Safe structural metadata: RVC v2, 48 kHz, f0 enabled, 500 epochs.
- Actual state: `runtime-missing`, with plain-language Basic TTS fallback feedback.
- The checkpoint/index were inspected structurally without unpickling and remain outside the installer.

## ZIP and path security

- ZIP UI availability now matches the validator's support claim.
- ZIP traversal rejection and no-escape behavior passed with a malicious entry fixture.
- Existing entry-count and expanded-size protections remain active.
- Model references remain confined beneath the validated normalized root.
- The read-only `yachiyo-asset` protocol remains extension-allowlisted and root-confined.
- Renderer sandboxing, context isolation, disabled Node integration, CSP, permission handling, and secret separation remain enabled.
- Asset persistence preserves unrelated settings and does not expose or rewrite the Hermes secret.

## Installed-copy evidence

The exact 0.1.1 NSIS artifact was silently installed into `output\installed-smoke`. The installed executable reported `app.isPackaged === true` and `app.getVersion() === "0.1.1"`.

The installed test selected the direct Mao `runtime` folder and the Kobo parent folder from generated paths containing spaces and Japanese characters. It verified inventories, `core-missing`, `runtime-missing`, explicit rescan, and persistence after quitting and launching a new application process.

After verification, the installed copy was silently uninstalled. `output\installed-smoke` is absent and no application or sidecar process launched from the workspace remains.

## Hermes

- Local random-port/token mock remained the active configuration.
- No real endpoint, external account, or key was used.
- Real Hermes stays configurable only through the application settings screen, as requested.

## Release artifacts

- Installer: `release\Yachiyo-Companion-0.1.1-x64-Setup.exe`
- Block map: `release\Yachiyo-Companion-0.1.1-x64-Setup.exe.blockmap`
- Unpacked executable: `release\win-unpacked\Yachiyo Companion.exe`
- Checksums: `release\checksums.txt`

| Artifact          |       Bytes | SHA-256                                                            |
| ----------------- | ----------: | ------------------------------------------------------------------ |
| Installer         | 229,207,155 | `7FE8CB0AD5FC80A25E44161134941F5BB15CAB3C8EB16ACF2C61E7DE0073BD4C` |
| Block map         |     239,216 | `2438333E3051D6D7CDAF760D6CDB23A9B58319E253FBFFA95309AB2B2A269653` |
| Unpacked app EXE  | 225,821,696 | `602C9796A775F4FC1E0AFE0609A93E6313C7F71F56C4F2F341058C8087406E53` |
| `app.asar`        |  34,039,577 | `41FE234D045033F915DC23B013E9F0FB618E03D1A11D918D08C8A1589A94C99A` |
| Voice sidecar EXE |   6,889,585 | `CF36F545BEAFED75014FBA7CE6FF7AB3A474833985806A5681390EF905A46CC9` |

Windows product metadata reports Yachiyo Companion 0.1.1. `Get-AuthenticodeSignature` reports `NotSigned` for the installer, app executable, and sidecar. The superseded 0.1.0 installer/block-map artifacts were removed from `release` to avoid accidental installation of the known-defective build.

## Screenshots

- `docs\screenshots\01-onboarding.png`
- `docs\screenshots\02-main-fallback.png`
- `docs\screenshots\03-mock-chat.png`
- `docs\screenshots\04-asset-status.png`
- `docs\screenshots\05-restart-persistence.png`
- `docs\screenshots\06-packaged-fallback.png`
- `docs\screenshots\07-installed-asset-selection.png`

The installed-build screenshot was visually inspected at original resolution. Selected/normalized non-ASCII Kobo paths, status badges, feedback, and asset actions are legible without overlap.

## Known limitations

- The installer is unsigned and may trigger SmartScreen.
- Proprietary Cubism Core remains an external user requirement, so actual Mao rendering was not executed.
- The supplied Kobo assets still lack the RVC runtime, RMVPE, ContentVec, and license/provenance files.
- Real Hermes remains untested until the user supplies its connection through Settings.
- Edge Basic TTS depends on Microsoft's online service; browser/Windows fallback availability varies.
- Public redistribution still requires Live2D, model-rights, FFmpeg/FFprobe, privacy, and code-signing review.
