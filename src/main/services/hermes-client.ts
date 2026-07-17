import type { AvatarMetadata, ConnectionTestResult, NormalizedError } from '../../shared/types'

export type HermesConfig = {
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
  streaming: boolean
  retryCount: number
  sessionId: string
}

export type HermesMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type StreamResult = {
  rawText: string
  displayText: string
  metadata: AvatarMetadata | null
}

export class HermesRequestError extends Error {
  constructor(
    readonly normalized: NormalizedError,
    readonly partialText = ''
  ) {
    super(normalized.message)
    this.name = 'HermesRequestError'
  }
}

export class HermesClient {
  async test(
    config: Pick<HermesConfig, 'baseUrl' | 'apiKey' | 'model' | 'timeoutMs'>
  ): Promise<ConnectionTestResult> {
    let endpoint: URL
    try {
      endpoint = buildEndpoint(config.baseUrl, 'models')
    } catch {
      return {
        ok: false,
        status: 'invalid',
        message: 'URL Hermes tidak valid. Gunakan alamat http:// atau https://.',
        model: null,
        warning: null
      }
    }

    const warning = insecureRemoteWarning(endpoint)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs)
    try {
      const response = await fetch(endpoint, {
        headers: authorizationHeaders(config.apiKey),
        signal: controller.signal,
        redirect: 'error'
      })
      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          status: 'auth-error',
          message: 'Hermes dapat dijangkau, tetapi API key ditolak.',
          model: null,
          warning
        }
      }
      if (!response.ok) {
        return {
          ok: false,
          status: 'offline',
          message: `Hermes menjawab dengan status ${String(response.status)}.`,
          model: null,
          warning
        }
      }
      const body = (await response.json().catch(() => null)) as {
        data?: { id?: string }[]
      } | null
      const modelAvailable = body?.data?.some((item) => item.id === config.model) ?? false
      return {
        ok: true,
        status: 'connected',
        message: modelAvailable
          ? 'Koneksi Hermes berhasil dan model ditemukan.'
          : 'Koneksi Hermes berhasil. Nama model belum dikonfirmasi oleh daftar server.',
        model: modelAvailable ? config.model : (body?.data?.[0]?.id ?? null),
        warning
      }
    } catch (error) {
      const timedOut = isAbort(error)
      return {
        ok: false,
        status: timedOut ? 'timeout' : 'offline',
        message: timedOut
          ? 'Hermes tidak menjawab sebelum batas waktu.'
          : 'Hermes tidak dapat dijangkau. Mock lokal tetap dapat digunakan.',
        model: null,
        warning
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  async stream(
    config: HermesConfig,
    messages: HermesMessage[],
    signal: AbortSignal,
    onDelta: (text: string) => void
  ): Promise<StreamResult> {
    const endpoint = buildEndpoint(config.baseUrl, 'chat/completions')
    let partialText = ''
    let attempt = 0

    for (;;) {
      try {
        const response = await fetchWithTimeout(
          endpoint,
          {
            method: 'POST',
            headers: {
              ...authorizationHeaders(config.apiKey),
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: config.model,
              messages,
              stream: config.streaming,
              user: config.sessionId || undefined
            }),
            redirect: 'error'
          },
          config.timeoutMs,
          signal
        )
        if (!response.ok) throw statusError(response, partialText)

        if (!config.streaming || !response.body || !isEventStream(response)) {
          const body = (await response.json()) as {
            choices?: { message?: { content?: string } }[]
          }
          partialText = body.choices?.[0]?.message?.content ?? ''
          if (!partialText) throw malformed('Hermes tidak mengirim teks jawaban.', partialText)
          onDelta(partialText)
        } else {
          partialText = await parseEventStream(response.body, signal, onDelta)
        }

        const structured = parseStructuredContent(partialText)
        return {
          rawText: partialText,
          displayText: structured?.text ?? partialText,
          metadata: structured?.metadata ?? null
        }
      } catch (error) {
        if (signal.aborted) throw error
        const requestError = normalizeThrown(error, partialText)
        const mayRetry = partialText.length === 0 && requestError.normalized.retryable
        if (!mayRetry || attempt >= config.retryCount) throw requestError
        attempt += 1
        await delay(250 * attempt, signal)
      }
    }
  }
}

export function buildEndpoint(baseUrl: string, resource: string): URL {
  const url = new URL(baseUrl.trim())
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported protocol')
  url.search = ''
  url.hash = ''
  const root = url.pathname.replace(/\/+$/, '')
  url.pathname = `${root.endsWith('/v1') ? root : `${root}/v1`}/${resource}`.replace(/\/{2,}/g, '/')
  return url
}

function authorizationHeaders(apiKey: string): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
}

function insecureRemoteWarning(url: URL): string | null {
  const local = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname)
  return url.protocol === 'http:' && !local
    ? 'Alamat HTTP jarak jauh tidak terenkripsi. Gunakan HTTPS atau tunnel aman.'
    : null
}

async function fetchWithTimeout(
  url: URL,
  init: RequestInit,
  timeoutMs: number,
  outerSignal: AbortSignal
): Promise<Response> {
  const controller = new AbortController()
  const abort = (): void => controller.abort()
  outerSignal.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(abort, timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
    outerSignal.removeEventListener('abort', abort)
  }
}

async function parseEventStream(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onDelta: (text: string) => void
): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  let completed = false

  try {
    for (;;) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      const result = await reader.read()
      if (result.done) break
      buffer += decoder.decode(result.value, { stream: true }).replace(/\r\n/g, '\n')
      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''
      for (const event of events) {
        const parsed = parseSseEvent(event)
        if (parsed.done) {
          completed = true
          continue
        }
        if (parsed.delta) {
          text += parsed.delta
          onDelta(parsed.delta)
        }
      }
    }
    if (buffer.trim()) {
      const parsed = parseSseEvent(buffer)
      if (parsed.delta) {
        text += parsed.delta
        onDelta(parsed.delta)
      }
      completed ||= parsed.done
    }
  } catch (error) {
    if (signal.aborted) throw error
    if (error instanceof HermesRequestError) {
      throw new HermesRequestError(error.normalized, text || error.partialText)
    }
    throw new HermesRequestError(
      normalized('OFFLINE', 'Stream Hermes terputus sebelum selesai.', true),
      text
    )
  } finally {
    reader.releaseLock()
  }

  if (!completed) throw malformed('Stream Hermes berakhir tanpa penanda selesai.', text)
  return text
}

function parseSseEvent(event: string): { done: boolean; delta: string } {
  const data = event
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
  if (!data) return { done: false, delta: '' }
  if (data.trim() === '[DONE]') return { done: true, delta: '' }
  try {
    const body = JSON.parse(data) as {
      choices?: { delta?: { content?: unknown }; text?: unknown }[]
    }
    const value = body.choices?.[0]?.delta?.content ?? body.choices?.[0]?.text ?? ''
    return { done: false, delta: typeof value === 'string' ? value : '' }
  } catch {
    throw malformed('Hermes mengirim potongan stream yang tidak valid.', '')
  }
}

function parseStructuredContent(text: string): { text: string; metadata: AvatarMetadata } | null {
  try {
    const value = JSON.parse(text) as Record<string, unknown>
    if (typeof value.text !== 'string') return null
    const metadata: AvatarMetadata = {}
    const emotions = new Set([
      'idle',
      'listening',
      'thinking',
      'speaking',
      'happy',
      'concerned',
      'confused',
      'reminder',
      'success',
      'error'
    ])
    const motions = new Set(['idle', 'nod', 'wave', 'celebrate', 'concerned'])
    if (typeof value.emotion === 'string' && emotions.has(value.emotion)) {
      metadata.emotion = value.emotion as NonNullable<AvatarMetadata['emotion']>
    }
    if (typeof value.motion === 'string' && motions.has(value.motion)) {
      metadata.motion = value.motion as NonNullable<AvatarMetadata['motion']>
    }
    if (['low', 'normal', 'high'].includes(String(value.importance))) {
      metadata.importance = value.importance as NonNullable<AvatarMetadata['importance']>
    }
    if (typeof value.requires_response === 'boolean') {
      metadata.requiresResponse = value.requires_response
    }
    return { text: value.text, metadata }
  } catch {
    return null
  }
}

function statusError(response: Response, partialText: string): HermesRequestError {
  if (response.status === 401 || response.status === 403) {
    return new HermesRequestError(normalized('AUTH', 'API key Hermes ditolak.', false), partialText)
  }
  if (response.status === 429) {
    return new HermesRequestError(
      normalized('RATE_LIMIT', 'Hermes sedang membatasi permintaan. Coba lagi sebentar.', true),
      partialText
    )
  }
  return new HermesRequestError(
    normalized(
      'SERVER',
      `Hermes menjawab dengan status ${String(response.status)}.`,
      response.status >= 500
    ),
    partialText
  )
}

function malformed(message: string, partialText: string): HermesRequestError {
  return new HermesRequestError(normalized('MALFORMED_STREAM', message, false), partialText)
}

function normalizeThrown(error: unknown, partialText: string): HermesRequestError {
  if (error instanceof HermesRequestError) return error
  if (isAbort(error)) {
    return new HermesRequestError(
      normalized('TIMEOUT', 'Hermes tidak menjawab sebelum batas waktu.', true),
      partialText
    )
  }
  return new HermesRequestError(
    normalized('OFFLINE', 'Hermes tidak dapat dijangkau. Data lokal tetap aman.', true),
    partialText
  )
}

function normalized(
  code: NormalizedError['code'],
  message: string,
  retryable: boolean
): NormalizedError {
  const title =
    code === 'AUTH'
      ? 'Autentikasi gagal'
      : code === 'RATE_LIMIT'
        ? 'Hermes sedang sibuk'
        : code === 'TIMEOUT'
          ? 'Waktu tunggu habis'
          : code === 'MALFORMED_STREAM'
            ? 'Respons tidak lengkap'
            : 'Hermes offline'
  return {
    code,
    title,
    message,
    dataSafe: true,
    availableFeatures: ['Avatar', 'Pengaturan', 'Pengingat lokal', 'Hermes mock'],
    nextAction: retryable ? 'Coba lagi atau gunakan mode Mock.' : 'Periksa pengaturan Hermes.',
    retryable
  }
}

function isAbort(error: unknown): boolean {
  return (
    error instanceof Error && (error.name === 'AbortError' || error.message.includes('aborted'))
  )
}

function isEventStream(response: Response): boolean {
  return response.headers.get('content-type')?.includes('text/event-stream') ?? false
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(resolvePromise, milliseconds)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true }
    )
  })
}
