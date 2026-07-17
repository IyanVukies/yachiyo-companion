# Yachiyo Companion 0.2.3 verification

Date: 2026-07-18

## Scope

This hotfix repairs the missing Mao Live2D avatar in Companion Mode without changing the Hermes, Live2D adapter, TTS, RVC, Avatar Director, reminder, persistence, launcher, or sidecar architecture.

## Root cause

The avatar positioning layer used `width: max-content` and `height: max-content`, while its Live2D child used percentage width and height. That circular intrinsic-size dependency collapsed the wrapper and Live2D element to zero width. The adapter then clamped the backing canvas to one pixel, so initialization still reported `Mao runtime aktif` even though the avatar could not render visibly.

## Fix

- The transform layer now receives an explicit `live2d` or `fallback` presentation variant.
- Only the Live2D layer receives a stage-relative `min(94%, 430px)` by `min(92%, 590px)` size.
- The Live2D element and canvas fill that layer, with the obsolete top margin removed so drag, bubble, and viewport-safety bounds match the actual canvas.
- Fallback avatar intrinsic sizing remains unchanged.

## Automated verification

| Check                              | Result                    |
| ---------------------------------- | ------------------------- |
| Focused renderer regressions       | Pass: 7/7                 |
| Full Vitest suite                  | Pass: 25 files, 142 tests |
| Typecheck and application build    | Pass                      |
| ESLint                             | Pass, zero warnings       |
| Prettier check                     | Pass                      |
| Packaged Electron smoke            | Pass: 1/1                 |
| Packaged real-profile Live2D check | Pass                      |

The installed-build E2E test now requires the Live2D element and canvas to exceed 100 CSS pixels and the canvas backing store to exceed one pixel; the ready label alone is no longer sufficient.

## Real-profile measurements

Measured against the packaged 0.2.3 executable with the existing Mao profile at a 464 x 720 viewport:

- Avatar stage: 464 x 474 CSS pixels
- Live2D transform layer: 430 x 436.075 CSS pixels
- Live2D element: 430 x 436.075 CSS pixels
- Canvas client size: 430 x 436 CSS pixels
- Canvas backing store: 538 x 545 pixels
- Runtime label: `Mao runtime aktif`

Screenshot: `output/playwright/avatar-fix-verification.png`

## Windows installer

- File: `release/Yachiyo-Companion-0.2.3-x64-Setup.exe`
- Size: 385,465,743 bytes
- SHA-256: `8530500DF335C5110F59919C71D7BD1EBD42B5BEC73CCF4A6B327B92462570B4`
- Authenticode: `NotSigned` (personal build)

The complete installer, blockmap, app, ASAR, and sidecar hashes are recorded in `release/checksums.txt`.

## Manual verification checklist

- [x] Existing avatar scale and centered X/Y settings load unchanged.
- [x] Mao is visible in Companion Mode after startup.
- [x] `Mao runtime aktif` is accompanied by a nonzero visible canvas.
- [x] Composer and navigation remain below the avatar stage.
- [x] Clean packaged profile still uses the fallback avatar safely.
- [x] Packaged sidecar reports ready.
- [x] Minimize shows the floating launcher and launcher click restores/focuses the main window.
- [x] No second Live2D, Hermes, TTS/RVC, or sidecar instance was introduced.
