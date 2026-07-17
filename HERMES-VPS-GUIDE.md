# Hermes VPS Guide

## Expected API

Yachiyo uses an OpenAI-compatible interface:

- `GET /v1/models` for connection testing;
- `POST /v1/chat/completions` for chat;
- bearer-token authorization;
- Server-Sent Events when streaming is enabled.

If the configured base path does not end in `/v1`, Yachiyo appends it. Redirects are rejected.

## Configure in the app

1. Open **Atur → Hermes**.
2. Choose **Hermes VPS**.
3. Enter the HTTPS base URL, model name, and API key.
4. Choose a timeout and conservative retry count.
5. Choose **Tes koneksi**.
6. Save only after the model is found or the returned model warning is understood.

The real connection remains untested until the user provides these values. Mock mode is the verified default.

## Recommended VPS/reverse-proxy setup

- Use TLS with a valid certificate.
- Expose only the required API routes.
- Require a scoped, revocable bearer key.
- Apply server-side request-size and rate limits.
- Keep model/admin dashboards on a separate protected route.
- Disable redirects on API routes.
- Log request IDs and status, not full prompts or bearer keys.
- Restrict inbound traffic with a firewall or private tunnel when practical.

Remote plain HTTP is allowed only with a prominent warning so unusual private setups can be diagnosed. Do not use it over the public internet.

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

- model listing succeeds;
- short streaming reply completes;
- Stop cancels a long reply;
- invalid key shows 401/403 without leaking it;
- rate limit and 5xx return plain recovery guidance;
- VPS offline leaves mock/local features usable;
- diagnostics redact the remote hostname and key.
