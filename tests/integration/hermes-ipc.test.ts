import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  return {
    handlers,
    setLoginItemSettings: vi.fn(),
    showSaveDialog: vi.fn(),
    clipboardWriteText: vi.fn()
  }
})

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.2.1-test',
    getLoginItemSettings: () => ({ openAtLogin: false }),
    setLoginItemSettings: electron.setLoginItemSettings
  },
  clipboard: { writeText: electron.clipboardWriteText },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: electron.showSaveDialog },
  ipcMain: {
    removeHandler: (channel: string) => electron.handlers.delete(channel),
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      electron.handlers.set(channel, handler)
  },
  shell: { openPath: vi.fn() }
}))

import { registerIpc } from '../../src/main/ipc/register-ipc'
import type { HermesConfig } from '../../src/main/services/hermes-client'
import { AppLogger } from '../../src/main/services/logger'
import type { SecretVault } from '../../src/main/services/secret-vault'
import { SettingsStore } from '../../src/main/services/settings-store'
import { IPC } from '../../src/shared/ipc'
import { defaultSettings, type Settings } from '../../src/shared/schemas'
import type {
  AppStatus,
  AssetStatus,
  ConnectionTestResult,
  OperationResult,
  SettingsView,
  VoiceCapabilities
} from '../../src/shared/types'

const roots: string[] = []
const disposers: (() => void)[] = []

beforeEach(() => {
  electron.handlers.clear()
  electron.setLoginItemSettings.mockReset()
  electron.showSaveDialog.mockReset()
  electron.clipboardWriteText.mockReset()
})

afterEach(async () => {
  for (const dispose of disposers.splice(0)) dispose()
  await Promise.all(
    roots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }))
  )
})

describe('Hermes IPC end-to-end configuration flow', () => {
  it('persists canonical settings and applies them to real runtime chat without restart', async () => {
    const fixture = await ipcFixture()
    const settings = hermesSettings('http://127.0.0.1:20129/v1/')

    const saved = await invoke<SettingsView>(IPC.settingsUpdate, fixture.sender, {
      settings,
      apiKey: '  runtime-key  '
    })
    await vi.waitFor(() => expect(fixture.client.test).toHaveBeenCalledTimes(1))

    expect(saved.connection).toMatchObject({
      mode: 'hermes',
      baseUrl: 'http://127.0.0.1:20129/v1',
      model: 'hermes-agent',
      timeoutMs: 60_000,
      retryCount: 2,
      streaming: true
    })
    expect((await fixture.store.getHermesSnapshot()).apiKey).toBe('runtime-key')

    const started = await invoke<OperationResult>(IPC.chatStart, fixture.sender, {
      requestId: '00000000-0000-4000-8000-000000000301',
      messages: [{ role: 'user', content: 'Balas ONLINE' }]
    })
    expect(started.ok).toBe(true)
    await vi.waitFor(() => expect(fixture.client.stream).toHaveBeenCalledTimes(1))

    const runtimeConfig = fixture.client.stream.mock.calls[0]?.[0] as HermesConfig
    expect(runtimeConfig).toMatchObject({
      baseUrl: 'http://127.0.0.1:20129/v1',
      apiKey: 'runtime-key',
      model: 'hermes-agent',
      timeoutMs: 60_000,
      retryCount: 2,
      streaming: true
    })
    expect(runtimeConfig.baseUrl).not.toContain('8642')
    await vi.waitFor(() =>
      expect(fixture.sender.send).toHaveBeenCalledWith(
        IPC.chatEvent,
        expect.objectContaining({ type: 'done', text: 'REAL HERMES ONLINE' })
      )
    )
    const status = await invoke<AppStatus>(IPC.appStatus, fixture.sender)
    expect(status.connection).toBe('online')

    const persisted = await readFile(fixture.settingsPath, 'utf8')
    expect(persisted).toContain('http://127.0.0.1:20129/v1')
    expect(persisted).not.toContain('runtime-key')
    await vi.waitFor(async () => {
      const log = await readFile(fixture.logPath, 'utf8')
      expect(log).toContain('"provider":"hermes"')
      expect(log).toContain('"endpoint":"/v1/chat/completions"')
      expect(log).not.toContain('runtime-key')
      expect(log).not.toContain('Balas ONLINE')
    })
  })

  it('updates the global badge state immediately after a successful draft test', async () => {
    const fixture = await ipcFixture({
      initialSettings: hermesSettings('http://127.0.0.1:20129/v1'),
      initialKey: 'draft-key'
    })

    const result = await invoke<ConnectionTestResult>(IPC.hermesTest, fixture.sender, {
      mode: 'hermes',
      baseUrl: 'http://127.0.0.1:20129/v1/',
      model: 'hermes-agent',
      timeoutMs: 30_000,
      apiKey: 'draft-key'
    })

    expect(result.status).toBe('online')
    expect((await invoke<AppStatus>(IPC.appStatus, fixture.sender)).connection).toBe('online')
    expect(fixture.sender.send).toHaveBeenCalledWith(
      IPC.hermesStatus,
      expect.objectContaining({ state: 'online' })
    )
  })

  it('publishes a successful unsaved Hermes draft while warning that chat still needs Save', async () => {
    const fixture = await ipcFixture()

    const result = await invoke<ConnectionTestResult>(IPC.hermesTest, fixture.sender, {
      mode: 'hermes',
      baseUrl: 'http://127.0.0.1:20129/v1',
      model: 'hermes-agent',
      timeoutMs: 30_000,
      apiKey: 'draft-key'
    })

    expect(result.ok).toBe(true)
    expect(result.warning).toContain('Simpan konfigurasi')
    expect((await invoke<AppStatus>(IPC.appStatus, fixture.sender)).connection).toBe('online')
    expect(fixture.sender.send).toHaveBeenCalledWith(
      IPC.hermesStatus,
      expect.objectContaining({ state: 'online' })
    )
  })

  it('requires key re-entry before a saved bearer can move to another destination', async () => {
    const fixture = await ipcFixture()
    await invoke(IPC.settingsUpdate, fixture.sender, {
      settings: hermesSettings('http://127.0.0.1:20129/v1'),
      apiKey: 'saved-key'
    })

    await expect(
      invoke(IPC.settingsUpdate, fixture.sender, {
        settings: hermesSettings('http://127.0.0.1:29999/v1')
      })
    ).rejects.toThrow('Masukkan ulang API key saat Base URL Hermes berubah.')

    expect(fixture.store.get().connection.baseUrl).toBe('http://127.0.0.1:20129/v1')
    expect((await fixture.store.getHermesSnapshot()).apiKey).toBe('saved-key')
  })

  it('reloads persisted Hermes config and reconnects automatically at startup', async () => {
    const fixture = await ipcFixture({
      initialSettings: hermesSettings('http://127.0.0.1:20129/v1'),
      initialKey: 'startup-key'
    })

    await vi.waitFor(() => expect(fixture.client.test).toHaveBeenCalledTimes(1))
    const status = await invoke<AppStatus>(IPC.appStatus, fixture.sender)

    expect(status.connection).toBe('online')
    expect(fixture.client.test.mock.calls[0]?.[0]).toMatchObject({
      baseUrl: 'http://127.0.0.1:20129/v1',
      apiKey: 'startup-key',
      model: 'hermes-agent'
    })
  })

  it('keeps Hermes settings when the tunnel is offline', async () => {
    const fixture = await ipcFixture({
      initialSettings: hermesSettings('http://127.0.0.1:20129/v1'),
      initialKey: 'startup-key',
      connectionResult: connectionResult('offline', false, 'connection')
    })

    await vi.waitFor(async () => {
      expect((await invoke<AppStatus>(IPC.appStatus, fixture.sender)).connection).toBe('offline')
    })
    expect(fixture.store.get().connection).toMatchObject({
      mode: 'hermes',
      baseUrl: 'http://127.0.0.1:20129/v1',
      model: 'hermes-agent'
    })
    expect((await fixture.store.getHermesSnapshot()).apiKey).toBe('startup-key')
  })

  it('exports useful Hermes diagnostics without API keys or authorization headers', async () => {
    const fixture = await ipcFixture({
      initialSettings: hermesSettings('http://127.0.0.1:20129/v1'),
      initialKey: 'diagnostic-secret-key'
    })
    const exportPath = join(fixture.root, 'diagnostics.json')
    electron.showSaveDialog.mockResolvedValue({ canceled: false, filePath: exportPath })

    const result = await invoke<{ result: OperationResult }>(IPC.diagnosticsExport, fixture.sender)
    const content = await readFile(exportPath, 'utf8')

    expect(result.result.ok).toBe(true)
    expect(content).toContain('http://127.0.0.1:20129/v1')
    expect(content).toContain('hermes-agent')
    expect(content).toContain('chat/completions')
    expect(content).not.toContain('diagnostic-secret-key')
    expect(content).not.toContain('Bearer')
    expect(content).not.toContain('Authorization')
  })

  it('keeps control envelopes out of chat history, final text, TTS, and clipboard', async () => {
    const fixture = await ipcFixture()
    fixture.client.stream.mockResolvedValueOnce({
      rawText: 'Jawaban aman.<yachiyo_control>{"emotion":"happy"}</yachiyo_control>',
      displayText: 'Jawaban aman.<yachiyo_control>{"emotion":"happy"}</yachiyo_control>',
      metadata: { emotion: 'happy' as const },
      transport: 'sse' as const
    })

    await invoke(IPC.chatStart, fixture.sender, {
      requestId: '00000000-0000-4000-8000-000000000302',
      messages: [
        {
          role: 'assistant',
          content: 'Riwayat aman.<yachiyo_control>{"motion":"wave"}</yachiyo_control>'
        },
        {
          role: 'user',
          content: 'Balas aman.</yachiyo_control>'
        }
      ]
    })
    await vi.waitFor(() =>
      expect(fixture.sender.send).toHaveBeenCalledWith(IPC.chatEvent, {
        type: 'done',
        requestId: '00000000-0000-4000-8000-000000000302',
        text: 'Jawaban aman.'
      })
    )
    expect(fixture.client.stream.mock.calls[0]?.[1]).toEqual([
      { role: 'assistant', content: 'Riwayat aman.' },
      { role: 'user', content: 'Balas aman.' }
    ])

    await invoke(IPC.voiceSynthesize, fixture.sender, {
      text: 'Suara aman.<yachiyo_control>{"emotion":"happy"}</yachiyo_control>',
      mode: 'basic',
      voice: defaultSettings.voice.ttsVoice,
      speed: 1,
      pitch: 0,
      rvc: defaultSettings.voice.rvc
    })
    expect(fixture.voiceSynthesize).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Suara aman.' })
    )

    await invoke(
      IPC.clipboardWrite,
      fixture.sender,
      'Salin aman.<yachiyo_control>{"importance":"high"}</yachiyo_control>'
    )
    expect(electron.clipboardWriteText).toHaveBeenCalledWith('Salin aman.')
    expect(
      JSON.stringify({
        events: fixture.sender.send.mock.calls,
        clipboard: electron.clipboardWriteText.mock.calls
      })
    ).not.toContain('yachiyo_control')
  })
})

async function ipcFixture(
  options: {
    initialSettings?: Settings
    initialKey?: string
    connectionResult?: ConnectionTestResult
  } = {}
): Promise<{
  root: string
  settingsPath: string
  logPath: string
  store: SettingsStore
  vault: MemoryVault
  sender: { send: ReturnType<typeof vi.fn> }
  client: {
    test: ReturnType<typeof vi.fn>
    probe: ReturnType<typeof vi.fn>
    stream: ReturnType<typeof vi.fn>
  }
  voiceSynthesize: ReturnType<typeof vi.fn>
}> {
  const root = await mkdtemp(join(tmpdir(), 'yachiyo-hermes-ipc-'))
  roots.push(root)
  const settingsPath = join(root, 'settings.json')
  const logPath = join(root, 'app.log')
  const vault = new MemoryVault()
  const logger = new AppLogger(logPath, 'debug')
  const store = new SettingsStore(settingsPath, vault, logger)
  await store.load()
  if (options.initialSettings) {
    await store.update({ settings: options.initialSettings, apiKey: options.initialKey })
  }
  const sender = { send: vi.fn() }
  const selectedResult = options.connectionResult
  const client = {
    test: vi.fn((config: HermesConfig, mode: 'mock' | 'hermes') =>
      Promise.resolve(selectedResult ?? connectionResult('online', true, 'none', config, mode))
    ),
    probe: vi.fn((config: HermesConfig, mode: 'mock' | 'hermes') =>
      Promise.resolve(connectionResult('online', true, 'none', config, mode))
    ),
    stream: vi.fn(() =>
      Promise.resolve({
        rawText: 'REAL HERMES ONLINE',
        displayText: 'REAL HERMES ONLINE',
        metadata: null,
        transport: 'sse' as const
      })
    )
  }
  const voiceSynthesize = vi.fn().mockResolvedValue(undefined)
  let assets = missingStatus()
  const dispose = registerIpc({
    dataRoot: root,
    projectRoot: root,
    settingsStore: store,
    vault,
    windowController: {
      browserWindow: { webContents: sender },
      setAlwaysOnTop: vi.fn(),
      setClickThrough: vi.fn(),
      resetPosition: vi.fn(),
      hide: vi.fn(),
      show: vi.fn()
    },
    trayController: { isReady: true, rebuildMenu: vi.fn() },
    mockServer: {
      config: {
        baseUrl: 'http://127.0.0.1:8642',
        apiKey: 'mock-key',
        model: 'yachiyo-mock'
      }
    },
    hermesClient: client,
    voiceSidecar: {
      restart: vi.fn(),
      capabilities: () => voiceCapabilities(),
      refreshCapabilities: vi.fn().mockResolvedValue(voiceCapabilities()),
      setupRuntime: vi.fn(),
      reportPlayback: vi.fn(),
      synthesize: voiceSynthesize,
      stopCurrent: vi.fn()
    },
    assetValidator: { scan: vi.fn(), refreshRuntime: (status: AssetStatus) => status },
    proactiveService: {
      onEvent: vi.fn(),
      manualTest: vi.fn(),
      list: vi.fn(),
      schedule: vi.fn(),
      act: vi.fn()
    },
    logger,
    applyDesktopSettings: vi.fn(),
    applyGlobalShortcut: vi.fn(() => true),
    setLauncherStatus: vi.fn(),
    getAssetStatus: () => assets,
    setAssetStatus: (status: AssetStatus) => {
      assets = status
    }
  } as never)
  disposers.push(dispose)
  return { root, settingsPath, logPath, store, vault, sender, client, voiceSynthesize }
}

async function invoke<T>(channel: string, sender: object, input?: unknown): Promise<T> {
  const handler = electron.handlers.get(channel)
  if (!handler) throw new Error(`Missing IPC handler: ${channel}`)
  return (await handler({ sender }, input)) as T
}

function hermesSettings(baseUrl: string): Settings {
  return {
    ...structuredClone(defaultSettings),
    onboardingComplete: true,
    connection: {
      ...defaultSettings.connection,
      mode: 'hermes',
      baseUrl,
      model: 'hermes-agent',
      timeoutMs: 60_000,
      retryCount: 2,
      streaming: true
    }
  }
}

function connectionResult(
  status: ConnectionTestResult['status'],
  ok: boolean,
  errorCategory: ConnectionTestResult['diagnostics']['errorCategory'],
  config: Pick<HermesConfig, 'baseUrl' | 'model' | 'timeoutMs'> = {
    baseUrl: 'http://127.0.0.1:20129/v1',
    model: 'hermes-agent',
    timeoutMs: 30_000
  },
  mode: 'mock' | 'hermes' = 'hermes'
): ConnectionTestResult {
  const base = config.baseUrl.replace(/\/$/, '').replace(/\/v1$/, '')
  return {
    ok,
    status,
    message: ok ? 'online' : 'offline',
    model: ok ? config.model : null,
    warning: null,
    diagnostics: {
      mode,
      phase: 'chat-test',
      normalizedBaseUrl: `${base}/v1`,
      modelsEndpoint: `${base}/v1/models`,
      chatEndpoint: `${base}/v1/chat/completions`,
      activeEndpoint: `${base}/v1/chat/completions`,
      selectedModel: config.model,
      httpStatus: ok ? 200 : null,
      errorCategory,
      timeoutMs: config.timeoutMs,
      responseSummary: null,
      checkedAt: '2026-07-17T00:00:00.000Z'
    }
  }
}

function missingStatus(): AssetStatus {
  return {
    scannedAt: '2026-07-17T00:00:00.000Z',
    live2d: {
      state: 'missing',
      sourceKind: 'none',
      root: null,
      entry: null,
      modelName: null,
      modelVersion: null,
      textureSize: null,
      textures: [],
      expressions: [],
      motions: [],
      eyeBlinkParameters: [],
      lipSyncParameters: [],
      hasPhysics: false,
      hasPose: false,
      hasCore: false,
      issues: [],
      hashes: {}
    },
    voice: {
      state: 'missing',
      sourceKind: 'none',
      root: null,
      checkpoint: null,
      index: null,
      metadata: { version: null, sampleRate: null, f0: null, info: null },
      runtime: {
        ffmpeg: true,
        ffprobe: true,
        python: true,
        rvc: false,
        rmvpe: false,
        contentVec: false
      },
      issues: [],
      hashes: {}
    }
  }
}

function voiceCapabilities(): VoiceCapabilities {
  return {
    sidecar: 'ready',
    edgeTts: true,
    browserTts: true,
    rvc: false,
    ffmpeg: true,
    device: 'cpu',
    detail: 'Basic TTS siap.',
    runtime: {
      state: 'setup-required',
      stage: 'Runtime RVC perlu disiapkan.',
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      currentAsset: null,
      error: null,
      assets: {}
    },
    deviceInfo: {
      selected: 'cpu',
      cudaAvailable: false,
      cudaName: null,
      devices: ['cpu'],
      torch: null,
      torchCuda: null
    },
    versions: {},
    lastMetrics: null,
    lastPlayback: null
  }
}

class MemoryVault implements SecretVault {
  value: string | null = null

  available(): boolean {
    return true
  }

  has(): Promise<boolean> {
    return Promise.resolve(this.value !== null)
  }

  get(): Promise<string | null> {
    return Promise.resolve(this.value)
  }

  set(value: string): Promise<void> {
    this.value = value
    return Promise.resolve()
  }

  clear(): Promise<void> {
    this.value = null
    return Promise.resolve()
  }
}
