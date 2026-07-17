# Live2D Model Guide

## Verified supplied model

Yachiyo inspected the actual contents of `assets\source\mao_en.zip`:

- entry: `runtime\mao_pro.model3.json` (model JSON version 3);
- MOC3 version byte 5, 870,272 bytes;
- one 4096×4096 PNG texture;
- 8 expressions;
- 7 looping motions, including one `Idle` motion;
- physics, pose, and display information;
- eye blink: `ParamEyeLOpen`, `ParamEyeROpen`;
- lip-sync: `ParamA`.

Every runtime reference resolves beneath the model root. Editor files `.cmo3` and `.can3` are intentionally excluded.

## Core requirement

Cubism Framework is open source under Live2D's Open Software License, but Cubism Core is a separate proprietary component. The workspace did not contain Core, and obtaining it requires the user to accept Live2D's terms. Yachiyo therefore does not download or fabricate it.

After accepting the applicable official terms:

1. Obtain the Cubism SDK for Web that matches the current Cubism 5 generation.
2. Locate `Core\live2dcubismcore.min.js`.
3. In Yachiyo, open **Atur → Aset → Cubism Core resmi** and choose that file.
4. Yachiyo displays the path, saves it, and rescans automatically. Use **Scan ulang** to repeat validation.

## Framework integration

- Official repository: Live2D `CubismWebFramework`
- Pinned tag: `5-r.5`
- Inspected commit: `198a3769…`
- Generated adapter: `src/renderer/public/live2d/yachiyo-live2d-adapter.js`
- Official shaders/license are copied into the generated renderer assets.

The adapter loads model settings, MOC, expressions, physics, pose, user data, eye blink, breathing, pointer look, layout, motions, textures, and shaders in the official order. Final audio RMS is applied to all declared lip-sync IDs after scheduled updates.

## Runtime controls

Avatar Lab lists expression names and motion group/index values from the actual model. It does not guess that `exp_01` means a particular emotion. Use each control to inspect it after Core is active.

## Supported input contract

Yachiyo accepts the extracted parent folder containing `runtime\mao_pro.model3.json`, the `runtime` folder containing `mao_pro.model3.json` directly, or a ZIP through the separate **Pilih ZIP** action. Both folder forms normalize to the actual runtime model root. Referenced runtime files must remain below that directory. The read-only renderer protocol permits only `.json`, `.moc3`, and `.png` GET requests.

## Status meanings

- **missing**: no Mao folder/ZIP selected;
- **invalid**: entry/reference/texture validation failed;
- **core-missing**: Mao is valid, but Core is absent;
- **ready**: validated Mao and a selected official Core file that passes compatibility validation are both available.

`ready` means the adapter may attempt rendering; graphics-driver or SDK compatibility errors still trigger the animated fallback.

## Licensing

The supplied readme identifies Niziiro Mao (PRO Version), credits Live2D Inc., and requires agreement to Live2D's Free Material License Agreement and Terms of Use. Do not sell raw assets or assume public redistribution rights. Consult Live2D's current terms before distribution or commercial use.

## Current verification limit

Mao's structure, inventory, hashes, model contract, external packaged detection, and asset protocol were tested. Actual Core execution, model drawing, expressions, motions, physics movement, eye blink, and `ParamA` on Mao could not be honestly tested because Core was not supplied.
