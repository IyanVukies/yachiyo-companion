# Yachiyo Companion 0.2.2 verification

Date: 2026-07-18  
Platform: Windows x64  
Scope: companion UX, shared chat presentation, avatar transform, and desktop lifecycle

## Automated verification

| Check                                | Result                                                   |
| ------------------------------------ | -------------------------------------------------------- |
| TypeScript (main/preload + renderer) | Pass                                                     |
| ESLint                               | Pass, zero warnings                                      |
| Prettier check                       | Pass                                                     |
| Vitest unit/renderer/integration     | Pass: 24 files, 140 tests                                |
| Electron build                       | Pass; standalone `index.cjs` and `launcher.cjs` preloads |
| Electron presentation/launcher E2E   | Pass: 1/1 (9.3 s)                                        |
| Packaged `win-unpacked` smoke E2E    | Pass: 1/1 (10.7 s)                                       |
| Voice sidecar regression             | Pass: 13 passed, 1 skipped                               |
| NSIS Windows installer               | Pass: version 0.2.2, x64                                 |

## Manual verification checklist

Use a normal Windows desktop and repeat the display checks once with a second monitor connected.

- [ ] Open **Atur → Avatar**; change Scale, Horizontal position, and Vertical position and confirm the stage preview updates immediately.
- [ ] Unlock the avatar, choose **Atur langsung pada stage**, drag it, and confirm click-to-chat does not fire while editing.
- [ ] Press Escape once to cancel an edit, then repeat and choose **Selesai** to persist it.
- [ ] Resize and restart the app; confirm scale/X/Y persist and at least 64 px of the avatar remains reachable.
- [ ] Exercise **Reset posisi**, **Pusatkan avatar**, and **Reset semua transform**.
- [ ] Send from the compact Companion composer with Enter; use Shift+Enter for a newline.
- [ ] Confirm visible streaming text appears in the response bubble and the bubble does not block unrelated stage clicks.
- [ ] With voice disabled, confirm the bubble appears with no audio. With Basic/RVC enabled, confirm bubble, expression, TTS, and lip-sync remain coordinated.
- [ ] Open Full Chat and confirm history, draft, streaming response, retry, copy, and clear use the same conversation as Companion Mode.
- [ ] Switch Companion ↔ Full Chat during a stream and during playback; confirm neither the Hermes request nor audio is cancelled.
- [ ] Minimize with **Floating launcher** selected; confirm the main window hides and only the small launcher remains above normal windows.
- [ ] Drag and release the launcher; confirm it snaps to the selected edge and restores at the same validated position after restart.
- [ ] Disconnect a secondary monitor; confirm the launcher returns to the right-center safe fallback on an available display.
- [ ] Single-click the launcher and confirm Yachiyo restores, focuses, and keeps the last presentation mode and draft.
- [ ] Right-click the launcher and exercise Open, Chat, Mute/Unmute, main Always on Top, and Quit.
- [ ] Exercise tray Open, Chat, Mute/Unmute, and Quit; double-click the tray icon to restore.
- [ ] Press Ctrl+Shift+Y while hidden and visible; confirm it restores/focuses without starting a second instance.
- [ ] Select normal minimize and tray minimize in turn and confirm each follows its configured behavior.
- [ ] Exercise close behaviors Hide, Ask, and Quit. Confirm only explicit Quit stops the sidecar and all windows.
- [ ] Enable reduced motion and confirm launcher/bubble animation becomes effectively static.
- [ ] Enable do-not-disturb and confirm proactive notifications are held while a fullscreen app/presentation is detected.
- [ ] Send a response whose `<yachiyo_control>` closing tag is split across SSE chunks; confirm no tag or control JSON appears in bubble, Full Chat, copy, TTS/RVC input, retry history, logs, or persistence.

## Release artifacts

- Installer: `release/Yachiyo-Companion-0.2.2-x64-Setup.exe` (385,470,054 bytes)
- Installer SHA-256: `EB4B84EFA2C17E5E18EE8093D9269AAFB1AE7A378FD4CCBA2EDEB3A46AF0E6DF`
- Authenticode: `NotSigned` (personal build; verify SHA-256 before use)
- Complete artifact hashes: `release/checksums.txt`
- Companion screenshot: `output/playwright/companion-mode.png`
- Full Chat screenshot: `output/playwright/full-chat-mode.png`
- Floating launcher screenshot: `output/playwright/floating-launcher.png`
