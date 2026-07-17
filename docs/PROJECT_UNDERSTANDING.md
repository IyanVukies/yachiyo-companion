# Project Understanding

## Product contract

Yachiyo Companion is a Windows 11 desktop presence for an existing Hermes Agent. Hermes remains the only reasoning, memory, and tool-using agent. The desktop application adds an avatar, streamed chat, speech output, safe reminders, onboarding, settings, tray controls, and failure-tolerant local behavior.

The normal user must not need a terminal. The application must remain useful when Hermes, Live2D, Edge TTS, RVC, GPU support, or the network is unavailable. A bundled animated fallback avatar and the local mock Hermes service are therefore first-class product paths, not developer-only placeholders.

## Required boundaries

- Electron main owns windows, tray, global recovery shortcuts, persistence, secrets, network requests, asset access, sidecar lifecycle, and proactive scheduling.
- The React renderer owns presentation, interaction, animation, audio playback, and amplitude-driven mouth state.
- The preload exposes a narrow typed API. `contextIsolation` remains enabled and `nodeIntegration` remains disabled.
- Hermes is accessed through an OpenAI-compatible adapter. Mock mode is the default until the user configures the real connection locally.
- The Python sidecar binds to loopback only and requires a random per-session bearer token.
- RVC is optional and isolated. Its failure must automatically retain text and fall back to Basic TTS.
- LLM-provided avatar metadata is data only and is mapped through a local allowlist. It can never execute files, shell commands, or arbitrary model motions.

## User experience

The default surface is a small transparent desktop companion, not a dashboard. The avatar is the visual anchor; chat, reminders, Avatar Lab, and settings appear as compact sheets when requested. UI language is Indonesian and errors explain what failed, whether data is safe, what still works, and what to do next.

### Visual thesis

A calm midnight-ink companion with warm paper-like utility sheets orbiting a softly luminous teal avatar: intimate, precise, and alive without becoming noisy.

### Content plan

1. Primary workspace: avatar, state, connection, and one clear chat action.
2. Chat sheet: streamed conversation, voice state, stop/retry/copy/clear controls.
3. Context sheets: reminder actions and Avatar Lab inventory.
4. Settings/onboarding: connection, voice, desktop behavior, privacy, and diagnostics in a single restrained inspector.

### Interaction thesis

- The fallback avatar breathes, blinks, looks toward pointer movement, and changes its halo/mouth rhythm with state.
- Sheets unfurl from the avatar dock with one consistent spring-like transition and return without stealing focus unnecessarily.
- Speaking, thinking, reminders, and errors are communicated through motion and one state accent, with reduced-motion support.

## Delivery interpretation

The release is a personal unsigned Windows build. The installer is allowed to show the normal Windows reputation warning. User-supplied Mao and Kobo files remain external and are not committed or bundled into a public-safe installer. Development and local personal runs may detect the supplied asset folders directly.

The official Live2D open-source Framework can be integrated from Live2D's repository. The proprietary Cubism Core is not present in the supplied assets and its official download requires the user to accept Live2D's license. The application must therefore ship a complete fallback path and report this capability honestly until Core is supplied.
