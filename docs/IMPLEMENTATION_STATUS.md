# Implementation Status

Last updated: 2026-07-17

## Current state

The application, sidecar, automated tests, branded unpacked release, and NSIS installer have been built, exercised, and hashed. External capabilities that require missing proprietary/runtime inputs remain explicit.

## Gates

| Phase                      | Status                      | Evidence                                                                          |
| -------------------------- | --------------------------- | --------------------------------------------------------------------------------- |
| Plans, environment, assets | Complete                    | All 00–15 plans read; 26 supplied files inspected directly                        |
| Electron shell + fallback  | Complete                    | Production and packaged GUI E2E screenshots                                       |
| Desktop controls           | Complete                    | Tray-ready status, hide/show, restart, bounds/click recovery implementation       |
| Mock Hermes chat           | Complete                    | Streaming success plus 401/429/500/drop/malformed tests                           |
| Basic TTS                  | Complete                    | Real Edge TTS and packaged sidecar audio smoke                                    |
| Live2D Mao                 | Complete                    | Official Core, Mao rendering, inventory, and `ParamA` input verified              |
| RVC                        | Complete                    | Real Kobo v2 CPU conversion; HuBERT, RMVPE, FAISS, metrics, and fallback verified |
| Real Hermes                | Awaiting user configuration | Settings adapter complete; mock remains requested default                         |
| Proactive engine           | Complete                    | Policy tests plus Electron notification test flow                                 |
| Onboarding and UX          | Complete                    | Visual and E2E review at 460×720                                                  |
| Hardening and tests        | Complete                    | Strict TS/lint/formatting, 55 Vitest, 13 pytest, and Electron E2E                 |
| Package                    | Complete                    | Final NSIS build, installed-copy GUI E2E, clean uninstall, signatures, and hashes |

## Important externally blocked checks

- Real Hermes cannot be claimed without the user's endpoint, model, and secret.
- CUDA performance is not claimed because the release machine has no NVIDIA runtime; CPU mode is verified.
- Kobo conversion is technically verified, but redistribution/identity rights remain unresolved because the supplied model has no license/provenance document.

Final artifact paths and hashes are recorded in `FINAL_VERIFICATION.md` and `release/checksums.txt`.
