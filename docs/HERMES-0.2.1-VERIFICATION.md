# Hermes 0.2.1 verification

Date: 2026-07-17  
Target: Windows x64  
Installer: `release\Yachiyo-Companion-0.2.1-x64-Setup.exe`

## Outcome

The Hermes integration is functionally complete against a real OpenAI-compatible loopback HTTP server. Connection test, online badge, Save/apply, runtime chat, non-streaming JSON, SSE, restart reload, and automatic reconnect all use the same main-process configuration and HTTP client.

The production VPS and its credential were intentionally not used. They remain a manual verification step through the user's SSH tunnel.

## Root causes fixed

1. Connection testing and runtime chat did not share an authoritative lifecycle/status path.
2. URL construction could diverge between root and `/v1` inputs.
3. Renderer form state, persisted settings, vault data, and a live client could represent different configurations.
4. Runtime could remain on mock after a successful Hermes setup, while the badge could remain stale.
5. Streaming/parser failures were conflated with connectivity and were not fully bounded.
6. A failed chat left an empty assistant message that caused strict IPC validation to reject the next chat before it reached Hermes.
7. Credential and destination reads were separate and could be paired incorrectly during an interrupted or overlapping update.

## Automated and build evidence

| Check                                   | Result                     | Evidence                                                                                                                                                         |
| --------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript, ESLint, Prettier, app build | Pass                       | `npm run verify`                                                                                                                                                 |
| Vitest                                  | Pass                       | 17 files, 104 tests                                                                                                                                              |
| Python voice sidecar suite              | Pass                       | 13 passed, 1 gated test skipped                                                                                                                                  |
| Source Electron Hermes E2E              | Pass                       | 1 test; real loopback HTTP server, GET models, POST test, badge, Save/apply, JSON chat, SSE, restart reconnect                                                   |
| Packaged Electron smoke                 | Pass                       | 1 test against `release\win-unpacked\Yachiyo Companion.exe`                                                                                                      |
| NSIS build                              | Pass                       | electron-builder completed and rebuilt the blockmap                                                                                                              |
| Silent installer smoke                  | Pass                       | installed executable reports `0.2.1` / `0.2.1.0`                                                                                                                 |
| Installed RVC E2E                       | Fail, outside Hermes patch | packaged sidecar is healthy with model/index, but the in-app restart after selecting Kobo exceeds the existing 20-second voice startup deadline under Playwright |

The installed RVC failure was reproduced twice on the final installer. A direct probe of the exact packaged sidecar reported `rvc=true`, `model=true`, `index=true`, and runtime `ready` in 7-14 seconds. No Live2D, TTS, RVC, reminder, tray, or mock implementation was changed to hide this separate lifecycle/performance issue.

Tunnel-drop coverage is layered: an actual closed loopback port verifies connection-refused handling, and runtime monitor tests verify the online-to-offline transition without deleting configuration. There is not yet one Electron E2E that stops the mock server mid-session.

## Release identity

- Installer bytes: `385451545`
- Installer SHA-256: `25575642234AEFBBED50E46092DE3D7C31D865A2F183E06BB834E3BF251141A9`
- Blockmap SHA-256: `04AFBC6AD2AF7A74D947E374D0E4B53CC63198DF503636EFD597E15A6A8BC362`
- `app.asar` SHA-256: `E8B59E7EC6C134707EECFCA8C38FA8824896C93735421B77001F01B789818C45`
- Authenticode: `NotSigned`

Verify locally:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath '.\release\Yachiyo-Companion-0.2.1-x64-Setup.exe'
```

## Manual VPS verification

1. Start the tunnel and keep its terminal open:

   ```powershell
   ssh -N -L 127.0.0.1:20129:127.0.0.1:8642 <user>@<vps-host>
   ```

2. In Yachiyo, open **Atur -> Hermes** and enter:
   - mode: **Hermes VPS**
   - Base URL: `http://127.0.0.1:20129/v1`
   - model: `hermes-agent`
   - API key: raw key only, without `Bearer`
3. Click **Tes koneksi**. Confirm the result says the model and chat completion were verified, diagnostics show HTTP 200, and the home badge immediately reads **Hermes online**.
4. Click **Simpan**, close settings, and send a distinctive chat message. Confirm the reply is from the real agent rather than the local mock.
5. Restart Yachiyo while the tunnel remains active. Confirm settings persist and the badge returns online automatically.
6. Stop the SSH tunnel. Confirm the badge changes offline with a connection-refused/tunnel hint, the app remains usable, and the saved Hermes configuration is not removed.
7. Restart the tunnel and use **Tes koneksi** or wait for monitoring to reconnect.

Safe diagnostics may show mode, normalized URL, endpoint, model, status, category, timeout, summary, and timestamp. They must never show the API key, Authorization header, prompt, provider token, or sensitive response content.
