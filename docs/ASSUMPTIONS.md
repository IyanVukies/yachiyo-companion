# Assumptions and External Dependencies

## Safe working assumptions

- This is a personal local build for one Windows user, not a public marketplace release.
- The real Hermes endpoint follows the OpenAI-compatible `/v1/chat/completions` contract unless the local connection test proves otherwise.
- Mock Hermes remains selected until the user changes connection mode in Settings.
- The user will enter Hermes URL, model, and API key only in the local application; no real secret is needed for implementation or testing.
- Windows code signing and a public auto-update service are outside v1.
- A browser-provided or Windows speech voice is an acceptable last-resort Basic TTS fallback when Edge TTS is offline.
- Fullscreen suppression is enabled only where a reliable OS capability is available; no broad keyboard monitoring or screen capture will be added.

## Verified constraints, not assumptions

- The supplied asset paths are extracted directories despite being described as ZIP paths.
- FFmpeg and FFprobe are not installed system-wide.
- NVIDIA CUDA tooling is not visible; the detected display adapter is Intel Iris Xe.
- Python 3.13.3 and Python 3.11.9 are available. RVC packages commonly target Python 3.10/3.11, so 3.11 is the candidate runtime.
- The supplied Kobo package lacks HuBERT/ContentVec, RMVPE, FFmpeg, and any license/readme.
- The supplied Mao package lacks Cubism Core for Web.

## External dependencies that cannot be invented

- Real Hermes URL, model name, API key, and any Hermes-specific deviations from the OpenAI protocol.
- User acceptance of Live2D's proprietary/open SDK license and a legitimately downloaded Cubism Core for Web runtime.
- A verified redistribution/usage license for the Kobo checkpoint and its source voice.
- Optional network availability for Edge TTS and large RVC runtime/model dependency downloads.
- A code-signing certificate, if a trusted signed installer is desired later.

## Fallback policy

- Missing Hermes credentials → local mock Hermes.
- Invalid/offline Hermes → preserve conversation input, show a simple status, allow retry or switch to mock.
- Missing Cubism Core or invalid Mao runtime → animated fallback avatar plus factual Avatar Lab inventory.
- Missing RVC dependencies or failed conversion → Basic TTS.
- Edge TTS unavailable → Windows/browser speech synthesis where available, otherwise text-only without crashing.
- Missing microphone/STT endpoint → text input remains fully usable and microphone control explains the limitation.
