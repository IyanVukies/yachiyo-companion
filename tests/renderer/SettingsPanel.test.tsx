// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SettingsPanel } from '../../src/renderer/src/components/SettingsPanel'
import { defaultSettings } from '../../src/shared/schemas'
import type {
  AssetStatus,
  ConnectionTestResult,
  HermesConnectionStatus,
  SettingsView,
  VoiceCapabilities
} from '../../src/shared/types'

describe('voice settings', () => {
  it('shows setup-required feedback and starts the pinned runtime setup explicitly', async () => {
    const setup = vi
      .fn<React.ComponentProps<typeof SettingsPanel>['onVoiceRuntimeSetup']>()
      .mockResolvedValue(voiceWith({ runtimeState: 'downloading' }))
    renderPanel(voiceWith({ runtimeState: 'setup-required' }), { setup })

    openVoiceSection()
    const status = screen.getByTestId('voice-runtime-status')
    expect(within(status).getByText(/Runtime RVC · perlu setup/)).toBeVisible()
    expect(within(status).getAllByText(/HuBERT Base/).length).toBeGreaterThan(0)
    expect(within(status).getAllByText(/RMVPE/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Tes RVC Kobo' })).toBeDisabled()

    fireEvent.click(within(status).getByRole('button', { name: 'Siapkan RVC' }))
    await waitFor(() => expect(setup).toHaveBeenCalledTimes(1))
    expect(screen.getByText('Penyiapan runtime RVC dimulai…')).toBeVisible()
  })

  it('renders visible download progress and polls while setup is active', async () => {
    vi.useFakeTimers()
    const refresh = vi
      .fn<React.ComponentProps<typeof SettingsPanel>['onVoiceRefresh']>()
      .mockResolvedValue(voiceWith({ runtimeState: 'downloading' }))
    try {
      renderPanel(voiceWith({ runtimeState: 'downloading' }), { refresh })
      openVoiceSection()

      const status = screen.getByTestId('voice-runtime-status')
      expect(within(status).getByText(/42\.5%/)).toBeVisible()
      expect(within(status).getByText(/226\.4 MB \/ 532\.9 MB/)).toBeVisible()
      expect(within(status).getByRole('progressbar')).toHaveValue(42.5)

      await vi.advanceTimersByTimeAsync(750)
      expect(refresh).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('exposes Basic/RVC comparison, tuning controls, metrics, and playback proof', async () => {
    const voiceTest = vi
      .fn<React.ComponentProps<typeof SettingsPanel>['onVoiceTest']>()
      .mockResolvedValue(undefined)
    renderPanel(voiceWith({ runtimeState: 'ready', rvc: true, withMetrics: true }), {
      voiceTest
    })
    openVoiceSection()

    expect(screen.getByText('Konversi lokal Kobo RVC v2 · RMVPE · HuBERT · 48 kHz')).toBeVisible()
    expect(screen.getByText('Pitch RVC')).toBeVisible()
    expect(screen.getByText('Index rate')).toBeVisible()
    expect(screen.getByText('Protection')).toBeVisible()
    expect(screen.getByLabelText('Perangkat inferensi')).toHaveValue('auto')
    expect(screen.getByRole('option', { name: 'CUDA' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Tes Basic' }))
    await waitFor(() => expect(voiceTest).toHaveBeenCalledWith(expect.any(Object), 'basic'))
    const rvcButton = screen.getByRole('button', { name: 'Tes RVC Kobo' })
    await waitFor(() => expect(rvcButton).toBeEnabled())
    fireEvent.click(rvcButton)
    await waitFor(() => expect(voiceTest).toHaveBeenCalledWith(expect.any(Object), 'rvc'))

    const metrics = screen.getByTestId('voice-metrics')
    expect(within(metrics).getByText('1.25 dtk')).toBeVisible()
    expect(within(metrics).getByText('1536.0 MB')).toBeVisible()
    expect(
      within(metrics).getByText(/Playback WebAudio selesai · lip-sync puncak 0\.74/)
    ).toBeVisible()
  })
})

describe('Hermes settings', () => {
  it('saves every editable Hermes connection field and the raw key', async () => {
    const save = vi
      .fn<React.ComponentProps<typeof SettingsPanel>['onSave']>()
      .mockImplementation((view) => Promise.resolve(view))
    renderPanel(voiceWith({ runtimeState: 'ready' }), { save })

    fireEvent.click(screen.getByRole('button', { name: 'Hermes VPS' }))
    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: 'http://127.0.0.1:20129/v1/' }
    })
    fireEvent.change(screen.getByLabelText('Nama model'), {
      target: { value: 'hermes-agent' }
    })
    fireEvent.change(screen.getByLabelText(/API key/), { target: { value: ' raw-ui-key ' } })
    fireEvent.change(screen.getByLabelText('Timeout'), { target: { value: '60000' } })
    fireEvent.change(screen.getByLabelText('Retry aman'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    const call = save.mock.calls[0]
    expect(call?.[0].connection).toMatchObject({
      mode: 'hermes',
      baseUrl: 'http://127.0.0.1:20129/v1/',
      model: 'hermes-agent',
      timeoutMs: 60_000,
      retryCount: 2,
      streaming: true
    })
    expect(call?.[1]).toBe(' raw-ui-key ')
  })

  it('runs the validated connection test callback and renders safe diagnostics', async () => {
    const result = onlineConnectionResult()
    const testConnection = vi
      .fn<React.ComponentProps<typeof SettingsPanel>['onTestConnection']>()
      .mockResolvedValue(result)
    renderPanel(voiceWith({ runtimeState: 'ready' }), {
      testConnection,
      hermes: {
        state: result.status,
        message: result.message,
        diagnostics: result.diagnostics
      }
    })

    fireEvent.click(screen.getByRole('button', { name: 'Hermes VPS' }))
    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: 'http://127.0.0.1:20129/v1/' }
    })
    fireEvent.change(screen.getByLabelText(/API key/), {
      target: { value: '  local-secret  ' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Tes koneksi' }))

    await waitFor(() =>
      expect(testConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'hermes',
          baseUrl: 'http://127.0.0.1:20129/v1/',
          apiKey: '  local-secret  '
        })
      )
    )
    const diagnostics = screen.getByLabelText('Diagnostik koneksi Hermes')
    expect(within(diagnostics).getByText('http://127.0.0.1:20129/v1')).toBeVisible()
    expect(
      within(diagnostics).getByText('http://127.0.0.1:20129/v1/chat/completions')
    ).toBeVisible()
    expect(within(diagnostics).queryByText(/local-secret/)).not.toBeInTheDocument()
  })
})

function openVoiceSection(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Suara' }))
}

function renderPanel(
  voice: VoiceCapabilities,
  overrides: {
    setup?: React.ComponentProps<typeof SettingsPanel>['onVoiceRuntimeSetup']
    refresh?: React.ComponentProps<typeof SettingsPanel>['onVoiceRefresh']
    voiceTest?: React.ComponentProps<typeof SettingsPanel>['onVoiceTest']
    testConnection?: React.ComponentProps<typeof SettingsPanel>['onTestConnection']
    hermes?: HermesConnectionStatus
    save?: React.ComponentProps<typeof SettingsPanel>['onSave']
  } = {}
): void {
  const settings: SettingsView = {
    ...structuredClone(defaultSettings),
    hasApiKey: false,
    secureStorageAvailable: true
  }
  render(
    <SettingsPanel
      settings={settings}
      assets={missingAssets()}
      voice={voice}
      hermes={overrides.hermes ?? idleHermesStatus()}
      onClose={vi.fn()}
      onSave={overrides.save ?? vi.fn().mockResolvedValue(settings)}
      onTestConnection={
        overrides.testConnection ?? vi.fn().mockResolvedValue(onlineConnectionResult())
      }
      onReset={vi.fn().mockResolvedValue(settings)}
      onChooseAsset={vi.fn()}
      onApplyAsset={vi.fn()}
      onRescan={vi.fn().mockResolvedValue(missingAssets())}
      onVoiceTest={overrides.voiceTest ?? vi.fn().mockResolvedValue(undefined)}
      onVoiceRuntimeSetup={overrides.setup ?? vi.fn().mockResolvedValue(voice)}
      onVoiceRefresh={overrides.refresh ?? vi.fn().mockResolvedValue(voice)}
    />
  )
}

function idleHermesStatus(): HermesConnectionStatus {
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

function onlineConnectionResult(): ConnectionTestResult {
  return {
    ok: true,
    status: 'online',
    message: 'Koneksi Hermes dan chat completion berhasil.',
    model: 'hermes-agent',
    warning: null,
    diagnostics: {
      mode: 'hermes',
      phase: 'chat-test',
      normalizedBaseUrl: 'http://127.0.0.1:20129/v1',
      modelsEndpoint: 'http://127.0.0.1:20129/v1/models',
      chatEndpoint: 'http://127.0.0.1:20129/v1/chat/completions',
      activeEndpoint: 'http://127.0.0.1:20129/v1/chat/completions',
      selectedModel: 'hermes-agent',
      httpStatus: 200,
      errorCategory: 'none',
      timeoutMs: 30_000,
      responseSummary: 'models=1; selectedModelFound=true; chatContent=true',
      checkedAt: '2026-07-17T10:00:00.000Z'
    }
  }
}

function voiceWith(options: {
  runtimeState: VoiceCapabilities['runtime']['state']
  rvc?: boolean
  withMetrics?: boolean
}): VoiceCapabilities {
  const downloading = options.runtimeState === 'downloading'
  const ready = options.runtimeState === 'ready'
  return {
    sidecar: 'ready',
    edgeTts: true,
    browserTts: true,
    rvc: options.rvc ?? false,
    ffmpeg: true,
    device: 'cpu',
    detail: ready ? 'RVC dan Basic TTS siap.' : 'Basic TTS tetap tersedia.',
    runtime: {
      state: options.runtimeState,
      stage: downloading
        ? 'Mengunduh HuBERT Base dari sumber resmi…'
        : ready
          ? 'Runtime RVC siap.'
          : 'Unduh aset resmi HuBERT dan RMVPE untuk mengaktifkan RVC.',
      progress: downloading ? 42.5 : ready ? 100 : 0,
      downloadedBytes: downloading ? 237_397_606 : ready ? 558_749_677 : 0,
      totalBytes: 558_749_677,
      currentAsset: downloading ? 'HuBERT Base' : null,
      error: options.runtimeState === 'error' ? 'download_hash_mismatch' : null,
      assets: {
        hubert: { label: 'HuBERT Base', state: ready ? 'ready' : 'missing', bytes: 377_565_405 },
        rmvpe: { label: 'RMVPE', state: ready ? 'ready' : 'missing', bytes: 181_184_272 }
      }
    },
    deviceInfo: {
      selected: 'cpu',
      cudaAvailable: false,
      cudaName: null,
      devices: ['cpu'],
      torch: '2.7.1+cpu',
      torchCuda: null
    },
    versions: { torch: '2.7.1+cpu', 'faiss-cpu': '1.8.0' },
    lastMetrics: options.withMetrics
      ? {
          coldStartMs: 4820,
          conversionMs: 1250,
          audioDurationMs: 2020,
          cpuPercent: 51.2,
          peakRamMb: 1536,
          indexMs: 82,
          deviceName: 'CPU'
        }
      : null,
    lastPlayback: options.withMetrics
      ? {
          requestId: '00000000-0000-4000-8000-000000000220',
          source: 'sidecar-rvc',
          playedAt: '2026-07-17T10:00:00.000Z',
          durationMs: 2020,
          maxLipSync: 0.74,
          metrics: null
        }
      : null
  }
}

function missingAssets(): AssetStatus {
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
        rvc: true,
        rmvpe: true,
        contentVec: true
      },
      issues: [],
      hashes: {}
    }
  }
}
