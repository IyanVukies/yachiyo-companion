// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { defaultSettings } from '../../src/shared/schemas'
import type {
  AppStatus,
  AssetStatus,
  ChatEvent,
  HermesConnectionStatus,
  SettingsView,
  VoiceCapabilities
} from '../../src/shared/types'

const voiceQueue = vi.hoisted(() => ({
  speak: vi.fn<() => Promise<void>>(),
  stop: vi.fn()
}))

vi.mock('../../src/renderer/src/hooks/useVoiceQueue', () => ({
  useVoiceQueue: () => ({
    speak: voiceQueue.speak,
    speaking: false,
    stop: voiceQueue.stop
  })
}))

import { App } from '../../src/renderer/src/App'

type Bridge = typeof window.yachiyo

describe('App shared conversation presentation', () => {
  let chatListener: ((event: ChatEvent) => void) | null
  let bridge: Bridge

  beforeEach(() => {
    chatListener = null
    voiceQueue.speak.mockReset().mockResolvedValue(undefined)
    voiceQueue.stop.mockReset()
    vi.stubGlobal('ResizeObserver', TestResizeObserver)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('keeps one active Hermes stream while switching between Companion and Full Chat', async () => {
    bridge = installBridge('disabled', (listener) => {
      chatListener = listener
    })
    render(<App />)

    const composer = await screen.findByRole('textbox', { name: 'Pesan ringkas untuk Yachiyo' })
    fireEvent.change(composer, { target: { value: 'Pertahankan stream ini' } })
    fireEvent.click(screen.getByRole('button', { name: 'Kirim' }))

    await waitFor(() => expect(bridge.startChat).toHaveBeenCalledTimes(1))
    const startCall = vi.mocked(bridge.startChat).mock.calls[0]
    if (!startCall) throw new Error('Chat request was not started.')
    const requestId = startCall[0].requestId
    emit({ type: 'delta', requestId, text: 'Bagian pertama ' })

    const bubble = await responseBubble()
    expect(within(bubble).getByText('Bagian pertama')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Buka percakapan lengkap' }))
    await expectFullChat()
    expect(screen.getByText('Bagian pertama')).toBeVisible()
    expect(bridge.startChat).toHaveBeenCalledTimes(1)
    expect(bridge.cancelChat).not.toHaveBeenCalled()

    emit({ type: 'delta', requestId, text: 'tetap berjalan.' })
    expect(await screen.findByText('Bagian pertama tetap berjalan.')).toBeVisible()

    fireEvent.click(
      screen.getByRole('button', { name: 'Tutup chat dan kembali ke Companion Mode' })
    )
    const restoredBubble = await responseBubble()
    expect(within(restoredBubble).getByText('Bagian pertama tetap berjalan.')).toBeVisible()
    expect(bridge.startChat).toHaveBeenCalledTimes(1)
    expect(bridge.cancelChat).not.toHaveBeenCalled()
  })

  it('shows the response bubble without routing text to TTS when voice is disabled', async () => {
    bridge = installBridge('disabled', (listener) => {
      chatListener = listener
    })
    render(<App />)

    const requestId = await startConversation(bridge)
    emit({ type: 'delta', requestId, text: 'Bubble tetap terlihat.' })
    emit({ type: 'done', requestId, text: 'Bubble tetap terlihat.' })

    const bubble = await responseBubble()
    expect(within(bubble).getByText('Bubble tetap terlihat.')).toBeVisible()
    expect(voiceQueue.speak).not.toHaveBeenCalled()
  })

  it('shows the response bubble and routes the same visible response to TTS when voice is enabled', async () => {
    bridge = installBridge('basic', (listener) => {
      chatListener = listener
    })
    render(<App />)

    const requestId = await startConversation(bridge)
    emit({ type: 'delta', requestId, text: 'Bubble dan suara aktif.' })
    emit({ type: 'done', requestId, text: 'Bubble dan suara aktif.' })

    const bubble = await responseBubble()
    expect(within(bubble).getByText('Bubble dan suara aktif.')).toBeVisible()
    expect(voiceQueue.speak).toHaveBeenCalledTimes(1)
    expect(voiceQueue.speak).toHaveBeenCalledWith(
      'Bubble dan suara aktif.',
      expect.objectContaining({ mode: 'basic' })
    )
  })

  it('retries the same turn without duplicating its user message', async () => {
    bridge = installBridge('disabled', (listener) => {
      chatListener = listener
    })
    render(<App />)

    const requestId = await startConversation(bridge)
    emit({ type: 'done', requestId, text: 'Jawaban pertama.' })
    fireEvent.click(within(await responseBubble()).getByRole('button', { name: 'Buka percakapan' }))
    await expectFullChat()
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }))

    await waitFor(() => expect(bridge.startChat).toHaveBeenCalledTimes(2))
    const retryCall = vi.mocked(bridge.startChat).mock.calls[1]
    if (!retryCall) throw new Error('Retry request was not started.')
    const retryMessages = retryCall[0].messages
    expect(retryMessages.at(-1)).toMatchObject({ role: 'user', content: 'Halo Yachiyo' })
    expect(retryMessages.filter((message) => message.role === 'user')).toHaveLength(1)
    expect(screen.getAllByText('Kamu')).toHaveLength(1)
  })

  function emit(event: ChatEvent): void {
    if (!chatListener) throw new Error('Chat listener was not registered.')
    act(() => chatListener?.(event))
  }
})

async function startConversation(bridge: Bridge): Promise<string> {
  const composer = await screen.findByRole('textbox', { name: 'Pesan ringkas untuk Yachiyo' })
  fireEvent.change(composer, { target: { value: 'Halo Yachiyo' } })
  fireEvent.click(screen.getByRole('button', { name: 'Kirim' }))
  await waitFor(() => expect(bridge.startChat).toHaveBeenCalledTimes(1))
  const startCall = vi.mocked(bridge.startChat).mock.calls[0]
  if (!startCall) throw new Error('Chat request was not started.')
  return startCall[0].requestId
}

async function responseBubble(): Promise<HTMLElement> {
  return screen.findByLabelText('Respons terbaru Yachiyo', { selector: 'aside' })
}

async function expectFullChat(): Promise<void> {
  expect(await screen.findByRole('heading', { name: 'Chat dengan Yachiyo' })).toBeVisible()
}

function installBridge(
  voiceMode: SettingsView['voice']['mode'],
  captureChat: (listener: (event: ChatEvent) => void) => void
): Bridge {
  const settings = settingsWithVoice(voiceMode)
  const status = appStatus()
  const noopSubscription = (): (() => void) => vi.fn()
  const bridge = {
    getAppStatus: vi.fn().mockResolvedValue(status),
    getSettings: vi.fn().mockResolvedValue(settings),
    listReminders: vi.fn().mockResolvedValue([]),
    onHermesStatus: vi.fn(noopSubscription),
    onChatEvent: vi.fn((listener: (event: ChatEvent) => void) => {
      captureChat(listener)
      return vi.fn()
    }),
    onProactiveEvent: vi.fn(noopSubscription),
    onAppCommand: vi.fn(noopSubscription),
    startChat: vi.fn().mockResolvedValue({ ok: true, message: 'Permintaan chat dimulai.' }),
    cancelChat: vi.fn().mockResolvedValue({ ok: true, message: 'Respons dihentikan.' }),
    setPresentationMode: vi.fn().mockResolvedValue({ ok: true, message: 'Mode diperbarui.' }),
    setLauncherStatus: vi.fn().mockResolvedValue({ ok: true, message: 'Status diperbarui.' }),
    minimizeWindow: vi.fn().mockResolvedValue({ ok: true, message: 'Jendela disembunyikan.' }),
    closeWindow: vi.fn().mockResolvedValue({ ok: true, message: 'Jendela ditutup.' })
  } as unknown as Bridge
  Object.defineProperty(window, 'yachiyo', {
    configurable: true,
    value: bridge
  })
  return bridge
}

function settingsWithVoice(mode: SettingsView['voice']['mode']): SettingsView {
  return {
    ...structuredClone(defaultSettings),
    onboardingComplete: true,
    voice: { ...structuredClone(defaultSettings.voice), mode },
    hasApiKey: false,
    secureStorageAvailable: true
  }
}

function appStatus(): AppStatus {
  const hermes = mockHermesStatus()
  return {
    version: '0.2.3',
    connection: hermes.state,
    hermes,
    mockServerReady: true,
    trayReady: true,
    clickThrough: false,
    alwaysOnTop: false,
    autoStart: false,
    voice: voiceCapabilities(),
    assets: missingAssets(),
    recoveryShortcut: 'Ctrl+Shift+F12'
  }
}

function mockHermesStatus(): HermesConnectionStatus {
  return {
    state: 'mock',
    message: 'Mock lokal aktif.',
    diagnostics: {
      mode: 'mock',
      phase: 'idle',
      normalizedBaseUrl: null,
      modelsEndpoint: null,
      chatEndpoint: null,
      activeEndpoint: null,
      selectedModel: 'yachiyo-mock',
      httpStatus: null,
      errorCategory: 'none',
      timeoutMs: 30_000,
      responseSummary: null,
      checkedAt: null
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
      stage: 'Runtime RVC belum dipasang.',
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

function missingAssets(): AssetStatus {
  return {
    scannedAt: '2026-07-18T00:00:00.000Z',
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
        python: false,
        rvc: false,
        rmvpe: false,
        contentVec: false
      },
      issues: [],
      hashes: {}
    }
  }
}

class TestResizeObserver implements ResizeObserver {
  readonly root = null

  observe(): void {
    return undefined
  }
  unobserve(): void {
    return undefined
  }
  disconnect(): void {
    return undefined
  }
}
