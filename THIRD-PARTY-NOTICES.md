# Third-Party Notices

Yachiyo Companion 0.1.1 is an unlicensed/private project wrapper around several third-party components. This summary is not legal advice and does not replace the license files shipped with dependencies.

## Live2D Cubism Web Framework

Pinned from Live2D's official `CubismWebFramework` tag `5-r.5`. Use is governed by the Live2D Open Software License and related release-license terms. The Framework license is copied into the renderer payload as `live2d/CUBISM-FRAMEWORK-LICENSE.md`.

Cubism Core is proprietary, is not in this release, and must be obtained separately after accepting Live2D's applicable terms.

## Niziiro Mao

Mao is an external user-supplied sample model, credited to Live2D Inc. The supplied readme references Live2D's Free Material License Agreement and Terms of Use. Raw Mao files are excluded from the installer.

## Kobo voice model

Kobo is an external unofficial personal voice experiment. No license/provenance file was supplied. The checkpoint and index are excluded from the installer and must not be redistributed or represented as official.

## FFmpeg / FFprobe

`ffmpeg-static` 5.3.0 declares GPL-3.0-or-later. The unpacked application carries `ffmpeg.exe.LICENSE`, `ffmpeg.exe.README`, and the package license beside the binary. `ffprobe-static` 3.1.0's JavaScript wrapper is MIT; the bundled FFprobe executable derives from the FFmpeg project and requires its own FFmpeg license/source-compliance review before public redistribution.

## JavaScript runtime and libraries

Electron, React, Vite, TypeScript, Zod, Lucide, yauzl, and their transitive packages retain their respective notices in the npm dependency metadata/package payload where applicable. See `package-lock.json` for exact versions.

## Python sidecar

FastAPI, Uvicorn, Pydantic, edge-tts, PyInstaller, and their bundled dependencies retain their respective licenses. `edge-tts` is an unofficial client for Microsoft's online speech service; service terms and availability are separate from its package license.

## Release profile

This build is for personal evaluation. Do not publish it until all third-party binary/source obligations, Live2D terms, model rights, privacy disclosures, and Authenticode signing are reviewed.
