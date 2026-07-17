# Decision Log

## D-001 — Desktop framework

**Decision:** Electron + React + Vite + TypeScript.

**Reason:** Highest probability of one-shot success for a nontechnical Windows user, broad ecosystem, simpler than adding Rust/Tauri toolchain.

## D-002 — Hermes remains the brain

**Decision:** Desktop app does not implement a separate autonomous agent.

**Reason:** Preserve memory, tools, and behavioral consistency with the existing Telegram assistant.

## D-003 — Official Cubism SDK

**Decision:** Use official Live2D Cubism SDK for Web compatible with Cubism 5.

**Reason:** Mao is Cubism 5 and may use features not guaranteed by older wrappers.

## D-004 — Fallback avatar is mandatory

**Decision:** Bundle a simple animated fallback avatar.

**Reason:** Project must remain testable when Mao is absent, malformed, or incompatible.

## D-005 — Voice is TTS plus RVC

**Decision:** Edge TTS creates source speech; Kobo RVC changes timbre.

**Reason:** Kobo package is not a TTS model.

## D-006 — Python sidecar

**Decision:** RVC runs in a separate localhost Python process.

**Reason:** Isolates PyTorch, avoids blocking Electron, enables restart and fallback.

## D-007 — Basic TTS fallback

**Decision:** Voice system has RVC, Basic TTS, and Disabled modes.

**Reason:** RVC is the most failure-prone and heavy component.

## D-008 — Push-to-talk first

**Decision:** No always-listening in v1.

**Reason:** Lower complexity, lower privacy risk, easier testing.

## D-009 — Proactive interactions are policy-controlled

**Decision:** Local policy engine decides whether a proactive message is delivered.

**Reason:** Prevent spam and avoid letting an LLM send messages without deterministic limits.

## D-010 — Assets external by default

**Decision:** Mao and Kobo can be placed in `project-assets/` and excluded from Git.

**Reason:** Licensing, size, and user-controlled placement.

## D-011 — Kobo is personal-experiment-only

**Decision:** Do not bundle Kobo in public distribution.

**Reason:** License and source authorization are not verified.

## D-012 — One-shot execution uses phased gates

**Decision:** Sol must build incrementally.

**Reason:** “One-shot” refers to one autonomous agent session, not one untested bulk code generation step.

## D-013 — Native asset paths use one-time main-process tokens

**Decision:** The renderer may request an asset kind and picker mode, but cannot submit a path. Electron main returns a native-selected path for display and a short-lived, single-use token for validation and persistence.

**Reason:** Immediate UX feedback is required without weakening the sandbox or allowing compromised renderer code to probe arbitrary local paths.

## D-014 — Explicit asset choices are authoritative

**Decision:** Once a user selects Mao, Core, or Kobo, that configured source is validated directly and never silently replaced by a development/source fallback.

**Reason:** A visible invalid selection must remain diagnosable and must not appear successful because another tree happened to exist.

## D-015 — Folder forms normalize; ZIP remains explicit

**Decision:** Mao accepts either the parent containing `runtime\mao_pro.model3.json` or the direct `runtime` folder and normalizes both to the runtime root. ZIP uses a separate native file action for Mao and Kobo.

**Reason:** These are the real supplied layouts, and a separate ZIP action makes supported behavior discoverable without ambiguous dialog modes.

## D-016 — Mao readiness requires both model and Core

**Decision:** A structurally valid Mao source without Core reports `core-missing`; `ready` is reserved for a valid Mao source plus a compatible selected official Core file.

**Reason:** Structural model success must not imply that Live2D rendering can start.

## D-017 — RVC implementation is pinned and sidecar-only

**Decision:** Vendor the compatible inference subset from official RVC release `2.2.231006` at commit `9f2f0559e6932c10c48642d404e7d2e771d9db43`; run PyTorch, HuBERT, RMVPE, FAISS, and Kobo synthesis only in Python.

**Reason:** Electron and the sandboxed renderer must remain isolated from native inference crashes, heavy imports, checkpoint parsing, and model paths.

## D-018 — Runtime setup downloads data, not executable code

**Decision:** Freeze the exact Python/native runtime into the installer. The settings setup action may fetch only the manifest-pinned HuBERT and RMVPE data files from allowlisted HTTPS origins after exact size and SHA-256 verification.

**Reason:** Visible setup progress is required, but downloading mutable code or unverified weights would break the audited release boundary.

## D-019 — CPU is the distributable baseline

**Decision:** Ship PyTorch/TorchAudio `2.7.1+cpu`, expose `auto`, `cpu`, and `cuda`, and detect CUDA at runtime without claiming a CUDA build on this machine.

**Reason:** CPU works on the verified Intel host and avoids adding a multi-gigabyte untested CUDA payload. Explicit CUDA selection fails closed when unavailable.

## D-020 — FAISS uses an isolated bounded helper

**Decision:** Package FAISS in a separate frozen process, confine all query/output files to a one-use temporary root, sanitize the Windows frozen-process DLL boundary, and cap FAISS/OpenBLAS/OpenMP to one thread.

**Reason:** Loading FAISS beside Torch caused native-runtime contention. Isolation prevents Electron crashes; the thread bound prevents multi-gigabyte oversubscription while preserving normal Torch CPU parallelism.

## D-021 — Playback proof is correlated in Electron main

**Decision:** Electron issues a random request ID with synthesized audio and accepts playback duration/lip-sync metrics only once for that pending ID after WebAudio reaches `ended`.

**Reason:** Renderer-visible metrics should prove that returned bytes were actually played and drove Mao `ParamA`, without trusting arbitrary renderer claims.
