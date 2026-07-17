import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

import type { AppLogger } from './logger'

type CompletionPayload = {
  stream?: boolean
  model?: string
  messages?: { role?: string; content?: string }[]
}

const MAX_BODY_BYTES = 128 * 1024

export class MockHermesServer {
  private server: Server | null = null
  private token = randomBytes(32).toString('hex')
  private port = 0

  constructor(private readonly logger: AppLogger) {}

  async start(): Promise<void> {
    if (this.server) return
    this.server = createServer((request, response) => {
      void this.handle(request, response).catch((error: unknown) => {
        this.logger.warn('Mock Hermes request gagal.', error)
        if (!response.headersSent)
          json(response, 500, { error: { message: 'Mock internal error' } })
        else response.end()
      })
    })
    await new Promise<void>((resolvePromise, reject) => {
      this.server?.once('error', reject)
      this.server?.listen(0, '127.0.0.1', () => resolvePromise())
    })
    const address = this.server.address()
    if (!address || typeof address === 'string') throw new Error('Port mock Hermes tidak tersedia.')
    this.port = address.port
    this.logger.info('Mock Hermes siap.', { port: this.port })
  }

  async stop(): Promise<void> {
    const current = this.server
    this.server = null
    if (!current) return
    await new Promise<void>((resolvePromise) => current.close(() => resolvePromise()))
  }

  get config(): { baseUrl: string; apiKey: string; model: string } {
    if (!this.port) throw new Error('Mock Hermes belum dimulai.')
    return {
      baseUrl: `http://127.0.0.1:${String(this.port)}`,
      apiKey: this.token,
      model: 'yachiyo-mock'
    }
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.headers.authorization !== `Bearer ${this.token}`) {
      json(response, 401, { error: { message: 'Unauthorized' } })
      return
    }
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (request.method === 'GET' && url.pathname === '/v1/models') {
      json(response, 200, {
        object: 'list',
        data: [{ id: 'yachiyo-mock', object: 'model', owned_by: 'local' }]
      })
      return
    }
    if (request.method !== 'POST' || url.pathname !== '/v1/chat/completions') {
      json(response, 404, { error: { message: 'Not found' } })
      return
    }

    const payload = JSON.parse(await readBody(request)) as CompletionPayload
    const lastMessage = [...(payload.messages ?? [])]
      .reverse()
      .find((message) => message.role === 'user')?.content
    const scenario = scenarioFrom(lastMessage ?? '')

    if (scenario === '401') return json(response, 401, { error: { message: 'Mock auth failed' } })
    if (scenario === '429') return json(response, 429, { error: { message: 'Mock rate limited' } })
    if (scenario === '500') return json(response, 500, { error: { message: 'Mock server error' } })
    if (scenario === 'slow') await delay(1_800)

    const content = responseFor(lastMessage ?? '', scenario)
    if (payload.stream === false) {
      json(response, 200, {
        id: 'mock-completion',
        object: 'chat.completion',
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }]
      })
      return
    }

    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Content-Type-Options': 'nosniff'
    })

    const chunks = tokenize(content)
    for (let index = 0; index < chunks.length; index += 1) {
      if (response.destroyed) return
      const chunk = chunks[index]
      if (chunk === undefined) continue
      if (scenario === 'malformed' && index === 2) response.write('data: {not-json}\n\n')
      response.write(
        `data: ${JSON.stringify({
          id: 'mock-stream',
          choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }]
        })}\n\n`
      )
      if (scenario === 'drop' && index === Math.min(3, chunks.length - 1)) {
        response.destroy()
        return
      }
      await delay(scenario === 'slow' ? 180 : 32)
    }
    response.write('data: [DONE]\n\n')
    response.end()
  }
}

function scenarioFrom(message: string): string {
  const match = /\/mock\s+(401|429|500|slow|drop|malformed|long|json)/.exec(message.toLowerCase())
  return match?.[1] ?? 'normal'
}

function responseFor(message: string, scenario: string): string {
  if (scenario === 'long') {
    return Array.from(
      { length: 18 },
      (_, index) => `Bagian ${String(index + 1)}: mock streaming tetap stabil dan dapat dihentikan.`
    ).join(' ')
  }
  if (scenario === 'json') {
    return JSON.stringify({
      text: 'Semua metadata avatar diproses melalui allowlist lokal. Tidak ada perintah yang dijalankan.',
      emotion: 'happy',
      motion: 'nod',
      importance: 'normal',
      requires_response: false
    })
  }
  const cleaned = message.replace(/\/mock\s+\w+/i, '').trim()
  return cleaned
    ? `Aku menerima pesanmu: “${cleaned}”. Ini respons dari Hermes mock lokal, jadi kamu bisa menguji chat tanpa API key.`
    : 'Hermes mock lokal siap. Kirim pesan apa saja untuk menguji streaming, suara, dan animasi Yachiyo.'
}

function tokenize(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [text]
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk as Uint8Array)
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new Error('Request mock terlalu besar.')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function json(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'X-Content-Type-Options': 'nosniff'
  })
  response.end(payload)
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))
}
