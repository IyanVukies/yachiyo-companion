import type { Settings } from '../../shared/schemas'
import type {
  ConnectionTestResult,
  HermesConnectionDiagnostics,
  HermesConnectionState,
  HermesConnectionStatus,
  NormalizedError
} from '../../shared/types'
import {
  HermesClient,
  HermesRequestError,
  buildEndpoint,
  normalizeHermesApiKey,
  normalizeHermesBaseUrl,
  sameHermesDestination,
  type HermesConfig,
  type HermesMessage,
  type StreamResult
} from './hermes-client'
import type { AppLogger } from './logger'
import type { MockHermesServer } from './mock-hermes-server'
import type { SettingsStore } from './settings-store'

type Dependencies = {
  settingsStore: Pick<SettingsStore, 'get' | 'getHermesSnapshot'>
  mockServer: Pick<MockHermesServer, 'config'>
  hermesClient: Pick<HermesClient, 'test' | 'probe' | 'stream'>
  logger: Pick<AppLogger, 'info' | 'warn'>
  monitorIntervalMs?: number
}

type ConnectionTestInput = {
  mode: 'mock' | 'hermes'
  baseUrl: string
  model: string
  timeoutMs: number
  apiKey?: string | undefined
}

const DEFAULT_MONITOR_INTERVAL_MS = 30_000

export class HermesRuntime {
  private status: HermesConnectionStatus
  private listeners = new Set<(status: HermesConnectionStatus) => void>()
  private monitorTimer: ReturnType<typeof setInterval> | null = null
  private monitorRunning = false
  private generation = 0

  constructor(private readonly dependencies: Dependencies) {
    const settings = dependencies.settingsStore.get()
    this.status = initialStatus(settings, dependencies.mockServer)
  }

  getStatus(): HermesConnectionStatus {
    return structuredClone(this.status)
  }

  onStatus(listener: (status: HermesConnectionStatus) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async start(): Promise<void> {
    if (!this.monitorTimer) {
      const interval = this.dependencies.monitorIntervalMs ?? DEFAULT_MONITOR_INTERVAL_MS
      this.monitorTimer = setInterval(() => void this.monitor(), interval)
      this.monitorTimer.unref()
    }
    await this.settingsChanged()
  }

  stop(): void {
    this.generation += 1
    if (this.monitorTimer) clearInterval(this.monitorTimer)
    this.monitorTimer = null
    this.listeners.clear()
  }

  async settingsChanged(): Promise<void> {
    const settings = this.dependencies.settingsStore.get()
    if (settings.connection.mode === 'mock') {
      this.generation += 1
      this.publish(mockStatus(settings, this.dependencies.mockServer))
      return
    }
    await this.reconnect()
  }

  async reconnect(): Promise<ConnectionTestResult | null> {
    const snapshot = await this.dependencies.settingsStore.getHermesSnapshot()
    const settings = snapshot.settings
    if (settings.connection.mode === 'mock') {
      this.generation += 1
      this.publish(mockStatus(settings, this.dependencies.mockServer))
      return null
    }
    const config = configFromSettings(settings, normalizeHermesApiKey(snapshot.apiKey))
    return this.runConnectionCheck(config, 'hermes', true)
  }

  async testDraft(input: ConnectionTestInput): Promise<ConnectionTestResult> {
    if (input.mode === 'mock') {
      const config = mockConfig(this.dependencies.mockServer, input.timeoutMs)
      const active = this.dependencies.settingsStore.get().connection.mode === 'mock'
      return this.withActivationWarning(await this.runConnectionCheck(config, 'mock', true), active)
    }

    const enteredKey = normalizeHermesApiKey(input.apiKey ?? '')
    const savedSnapshot = await this.dependencies.settingsStore.getHermesSnapshot()
    const savedSettings = savedSnapshot.settings
    const mayReuseSavedKey = sameHermesDestination(input.baseUrl, savedSettings.connection.baseUrl)
    const savedKey = !enteredKey && mayReuseSavedKey ? savedSnapshot.apiKey : ''
    const active =
      savedSettings.connection.mode === 'hermes' &&
      mayReuseSavedKey &&
      savedSettings.connection.model === input.model &&
      (!enteredKey || enteredKey === normalizeHermesApiKey(savedSnapshot.apiKey))
    const config: HermesConfig = {
      baseUrl: input.baseUrl,
      apiKey: enteredKey || normalizeHermesApiKey(savedKey),
      model: input.model,
      timeoutMs: input.timeoutMs,
      streaming: false,
      retryCount: 0,
      sessionId: savedSettings.connection.sessionId
    }
    return this.withActivationWarning(await this.runConnectionCheck(config, 'hermes', true), active)
  }

  async stream(
    messages: HermesMessage[],
    signal: AbortSignal,
    onDelta: (text: string) => void
  ): Promise<StreamResult> {
    const snapshot = await this.dependencies.settingsStore.getHermesSnapshot()
    const settings = snapshot.settings
    const config =
      settings.connection.mode === 'mock'
        ? mockConfig(this.dependencies.mockServer, settings.connection.timeoutMs, settings)
        : configFromSettings(settings, normalizeHermesApiKey(snapshot.apiKey))
    if (settings.connection.mode === 'mock') {
      this.publish(mockStatus(settings, this.dependencies.mockServer))
      return this.dependencies.hermesClient.stream(config, messages, signal, onDelta)
    }

    const previousStatus = this.getStatus()
    const generation = ++this.generation
    const pending = diagnosticsFor(config, 'hermes', 'chat-runtime', 'chat/completions')
    this.publish({ state: 'checking', message: 'Menghubungi Hermes...', diagnostics: pending })
    this.dependencies.logger.info('Hermes runtime request.', {
      provider: 'hermes',
      model: config.model,
      endpoint: '/v1/chat/completions',
      streaming: config.streaming
    })

    try {
      const result = await this.dependencies.hermesClient.stream(config, messages, signal, onDelta)
      if (generation === this.generation) {
        this.publish({
          state: 'online',
          message: 'Hermes online dan chat runtime aktif.',
          diagnostics: {
            ...pending,
            httpStatus: 200,
            errorCategory: 'none',
            responseSummary: `chatContent=true; transport=${result.transport}`,
            checkedAt: new Date().toISOString()
          }
        })
      }
      return result
    } catch (error) {
      if (generation === this.generation) {
        if (signal.aborted) {
          this.publish(
            previousStatus.state === 'checking' ? cancelledCheckStatus(config) : previousStatus
          )
        } else {
          const failure = runtimeFailureStatus(config, error)
          this.publish(failure)
          this.dependencies.logger.warn('Hermes runtime request gagal.', {
            provider: 'hermes',
            model: config.model,
            endpoint: '/v1/chat/completions',
            errorCategory: failure.diagnostics.errorCategory,
            httpStatus: failure.diagnostics.httpStatus
          })
        }
      }
      throw error
    }
  }

  private async runConnectionCheck(
    config: HermesConfig,
    mode: 'mock' | 'hermes',
    full: boolean,
    publishStatus = true,
    announce = publishStatus
  ): Promise<ConnectionTestResult> {
    const generation = publishStatus ? ++this.generation : this.generation
    const pending = diagnosticsFor(config, mode, 'models', 'models')
    if (publishStatus && announce) {
      this.publish({
        state: mode === 'mock' ? 'mock' : 'checking',
        message: mode === 'mock' ? 'Memeriksa mock lokal...' : 'Memeriksa koneksi Hermes...',
        diagnostics: pending
      })
    }
    let result: ConnectionTestResult
    try {
      result = full
        ? await this.dependencies.hermesClient.test(config, mode)
        : await this.dependencies.hermesClient.probe(config, mode)
    } catch {
      result = unexpectedConnectionFailure(config, mode)
    }
    if (publishStatus && generation === this.generation) {
      this.publish({
        state: mode === 'mock' && result.ok ? 'mock' : result.status,
        message: result.message,
        diagnostics: result.diagnostics
      })
    }
    return result
  }

  private withActivationWarning(
    result: ConnectionTestResult,
    active: boolean
  ): ConnectionTestResult {
    if (!result.ok || active) return result
    return {
      ...result,
      warning: result.warning
        ? `${result.warning} Simpan konfigurasi untuk mengaktifkannya pada chat utama.`
        : 'Tes berhasil. Simpan konfigurasi untuk mengaktifkannya pada chat utama.'
    }
  }

  private async monitor(): Promise<void> {
    if (this.monitorRunning || this.status.state === 'checking') return
    const snapshot = await this.dependencies.settingsStore.getHermesSnapshot()
    const settings = snapshot.settings
    if (settings.connection.mode === 'mock') return
    this.monitorRunning = true
    try {
      const config = configFromSettings(settings, normalizeHermesApiKey(snapshot.apiKey))
      const requiresFullCheck = this.status.state !== 'online'
      await this.runConnectionCheck(config, 'hermes', requiresFullCheck, true, requiresFullCheck)
    } catch (error) {
      this.dependencies.logger.warn('Pemantauan Hermes gagal.', {
        errorCategory: error instanceof HermesRequestError ? error.normalized.category : 'response'
      })
    } finally {
      this.monitorRunning = false
    }
  }

  private publish(status: HermesConnectionStatus): void {
    this.status = structuredClone(status)
    for (const listener of this.listeners) listener(this.getStatus())
  }
}

function unexpectedConnectionFailure(
  config: HermesConfig,
  mode: 'mock' | 'hermes'
): ConnectionTestResult {
  const diagnostics = diagnosticsFor(config, mode, 'models', 'models')
  return {
    ok: false,
    status: 'response-error',
    message: 'Pemeriksaan Hermes tidak dapat diselesaikan.',
    model: null,
    warning: null,
    diagnostics: {
      ...diagnostics,
      errorCategory: 'response',
      responseSummary: 'check=unexpected-failure',
      checkedAt: new Date().toISOString()
    }
  }
}

function cancelledCheckStatus(config: HermesConfig): HermesConnectionStatus {
  return {
    state: 'idle',
    message: 'Pemeriksaan Hermes dibatalkan; koneksi akan diperiksa ulang.',
    diagnostics: diagnosticsFor(config, 'hermes', 'idle', null)
  }
}

function initialStatus(
  settings: Settings,
  mockServer: Pick<MockHermesServer, 'config'>
): HermesConnectionStatus {
  if (settings.connection.mode === 'mock') return mockStatus(settings, mockServer)
  const config = configFromSettings(settings, '')
  return {
    state: 'idle',
    message: 'Koneksi Hermes belum diperiksa.',
    diagnostics: diagnosticsFor(config, 'hermes', 'idle', null)
  }
}

function mockStatus(
  settings: Settings,
  mockServer: Pick<MockHermesServer, 'config'>
): HermesConnectionStatus {
  const config = mockConfig(mockServer, settings.connection.timeoutMs, settings)
  return {
    state: 'mock',
    message: 'Mock lokal aktif.',
    diagnostics: diagnosticsFor(config, 'mock', 'idle', null)
  }
}

function mockConfig(
  mockServer: Pick<MockHermesServer, 'config'>,
  timeoutMs: number,
  settings?: Settings
): HermesConfig {
  return {
    ...mockServer.config,
    timeoutMs,
    streaming: settings?.connection.streaming ?? true,
    retryCount: settings?.connection.retryCount ?? 0,
    sessionId: settings?.connection.sessionId ?? 'desktop'
  }
}

function configFromSettings(settings: Settings, apiKey: string): HermesConfig {
  return {
    baseUrl: settings.connection.baseUrl,
    apiKey,
    model: settings.connection.model,
    timeoutMs: settings.connection.timeoutMs,
    streaming: settings.connection.streaming,
    retryCount: settings.connection.retryCount,
    sessionId: settings.connection.sessionId
  }
}

function diagnosticsFor(
  config: Pick<HermesConfig, 'baseUrl' | 'model' | 'timeoutMs'>,
  mode: 'mock' | 'hermes',
  phase: HermesConnectionDiagnostics['phase'],
  activeResource: 'models' | 'chat/completions' | null
): HermesConnectionDiagnostics {
  try {
    const normalizedBaseUrl = normalizeHermesBaseUrl(config.baseUrl).toString()
    const modelsEndpoint = buildEndpoint(config.baseUrl, 'models').toString()
    const chatEndpoint = buildEndpoint(config.baseUrl, 'chat/completions').toString()
    return {
      mode,
      phase,
      normalizedBaseUrl,
      modelsEndpoint,
      chatEndpoint,
      activeEndpoint:
        activeResource === 'models'
          ? modelsEndpoint
          : activeResource === 'chat/completions'
            ? chatEndpoint
            : null,
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

function runtimeFailureStatus(config: HermesConfig, error: unknown): HermesConnectionStatus {
  const normalized =
    error instanceof HermesRequestError ? error.normalized : unknownRuntimeError(config)
  const state = stateFromError(normalized)
  const diagnostics = diagnosticsFor(config, 'hermes', 'chat-runtime', 'chat/completions')
  return {
    state,
    message: normalized.message,
    diagnostics: {
      ...diagnostics,
      activeEndpoint: normalized.endpoint ?? diagnostics.chatEndpoint,
      httpStatus: normalized.httpStatus,
      errorCategory: normalized.category,
      responseSummary: normalized.responseSummary,
      checkedAt: new Date().toISOString()
    }
  }
}

function stateFromError(error: NormalizedError): HermesConnectionState {
  if (error.code === 'AUTH') return 'authentication-error'
  if (error.code === 'TIMEOUT') return 'timeout'
  if (error.code === 'OFFLINE') return 'offline'
  if (error.code === 'SERVER' || error.code === 'RATE_LIMIT') return 'server-error'
  return 'response-error'
}

function unknownRuntimeError(config: HermesConfig): NormalizedError {
  return {
    code: 'UNKNOWN',
    title: 'Respons gagal',
    message: 'Respons Hermes tidak dapat diselesaikan.',
    dataSafe: true,
    availableFeatures: ['Avatar', 'Pengaturan', 'Pengingat lokal', 'Hermes mock'],
    nextAction: 'Coba lagi atau gunakan mode Mock.',
    retryable: true,
    category: 'response',
    httpStatus: null,
    endpoint: safeChatEndpoint(config.baseUrl),
    responseSummary: null
  }
}

function safeChatEndpoint(baseUrl: string): string | null {
  try {
    return buildEndpoint(baseUrl, 'chat/completions').toString()
  } catch {
    return null
  }
}
