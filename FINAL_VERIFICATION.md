# Final Verification — Yachiyo Companion 0.2.1

## Hermes integration outcome

The 0.2.1 Hermes path passes unit/integration coverage (104 tests), source Electron E2E with a real loopback OpenAI-compatible server, packaged Electron smoke, NSIS build, and silent installer smoke. Test connection now verifies both `/v1/models` and `/v1/chat/completions`, updates the badge immediately, and Save applies the same configuration to runtime chat without restart. JSON and SSE chat plus startup reconnect were verified.

- Installer: `release\Yachiyo-Companion-0.2.1-x64-Setup.exe`
- Bytes: `385451545`
- SHA-256: `25575642234AEFBBED50E46092DE3D7C31D865A2F183E06BB834E3BF251141A9`
- Authenticode: `NotSigned`
- Detailed Hermes report: `docs\HERMES-0.2.1-VERIFICATION.md`
- Security/root-cause audit: `docs\HERMES-INTEGRATION-AUDIT-0.2.1.md`

The production VPS/key remains a manual test. The final installed RVC E2E separately fails because the unchanged voice host kills a model restart at its existing 20-second startup deadline under Playwright; the packaged sidecar itself reports model/index/RVC ready in a direct probe. This is recorded rather than hidden or patched outside the requested Hermes scope.

---

# Historical verification — Yachiyo Companion 0.2.0

## Release identity

- Product: Yachiyo Companion
- Version: 0.2.0
- Build date: 2026-07-17
- Target: Windows x64
- Verified host: Windows 10.0.26200 x64
- Toolchain: Node 22.17.1, npm 11.12.1, Python 3.11.9, Electron 43.1.1
- Hermes configuration: local mock only

## Outcome

**Pass.** The supplied Kobo RVC v2 checkpoint and FAISS index generated a real, non-silent, mono 48 kHz WAV. The exact NSIS-installed 0.2.0 application then ran the complete RVC path and finished correlated WebAudio playback while the validated Mao Live2D runtime and official Cubism Core were active. The WebAudio analyser produced a non-zero Mao `ParamA` lip-sync value.

This result is based on the supplied `kobov2.pth` and `added_IVF454_Flat_nprobe_1_kobov2_v2.index`, not a mock converter. Basic TTS remains an automatic fallback when setup, inference, or playback preparation fails. No Live2D renderer, adapter, model-loading, Core-loading, or asset-protocol implementation was changed for 0.2.0.

## Verified inference path

| Stage                    | Installed-build evidence                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| Indonesian source speech | Edge TTS `id-ID-GadisNeural` synthesized “Halo, ini perbandingan suara Yachiyo dalam bahasa Indonesia.” |
| Source normalization     | Bundled FFmpeg produced a mono 48 kHz WAV                                                               |
| Content features         | TorchAudio HuBERT Base state dict loaded and extracted 768-dimensional features                         |
| Pitch                    | Official RMVPE weights loaded and extracted F0                                                          |
| Voice conversion         | Supplied RVC v2, 48 kHz, F0-enabled Kobo checkpoint ran through the vendored compatible synthesizer     |
| Retrieval                | Supplied `IndexIVFFlat` FAISS index ran in the isolated frozen worker                                   |
| Result                   | A non-silent mono 48 kHz WAV was returned to Electron                                                   |
| Playback                 | Renderer WebAudio reached `ended` and reported the matching one-use request ID                          |
| Lip-sync                 | WebAudio analysis drove Mao `ParamA`; measured peak `0.6095686384799587`                                |

## Release test matrix

| Check                        | Result | Evidence                                                               |
| ---------------------------- | ------ | ---------------------------------------------------------------------- |
| Strict TypeScript            | Pass   | Main, preload, shared, and renderer projects                           |
| ESLint                       | Pass   | Zero warnings allowed                                                  |
| Prettier                     | Pass   | Full tracked workspace formatting check                                |
| Vitest                       | Pass   | 13 files, 55 tests                                                     |
| Python sidecar suite         | Pass   | 13 passed, 1 gated real-inference test skipped in the normal suite     |
| Real checkpoint integration  | Pass   | Gated Python test explicitly enabled against the supplied Kobo files   |
| Production application build | Pass   | Electron main, CommonJS preload, renderer, and existing Live2D payload |
| Frozen sidecar build         | Pass   | Main voice sidecar plus isolated FAISS worker                          |
| Source Electron E2E          | Pass   | 1 test, including sidecar restart and persisted asset state            |
| Packaged Electron E2E        | Pass   | 1 test against `release\win-unpacked\Yachiyo Companion.exe`            |
| Installed Electron E2E       | Pass   | 1 test against the actual isolated NSIS installation                   |
| NSIS release pipeline        | Pass   | `npm run package` completed all gates and produced 0.2.0 artifacts     |

The installed proof used real Mao, Cubism Core, Kobo, HuBERT, and RMVPE files copied into fixture paths containing spaces and non-ASCII characters. It selected the direct Mao `runtime` folder and the Kobo parent folder, reached `ready` for both assets, converted and played RVC audio, saved RVC mode, quit the complete application process, relaunched it, and returned to Mao/RVC `ready`.

## Installed-build proof

- Installed executable: `output\installed-smoke\Yachiyo Companion.exe`
- `app.isPackaged`: `true`
- `app.getVersion()`: `0.2.0`
- Product version: `0.2.0.0`
- File version: `0.2.0`
- Voice source reported after playback: `sidecar-rvc`
- Runtime after restart: `ready`
- Kobo inference after restart: `true`
- Persisted voice mode after restart: `rvc`
- Mao status after restart: `Mao runtime aktif`

### Measured installed run

| Measurement                     |              Value |
| ------------------------------- | -----------------: |
| Cold start                      |         9,964.9 ms |
| Edge TTS + source normalization |           882.1 ms |
| HuBERT feature extraction       |         1,488.0 ms |
| RMVPE pitch extraction          |         2,701.7 ms |
| FAISS index stage               |         2,609.4 ms |
| RVC synthesizer stage           |        17,146.9 ms |
| Total conversion                |        24,020.8 ms |
| End-to-end request              |        37,211.6 ms |
| Measured CPU                    |              26.8% |
| Peak process RAM                |        1,738.0 MiB |
| Source audio                    |           5,856 ms |
| Converted audio                 |           5,840 ms |
| Output WAV                      |      560,684 bytes |
| WebAudio playback               |         7,569.5 ms |
| Peak lip-sync                   | 0.6095686384799587 |

The attached installed application log records the package version, Python 3.11.9, every pinned runtime version, runtime/model/index readiness, request-correlated `sidecar-rvc` playback, conversion metrics, and restart result. The installed copy remains available at the path above after testing; its temporary test profile and secrets were removed.

## Independent frozen-runtime proof

The final frozen sidecar and final frozen FAISS worker also converted the supplied checkpoint outside Electron:

| Run  | WAV                                               | Cold start |  Conversion |       Total | Duration |   Bytes |
| ---- | ------------------------------------------------- | ---------: | ----------: | ----------: | -------: | ------: |
| Cold | `.runtime-cache\proof\final-frozen-kobo-cold.wav` | 7,490.5 ms | 15,562.8 ms | 25,593.3 ms | 5,640 ms | 541,484 |
| Warm | `.runtime-cache\proof\final-frozen-kobo-warm.wav` |       0 ms | 12,603.9 ms | 14,680.7 ms | 4,320 ms | 414,764 |

An independent WAV read confirmed the cold output is mono at 48 kHz, 5.64 seconds long, with peak amplitude `0.2611` and RMS `0.02632`; it is not silence.

## Runtime pinning and provenance

The installer contains the Python code and native libraries. Runtime setup downloads no executable code: it can acquire only the two inference data files listed in `runtime-manifest.json`, from fixed HTTPS hosts. Redirects are revalidated, expected byte lengths and SHA-256 hashes must match, and activation is atomic.

| Component                    | Pin                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------- |
| Compatible RVC subset        | Official RVC tag `2.2.231006`, commit `9f2f0559e6932c10c48642d404e7d2e771d9db43` |
| PyTorch / TorchAudio         | `2.7.1+cpu`                                                                      |
| FAISS CPU                    | `1.8.0`                                                                          |
| NumPy / SciPy                | `1.26.4` / `1.13.1`                                                              |
| SoundFile / psutil           | `0.12.1` / `6.1.1`                                                               |
| edge-tts                     | `7.2.8`                                                                          |
| FastAPI / Uvicorn / Pydantic | `0.128.0` / `0.40.0` / `2.12.5`                                                  |

The complete CPython 3.11 Windows x64 dependency set is version-pinned in `requirements-runtime-windows-py311.in` and wheel-hash-pinned in `requirements-runtime-windows-py311.lock`, including the official PyTorch CPU wheel URLs and hashes.

| Data asset                |       Bytes | SHA-256                                                            | Pinned source                                                                   |
| ------------------------- | ----------: | ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| HuBERT Base state dict    | 377,565,405 | `2809382725ea3b9b3d62c8e94168d7587923603cca5e05e50ed3fb65502c5b75` | `download.pytorch.org`                                                          |
| RMVPE weights             | 181,184,272 | `6d62215f4306e3ca278246188607209f09af3dc77ed4232efdd069798c4ec193` | Official RVC model repository commit `0d7ebae452fb102c695b08f4e6f546be00603425` |
| Supplied Kobo checkpoint  |    External | `EBF2826393F278168BBE6C9E6DA614D75A6EEDA408C33219DEDF94688ED4F49C` | User-supplied; not redistributed                                                |
| Supplied Kobo FAISS index |    External | `81AD383BD13B46B7A0C3B526F77258250EDFC9D774DE37B3A6918B9D2B8B5859` | User-supplied; not redistributed                                                |
| Selected Cubism Core      |     228,042 | `8741F739779B5D5210872BD3D7D99F0F1E56E6C87409E7D26D6BB4B80AA1EF47` | User-supplied official SDK file; not redistributed                              |

## Functional and failure coverage

- Runtime setup reports checking, per-asset download progress, ready state, and plain-language failure while Basic TTS remains usable.
- The voice panel compares **Tes Basic** and **Tes RVC Kobo** and exposes pitch, index rate, protection, RMVPE, and Auto/CPU/CUDA device settings.
- Auto device selection uses `torch.cuda.is_available()`; explicit unavailable CUDA fails closed. The verified machine selected CPU.
- Long replies are split at sentence boundaries and converted/played sequentially. Oversized individual sentences are hard-split within the validated request limit.
- The actual installed proof used an Indonesian sentence and produced/played a non-silent converted result. Automated verification establishes pipeline completion, not a subjective rating of accent or timbre.
- Silence produces a valid mono 48 kHz silent WAV without unnecessarily loading the model.
- Too-short and malformed WAV input return stable public errors.
- Missing checkpoint/index/runtime files fail closed and preserve Basic TTS fallback.
- A forced RVC HTTP failure falls back to Basic TTS without throwing into or crashing Electron.
- Sidecar restart, stale-child handling, settings persistence, and playback request correlation are covered.
- Cold-start, feature, pitch, index, inference, conversion, CPU, RAM, source duration, output duration, and byte metrics are visible in the UI.

## Security regression check

- Renderer sandboxing, context isolation, disabled Node integration, Content Security Policy, permission denial, and the narrow frozen preload API remain enabled.
- IPC validates trusted sender, request schemas, one-use native-dialog tokens, and one-use voice playback IDs.
- Mao/Core/Kobo path confinement, read-only asset protocol rules, ZIP traversal/entry/expanded-size protections, and secret-vault separation remain active.
- PyTorch checkpoint and inference state dictionaries load with `weights_only=True`, followed by architecture, tensor-count, shape, size, and metadata validation.
- The voice sidecar binds to a random loopback port with a per-run bearer token and strict request limits.
- FFmpeg/FFprobe use fixed executable paths and argument arrays without a shell.
- FAISS runs in a separate frozen worker with confined one-use files, stripped sidecar secrets, a fresh PyInstaller environment, and bounded native thread counts.
- Runtime downloads are allowlisted, size-bounded, hash-pinned data only; invalid or partial files never replace a valid asset.

## Live2D non-regression

The 0.2.0 work did not modify the working Live2D implementation. The installed proof selected the real Mao runtime and official Core, reached Mao `ready`, detected expressions, motions, texture, physics, pose, EyeBlink IDs, and `ParamA`, displayed “Mao runtime aktif,” drove non-zero lip-sync during RVC playback, and restored the active Mao runtime after a full restart.

## Release artifacts

- Installer: `release\Yachiyo-Companion-0.2.0-x64-Setup.exe`
- Block map: `release\Yachiyo-Companion-0.2.0-x64-Setup.exe.blockmap`
- Unpacked executable: `release\win-unpacked\Yachiyo Companion.exe`
- Checksums: `release\checksums.txt`

| Artifact          |       Bytes | SHA-256                                                            |
| ----------------- | ----------: | ------------------------------------------------------------------ |
| Installer         | 385,444,422 | `C0AA5E8B5952DBB927FEF34F89BB31478D39E873F3E3BB9952B4E0B898ED1397` |
| Block map         |     396,502 | `667224C0AB4AAD418B907D5847F6C853C1B68F886265BBC1560199FD539C02C4` |
| Unpacked app EXE  | 225,821,696 | `39060F0AFE01907B5B0500BE7C8DA4388DDBCB41EB19B164AB5865B2B3025BF4` |
| `app.asar`        |  34,062,777 | `FCBD68F515B94E6338B28D9DC4388D3A90E6B2B57184FAD854A996C9BF5C459D` |
| Voice sidecar EXE |  39,825,225 | `E4E0D625867C469A39B75CAEA5B87E44BB2A51DFEA6B58BB8BB724D03739970C` |
| FAISS worker EXE  |   7,709,654 | `B530E38456E70FE7092488D436D4A98331697DBC2A9A6ABA4A4B6A5413B03B69` |

`Get-AuthenticodeSignature` reports `NotSigned` for the installer, application, sidecar, and FAISS worker.

## Visual evidence

- `docs\screenshots\04-asset-status.png`: validated Mao/Core/Kobo inventory and states.
- `docs\screenshots\05-restart-persistence.png`: source restart persistence.
- `docs\screenshots\06-packaged-fallback.png`: packaged fallback state.
- `docs\screenshots\07-installed-asset-selection.png`: installed asset-selection flow.
- `docs\screenshots\08-installed-rvc-playback.png`: installed RVC test after completed WebAudio playback.

The final installed screenshot was visually inspected at original resolution. The RVC runtime state, HuBERT/RMVPE assets, tuning controls, comparison actions, and completed playback feedback are legible without overlap.

## Known limitations

- The installer is unsigned and may trigger Windows SmartScreen.
- The audited release baseline contains CPU PyTorch. Device selection detects CUDA when the active trusted Torch runtime exposes it, but no CUDA hardware/runtime was available for this release verification; CUDA inference is not claimed.
- CPU RVC cold start and conversion are resource-intensive on this machine, as quantified above.
- Edge TTS requires Microsoft's online service and sends the source text to that service. RVC conversion itself remains local.
- The HuBERT and RMVPE data assets total 558,749,677 bytes and are acquired separately through the explicit setup action rather than bundled in the installer.
- The supplied Kobo checkpoint/index have no included license or provenance document. This local technical proof does not grant redistribution or impersonation rights.
- Mao, Cubism Core, and Kobo remain external and are not redistributed.
- Real Hermes remains untested until its connection is supplied through Settings; local mock Hermes was used throughout.
- Automated checks prove Indonesian synthesis, conversion, non-silent output, WebAudio completion, and lip-sync. Subjective voice similarity and pronunciation quality still require a human listening assessment.
