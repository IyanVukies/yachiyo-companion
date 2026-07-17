# Hermes Integration Audit - Yachiyo Companion 0.2.1

## Executive summary

The audited path is now one main-process-owned flow:

`Settings UI -> validated preload/IPC -> SettingsStore + encrypted credential -> HermesRuntime -> HermesClient -> status event -> renderer badge/diagnostics`

Runtime chat and connection testing use the same URL normalizer, authentication builder, endpoint builder, credential snapshot, and HTTP client. Automated tests use loopback mock HTTP servers; no production VPS or production credential is required.

No unresolved high-severity Hermes finding remains in the patched scope. Live2D, TTS, RVC, reminders, tray, asset validation, and the local mock implementation were not rewritten.

## Findings and remediation

### HERMES-001 - Incomplete connection test

- Severity: High
- Location: `src/main/services/hermes-client.ts`
- Evidence: the previous test treated a reachable model-list endpoint as success and did not prove chat completion.
- Impact: the UI could report a healthy connection while the selected model, chat route, authentication policy, or completion response was unusable.
- Fix: the test now performs `GET /v1/models`, checks the exact selected model, then performs a non-streaming `POST /v1/chat/completions` and requires non-empty `choices[0].message.content`.
- Verification: `tests/unit/hermes-client.test.ts`, `tests/integration/hermes-ipc.test.ts`, and `tests/e2e/desktop.spec.ts`.
- False-positive/mitigation note: a successful TCP connection or models response alone is intentionally insufficient.

### HERMES-002 - Runtime status was disconnected from health checks

- Severity: High
- Location: `src/main/services/hermes-runtime.ts`, `src/main/ipc/register-ipc.ts`, `src/renderer/src/App.tsx`
- Evidence: Save reset an isolated status value; startup did not reconnect; the renderer had no authoritative status event.
- Impact: a successful test could leave the home badge offline, and a tunnel failure could be invisible or misclassified.
- Fix: an explicit state machine (`idle`, `checking`, `online`, `offline`, authentication, timeout, server, and response errors) is published to the renderer. A successful manual test updates the badge immediately, startup reconnects automatically, monitoring detects tunnel loss, and cancellation cannot strand the runtime in `checking`.
- Verification: runtime, IPC, badge, source Electron, and restart tests.
- False-positive/mitigation note: a successful unsaved draft reports Hermes online as required, while the UI explicitly warns that Save is still required before chat switches providers.

### HERMES-003 - URL and Bearer handling diverged by call path

- Severity: High
- Location: `src/main/services/hermes-client.ts`
- Evidence: root URLs and `/v1` URLs could be resolved differently, while authentication formatting was not represented by one exported helper.
- Impact: requests could reach `/models`, `/v1/v1/...`, or another path than the one tested; copied `Bearer` prefixes or whitespace could also cause authentication failures.
- Fix: one canonical normalizer produces exactly one terminal `/v1`; every models/chat call uses `buildEndpoint`. Keys are trimmed, repeated `Bearer` prefixes are removed, and exactly one prefix is added. URL credentials, redirects, non-HTTP(S) schemes, and non-loopback plain HTTP are rejected.
- Verification: table-driven URL/auth tests cover all required forms and duplicate-prefix prevention.
- False-positive/mitigation note: HTTPS remains valid for remote hosts; loopback HTTP remains valid for the documented SSH tunnel.

### HERMES-004 - Credential/configuration race

- Severity: High (security)
- Location: `src/main/services/settings-store.ts`
- Evidence: settings and the vault were previously read/written separately, so concurrent Save/chat operations could momentarily pair an endpoint with another update's key.
- Impact: a credential could be sent to the wrong configured destination after a concurrent or interrupted update.
- Fix: store operations are serialized, runtime obtains one atomic settings/key snapshot, and the encrypted credential record is bound to the normalized destination. A destination mismatch yields no usable key. Failed commits attempt rollback and remain fail-closed because the destination binding is checked before use.
- Verification: persistence, atomic snapshot/destination-binding, IPC re-key, apply-without-restart, and startup reload tests.
- False-positive/mitigation note: the settings JSON still never contains the API key; the bound record remains inside Electron `safeStorage` ciphertext.

### HERMES-005 - Streaming/parser failures could corrupt health state

- Severity: Medium-High
- Location: `src/main/services/hermes-client.ts`, `src/main/services/hermes-runtime.ts`
- Evidence: the previous deadline did not reliably cover body consumption, CRLF could split across chunks, `[DONE]` handling was incomplete, and parser failures could be reported as offline.
- Impact: a working API could appear offline, a stalled body could hang, or an unbounded stream could consume main-process memory.
- Fix: the deadline covers fetch and body parsing; response bytes are bounded; SSE handles split CRLF, multiple data lines, delta aggregation, and `[DONE]`; empty/incomplete streams are distinct errors; one non-stream fallback is attempted only before any delta; retries never duplicate partial output.
- Verification: real loopback SSE, wrong MIME, malformed JSON/SSE, retry, timeout, cancel, non-stream, and Electron SSE tests.
- False-positive/mitigation note: a stream parser error is reported as a response/stream error, not a connectivity failure.

### HERMES-006 - Failed chat poisoned later history

- Severity: High (functional)
- Location: `src/renderer/src/App.tsx`
- Evidence: an empty assistant placeholder remained after a failed request and was included in the next history payload; strict IPC validation rejected it before network dispatch.
- Impact: the badge/test could be online while every subsequent chat appeared to hang and no request reached Hermes.
- Fix: empty placeholders are removed after error, cancel, or start failure, and outgoing history filters empty content.
- Verification: source Electron E2E deliberately triggers a mock HTTP 500 before switching to Hermes, then proves non-streaming and SSE chat reach the loopback server.
- False-positive/mitigation note: non-empty partial assistant output is preserved for the user and remains eligible as conversation context.

## Positive security controls retained

- Network and secret access remain in the Electron main process.
- Preload exposes a narrow, frozen API; renderer Node integration remains disabled with context isolation and sandboxing.
- IPC validates schemas and the trusted sender.
- API keys, Authorization headers, prompts, and response text are excluded from provider logs and exported diagnostics.
- Diagnostics summarize body shape/size rather than copying server content.
- Redirects are denied so bearer credentials cannot follow a redirect to another origin.

## Residual limitations

- The release installer is unsigned and may trigger SmartScreen.
- Real VPS verification must be performed by the user because the production key is intentionally unavailable to automated tests.
- A remote endpoint must use HTTPS; the documented plain-HTTP configuration is limited to a loopback SSH tunnel.
