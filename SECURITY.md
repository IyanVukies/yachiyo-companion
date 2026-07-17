# Security and Privacy

## Security posture

Yachiyo is a local personal desktop application with optional network services. The renderer is treated as untrusted presentation code; secrets, filesystem access, process creation, and network credentials remain outside it.

## Implemented controls

- Electron renderer sandbox enabled.
- Context isolation enabled; Node integration and insecure content disabled.
- Frozen, narrow preload API with validated IPC payloads.
- CSP denies objects, frames, forms, inline scripts, and unneeded origins.
- New windows and cross-document navigation are denied.
- Camera/geolocation denied; microphone is off by default and permission-bound to the trusted window.
- Hermes redirects are rejected; remote HTTP produces a visible warning and HTTPS is recommended.
- API key stored separately with Electron `safeStorage` when Windows protection is available; it never returns to the renderer.
- Logs redact key/token/secret/password patterns.
- Diagnostics redact remote hostnames, absolute asset paths, secrets, conversations, and audio.
- Custom asset protocol is read-only, extension-allowlisted, root-confined, and traversal-tested.
- ZIP extraction rejects traversal, excessive entry counts, and expanded payloads over 2 GiB.
- PyTorch checkpoint and runtime weights load with `weights_only=True`; strict version, tensor-count, shape, size, and architecture checks run before inference.
- Voice sidecar binds only to loopback, uses a per-run random token/port, validates host/token/body, and invokes fixed FFmpeg paths without a shell.
- RVC and FAISS run only in isolated Python processes. FAISS input/output paths are confined to a one-use temporary root, and native worker threads are bounded to prevent resource exhaustion.
- Runtime setup downloads only the two data assets in the signed source manifest, from an HTTPS host allowlist, with redirect validation, exact byte counts, SHA-256 verification, temporary `.part` files, and atomic activation.
- Hermes structured avatar metadata is allowlisted; it cannot execute commands.
- Click-through has a global recovery shortcut: **Ctrl+Shift+F12**.

## Data leaving the computer

- Mock mode: chat remains on the local random-port mock server.
- Hermes mode: chat content is sent to the configured Hermes URL.
- Basic Edge TTS: text is sent to Microsoft's online speech service by the `edge-tts` provider. Choose **Suara → Mati** if this is not acceptable.
- RVC conversion after Edge synthesis is local; Kobo audio, HuBERT features, RMVPE pitch, and final WAV files are not uploaded by Yachiyo.
- Browser/Windows speech behavior depends on installed voices and Windows configuration.
- No analytics, telemetry, screen capture, global activity logging, camera access, or automatic update service is included.

## Secrets

Enter the Hermes key only in **Atur → Hermes**. Never place it in `.env`, source code, chat, issue reports, screenshots, or asset folders. If secure storage is unavailable, the app refuses to persist plaintext key material.

## Asset and model trust

Only use assets from a source you trust. Mao and Kobo remain external. Yachiyo validates structure and paths, but model provenance and legal authorization are still the user's responsibility. Kobo has no supplied license/provenance document and must not be distributed or used for deceptive impersonation.

## Release risks

- Version 0.2.0 is not Authenticode-signed, so SmartScreen may warn.
- Cubism Core and Mao remain external licensed assets and are not redistributed by the installer.
- Kobo has no supplied license/provenance document. Actual local inference is verified for this personal profile, but that does not grant redistribution or impersonation rights.
- The audited installer baseline contains CPU PyTorch. CUDA requires a separately compatible trusted runtime and is not claimed for this release machine.
- The installer is a personal profile, not a public redistribution approval.
- Bundled FFmpeg is GPL-3.0-or-later; its license/readme are included. Public redistribution requires a complete license/source-compliance review.

## Reporting safely

Use **Atur → Privasi → Ekspor diagnostik aman**. Review the JSON before sharing. Do not attach settings files, `hermes-key.bin`, raw logs, voice checkpoints, or private endpoint details.
