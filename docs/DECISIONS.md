# Implementation Decisions

## I-001 — Mock-first connection mode

The application starts in local mock mode. Real Hermes is enabled only after the user enters connection details in Settings and passes a local connection test.

## I-002 — Secrets never return to the renderer

Hermes requests run in Electron main. The API key is encrypted through Electron `safeStorage` where available and persisted only as encrypted bytes. Settings reads expose `hasApiKey`, never the key itself.

## I-003 — External asset distribution

Development detects the supplied extracted assets. Installer payloads exclude Kobo and editor files. External paths plus SHA-256 hashes are stored for personal use. Mao redistribution remains subject to its supplied readme and Live2D terms.

## I-004 — Live2D Core license boundary

The open Cubism Framework may be pinned from Live2D's official repository. Cubism Core is not present and Live2D's official download requires explicit license acceptance. The build will not impersonate that acceptance or substitute an unofficial Core. A runtime adapter, validator, Avatar Lab, and fallback avatar are implemented so the rest of the product remains complete.

## I-005 — Two-level voice fallback

Edge TTS through the authenticated loopback sidecar is preferred. Chromium/Windows speech synthesis is the Basic TTS fallback. RVC is attempted only when its model, index, inference runtime, pitch/content models, and FFmpeg capability all pass health checks.

## I-006 — Conservative RVC defaults

Pitch 0, index rate 0.5, consonant protection 0.33, RMVPE, 48 kHz mono, and CPU are the initial values. They are visible and resettable in Settings.

## I-007 — No activity surveillance

Inactivity check-ins are disabled by default. The application does not install global keyboard hooks, record the screen, infer emotion, or fabricate calendar/email events.

## I-008 — Dependency compatibility

Registry versions are inspected before pinning. Electron/React/Vite use current stable releases compatible with Node 22; TypeScript remains on 5.9.3 rather than the new 7.x line because ecosystem support is broader. Lockfiles are mandatory.

## I-009 — Pinned Cubism adapter boundary

The official Framework is pinned at tag `5-r.5` and bundled from source by esbuild. It stays outside the normal TypeScript project because official proprietary Core declarations were not supplied; syntax/import correctness is build-gated, while the renderer-facing controller is strictly typed.

## I-010 — Sandboxed preload uses CommonJS

Electron sandboxed preload execution requires the limited CommonJS environment. The first GUI test found that an ESM `.mjs` preload did not expose the bridge, so the preload build is explicitly CJS (`index.cjs`). E2E asserts the frozen bridge and absence of `process`/`require` in the page.

## I-011 — PyInstaller onedir sidecar

The one-file sidecar build stalled on this environment. The reproducible `onedir` profile starts quickly, smoke-tests reliably, and is copied as one resource directory by electron-builder.

## I-012 — Personal external-asset release

The installer includes the application, voice sidecar, Framework adapter/shaders/license, FFmpeg tools, placeholder instructions, and third-party notices. Mao, Kobo, editor files, Core, endpoint, and key stay external. The packaged smoke tests both clean missing state and the actual external folders.

## I-013 — Branded generated icon

The release icon is generated deterministically from `build/icon.svg` into multi-size ICO/PNG outputs. This removes the generic Electron icon without adding a third-party artwork claim.
