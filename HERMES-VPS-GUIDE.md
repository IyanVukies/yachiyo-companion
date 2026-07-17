# Hermes VPS Guide

## Expected API

Yachiyo uses an OpenAI-compatible interface:

- `GET /v1/models` for connection testing;
- `POST /v1/chat/completions` for chat;
- bearer-token authorization;
- Server-Sent Events when streaming is enabled.

If the configured base path does not end in `/v1`, Yachiyo appends it. Redirects are rejected.

## Configure in the app

1. Start the SSH tunnel on Windows:

   ```powershell
   ssh -N -L 127.0.0.1:20129:127.0.0.1:8642 user@your-vps
   ```

2. Open **Atur -> Hermes** and choose **Hermes VPS**.
3. Enter:

   - Base URL: `http://127.0.0.1:20129/v1`
   - Model: `hermes-agent`
   - API key: the raw key, without the `Bearer` prefix
   - Timeout/retry values suitable for the tunnel

4. Choose **Simpan** so this becomes the active chat provider.
5. Choose **Tes koneksi** and confirm the home badge changes to **Hermes online**.

These base forms normalize to the same destination:

- `http://127.0.0.1:20129`
- `http://127.0.0.1:20129/`
- `http://127.0.0.1:20129/v1`
- `http://127.0.0.1:20129/v1/`

All four produce exactly:

- `GET http://127.0.0.1:20129/v1/models`
- `POST http://127.0.0.1:20129/v1/chat/completions`

Plain HTTP is accepted only for a loopback tunnel address. Use HTTPS for a non-loopback host.

## What the connection test proves

The test performs these checks in order:

1. `GET /v1/models` returns HTTP 200.
2. `hermes-agent` is present in the model IDs.
3. `POST /v1/chat/completions` returns HTTP 200 with `stream: false`.
4. `choices[0].message.content` is non-empty.

Testing an unsaved draft does not silently switch the active provider. The result tells you to Save when the draft differs from the active configuration.

## Safe diagnostics

The Hermes panel shows active mode, normalized URL, endpoint, model, HTTP status, error category, timeout, sanitized response summary, and last-check time. It never displays the API key, Authorization header, prompt, response content, environment credentials, or provider tokens.

If the tunnel drops, the stored Hermes configuration remains intact and the application stays open.

## Recommended VPS/reverse-proxy setup

- Use TLS with a valid certificate.
- Expose only the required API routes.
- Require a scoped, revocable bearer key.
- Apply server-side request-size and rate limits.
- Keep model/admin dashboards on a separate protected route.
- Disable redirects on API routes.
- Log request IDs and status, not full prompts or bearer keys.
- Restrict inbound traffic with a firewall or private tunnel when practical.

Remote plain HTTP is rejected before credentials are sent. Use HTTPS or a loopback SSH tunnel.

## Streaming behavior

The client incrementally parses SSE, ignores unsupported fields, and accepts only allowlisted avatar metadata. Stop cancels the request locally. Retry occurs only for safe retryable failures and never converts response text into executable commands.

## Error mapping

- 401/403: authentication failed;
- 429: Hermes is busy/rate-limited;
- 5xx: server/offline fallback state;
- timeout/network failure: offline state;
- malformed SSE: incomplete-response state.

Avatar, settings, local reminders, and mock mode remain available during all these failures.

## Key rotation

Enter the replacement key in Settings and test it. Revoke the old key server-side. Yachiyo stores only encrypted key bytes through Windows/Electron secure storage where available and never exports the key in diagnostics.

## Test checklist

1. With the tunnel running, Save the configuration and run **Tes koneksi**; verify **Hermes online**.
2. Open Chat, send a unique prompt, and verify the reply is not the local mock wording.
3. Close and reopen Yachiyo; verify settings persist and startup reconnects automatically.
4. Stop the SSH process; verify **Hermes offline**, clear tunnel guidance, and no crash.
5. Start the tunnel and rerun the test (or wait for reconnect); verify online status returns.
6. Test streaming and Stop/cancel with a long reply.
7. Export safe diagnostics and search for the API key; it must not be present.
