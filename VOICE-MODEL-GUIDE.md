# Voice Model Guide

## Verified pipeline

```text
reply text
  → authenticated loopback FastAPI sidecar
  → Edge TTS MP3
  → fixed-path FFmpeg conversion
  → mono 48 kHz WAV
  → TorchAudio HuBERT feature extraction
  → RMVPE pitch extraction
  → Kobo RVC v2 checkpoint + FAISS index
  → final mono 48 kHz WAV
  → renderer WebAudio playback + RMS lip-sync
```

The sidecar is a pinned Python 3.11/PyInstaller bundle. It rejects unauthenticated requests, exposes no shell or arbitrary path primitive, and reports the exact runtime versions and selected CPU/CUDA device.

## Modes

- **Basic**: use Edge TTS and normalized audio. If the sidecar is unavailable, use browser/Windows speech where possible.
- **RVC**: use the complete Kobo pipeline only when the checkpoint, index, inference package, RMVPE, HuBERT, FFmpeg, and selected device all pass health checks. Any failure is contained and automatically uses Basic.
- **Mati**: do not synthesize speech.

## Supplied Kobo files

Detected beneath the nested `kobo` directory inside `assets\source\kobo.zip`:

- `kobov2.pth` — 57,575,716 bytes;
- `added_IVF454_Flat_nprobe_1_kobov2_v2.index` — 55,948,339 bytes;
- metadata inspected without unpickling: RVC v2, 48k, f0 enabled, 500 epochs.

The checkpoint/index are not bundled in the installer.

Select the extracted Kobo root in **Atur → Aset → Kobo RVC**, or use the separate **Pilih ZIP** action. The chosen path is displayed immediately, scanned automatically, and persisted after validation. The visible inventory reports the normalized model root, checkpoint, index, version, sample rate, f0 flag, training metadata, and missing runtime components. Use **Ganti folder** or **Scan ulang** when needed.

## Prepare the pinned runtime

Open **Atur → Suara**. If the status says **perlu setup**, choose **Siapkan RVC**. The UI shows the current asset, downloaded bytes, percentage, hash verification, success, or a plain-language error.

Only two data files are downloaded, both from fixed trusted HTTPS origins:

- TorchAudio HuBERT Base: 377,565,405 bytes, SHA-256 `2809382725ea3b9b3d62c8e94168d7587923603cca5e05e50ed3fb65502c5b75`;
- official RVC RMVPE: 181,184,272 bytes, SHA-256 `6d62215f4306e3ca278246188607209f09af3dc77ed4232efdd069798c4ec193`.

Downloads use an allowlist, reject unsafe redirects, enforce exact size/hash, stay beneath the versioned app-data runtime root, and activate atomically. No executable Python code is downloaded by the setup screen; the pinned inference implementation and native dependencies are already frozen into the installer.

## Test and tune Kobo

1. Select the extracted Kobo folder or ZIP in **Atur → Aset**.
2. Prepare the runtime in **Atur → Suara** if needed.
3. Compare **Tes Basic** and **Tes RVC Kobo**.
4. Adjust pitch (-24 to +24 semitones), index rate (0–1), protection (0–0.5), and device (`auto`, `cpu`, or `cuda`).
5. Leave RMVPE selected; other pitch method labels are rejected by this build.

Defaults are pitch 0, index rate 0.5, protection 0.33, RMVPE, and automatic device selection. This release machine has no NVIDIA CUDA runtime, so `auto` resolves to CPU. A CUDA-capable PyTorch build is detected automatically when present; the distributed runtime is the audited CPU baseline.

Long replies are split at sentence boundaries and converted sequentially. The panel reports cold-start, conversion, source/output duration, CPU, peak RAM, output size, playback duration, and peak lip-sync after WebAudio reaches `ended`.

## Privacy

Edge TTS sends synthesis text to Microsoft's online speech service. Temporary audio is stored under app data and removed. Select **Mati** if text must not leave the machine. No microphone audio is collected unless the user explicitly enables microphone permission; STT is not connected in this build.

## Safety and licensing

The Kobo model is an unofficial personal local experiment. Do not claim affiliation, use it for deception, or distribute it without documented permission. Keep checkpoints out of diagnostics, source control, and public installers.
