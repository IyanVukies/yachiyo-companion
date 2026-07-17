import type {
  AvatarMetadata,
  ConnectionTestResult,
  HermesConnectionDiagnostics,
  HermesErrorCategory,
  NormalizedError
} from '../../shared/types'

import {
  parseAvatarMetadata,
  sanitizeYachiyoVisibleText,
  YachiyoControlEnvelopeParser
} from './yachiyo-control-parser'

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
  transport: 'sse' | 'json' | 'json-fallback'
}

type HermesMode = 'mock' | 'hermes'
type HermesResource = 'models' | 'chat/completions'
type TestConfig = Pick<HermesConfig, 'baseUrl' | 'apiKey' | 'model' | 'timeoutMs'>

type ModelsCheck = {
  result: ConnectionTestResult
  modelIds: string[]
}

const MAX_RESPONSE_BYTES = 1024 * 1024

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
  async probe(config: TestConfig, mode: HermesMode = 'hermes'): Promise<ConnectionTestResult> {
    return (await checkModels(config, mode)).result
  }

  async test(config: TestConfig, mode: HermesMode = 'hermes'): Promise<ConnectionTestResult> {
    const models = await checkModels(config, mode)
    if (!models.result.ok) return models.result

    let chatEndpoint: URL
    try {
      chatEndpoint = buildEndpoint(config.baseUrl, 'chat/completions')
    } catch {
      return invalidUrlResult(config, mode)
    }

    const warning = insecureRemoteWarning(chatEndpoint)
    const deadline = createDeadline(config.timeoutMs)
    try {
      const response = await fetch(chatEndpoint, {
        method: 'POST',
        headers: {
          ...buildHermesAuthorizationHeaders(config.apiKey),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: 'Balas hanya ONLINE' }],
          stream: false
        }),
        signal: deadline.signal,
        redirect: 'error'
      })
      const rawBody = await readBoundedBody(response, deadline.signal)
      const bodySummary = summarizeBody(rawBody)
      if (!response.ok) {
        return httpFailureResult({
          config,
          mode,
          response,
          endpoint: chatEndpoint,
          phase: 'chat-test',
          bodySummary,
          warning,
          modelsReachable: true,
          modelFailure: looksLikeModelFailure(rawBody)
        })
      }

      const body = parseJson(rawBody)
      const content = completionContent(body)
      const modelsSummary = models.result.diagnostics.responseSummary ?? 'models=verified'
      if (!content) {
        return failureResult({
          config,
          mode,
          state: 'response-error',
          category: 'response',
          phase: 'chat-test',
          endpoint: chatEndpoint,
          httpStatus: response.status,
          message: `Chat endpoint merespons HTTP ${String(response.status)}, tetapi choices[0].message.content tidak tersedia.`,
          responseSummary: `${modelsSummary}; ${bodySummary}; chatContent=false`,
          warning
        })
      }

      return {
        ok: true,
        status: 'online',
        message: 'Koneksi Hermes berhasil, model ditemukan, dan chat completion terverifikasi.',
        model: config.model,
        warning,
        diagnostics: {
          ...baseDiagnostics(config, mode, 'chat-test'),
          activeEndpoint: chatEndpoint.toString(),
          httpStatus: response.status,
          errorCategory: 'none',
          responseSummary: `${modelsSummary}; ${bodySummary}; chatContent=true`,
          checkedAt: new Date().toISOString()
        }
      }
    } catch (error) {
      return thrownTestFailure(config, mode, chatEndpoint, 'chat-test', error, deadline.timedOut())
    } finally {
      deadline.dispose()
    }
  }

  async stream(
    config: HermesConfig,
    messages: HermesMessage[],
    signal: AbortSignal,
    onDelta: (text: string) => void
  ): Promise<StreamResult> {
    const endpoint = buildEndpoint(config.baseUrl, 'chat/completions')
    let attempt = 0
    let requestStreaming = config.streaming
    let usedStreamingFallback = false

    for (;;) {
      let rawText = ''
      let visibleText = ''
      const controlParser = new YachiyoControlEnvelopeParser()
      const deadline = createDeadline(config.timeoutMs, signal)
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            ...buildHermesAuthorizationHeaders(config.apiKey),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: config.model,
            messages,
            stream: requestStreaming,
            user: config.sessionId || undefined
          }),
          signal: deadline.signal,
          redirect: 'error'
        })
        if (!response.ok) {
          const rawBody = await readBoundedBody(response, deadline.signal)
          throw statusError(
            response,
            endpoint,
            visibleText,
            summarizeBody(rawBody),
            looksLikeModelFailure(rawBody)
          )
        }

        let transport: StreamResult['transport']
        if (requestStreaming && response.body && isEventStream(response)) {
          rawText = await parseEventStream(response.body, deadline.signal, (delta) => {
            rawText += delta
            const visibleDelta = controlParser.push(delta)
            if (!visibleDelta) return
            visibleText += visibleDelta
            onDelta(visibleDelta)
          })
          transport = 'sse'
        } else {
          const rawBody = await readBoundedBody(response, deadline.signal)
          const body = parseJsonResponse(rawBody, endpoint)
          rawText = completionContent(body) ?? ''
          if (!rawText.trim()) {
            throw malformedResponse(
              'Hermes tidak mengirim choices[0].message.content.',
              visibleText,
              endpoint,
              summarizeBody(rawBody)
            )
          }
          const visibleDelta = controlParser.push(rawText)
          if (visibleDelta) {
            visibleText += visibleDelta
            onDelta(visibleDelta)
          }
          transport = usedStreamingFallback ? 'json-fallback' : 'json'
        }

        const control = controlParser.finish()
        visibleText = control.text
        const structured = parseStructuredContent(rawText)
        const displayText = sanitizeYachiyoVisibleText(structured?.text ?? visibleText)
        if (!displayText.trim()) {
          throw requestStreaming
            ? malformedStream(
                'Hermes menyelesaikan stream tanpa teks jawaban.',
                visibleText,
                endpoint
              )
            : malformedResponse('Hermes tidak mengirim teks jawaban.', visibleText, endpoint, null)
        }
        return {
          rawText,
          displayText,
          metadata: control.metadata ?? structured?.metadata ?? null,
          transport
        }
      } catch (error) {
        if (signal.aborted) throw error
        const normalized = normalizeThrown(error, visibleText, endpoint, deadline.timedOut())
        const requestError = new HermesRequestError(normalized.normalized, visibleText)
        const canFallback =
          requestStreaming &&
          !usedStreamingFallback &&
          rawText.length === 0 &&
          ['MALFORMED_STREAM', 'MALFORMED_RESPONSE'].includes(requestError.normalized.code)
        if (canFallback) {
          requestStreaming = false
          usedStreamingFallback = true
          continue
        }
        const mayRetry = rawText.length === 0 && requestError.normalized.retryable
        if (!mayRetry || attempt >= config.retryCount) throw requestError
        attempt += 1
        await delay(250 * attempt, signal)
      } finally {
        deadline.dispose()
      }
    }
  }
}

export function normalizeHermesBaseUrl(baseUrl: string): URL {
  const url = new URL(baseUrl.trim())
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported protocol')
  if (url.username || url.password) throw new Error('URL credentials are not allowed')
  if (url.protocol === 'http:' && !isLoopbackHostname(url.hostname)) {
    throw new Error('Plain HTTP is allowed only for a loopback SSH tunnel')
  }
  url.search = ''
  url.hash = ''
  const segments = url.pathname.split('/').filter(Boolean)
  while (segments.at(-1)?.toLowerCase() === 'v1') segments.pop()
  segments.push('v1')
  url.pathname = `/${segments.join('/')}`
  return url
}

export function buildEndpoint(baseUrl: string, resource: HermesResource): URL {
  const url = normalizeHermesBaseUrl(baseUrl)
  url.pathname = `${url.pathname}/${resource}`
  return url
}

export function normalizeHermesApiKey(value: string): string {
  let normalized = value.trim()
  while (/^bearer\s+/i.test(normalized)) normalized = normalized.replace(/^bearer\s+/i, '').trim()
  return normalized
}

export function buildHermesAuthorizationHeaders(apiKey: string): Record<string, string> {
  const normalized = normalizeHermesApiKey(apiKey)
  return normalized ? { Authorization: `Bearer ${normalized}` } : {}
}

export function sameHermesDestination(left: string, right: string): boolean {
  try {
    return normalizeHermesBaseUrl(left).toString() === normalizeHermesBaseUrl(right).toString()
  } catch {
    return false
  }
}

async function checkModels(config: TestConfig, mode: HermesMode): Promise<ModelsCheck> {
  let endpoint: URL
  try {
    endpoint = buildEndpoint(config.baseUrl, 'models')
  } catch {
    return { result: invalidUrlResult(config, mode), modelIds: [] }
  }

  const warning = insecureRemoteWarning(endpoint)
  const deadline = createDeadline(config.timeoutMs)
  try {
    const response = await fetch(endpoint, {
      headers: buildHermesAuthorizationHeaders(config.apiKey),
      signal: deadline.signal,
      redirect: 'error'
    })
    const rawBody = await readBoundedBody(response, deadline.signal)
    const bodySummary = summarizeBody(rawBody)
    if (!response.ok) {
      return {
        result: httpFailureResult({
          config,
          mode,
          response,
          endpoint,
          phase: 'models',
          bodySummary,
          warning,
          modelsReachable: false,
          modelFailure: false
        }),
        modelIds: []
      }
    }

    const body = parseJson(rawBody)
    const modelIds = modelIdsFrom(body)
    if (!modelIds) {
      return {
        result: failureResult({
          config,
          mode,
          state: 'response-error',
          category: 'response',
          phase: 'models',
          endpoint,
          httpStatus: response.status,
          message: 'Endpoint models merespons, tetapi format daftar model tidak valid.',
          responseSummary: bodySummary,
          warning
        }),
        modelIds: []
      }
    }
    if (!modelIds.includes(config.model)) {
      return {
        result: failureResult({
          config,
          mode,
          state: 'response-error',
          category: 'model',
          phase: 'models',
          endpoint,
          httpStatus: response.status,
          message: `Model ${config.model} tidak ditemukan pada endpoint Hermes.`,
          responseSummary: `models=${String(modelIds.length)}; selectedModelFound=false; ${bodySummary}`,
          warning,
          model: modelIds[0] ?? null
        }),
        modelIds
      }
    }

    return {
      result: {
        ok: true,
        status: 'online',
        message: 'Endpoint models Hermes dapat dijangkau dan model ditemukan.',
        model: config.model,
        warning,
        diagnostics: {
          ...baseDiagnostics(config, mode, 'models'),
          activeEndpoint: endpoint.toString(),
          httpStatus: response.status,
          errorCategory: 'none',
          responseSummary: `models=${String(modelIds.length)}; selectedModelFound=true; ${bodySummary}`,
          checkedAt: new Date().toISOString()
        }
      },
      modelIds
    }
  } catch (error) {
    return {
      result: thrownTestFailure(config, mode, endpoint, 'models', error, deadline.timedOut()),
      modelIds: []
    }
  } finally {
    deadline.dispose()
  }
}

function invalidUrlResult(config: TestConfig, mode: HermesMode): ConnectionTestResult {
  return {
    ok: false,
    status: 'response-error',
    message: 'URL Hermes tidak valid. Gunakan alamat HTTP(S) tanpa kredensial URL.',
    model: null,
    warning: null,
    diagnostics: {
      ...baseDiagnostics(config, mode, 'idle'),
      errorCategory: 'invalid-url',
      checkedAt: new Date().toISOString()
    }
  }
}

function httpFailureResult(input: {
  config: TestConfig
  mode: HermesMode
  response: Response
  endpoint: URL
  phase: 'models' | 'chat-test'
  bodySummary: string
  warning: string | null
  modelsReachable: boolean
  modelFailure: boolean
}): ConnectionTestResult {
  const status = input.response.status
  const authentication = status === 401 || status === 403
  const rateLimited = status === 429
  const state = authentication
    ? 'authentication-error'
    : input.modelFailure
      ? 'response-error'
      : 'server-error'
  const category: HermesErrorCategory = authentication
    ? 'authentication'
    : rateLimited
      ? 'rate-limit'
      : input.modelFailure
        ? 'model'
        : 'server'
  const endpointLabel = input.phase === 'models' ? 'Models endpoint' : 'Chat endpoint'
  const suffix = input.modelsReachable ? ' Models endpoint tetap dapat dijangkau.' : ''
  const message = authentication
    ? `Authentication failed - HTTP ${String(status)}. Endpoint: ${input.endpoint.toString()}`
    : input.modelFailure
      ? `Model atau provider menolak permintaan - HTTP ${String(status)}.${suffix}`
      : `${endpointLabel} failed - HTTP ${String(status)}.${suffix}`
  return failureResult({
    config: input.config,
    mode: input.mode,
    state,
    category,
    phase: input.phase,
    endpoint: input.endpoint,
    httpStatus: status,
    message,
    responseSummary: input.bodySummary,
    warning: input.warning
  })
}

function thrownTestFailure(
  config: TestConfig,
  mode: HermesMode,
  endpoint: URL,
  phase: 'models' | 'chat-test',
  error: unknown,
  timedOut: boolean
): ConnectionTestResult {
  if (error instanceof HermesRequestError) {
    return failureResult({
      config,
      mode,
      state: stateForCode(error.normalized.code),
      category: error.normalized.category,
      phase,
      endpoint,
      httpStatus: error.normalized.httpStatus,
      message: error.normalized.message,
      responseSummary: error.normalized.responseSummary,
      warning: insecureRemoteWarning(endpoint)
    })
  }
  const timeout = timedOut || isAbort(error)
  return failureResult({
    config,
    mode,
    state: timeout ? 'timeout' : 'offline',
    category: timeout ? 'timeout' : 'connection',
    phase,
    endpoint,
    httpStatus: null,
    message: timeout
      ? `Hermes tidak menjawab sebelum timeout. Endpoint: ${endpoint.toString()}`
      : `Connection refused. Endpoint: ${endpoint.toString()} Kemungkinan SSH tunnel tidak aktif.`,
    responseSummary: null,
    warning: insecureRemoteWarning(endpoint)
  })
}

function failureResult(input: {
  config: TestConfig
  mode: HermesMode
  state: ConnectionTestResult['status']
  category: HermesErrorCategory
  phase: HermesConnectionDiagnostics['phase']
  endpoint: URL
  httpStatus: number | null
  message: string
  responseSummary: string | null
  warning: string | null
  model?: string | null
}): ConnectionTestResult {
  return {
    ok: false,
    status: input.state,
    message: input.message,
    model: input.model ?? null,
    warning: input.warning,
    diagnostics: {
      ...baseDiagnostics(input.config, input.mode, input.phase),
      activeEndpoint: input.endpoint.toString(),
      httpStatus: input.httpStatus,
      errorCategory: input.category,
      responseSummary: input.responseSummary,
      checkedAt: new Date().toISOString()
    }
  }
}

function baseDiagnostics(
  config: Pick<HermesConfig, 'baseUrl' | 'model' | 'timeoutMs'>,
  mode: HermesMode,
  phase: HermesConnectionDiagnostics['phase']
): HermesConnectionDiagnostics {
  try {
    return {
      mode,
      phase,
      normalizedBaseUrl: normalizeHermesBaseUrl(config.baseUrl).toString(),
      modelsEndpoint: buildEndpoint(config.baseUrl, 'models').toString(),
      chatEndpoint: buildEndpoint(config.baseUrl, 'chat/completions').toString(),
      activeEndpoint: null,
      selectedModel: config.model,
      httpStatus: null,
      errorCategory: 'none',
      timeoutMs: config.timeoutMs,
      responseSummary: null,
      checkedAt: null
    }
  } catch {
    return {
      mode,
      phase,
      normalizedBaseUrl: null,
      modelsEndpoint: null,
      chatEndpoint: null,
      activeEndpoint: null,
      selectedModel: config.model,
      httpStatus: null,
      errorCategory: 'invalid-url',
      timeoutMs: config.timeoutMs,
      responseSummary: null,
      checkedAt: null
    }
  }
}

function createDeadline(
  timeoutMs: number,
  outerSignal?: AbortSignal
): {
  signal: AbortSignal
  timedOut: () => boolean
  dispose: () => void
} {
  const controller = new AbortController()
  let timeoutReached = false
  const abortFromOuter = (): void => controller.abort()
  outerSignal?.addEventListener('abort', abortFromOuter, { once: true })
  if (outerSignal?.aborted) controller.abort()
  const timer = setTimeout(() => {
    timeoutReached = true
    controller.abort()
  }, timeoutMs)
  return {
    signal: controller.signal,
    timedOut: () => timeoutReached,
    dispose: () => {
      clearTimeout(timer)
      outerSignal?.removeEventListener('abort', abortFromOuter)
    }
  }
}

async function readBoundedBody(response: Response, signal: AbortSignal): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  const cancel = (): void => {
    void reader.cancel().catch(() => undefined)
  }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    for (;;) {
      const result = await reader.read()
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      if (result.done) break
      const value: unknown = result.value
      if (!(value instanceof Uint8Array)) {
        throw malformedResponse(
          'Respons Hermes memiliki format biner yang tidak valid.',
          '',
          response.url || null,
          null
        )
      }
      total += value.byteLength
      if (total > MAX_RESPONSE_BYTES) {
        throw malformedResponse('Respons Hermes terlalu besar.', '', response.url || null, null)
      }
      chunks.push(value)
    }
    const combined = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      combined.set(chunk, offset)
      offset += chunk.byteLength
    }
    return new TextDecoder().decode(combined)
  } finally {
    signal.removeEventListener('abort', cancel)
    reader.releaseLock()
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
  let receivedBytes = 0
  const cancel = (): void => {
    void reader.cancel().catch(() => undefined)
  }
  signal.addEventListener('abort', cancel, { once: true })

  const consume = async (final = false): Promise<boolean> => {
    for (;;) {
      const separator = /\r?\n\r?\n/.exec(buffer)
      if (!separator) break
      const event = buffer.slice(0, separator.index)
      buffer = buffer.slice(separator.index + separator[0].length)
      const parsed = parseSseEvent(event)
      if (parsed.done) {
        await reader.cancel().catch(() => undefined)
        return true
      }
      if (parsed.delta) {
        text += parsed.delta
        onDelta(parsed.delta)
      }
    }
    if (final && buffer.trim()) {
      const parsed = parseSseEvent(buffer)
      buffer = ''
      if (parsed.delta) {
        text += parsed.delta
        onDelta(parsed.delta)
      }
      if (parsed.done) return true
    }
    return completed
  }

  try {
    for (;;) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      const result = await reader.read()
      if (result.done) {
        buffer += decoder.decode()
        completed = await consume(true)
        break
      }
      const value: unknown = result.value
      if (!(value instanceof Uint8Array)) {
        throw malformedStream('Hermes mengirim format stream yang tidak valid.', text, null)
      }
      receivedBytes += value.byteLength
      if (receivedBytes > MAX_RESPONSE_BYTES) {
        throw malformedStream('Stream Hermes melebihi batas ukuran aman.', text, null)
      }
      buffer += decoder.decode(value, { stream: true })
      if (await consume()) {
        completed = true
        break
      }
    }
  } catch (error) {
    if (signal.aborted) throw error
    if (error instanceof HermesRequestError) {
      throw new HermesRequestError(error.normalized, text || error.partialText)
    }
    throw new HermesRequestError(
      normalizedError('OFFLINE', 'Stream Hermes terputus sebelum selesai.', true, {
        category: 'connection',
        endpoint: null
      }),
      text
    )
  } finally {
    signal.removeEventListener('abort', cancel)
    reader.releaseLock()
  }

  if (!completed) throw malformedStream('Stream Hermes berakhir tanpa penanda [DONE].', text, null)
  if (!text.trim())
    throw malformedStream('Hermes menyelesaikan stream tanpa teks jawaban.', '', null)
  return text
}

function parseSseEvent(event: string): { done: boolean; delta: string } {
  const data = event
    .split(/\r?\n|\r/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''))
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
    throw malformedStream('Hermes mengirim potongan stream yang tidak valid.', '', null)
  }
}

function parseJson(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody) as unknown
  } catch {
    return null
  }
}

function parseJsonResponse(rawBody: string, endpoint: URL): unknown {
  try {
    return JSON.parse(rawBody) as unknown
  } catch {
    throw malformedResponse(
      'Hermes mengirim JSON non-streaming yang tidak valid.',
      '',
      endpoint,
      summarizeBody(rawBody)
    )
  }
}

function modelIdsFrom(value: unknown): string[] | null {
  if (!value || typeof value !== 'object') return null
  const data = (value as { data?: unknown }).data
  if (!Array.isArray(data)) return null
  return data.flatMap((item) => {
    const id = item && typeof item === 'object' ? (item as { id?: unknown }).id : null
    return typeof id === 'string' ? [id] : []
  })
}

function completionContent(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const choices = (value as { choices?: unknown }).choices
  if (!Array.isArray(choices)) return null
  const first: unknown = choices[0]
  if (!first || typeof first !== 'object') return null
  const message = (first as { message?: unknown }).message
  if (!message || typeof message !== 'object') return null
  const content = (message as { content?: unknown }).content
  return typeof content === 'string' && content.trim() ? content : null
}

function summarizeBody(rawBody: string): string {
  const trimmed = rawBody.trim()
  if (!trimmed) return 'body=empty'
  try {
    const value = JSON.parse(trimmed) as unknown
    if (Array.isArray(value)) return `body=json-array; items=${String(value.length)}`
    if (value && typeof value === 'object') {
      return `body=json-object; fields=${String(Object.keys(value).length)}`
    }
    return `body=json-${typeof value}`
  } catch {
    return `body=text; chars=${String(trimmed.length)}`
  }
}

function statusError(
  response: Response,
  endpoint: URL,
  partialText: string,
  responseSummary: string,
  modelFailure: boolean
): HermesRequestError {
  if (response.status === 401 || response.status === 403) {
    return new HermesRequestError(
      normalizedError('AUTH', `Authentication failed - HTTP ${String(response.status)}.`, false, {
        category: 'authentication',
        httpStatus: response.status,
        endpoint: endpoint.toString(),
        responseSummary
      }),
      partialText
    )
  }
  if (response.status === 429) {
    return new HermesRequestError(
      normalizedError('RATE_LIMIT', 'Hermes sedang membatasi permintaan.', true, {
        category: 'rate-limit',
        httpStatus: response.status,
        endpoint: endpoint.toString(),
        responseSummary
      }),
      partialText
    )
  }
  if (modelFailure) {
    return new HermesRequestError(
      normalizedError(
        'MODEL',
        `Model atau provider menolak permintaan - HTTP ${String(response.status)}.`,
        false,
        {
          category: 'model',
          httpStatus: response.status,
          endpoint: endpoint.toString(),
          responseSummary
        }
      ),
      partialText
    )
  }
  if (response.status >= 400 && response.status < 500) {
    return new HermesRequestError(
      normalizedError(
        'VALIDATION',
        `Provider menolak payload chat - HTTP ${String(response.status)}.`,
        false,
        {
          category: 'response',
          httpStatus: response.status,
          endpoint: endpoint.toString(),
          responseSummary
        }
      ),
      partialText
    )
  }
  return new HermesRequestError(
    normalizedError(
      'SERVER',
      `Chat endpoint failed - HTTP ${String(response.status)}.`,
      response.status >= 500,
      {
        category: 'server',
        httpStatus: response.status,
        endpoint: endpoint.toString(),
        responseSummary
      }
    ),
    partialText
  )
}

function looksLikeModelFailure(rawBody: string): boolean {
  return /\bmodel\b|model[_-]?not[_-]?found|unknown[_ -]?model/i.test(rawBody)
}

function malformedResponse(
  message: string,
  partialText: string,
  endpoint: URL | string | null,
  responseSummary: string | null
): HermesRequestError {
  return new HermesRequestError(
    normalizedError('MALFORMED_RESPONSE', message, false, {
      category: 'response',
      endpoint: typeof endpoint === 'string' ? endpoint : (endpoint?.toString() ?? null),
      responseSummary
    }),
    partialText
  )
}

function malformedStream(
  message: string,
  partialText: string,
  endpoint: URL | null
): HermesRequestError {
  return new HermesRequestError(
    normalizedError('MALFORMED_STREAM', message, false, {
      category: 'stream',
      endpoint: endpoint?.toString() ?? null
    }),
    partialText
  )
}

function normalizeThrown(
  error: unknown,
  partialText: string,
  endpoint: URL,
  timedOut: boolean
): HermesRequestError {
  if (error instanceof HermesRequestError) {
    if (error.normalized.endpoint) return error
    return new HermesRequestError(
      { ...error.normalized, endpoint: endpoint.toString() },
      partialText || error.partialText
    )
  }
  if (timedOut || isAbort(error)) {
    return new HermesRequestError(
      normalizedError('TIMEOUT', 'Hermes tidak menjawab sebelum batas waktu.', true, {
        category: 'timeout',
        endpoint: endpoint.toString()
      }),
      partialText
    )
  }
  return new HermesRequestError(
    normalizedError('OFFLINE', 'Hermes tidak dapat dijangkau. Pastikan SSH tunnel aktif.', true, {
      category: 'connection',
      endpoint: endpoint.toString()
    }),
    partialText
  )
}

function normalizedError(
  code: NormalizedError['code'],
  message: string,
  retryable: boolean,
  details: {
    category: HermesErrorCategory
    httpStatus?: number | null
    endpoint?: string | null
    responseSummary?: string | null
  }
): NormalizedError {
  const title =
    code === 'AUTH'
      ? 'Autentikasi gagal'
      : code === 'RATE_LIMIT'
        ? 'Hermes sedang sibuk'
        : code === 'TIMEOUT'
          ? 'Waktu tunggu habis'
          : code === 'OFFLINE'
            ? 'Hermes offline'
            : code === 'SERVER'
              ? 'Server Hermes bermasalah'
              : code === 'MODEL'
                ? 'Model Hermes ditolak'
                : code === 'VALIDATION'
                  ? 'Payload Hermes ditolak'
                  : code === 'MALFORMED_STREAM'
                    ? 'Streaming Hermes gagal'
                    : 'Respons Hermes tidak valid'
  return {
    code,
    title,
    message,
    dataSafe: true,
    availableFeatures: ['Avatar', 'Pengaturan', 'Pengingat lokal', 'Hermes mock'],
    nextAction: retryable ? 'Coba lagi atau gunakan mode Mock.' : 'Periksa pengaturan Hermes.',
    retryable,
    category: details.category,
    httpStatus: details.httpStatus ?? null,
    endpoint: details.endpoint ?? null,
    responseSummary: details.responseSummary ?? null
  }
}

function stateForCode(code: NormalizedError['code']): ConnectionTestResult['status'] {
  if (code === 'AUTH') return 'authentication-error'
  if (code === 'TIMEOUT') return 'timeout'
  if (code === 'OFFLINE') return 'offline'
  if (code === 'SERVER' || code === 'RATE_LIMIT') return 'server-error'
  return 'response-error'
}

function parseStructuredContent(text: string): { text: string; metadata: AvatarMetadata } | null {
  try {
    const value = JSON.parse(text) as Record<string, unknown>
    if (typeof value.text !== 'string') return null
    return {
      text: sanitizeYachiyoVisibleText(value.text),
      metadata: parseAvatarMetadata(value) ?? {}
    }
  } catch {
    return null
  }
}

function insecureRemoteWarning(url: URL): string | null {
  return url.protocol === 'http:' && !isLoopbackHostname(url.hostname)
    ? 'Alamat HTTP jarak jauh ditolak. Gunakan HTTPS atau tunnel loopback yang aman.'
    : null
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return (
    normalized === 'localhost' ||
    normalized === '::1' ||
    normalized === '[::1]' ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized)
  )
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
