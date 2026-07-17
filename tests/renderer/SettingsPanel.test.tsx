// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SettingsPanel } from '../../src/renderer/src/components/SettingsPanel'
import { defaultSettings } from '../../src/shared/schemas'
import type { AssetStatus, SettingsView, VoiceCapabilities } from '../../src/shared/types'

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

function openVoiceSection(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Suara' }))
}

function renderPanel(
  voice: VoiceCapabilities,
  overrides: {
    setup?: React.ComponentProps<typeof SettingsPanel>['onVoiceRuntimeSetup']
    refresh?: React.ComponentProps<typeof SettingsPanel>['onVoiceRefresh']
    voiceTest?: React.ComponentProps<typeof SettingsPanel>['onVoiceTest']
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
      onClose={vi.fn()}
      onSave={vi.fn().mockResolvedValue(settings)}
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
