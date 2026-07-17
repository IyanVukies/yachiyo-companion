# Hermes Integration Plan

## Peran Hermes

Hermes tetap menjadi:

- Otak percakapan.
- Memori.
- Agent tooling.
- Sumber konteks pengguna.
- Sistem yang juga melayani Telegram.

Aplikasi desktop tidak membuat agent logic terpisah.

## Connection configuration

Settings:

- Base URL.
- API key.
- Model name.
- Timeout.
- Streaming toggle.
- Retry policy.
- Optional session identifier.

Gunakan placeholder; jangan hardcode nilai aktual.

## API baseline

Asumsikan API OpenAI-compatible:

```text
POST /v1/chat/completions
Authorization: Bearer <key>
```

Sol harus memverifikasi implementasi Hermes aktual dan menyesuaikan adapter tanpa mengunci aplikasi ke satu endpoint.

## Streaming

- Support SSE/chunked streaming.
- AbortController.
- Handle malformed chunks.
- Preserve partial text on recoverable error.
- Stop generation button.
- Timeout dan retry hanya untuk kondisi aman.

## Structured avatar metadata

Minta Hermes menghasilkan format opsional:

```json
{
  "text": "Jawaban untuk pengguna",
  "emotion": "happy",
  "motion": "nod",
  "importance": "normal",
  "requires_response": false
}
```

Aturan:

- Parser harus toleran.
- Plain text tetap valid.
- LLM tidak boleh menyebut filename motion langsung sebagai command.
- Mapping emotion/motion harus memakai allowlist lokal.
- Jangan pernah menjalankan arbitrary tool atau shell command dari metadata.

## Conversation handling

- Conversation history lokal opsional.
- Sediakan clear conversation.
- Bedakan session desktop dari Telegram bila Hermes memerlukan session ID.
- Dokumentasikan apakah memory Hermes shared atau channel-specific.
- Jangan menjanjikan sinkronisasi Telegram jika belum benar-benar tersedia.

## Mock Hermes server

Wajib dibuat untuk development dan testing.

Mock harus mendukung:

- Streaming normal.
- Plain text.
- Structured JSON.
- Slow response.
- 401.
- 429.
- 500.
- Connection drop.
- Malformed chunk.
- Long response.
- Cancel.

## Connection UX

Status:

- Connected.
- Connecting.
- Offline.
- Authentication failed.
- Server unavailable.
- Rate limited.
- Timed out.

Pesan harus menggunakan bahasa Indonesia sederhana.

## Security

- API key disimpan melalui credential manager bila mungkin.
- Renderer tidak menerima secret langsung setelah disimpan.
- Logs meredaksi Authorization header.
- Non-local HTTP menampilkan warning.
- HTTPS dianjurkan.
- Sediakan secure tunnel guide tanpa otomatis membuka port publik.

## Acceptance criteria

- Test connection valid.
- Streaming berjalan.
- Cancel bekerja.
- Plain text dan JSON terproses.
- 401 tidak menghapus key.
- Offline mode tidak crash.
- Mock test lengkap lulus.
