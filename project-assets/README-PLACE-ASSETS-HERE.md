# External assets

Yachiyo Companion accepts either ZIP files or extracted folders:

```text
project-assets/live2d/mao_en.zip
project-assets/live2d/mao/runtime/mao_pro.model3.json
project-assets/voice/kobo.zip
project-assets/voice/kobo/kobov2.pth
project-assets/voice/kobo/added_IVF454_Flat_nprobe_1_kobov2_v2.index
```

You can also choose an existing extracted folder in Settings. Do not place secrets here. Kobo remains a personal local experiment and is never added to a public installer automatically.

The supplied workspace inputs are already extracted at `assets/source/mao_en` and `assets/source/kobo`; the application can select those folders directly. Cubism Core is not included.
