# Third-Party Notices

Yachiyo Companion 0.2.0 is an unlicensed/private project wrapper around several third-party components. This summary is not legal advice and does not replace the license files shipped with dependencies.

## Live2D Cubism Web Framework

Pinned from Live2D's official `CubismWebFramework` tag `5-r.5`. Use is governed by the Live2D Open Software License and related release-license terms. The Framework license is copied into the renderer payload as `live2d/CUBISM-FRAMEWORK-LICENSE.md`.

Cubism Core is proprietary, is not in this release, and must be obtained separately after accepting Live2D's applicable terms.

## Niziiro Mao

Mao is an external user-supplied sample model, credited to Live2D Inc. The supplied readme references Live2D's Free Material License Agreement and Terms of Use. Raw Mao files are excluded from the installer.

## Kobo voice model

Kobo is an external unofficial personal voice experiment. No license/provenance file was supplied. The checkpoint and index are excluded from the installer and must not be redistributed or represented as official.

## RVC v2 inference implementation

The compatible inference subset is derived from the official `RVC-Project/Retrieval-based-Voice-Conversion-WebUI` release `2.2.231006`, commit `9f2f0559e6932c10c48642d404e7d2e771d9db43`, under the MIT License. Its license and exact adaptation notes are shipped at `rvc_service/vendor/rvc/LICENSE` and `rvc_service/vendor/rvc/PROVENANCE.md` in source distributions.

The installer includes frozen Python code and native libraries, but not the Kobo checkpoint/index or downloaded inference weights. Important pinned components include:

- PyTorch and TorchAudio `2.7.1+cpu`;
- FAISS CPU `1.8.0`;
- NumPy `1.26.4`, SciPy `1.13.1`, SoundFile `0.12.1`, and psutil `6.1.1`;
- FastAPI `0.128.0`, Uvicorn `0.40.0`, Pydantic `2.12.5`, and edge-tts `7.2.8`.

Exact Windows wheel hashes and the complete transitive closure are recorded in `src/sidecar/rvc_service/requirements-runtime-windows-py311.lock`.

## Downloaded voice runtime weights

Yachiyo can acquire only these two data assets through an HTTPS origin allowlist. Both are verified by byte length and SHA-256 before atomic activation:

- TorchAudio HuBERT Base state dict, 377,565,405 bytes, SHA-256 `2809382725ea3b9b3d62c8e94168d7587923603cca5e05e50ed3fb65502c5b75`, from `download.pytorch.org`;
- official RVC RMVPE weights, 181,184,272 bytes, SHA-256 `6d62215f4306e3ca278246188607209f09af3dc77ed4232efdd069798c4ec193`, pinned to RVC model repository commit `0d7ebae452fb102c695b08f4e6f546be00603425`.

Their source URLs, provenance fields, and expected sizes are in `src/sidecar/rvc_service/runtime-manifest.json`. Review the upstream model terms before redistribution; Yachiyo's setup action is for this personal local profile.

## FFmpeg / FFprobe

`ffmpeg-static` 5.3.0 declares GPL-3.0-or-later. The unpacked application carries `ffmpeg.exe.LICENSE`, `ffmpeg.exe.README`, and the package license beside the binary. `ffprobe-static` 3.1.0's JavaScript wrapper is MIT; the bundled FFprobe executable derives from the FFmpeg project and requires its own FFmpeg license/source-compliance review before public redistribution.

## JavaScript runtime and libraries

Electron, React, Vite, TypeScript, Zod, Lucide, yauzl, and their transitive packages retain their respective notices in the npm dependency metadata/package payload where applicable. See `package-lock.json` for exact versions.

## Other Python sidecar components

All Python dependencies retain their respective upstream licenses. PyInstaller is a build-time tool. `edge-tts` is an unofficial client for Microsoft's online speech service; service terms and availability are separate from its package license.

## Release profile

This build is for personal evaluation. Do not publish it until all third-party binary/source obligations, Live2D terms, model rights, privacy disclosures, and Authenticode signing are reviewed.
