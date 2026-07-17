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
