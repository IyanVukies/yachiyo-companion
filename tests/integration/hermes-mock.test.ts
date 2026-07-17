import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  HermesClient,
  HermesRequestError,
  buildEndpoint,
  type HermesConfig
} from '../../src/main/services/hermes-client'
import { AppLogger } from '../../src/main/services/logger'
import { MockHermesServer } from '../../src/main/services/mock-hermes-server'

let root: string
let server: MockHermesServer

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'yachiyo-hermes-'))
  server = new MockHermesServer(new AppLogger(join(root, 'mock.log'), 'error'))
  await server.start()
})

afterAll(async () => {
  await server.stop()
  await rm(root, { recursive: true, force: true })
})

describe('Hermes OpenAI-compatible integration', () => {
  it('normalizes base paths without duplicating /v1', () => {
    expect(buildEndpoint('https://example.test', 'models').toString()).toBe(
      'https://example.test/v1/models'
    )
    expect(buildEndpoint('https://example.test/root/v1/', 'models').toString()).toBe(
      'https://example.test/root/v1/models'
    )
    expect(() => buildEndpoint('file:///secret', 'models')).toThrow('Unsupported protocol')
  })

  it('tests connectivity and streams a complete local response', async () => {
    const client = new HermesClient()
    const config = fullConfig()
    const check = await client.test(config)
    const deltas: string[] = []
    const result = await client.stream(
      config,
      [{ role: 'user', content: 'halo dari pengujian' }],
      new AbortController().signal,
      (delta) => deltas.push(delta)
    )

    expect(check).toMatchObject({ ok: true, status: 'online', model: 'yachiyo-mock' })
    expect(check.diagnostics).toMatchObject({
      phase: 'chat-test',
      httpStatus: 200,
      errorCategory: 'none'
    })
    expect(deltas.length).toBeGreaterThan(2)
    expect(result.displayText).toContain('halo dari pengujian')
  })

  it('accepts only allowlisted structured avatar metadata', async () => {
    const result = await new HermesClient().stream(
      fullConfig(),
      [{ role: 'user', content: '/mock json' }],
      new AbortController().signal,
      () => undefined
    )

    expect(result.displayText).toContain('allowlist lokal')
    expect(result.metadata).toEqual({
      emotion: 'happy',
      motion: 'nod',
      importance: 'normal',
      requiresResponse: false
    })
  })

  it.each([
    ['/mock 401', 'AUTH'],
    ['/mock 429', 'RATE_LIMIT'],
    ['/mock 500', 'SERVER'],
    ['/mock malformed', 'MALFORMED_STREAM'],
    ['/mock drop', 'OFFLINE']
  ])('normalizes the %s failure scenario', async (message, code) => {
    const request = new HermesClient().stream(
      fullConfig(),
      [{ role: 'user', content: message }],
      new AbortController().signal,
      () => undefined
    )

    await expect(request).rejects.toSatisfy(
      (error: unknown) => error instanceof HermesRequestError && error.normalized.code === code
    )
  })

  it('reports a rejected key without exposing it', async () => {
    const result = await new HermesClient().test({ ...fullConfig(), apiKey: 'wrong-key' })

    expect(result).toMatchObject({ ok: false, status: 'authentication-error' })
    expect(JSON.stringify(result)).not.toContain('wrong-key')
  })
})

function fullConfig(): HermesConfig {
  return {
    ...server.config,
    timeoutMs: 5_000,
    streaming: true,
    retryCount: 0,
    sessionId: 'vitest'
  }
}
