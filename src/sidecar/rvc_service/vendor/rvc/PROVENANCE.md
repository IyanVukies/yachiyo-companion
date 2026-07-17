# RVC inference source provenance

- Upstream: `RVC-Project/Retrieval-based-Voice-Conversion-WebUI`
- Tag: `2.2.231006`
- Commit: `9f2f0559e6932c10c48642d404e7d2e771d9db43`
- License: MIT (see `LICENSE`)
- Included: the v2 synthesizer architecture and RMVPE network required for inference.
- Excluded: WebUI, training, upload, shell-launch, JIT export, DirectML, and model-download code.
- Packaging patch: the eager `fused_add_tanh_sigmoid_multiply` implementation is retained
  without its import-time TorchScript decorator. PyInstaller does not expose source through
  `inspect`, and inference does not require scripting this helper.
- Packaging patch: RMVPE's two Librosa helpers are implemented locally with NumPy using the
  same HTK mel scale and Slaney area normalization. This removes Librosa/Numba import-time
  source-cache requirements from the frozen process.

Yachiyo's adapter uses safe tensor-only checkpoint loading, fixed local paths, bounded
audio, and a separately hash-pinned runtime asset manifest.
