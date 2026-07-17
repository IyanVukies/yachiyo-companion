# Voice Model Guide

## Verified pipeline

```text
reply text
  → authenticated loopback FastAPI sidecar
  → Edge TTS MP3
  → fixed-path FFmpeg conversion
  → mono 48 kHz WAV
  → optional RVC (only when every dependency is healthy)
  → renderer WebAudio playback + RMS lip-sync
```

The packaged sidecar smoke produced authenticated Basic TTS audio, rejected an unauthenticated request with 401, and reported Python 3.13.3, Edge TTS, FFmpeg, and FFprobe ready.

## Modes

- **Basic**: use Edge TTS and normalized audio. If the sidecar is unavailable, use browser/Windows speech where possible.
- **RVC**: attempt RVC only when the checkpoint, index, inference package, pitch model, content model, and FFmpeg all pass health checks. Otherwise report and use Basic.
- **Mati**: do not synthesize speech.

## Supplied Kobo files

Detected beneath `assets\source\kobo\kobo`:

- `kobov2.pth` — 57,575,716 bytes;
- `added_IVF454_Flat_nprobe_1_kobov2_v2.index` — 55,948,339 bytes;
- metadata inspected without unpickling: RVC v2, 48k, f0 enabled, 500 epochs.

The checkpoint/index are not bundled in the installer.

## Why RVC is unavailable now

The supplied folder has no:

- compatible packaged RVC inference library;
- HuBERT/ContentVec model;
- RMVPE weights;
- license or provenance document.

Yachiyo therefore does not execute the checkpoint and reports `runtime-missing`. This is a safe, intentional fallback—not a hidden error.

## Enabling RVC later

1. Establish clear legal permission for the voice model and intended use.
2. Use a trusted RVC v2 runtime compatible with 48 kHz and the model architecture.
3. Add trusted HuBERT/ContentVec and RMVPE weights.
4. Pin and audit the runtime and its native dependencies.
5. Extend the sidecar package and health checks; do not bypass them.
6. Run comparison, pitch, latency, silence, malformed-audio, and CPU tests before enabling it.

Current visible defaults are pitch 0, index rate 0.5, protection 0.33, RMVPE, and automatic device selection. This Intel-only machine defaults to CPU.

## Privacy

Edge TTS sends synthesis text to Microsoft's online speech service. Temporary audio is stored under app data and removed. Select **Mati** if text must not leave the machine. No microphone audio is collected unless the user explicitly enables microphone permission; STT is not connected in this build.

## Safety and licensing

The Kobo model is an unofficial personal local experiment. Do not claim affiliation, use it for deception, or distribute it without documented permission. Keep checkpoints out of diagnostics, source control, and public installers.
