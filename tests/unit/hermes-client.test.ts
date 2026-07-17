import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  HermesClient,
  HermesRequestError,
  buildEndpoint,
  buildHermesAuthorizationHeaders,
  normalizeHermesApiKey,
  normalizeHermesBaseUrl,
  sameHermesDestination,
  type HermesConfig
} from '../../src/main/services/hermes-client'

let server: Server
let baseUrl: string
let handler: (request: IncomingMessage, response: ServerResponse) => Promise<void>

beforeEach(async () => {
  handler = defaultHandler
  server = createServer((request, response) => {
    void handler(request, response).catch(() => {
      if (!response.headersSent) response.writeHead(500)
      response.end()
    })
  })
  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolvePromise)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server address unavailable')
  baseUrl = `http://127.0.0.1:${String(address.port)}`
})

afterEach(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()))
})

describe('Hermes endpoint and authentication normalization', () => {
  it.each([
    ['http://127.0.0.1:20129', 'http://127.0.0.1:20129/v1'],
    ['http://127.0.0.1:20129/', 'http://127.0.0.1:20129/v1'],
    ['http://127.0.0.1:20129/v1', 'http://127.0.0.1:20129/v1'],
    ['http://127.0.0.1:20129/v1/', 'http://127.0.0.1:20129/v1'],
    ['http://127.0.0.1:20129/v1/v1/', 'http://127.0.0.1:20129/v1']
  ])('normalizes %s', (input, expected) => {
    expect(normalizeHermesBaseUrl(input).toString()).toBe(expected)
    expect(buildEndpoint(input, 'models').toString()).toBe(`${expected}/models`)
    expect(buildEndpoint(input, 'chat/completions').toString()).toBe(`${expected}/chat/completions`)
  })

  it('rejects URL credentials and non-HTTP protocols', () => {
    expect(() => normalizeHermesBaseUrl('file:///secret')).toThrow('Unsupported protocol')
    expect(() => normalizeHermesBaseUrl('https://user:pass@example.test')).toThrow(
      'URL credentials are not allowed'
    )
    expect(() => normalizeHermesBaseUrl('http://hermes.example.test/v1')).toThrow(
      'Plain HTTP is allowed only for a loopback SSH tunnel'
    )
  })

  it('trims raw keys and adds exactly one Bearer prefix', () => {
    expect(normalizeHermesApiKey('  Bearer Bearer raw-key\r\n')).toBe('raw-key')
    expect(buildHermesAuthorizationHeaders('  Bearer raw-key\n')).toEqual({
      Authorization: 'Bearer raw-key'
    })
  })

  it('compares canonical destinations', () => {
    expect(sameHermesDestination(`${baseUrl}/`, `${baseUrl}/v1/`)).toBe(true)
    expect(sameHermesDestination(baseUrl, 'http://127.0.0.1:9/v1')).toBe(false)
  })
})

describe('Hermes connection checks', () => {
  it('requires GET models followed by a non-streaming chat completion', async () => {
    const requests: { method: string; path: string; authorization: string; body: string }[] = []
    handler = async (request, response) => {
      const body = request.method === 'POST' ? await readBody(request) : ''
      requests.push({
        method: request.method ?? '',
        path: request.url ?? '',
        authorization: request.headers.authorization ?? '',
        body
      })
      defaultHandlerFromBody(request, response, body)
    }

    const result = await new HermesClient().test({
      ...config(),
      apiKey: '  Bearer raw-key\n'
    })

    expect(result).toMatchObject({ ok: true, status: 'online', model: 'hermes-agent' })
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'GET /v1/models',
      'POST /v1/chat/completions'
    ])
    expect(requests.every(({ authorization }) => authorization === 'Bearer raw-key')).toBe(true)
    expect(JSON.parse(requests[1]?.body ?? '{}')).toMatchObject({
      model: 'hermes-agent',
      stream: false
    })
    expect(JSON.stringify(result)).not.toContain('raw-key')
  })

  it('fails before chat when the selected model is unavailable', async () => {
    let chatRequests = 0
    handler = (request, response) => {
      if (request.method === 'GET') {
        json(response, 200, { data: [{ id: 'different-model' }] })
        return Promise.resolve()
      }
      chatRequests += 1
      json(response, 200, completion('ONLINE'))
      return Promise.resolve()
    }

    const result = await new HermesClient().test(config())

    expect(result).toMatchObject({
      ok: false,
      status: 'response-error',
      diagnostics: { errorCategory: 'model' }
    })
    expect(chatRequests).toBe(0)
  })

  it('reports chat failure even when models remains reachable', async () => {
    handler = async (request, response) => {
      if (request.method === 'GET') return json(response, 200, models())
      await readBody(request)
      return json(response, 500, { error: { message: 'sensitive server text' } })
    }

    const result = await new HermesClient().test(config())

    expect(result).toMatchObject({
      ok: false,
      status: 'server-error',
      diagnostics: {
        phase: 'chat-test',
        httpStatus: 500,
        errorCategory: 'server'
      }
    })
    expect(result.message).toContain('Models endpoint tetap dapat dijangkau')
    expect(JSON.stringify(result)).not.toContain('sensitive server text')
  })

  it('classifies a model rejection during connection test separately', async () => {
    handler = async (request, response) => {
      if (request.method === 'GET') return json(response, 200, models())
      await readBody(request)
      json(response, 400, { error: { message: 'unknown model hermes-agent' } })
    }
    const result = await new HermesClient().test(config())

    expect(result).toMatchObject({
      ok: false,
      status: 'response-error',
      diagnostics: {
        phase: 'chat-test',
        httpStatus: 400,
        errorCategory: 'model'
      }
    })
  })

  it('never exposes an echoed API key in diagnostics', async () => {
    const secret = 'unique-hermes-secret'
    handler = (_request, response) => {
      json(response, 401, { error: { message: secret }, reflected: secret })
      return Promise.resolve()
    }

    const result = await new HermesClient().test({ ...config(), apiKey: secret })

    expect(result.status).toBe('authentication-error')
    expect(JSON.stringify(result)).not.toContain(secret)
  })

  it('rejects HTTP 200 when chat content is empty', async () => {
    handler = async (request, response) => {
      if (request.method === 'GET') {
        json(response, 200, models())
        return
      }
      await readBody(request)
      json(response, 200, { choices: [{ message: { role: 'assistant', content: '' } }] })
    }

    const result = await new HermesClient().test(config())

    expect(result).toMatchObject({
      ok: false,
      status: 'response-error',
      diagnostics: { phase: 'chat-test', httpStatus: 200, errorCategory: 'response' }
    })
  })

  it('reports a stopped loopback tunnel as offline without throwing', async () => {
    const stoppedUrl = await closedLoopbackUrl()

    const result = await new HermesClient().test({
      ...config(),
      baseUrl: stoppedUrl,
      timeoutMs: 500
    })

    expect(result).toMatchObject({
      ok: false,
      status: 'offline',
      diagnostics: { phase: 'models', errorCategory: 'connection', httpStatus: null }
    })
    expect(result.message).toContain('SSH tunnel tidak aktif')
  })
})

describe('Hermes runtime response handling', () => {
  it('handles a non-streaming response', async () => {
    const deltas: string[] = []
    const result = await new HermesClient().stream(
      { ...config(), streaming: false },
      [{ role: 'user', content: 'hello' }],
      new AbortController().signal,
      (delta) => deltas.push(delta)
    )

    expect(result).toMatchObject({ displayText: 'ONLINE', transport: 'json' })
    expect(deltas).toEqual(['ONLINE'])
  })

  it('parses CRLF split across chunks and completes at DONE without waiting for socket close', async () => {
    handler = async (request, response) => {
      await readBody(request)
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'ON' } }] })}\r`)
      await wait(10)
      response.write('\n\r')
      await wait(10)
      response.write('\n')
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'LINE' } }] })}\r\n\r`)
      await wait(10)
      response.write('\n')
      response.write('data: [DONE]\r\n\r\n')
      // Intentionally keep the socket open. The client must stop at [DONE].
    }

    const result = await new HermesClient().stream(
      config(),
      [{ role: 'user', content: 'hello' }],
      new AbortController().signal,
      () => undefined
    )

    expect(result).toMatchObject({ displayText: 'ONLINE', transport: 'sse' })
  })

  it('withholds a yachiyo control envelope whose closing tag is split across SSE content chunks', async () => {
    handler = async (request, response) => {
      await readBody(request)
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      const contentChunks = [
        'Jawaban dari Hermes.',
        '<yachi',
        'yo_control>{"emotion":"happy","motion":"nod","importance":"normal",',
        '"requires_response":false,"command":"ignored"}</yachiyo_',
        'control>'
      ]
      for (const content of contentChunks) {
        response.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`)
      }
      response.end('data: [DONE]\n\n')
    }

    const deltas: string[] = []
    const result = await new HermesClient().stream(
      config(),
      [{ role: 'user', content: 'hello' }],
      new AbortController().signal,
      (delta) => deltas.push(delta)
    )

    expect(deltas).toEqual(['Jawaban dari Hermes.'])
    expect(deltas.join('')).not.toContain('yachiyo_control')
    expect(result).toMatchObject({
      displayText: 'Jawaban dari Hermes.',
      metadata: {
        emotion: 'happy',
        motion: 'nod',
        importance: 'normal',
        requiresResponse: false
      },
      transport: 'sse'
    })
    expect(JSON.stringify(result.metadata)).not.toContain('command')
  })

  it('sanitizes yachiyo control envelopes in non-streaming completions', async () => {
    handler = async (request, response) => {
      await readBody(request)
      json(
        response,
        200,
        completion(
          'Jawaban tetap terlihat.<yachiyo_control>{"emotion":"concerned"}</yachiyo_control>'
        )
      )
    }

    const deltas: string[] = []
    const result = await new HermesClient().stream(
      { ...config(), streaming: false },
      [{ role: 'user', content: 'hello' }],
      new AbortController().signal,
      (delta) => deltas.push(delta)
    )

    expect(deltas).toEqual(['Jawaban tetap terlihat.'])
    expect(result.displayText).toBe('Jawaban tetap terlihat.')
    expect(result.metadata).toEqual({ emotion: 'concerned' })
  })

  it('keeps error partial text clean when a stream fails inside an envelope', async () => {
    handler = async (request, response) => {
      await readBody(request)
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      response.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'Jawaban parsial.' } }] })}\n\n`
      )
      response.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content: '<yachiyo_control>{"emotion":"happy"}' } }] })}\n\n`
      )
      response.end('data: {broken}\n\n')
    }

    const deltas: string[] = []
    const pending = new HermesClient().stream(
      config(),
      [{ role: 'user', content: 'hello' }],
      new AbortController().signal,
      (delta) => deltas.push(delta)
    )

    await expect(pending).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof HermesRequestError &&
        error.normalized.code === 'MALFORMED_STREAM' &&
        error.partialText === 'Jawaban parsial.'
    )
    expect(deltas).toEqual(['Jawaban parsial.'])
  })

  it('falls back once to non-streaming when SSE parsing fails before any delta', async () => {
    const streamFlags: boolean[] = []
    handler = async (request, response) => {
      const body = JSON.parse(await readBody(request)) as { stream?: boolean }
      streamFlags.push(Boolean(body.stream))
      if (body.stream) {
        response.writeHead(200, { 'Content-Type': 'text/event-stream' })
        response.end('data: {broken}\n\n')
        return
      }
      json(response, 200, completion('ONLINE'))
    }

    const result = await new HermesClient().stream(
      config(),
      [{ role: 'user', content: 'hello' }],
      new AbortController().signal,
      () => undefined
    )

    expect(streamFlags).toEqual([true, false])
    expect(result).toMatchObject({ displayText: 'ONLINE', transport: 'json-fallback' })
  })

  it('falls back to non-streaming when a streaming response has the wrong content type', async () => {
    const streamFlags: boolean[] = []
    handler = async (request, response) => {
      const body = JSON.parse(await readBody(request)) as { stream?: boolean }
      streamFlags.push(Boolean(body.stream))
      if (body.stream) {
        response.writeHead(200, { 'Content-Type': 'text/plain' })
        response.end('not-json')
        return
      }
      json(response, 200, completion('ONLINE'))
    }

    const result = await new HermesClient().stream(
      config(),
      [{ role: 'user', content: 'hello' }],
      new AbortController().signal,
      () => undefined
    )

    expect(streamFlags).toEqual([true, false])
    expect(result.transport).toBe('json-fallback')
  })

  it('retries a retryable runtime failure exactly as configured', async () => {
    let attempts = 0
    handler = async (request, response) => {
      await readBody(request)
      attempts += 1
      if (attempts === 1) {
        json(response, 500, { error: 'temporary' })
        return
      }
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      response.end(
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'ONLINE' } }] })}\n\ndata: [DONE]\n\n`
      )
    }

    const deltas: string[] = []
    const result = await new HermesClient().stream(
      { ...config(), retryCount: 1 },
      [{ role: 'user', content: 'hello' }],
      new AbortController().signal,
      (delta) => deltas.push(delta)
    )

    expect(attempts).toBe(2)
    expect(deltas).toEqual(['ONLINE'])
    expect(result.displayText).toBe('ONLINE')
  })

  it('keeps the deadline active while an SSE body is stalled', async () => {
    handler = async (request, response) => {
      await readBody(request)
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      response.flushHeaders()
    }

    const pending = new HermesClient().stream(
      { ...config(), timeoutMs: 80, retryCount: 0 },
      [{ role: 'user', content: 'hello' }],
      new AbortController().signal,
      () => undefined
    )

    await expect(pending).rejects.toSatisfy(
      (error: unknown) => error instanceof HermesRequestError && error.normalized.code === 'TIMEOUT'
    )
  })

  it('classifies invalid non-stream JSON as a response error, not offline', async () => {
    handler = async (request, response) => {
      await readBody(request)
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end('{broken')
    }

    const pending = new HermesClient().stream(
      { ...config(), streaming: false },
      [{ role: 'user', content: 'hello' }],
      new AbortController().signal,
      () => undefined
    )

    await expect(pending).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof HermesRequestError &&
        error.normalized.code === 'MALFORMED_RESPONSE' &&
        error.normalized.category === 'response'
    )
  })

  it('classifies a rejected runtime model separately from server connectivity', async () => {
    handler = async (request, response) => {
      await readBody(request)
      json(response, 400, { error: { message: 'unknown model hermes-agent' } })
    }

    const pending = new HermesClient().stream(
      { ...config(), retryCount: 0 },
      [{ role: 'user', content: 'hello' }],
      new AbortController().signal,
      () => undefined
    )

    await expect(pending).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof HermesRequestError &&
        error.normalized.code === 'MODEL' &&
        error.normalized.category === 'model' &&
        error.normalized.httpStatus === 400
    )
  })
})

function config(): HermesConfig {
  return {
    baseUrl,
    apiKey: 'raw-key',
    model: 'hermes-agent',
    timeoutMs: 2_000,
    streaming: true,
    retryCount: 0,
    sessionId: 'vitest'
  }
}

async function defaultHandler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = request.method === 'POST' ? await readBody(request) : ''
  defaultHandlerFromBody(request, response, body)
}

function defaultHandlerFromBody(
  request: IncomingMessage,
  response: ServerResponse,
  body: string
): void {
  if (request.headers.authorization !== 'Bearer raw-key') {
    json(response, 401, { error: 'unauthorized' })
    return
  }
  if (request.method === 'GET' && request.url === '/v1/models') {
    json(response, 200, models())
    return
  }
  const payload = JSON.parse(body) as { stream?: boolean }
  if (payload.stream === false) {
    json(response, 200, completion('ONLINE'))
    return
  }
  response.writeHead(200, { 'Content-Type': 'text/event-stream' })
  response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'ONLINE' } }] })}\n\n`)
  response.end('data: [DONE]\n\n')
}

function models(): unknown {
  return { object: 'list', data: [{ id: 'hermes-agent', object: 'model' }] }
}

function completion(content: string): unknown {
  return { choices: [{ message: { role: 'assistant', content } }] }
}

function json(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  })
  response.end(payload)
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array))
  return Buffer.concat(chunks).toString('utf8')
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))
}

async function closedLoopbackUrl(): Promise<string> {
  const temporary = createServer()
  await new Promise<void>((resolvePromise, reject) => {
    temporary.once('error', reject)
    temporary.listen(0, '127.0.0.1', resolvePromise)
  })
  const address = temporary.address()
  if (!address || typeof address === 'string') throw new Error('Temporary port unavailable')
  const url = `http://127.0.0.1:${String(address.port)}`
  await new Promise<void>((resolvePromise) => temporary.close(() => resolvePromise()))
  return url
}
