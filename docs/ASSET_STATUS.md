# Asset Status

Inspected on 2026-07-17 from `assets/source/`. No ZIP files are present; both inputs are already extracted.

## Niziiro Mao

Actual root: `assets/source/mao_en/`

- Runtime entry: `runtime/mao_pro.model3.json`
- Model JSON version: 3
- MOC: `runtime/mao_pro.moc3` (870,272 bytes; `MOC3` header)
- Texture: one 4096×4096 32-bit PNG
- Expressions: 8 (`exp_01` through `exp_08`), all readable
- Motions: 7, all readable; one `Idle` entry and six entries in an empty-named group
- Motion durations: 3.47–9.37 seconds; files declare looping
- Physics: present and readable
- Pose: present and readable
- Display information: present and readable
- Eye blink group: `ParamEyeLOpen`, `ParamEyeROpen`
- Lip-sync group: `ParamA`
- Hit areas: head and body
- Every path referenced by the actual model JSON exists and resolves beneath the runtime root.
- Editor-only files `mao_pro_t06.cmo3` and `mao_pro_t06.can3` are present at source root and must not be packaged.
- `ReadMe.txt` identifies the model as “Niziiro Mao (PRO Version),” credits Live2D Inc. for illustration/modeling, and requires agreement to Live2D's Free Material License Agreement and Terms of Use.
- Cubism Core for Web is not included.

Key SHA-256 values:

- `mao_pro.model3.json`: `27B71A0E5476D870BA69D1B52F5BD068ED5A03113739B4F5337E579E954B7E2A`
- `mao_pro.moc3`: `247D028F9900BE2A46E4530816ECE5749524D35013BA77424BD943598E0E54FF`
- `texture_00.png`: `0A5F5436F26DCC908CF7C5EC1F8B54FF36B895CACAF9804DABA31B92D424C594`

## Kobo RVC

Actual root: `assets/source/kobo/kobo/` (one extra nested `kobo` directory)

- Checkpoint: `kobov2.pth`, 57,575,716 bytes
- Index: `added_IVF454_Flat_nprobe_1_kobov2_v2.index`, 55,948,339 bytes
- The checkpoint is a PyTorch ZIP archive. It was inspected structurally without executing or unsafely unpickling it.
- Serialized metadata reports `version: v2`, `sr: 48k`, `f0: 1`, and `info: 500epoch`.
- The FAISS index has binary header text `IwFl` / `IxF2`; full readability still requires a compatible FAISS runtime.
- No Kobo license, attribution, or source authorization file is present. It remains an unofficial personal local experiment and is excluded from distributable payloads.
- Required inference companions are absent: HuBERT/ContentVec, RMVPE weights, and a packaged RVC inference runtime.

Key SHA-256 values:

- `kobov2.pth`: `EBF2826393F278168BBE6C9E6DA614D75A6EEDA408C33219DEDF94688ED4F49C`
- `.index`: `81AD383BD13B46B7A0C3B526F77258250EDFC9D774DE37B3A6918B9D2B8B5859`

## Application policy

The detector accepts ZIPs and extracted folders, validates traversal and referenced paths, records hashes, and reports actual differences. Development discovery includes the supplied `assets/source` locations. Release builds use external asset selection and never include Kobo automatically.
