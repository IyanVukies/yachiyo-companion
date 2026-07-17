import { describe, expect, it, vi } from 'vitest'

import { HermesRequestError, type HermesConfig } from '../../src/main/services/hermes-client'
import { HermesRuntime } from '../../src/main/services/hermes-runtime'
import { defaultSettings, type Settings } from '../../src/shared/schemas'
import type {
  ConnectionTestResult,
  HermesConnectionDiagnostics,
  NormalizedError
} from '../../src/shared/types'

describe('Hermes runtime configuration and status', () => {
  it('reconnects persisted Hermes settings on startup and publishes online', async () => {
    const fixture = runtimeFixture()
    fixture.settings.connection = {
      ...fixture.settings.connection,
      mode: 'hermes',
      baseUrl: 'http://127.0.0.1:20129/v1/',
      model: 'hermes-agent',
      timeoutMs: 15_000,
      retryCount: 2,
      streaming: true
    }
    fixture.vault.value = 'saved-key'
    const states: string[] = []
    fixture.runtime.onStatus(({ state }) => states.push(state))

    await fixture.runtime.start()
    fixture.runtime.stop()

    expect(fixture.client.test).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'http://127.0.0.1:20129/v1/',
        apiKey: 'saved-key',
        model: 'hermes-agent',
        timeoutMs: 15_000,
        retryCount: 2,
        streaming: true
      }),
      'hermes'
    )
    expect(states).toEqual(['checking', 'online'])
    expect(fixture.runtime.getStatus().state).toBe('online')
    expect(fixture.settings.connection.mode).toBe('hermes')
  })

  it('reuses a saved key only for the same normalized destination', async () => {
    const fixture = runtimeFixture()
    fixture.settings.connection = {
      ...fixture.settings.connection,
      mode: 'hermes',
      baseUrl: 'http://127.0.0.1:20129/v1'
    }
    fixture.vault.value = 'saved-key'

    await fixture.runtime.testDraft({
      mode: 'hermes',
      baseUrl: 'http://127.0.0.1:20129/',
      model: 'hermes-agent',
      timeoutMs: 30_000
    })
    await fixture.runtime.testDraft({
      mode: 'hermes',
      baseUrl: 'http://127.0.0.1:29999/v1',
      model: 'hermes-agent',
      timeoutMs: 30_000
    })

    expect(fixture.client.test.mock.calls[0]?.[0]).toMatchObject({ apiKey: 'saved-key' })
    expect(fixture.client.test.mock.calls[1]?.[0]).toMatchObject({ apiKey: '' })
  })

  it('reads freshly saved config for chat without restarting and never uses mock in Hermes mode', async () => {
    const fixture = runtimeFixture()
    fixture.settings.connection = {
      ...fixture.settings.connection,
      mode: 'hermes',
      baseUrl: 'http://127.0.0.1:20129/v1',
      model: 'hermes-agent',
      timeoutMs: 60_000,
      retryCount: 2,
      streaming: false
    }
    fixture.vault.value = 'fresh-key'

    await fixture.runtime.settingsChanged()
    const result = await fixture.runtime.stream(
      [{ role: 'user', content: 'hello' }],
      new AbortController().signal,
      () => undefined
    )

    expect(result.displayText).toBe('REAL HERMES')
    expect(fixture.client.stream).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'http://127.0.0.1:20129/v1',
        apiKey: 'fresh-key',
        model: 'hermes-agent',
        timeoutMs: 60_000,
        retryCount: 2,
        streaming: false
      }),
      expect.any(Array),
      expect.any(AbortSignal),
      expect.any(Function)
    )
    expect(fixture.runtime.getStatus().state).toBe('online')
  })

  it('switches between mock and Hermes without mutating the saved mode', async () => {
    const fixture = runtimeFixture()

    await fixture.runtime.stream(
      [{ role: 'user', content: 'mock' }],
      new AbortController().signal,
      () => undefined
    )
    expect(fixture.client.stream.mock.calls[0]?.[0]).toMatchObject({
      baseUrl: 'http://127.0.0.1:8642',
      model: 'yachiyo-mock'
    })

    fixture.settings.connection = {
      ...fixture.settings.connection,
      mode: 'hermes',
      baseUrl: 'http://127.0.0.1:20129/v1',
      model: 'hermes-agent'
    }
    fixture.vault.value = 'saved-key'
    await fixture.runtime.settingsChanged()
    await fixture.runtime.stream(
      [{ role: 'user', content: 'real' }],
      new AbortController().signal,
      () => undefined
    )

    expect(fixture.client.stream.mock.calls[1]?.[0]).toMatchObject({
      baseUrl: 'http://127.0.0.1:20129/v1',
      model: 'hermes-agent'
    })
    fixture.settings.connection.mode = 'mock'
    await fixture.runtime.settingsChanged()
    await fixture.runtime.stream(
      [{ role: 'user', content: 'mock again' }],
      new AbortController().signal,
      () => undefined
    )

    expect(fixture.client.stream.mock.calls[2]?.[0]).toMatchObject({
      baseUrl: 'http://127.0.0.1:8642',
      model: 'yachiyo-mock'
    })
    expect(fixture.runtime.getStatus().state).toBe('mock')
    expect(fixture.settings.connection.mode).toBe('mock')
  })

  it('restores the prior state after a user cancels an active chat', async () => {
    const fixture = runtimeFixture()
    fixture.settings.connection = {
      ...fixture.settings.connection,
      mode: 'hermes',
      baseUrl: 'http://127.0.0.1:20129/v1',
      model: 'hermes-agent'
    }
    await fixture.runtime.reconnect()
    const controller = new AbortController()
    const cancelledResponse = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => reject(new Error('cancelled')), {
        once: true
      })
    })
    fixture.client.stream.mockReturnValueOnce(cancelledResponse)

    const response = fixture.runtime.stream(
      [{ role: 'user', content: 'cancel me' }],
      controller.signal,
      () => undefined
    )
    await vi.waitFor(() => expect(fixture.runtime.getStatus().state).toBe('checking'))
    controller.abort()

    await expect(response).rejects.toThrow('cancelled')
    expect(fixture.runtime.getStatus().state).toBe('online')
  })

  it('does not restore checking when chat cancellation supersedes an active check', async () => {
    const fixture = runtimeFixture()
    fixture.settings.connection = {
      ...fixture.settings.connection,
      mode: 'hermes',
      baseUrl: 'http://127.0.0.1:20129/v1',
      model: 'hermes-agent'
    }
    let finishCheck: ((result: ConnectionTestResult) => void) | undefined
    fixture.client.test.mockReturnValueOnce(
      new Promise<ConnectionTestResult>((resolve) => {
        finishCheck = resolve
      })
    )
    const check = fixture.runtime.reconnect()
    await vi.waitFor(() => expect(fixture.runtime.getStatus().state).toBe('checking'))

    const controller = new AbortController()
    const cancelledResponse = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => reject(new Error('cancelled')), {
        once: true
      })
    })
    fixture.client.stream.mockReturnValueOnce(cancelledResponse)
    const chat = fixture.runtime.stream(
      [{ role: 'user', content: 'cancel overlapping chat' }],
      controller.signal,
      () => undefined
    )
    await vi.waitFor(() => expect(fixture.client.stream).toHaveBeenCalledTimes(1))
    controller.abort()

    await expect(chat).rejects.toThrow('cancelled')
    expect(fixture.runtime.getStatus().state).toBe('idle')
    finishCheck?.(connectionResult('online', true, 'none', fixture.settings.connection.baseUrl))
    await check
    expect(fixture.runtime.getStatus().state).toBe('idle')
  })

  it('marks a disconnected tunnel offline without deleting configuration', async () => {
    const fixture = runtimeFixture()
    fixture.settings.connection = {
      ...fixture.settings.connection,
      mode: 'hermes',
      baseUrl: 'http://127.0.0.1:20129/v1',
      model: 'hermes-agent'
    }
    fixture.client.test.mockResolvedValueOnce(
      connectionResult('offline', false, 'connection', fixture.settings.connection.baseUrl)
    )

    await fixture.runtime.reconnect()

    expect(fixture.runtime.getStatus()).toMatchObject({
      state: 'offline',
      diagnostics: { errorCategory: 'connection' }
    })
    expect(fixture.settings.connection).toMatchObject({
      mode: 'hermes',
      baseUrl: 'http://127.0.0.1:20129/v1',
      model: 'hermes-agent'
    })
  })

  it.each([
    ['AUTH', 'authentication-error'],
    ['TIMEOUT', 'timeout'],
    ['SERVER', 'server-error'],
    ['MALFORMED_STREAM', 'response-error']
  ] as const)('maps %s runtime errors to %s', async (code, expectedState) => {
    const fixture = runtimeFixture()
    fixture.settings.connection = {
      ...fixture.settings.connection,
      mode: 'hermes',
      baseUrl: 'http://127.0.0.1:20129/v1',
      model: 'hermes-agent'
    }
    fixture.client.stream.mockRejectedValueOnce(new HermesRequestError(normalizedError(code)))

    await expect(
      fixture.runtime.stream(
        [{ role: 'user', content: 'hello' }],
        new AbortController().signal,
        () => undefined
      )
    ).rejects.toBeInstanceOf(HermesRequestError)
    expect(fixture.runtime.getStatus().state).toBe(expectedState)
  })

  it('detects a tunnel drop during lightweight monitoring', async () => {
    vi.useFakeTimers()
    const fixture = runtimeFixture(100)
    fixture.settings.connection = {
      ...fixture.settings.connection,
      mode: 'hermes',
      baseUrl: 'http://127.0.0.1:20129/v1',
      model: 'hermes-agent'
    }
    fixture.client.probe.mockResolvedValueOnce(
      connectionResult('offline', false, 'connection', fixture.settings.connection.baseUrl)
    )
    try {
      await fixture.runtime.start()
      expect(fixture.runtime.getStatus().state).toBe('online')

      await vi.advanceTimersByTimeAsync(100)

      expect(fixture.client.probe).toHaveBeenCalledTimes(1)
      expect(fixture.runtime.getStatus().state).toBe('offline')
    } finally {
      fixture.runtime.stop()
      vi.useRealTimers()
    }
  })

  it('logs only a safe provider marker and never the API key or messages', async () => {
    const fixture = runtimeFixture()
    fixture.settings.connection = {
      ...fixture.settings.connection,
      mode: 'hermes',
      baseUrl: 'http://127.0.0.1:20129/v1',
      model: 'hermes-agent'
    }
    fixture.vault.value = 'never-log-this-key'

    await fixture.runtime.stream(
      [{ role: 'user', content: 'private message' }],
      new AbortController().signal,
      () => undefined
    )

    const logPayload = JSON.stringify(fixture.logger.info.mock.calls)
    expect(logPayload).toContain('provider')
    expect(logPayload).toContain('/v1/chat/completions')
    expect(logPayload).not.toContain('never-log-this-key')
    expect(logPayload).not.toContain('private message')
  })
})

function runtimeFixture(monitorIntervalMs = 60_000): {
  runtime: HermesRuntime
  settings: Settings
  vault: { value: string | null; get: ReturnType<typeof vi.fn> }
  client: {
    test: ReturnType<typeof vi.fn>
    probe: ReturnType<typeof vi.fn>
    stream: ReturnType<typeof vi.fn>
  }
  logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> }
} {
  const settings = structuredClone(defaultSettings)
  const vault = {
    value: null as string | null,
    get: vi.fn(() => Promise.resolve(vault.value))
  }
  const client = {
    test: vi.fn((config: HermesConfig, mode: 'mock' | 'hermes') =>
      Promise.resolve(connectionResult('online', true, 'none', config.baseUrl, mode))
    ),
    probe: vi.fn((config: HermesConfig, mode: 'mock' | 'hermes') =>
      Promise.resolve(connectionResult('online', true, 'none', config.baseUrl, mode))
    ),
    stream: vi.fn(() =>
      Promise.resolve({
        rawText: 'REAL HERMES',
        displayText: 'REAL HERMES',
        metadata: null,
        transport: 'json'
      })
    )
  }
  const logger = { info: vi.fn(), warn: vi.fn() }
  const runtime = new HermesRuntime({
    settingsStore: {
      get: () => structuredClone(settings),
      getHermesSnapshot: () =>
        Promise.resolve({ settings: structuredClone(settings), apiKey: vault.value ?? '' })
    },
    mockServer: {
      config: {
        baseUrl: 'http://127.0.0.1:8642',
        apiKey: 'mock-key',
        model: 'yachiyo-mock'
      }
    },
    hermesClient: client,
    logger,
    monitorIntervalMs
  } as never)
  return { runtime, settings, vault, client, logger }
}

function connectionResult(
  status: ConnectionTestResult['status'],
  ok: boolean,
  category: HermesConnectionDiagnostics['errorCategory'],
  baseUrl: string,
  mode: 'mock' | 'hermes' = 'hermes'
): ConnectionTestResult {
  return {
    ok,
    status,
    message: ok ? 'online' : 'offline',
    model: ok ? 'hermes-agent' : null,
    warning: null,
    diagnostics: {
      mode,
      phase: 'chat-test',
      normalizedBaseUrl: baseUrl,
      modelsEndpoint: `${baseUrl.replace(/\/$/, '')}/models`,
      chatEndpoint: `${baseUrl.replace(/\/$/, '')}/chat/completions`,
      activeEndpoint: `${baseUrl.replace(/\/$/, '')}/chat/completions`,
      selectedModel: 'hermes-agent',
      httpStatus: ok ? 200 : null,
      errorCategory: category,
      timeoutMs: 30_000,
      responseSummary: null,
      checkedAt: '2026-07-17T00:00:00.000Z'
    }
  }
}

function normalizedError(code: NormalizedError['code']): NormalizedError {
  const category =
    code === 'AUTH'
      ? 'authentication'
      : code === 'TIMEOUT'
        ? 'timeout'
        : code === 'SERVER'
          ? 'server'
          : 'stream'
  return {
    code,
    title: 'failure',
    message: 'failure',
    dataSafe: true,
    availableFeatures: [],
    nextAction: 'retry',
    retryable: false,
    category,
    httpStatus: code === 'SERVER' ? 500 : null,
    endpoint: 'http://127.0.0.1:20129/v1/chat/completions',
    responseSummary: null
  }
}
