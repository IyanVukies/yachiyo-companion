// @vitest-environment jsdom

import { useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AssetSettings } from '../../src/renderer/src/components/AssetSettings'
import { defaultSettings } from '../../src/shared/schemas'
import type {
  AssetApplyResult,
  AssetDialogResult,
  AssetSelectionRequest,
  AssetStatus,
  SettingsView
} from '../../src/shared/types'

describe('asset settings', () => {
  it('shows the selected Mao path immediately, scans automatically, and renders inventory', async () => {
    const selectedPath = 'D:\\Aset Yachiyo 日本語\\Mao dengan spasi'
    const runtimeRoot = `${selectedPath}\\runtime`
    const pending = deferred<AssetApplyResult>()
    const choose = vi.fn<(request: AssetSelectionRequest) => Promise<AssetDialogResult>>()
    choose.mockResolvedValue({
      outcome: 'selected',
      request: { kind: 'live2d', source: 'folder' },
      selectedPath,
      selectionToken: '00000000-0000-4000-8000-000000000123',
      message: 'Folder Mao dipilih. Memindai aset…'
    })
    const apply = vi.fn(() => pending.promise)
    renderAssetSettings({ choose, apply })

    const mao = screen.getByTestId('mao-asset-source')
    fireEvent.click(within(mao).getByRole('button', { name: 'Pilih folder' }))

    expect(await within(mao).findByTestId('mao-selected-path')).toHaveTextContent(selectedPath)
    expect(within(mao).getByText('Folder Mao dipilih. Memindai aset…')).toBeVisible()
    expect(within(mao).getByText('scanning')).toBeVisible()
    expect(apply).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000123')

    const assets = maoAssets(runtimeRoot)
    pending.resolve({
      outcome: 'applied',
      selectedPath,
      normalizedRoot: runtimeRoot,
      settings: settingsWith({ live2dRoot: selectedPath }),
      assets,
      message: 'Pilihan aset dipindai dan disimpan.'
    })

    await waitFor(() => expect(within(mao).getByText('core-missing')).toBeVisible())
    expect(within(mao).getByTestId('mao-normalized-root')).toHaveTextContent(runtimeRoot)
    expect(within(mao).getByText('mao_pro.model3.json')).toBeVisible()
    expect(within(mao).getByText('1 · smile')).toBeVisible()
    expect(within(mao).getByText('1 · Idle')).toBeVisible()
    expect(within(mao).getByText('mao.png (4096×4096)')).toBeVisible()
    expect(within(mao).getByText('ParamEyeLOpen, ParamEyeROpen')).toBeVisible()
    expect(within(mao).getByText('ParamA')).toBeVisible()
    expect(within(mao).getByRole('button', { name: 'Ganti folder' })).toBeVisible()
    expect(
      within(mao).getByText(
        'Struktur Mao valid. Pilih Cubism Core resmi untuk mengaktifkan avatar.'
      )
    ).toBeVisible()
  })

  it('reports a cancelled ZIP dialog instead of silently ignoring it', async () => {
    const apply = vi.fn<() => Promise<AssetApplyResult>>()
    const choose = vi.fn<(request: AssetSelectionRequest) => Promise<AssetDialogResult>>()
    choose.mockResolvedValue({
      outcome: 'cancelled',
      request: { kind: 'voice', source: 'zip' },
      selectedPath: null,
      selectionToken: null,
      message: 'ZIP Kobo dibatalkan. Pilihan sebelumnya tidak diubah.'
    })
    renderAssetSettings({ choose, apply })

    const kobo = screen.getByTestId('kobo-asset-source')
    fireEvent.click(within(kobo).getByRole('button', { name: 'Pilih ZIP' }))

    expect(
      await within(kobo).findByText('ZIP Kobo dibatalkan. Pilihan sebelumnya tidak diubah.')
    ).toBeVisible()
    expect(choose).toHaveBeenCalledWith({ kind: 'voice', source: 'zip' })
    expect(apply).not.toHaveBeenCalled()
  })

  it('keeps an invalid selected path visible and shows a plain-language validation error', async () => {
    const selectedPath = 'D:\\Aset 日本語\\Folder Mao salah'
    const invalid = invalidMaoAssets(selectedPath)
    const choose = vi.fn<(request: AssetSelectionRequest) => Promise<AssetDialogResult>>()
    choose.mockResolvedValue({
      outcome: 'selected',
      request: { kind: 'live2d', source: 'folder' },
      selectedPath,
      selectionToken: '00000000-0000-4000-8000-000000000124',
      message: 'Folder Mao dipilih. Memindai aset…'
    })
    const apply = vi.fn<() => Promise<AssetApplyResult>>().mockResolvedValue({
      outcome: 'applied',
      selectedPath,
      normalizedRoot: selectedPath,
      settings: settingsWith({ live2dRoot: selectedPath }),
      assets: invalid,
      message: 'Pilihan aset dipindai dan disimpan.'
    })
    renderAssetSettings({ choose, apply })

    const mao = screen.getByTestId('mao-asset-source')
    fireEvent.click(within(mao).getByRole('button', { name: 'Pilih folder' }))

    expect(await within(mao).findByText('invalid')).toBeVisible()
    expect(within(mao).getByTestId('mao-selected-path')).toHaveTextContent(selectedPath)
    expect(
      within(mao).getAllByText('Entry mao_pro.model3.json tidak ditemukan.').length
    ).toBeGreaterThan(0)
    expect(within(mao).getByRole('alert')).toHaveTextContent(
      'Entry mao_pro.model3.json tidak ditemukan.'
    )
  })

  it('shows equivalent Kobo loading, source path, inventory, and runtime fallback feedback', async () => {
    const selectedPath = 'D:\\Suara 日本語\\Kobo model.zip'
    const assets = koboAssets('D:\\cache\\kobo')
    const choose = vi.fn<(request: AssetSelectionRequest) => Promise<AssetDialogResult>>()
    choose.mockResolvedValue({
      outcome: 'selected',
      request: { kind: 'voice', source: 'zip' },
      selectedPath,
      selectionToken: '00000000-0000-4000-8000-000000000125',
      message: 'ZIP Kobo dipilih. Memindai aset…'
    })
    const apply = vi.fn<() => Promise<AssetApplyResult>>().mockResolvedValue({
      outcome: 'applied',
      selectedPath,
      normalizedRoot: assets.voice.root,
      settings: settingsWith({ voiceRoot: selectedPath }),
      assets,
      message: 'Pilihan aset dipindai dan disimpan.'
    })
    renderAssetSettings({ choose, apply })

    const kobo = screen.getByTestId('kobo-asset-source')
    fireEvent.click(within(kobo).getByRole('button', { name: 'Pilih ZIP' }))

    expect(await within(kobo).findByText('runtime-missing')).toBeVisible()
    expect(within(kobo).getByTestId('kobo-selected-path')).toHaveTextContent(selectedPath)
    expect(within(kobo).getByText('kobov2.pth')).toBeVisible()
    expect(within(kobo).getByText('added_IVF454_Flat_nprobe_1_kobov2_v2.index')).toBeVisible()
    expect(within(kobo).getByText('48k')).toBeVisible()
    expect(
      within(kobo).getByText(
        'Model Kobo valid. Runtime RVC belum lengkap, jadi Basic TTS tetap digunakan.'
      )
    ).toBeVisible()
  })
})

function renderAssetSettings({
  choose,
  apply
}: {
  choose: (request: AssetSelectionRequest) => Promise<AssetDialogResult>
  apply: (token: string) => Promise<AssetApplyResult>
}): void {
  function Harness(): React.JSX.Element {
    const [paths, setPaths] = useState(settingsWith().assets)
    const [assets, setAssets] = useState(missingAssets)
    return (
      <AssetSettings
        paths={paths}
        assets={assets}
        onPathsChanged={setPaths}
        onChoose={choose}
        onApply={async (token) => {
          const result = await apply(token)
          setAssets(result.assets)
          return result
        }}
        onRescan={() => {
          const next = missingAssets()
          setAssets(next)
          return Promise.resolve(next)
        }}
      />
    )
  }
  render(<Harness />)
}

function settingsWith(paths: Partial<SettingsView['assets']> = {}): SettingsView {
  return {
    ...structuredClone(defaultSettings),
    assets: { ...defaultSettings.assets, ...paths },
    hasApiKey: false,
    secureStorageAvailable: true
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
      issues: [{ code: 'LIVE2D_MISSING', message: 'Aset Mao belum ditemukan.' }],
      hashes: {}
    },
    voice: {
      state: 'missing',
      sourceKind: 'none',
      root: null,
      checkpoint: null,
      index: null,
      metadata: { version: null, sampleRate: null, f0: null, info: null },
      runtime: runtimeCapabilities(),
      issues: [{ code: 'VOICE_MISSING', message: 'Model suara Kobo belum ditemukan.' }],
      hashes: {}
    }
  }
}

function maoAssets(runtimeRoot: string): AssetStatus {
  const assets = missingAssets()
  return {
    ...assets,
    scannedAt: '2026-07-17T00:00:01.000Z',
    live2d: {
      state: 'core-missing',
      sourceKind: 'folder',
      root: runtimeRoot,
      entry: `${runtimeRoot}\\mao_pro.model3.json`,
      modelName: 'Niziiro Mao',
      modelVersion: 3,
      textureSize: { width: 4096, height: 4096 },
      textures: [{ file: 'mao.png', width: 4096, height: 4096 }],
      expressions: [{ name: 'smile', file: 'smile.exp3.json', parameterCount: 1 }],
      motions: [
        {
          group: 'Idle',
          index: 0,
          name: 'idle',
          file: 'idle.motion3.json',
          durationSeconds: 1,
          loop: true
        }
      ],
      eyeBlinkParameters: ['ParamEyeLOpen', 'ParamEyeROpen'],
      lipSyncParameters: ['ParamA'],
      hasPhysics: true,
      hasPose: true,
      hasCore: false,
      issues: [
        {
          code: 'CUBISM_CORE_MISSING',
          message: 'Aset Mao valid, tetapi Cubism Core resmi belum dipasang.'
        }
      ],
      hashes: {}
    }
  }
}

function invalidMaoAssets(root: string): AssetStatus {
  const assets = missingAssets()
  return {
    ...assets,
    scannedAt: '2026-07-17T00:00:02.000Z',
    live2d: {
      ...assets.live2d,
      state: 'invalid',
      sourceKind: 'folder',
      root,
      issues: [
        {
          code: 'LIVE2D_ENTRY_MISSING',
          message: 'Entry mao_pro.model3.json tidak ditemukan.'
        }
      ]
    }
  }
}

function koboAssets(root: string): AssetStatus {
  const assets = missingAssets()
  return {
    ...assets,
    scannedAt: '2026-07-17T00:00:03.000Z',
    voice: {
      state: 'runtime-missing',
      sourceKind: 'zip',
      root,
      checkpoint: `${root}\\kobov2.pth`,
      index: `${root}\\added_IVF454_Flat_nprobe_1_kobov2_v2.index`,
      metadata: { version: 'v2', sampleRate: '48k', f0: true, info: '500epoch' },
      runtime: runtimeCapabilities(),
      issues: [
        {
          code: 'RVC_RUNTIME_MISSING',
          message: 'Model ditemukan, tetapi runtime RVC lengkap belum siap.'
        }
      ],
      hashes: {}
    }
  }
}

function runtimeCapabilities(): AssetStatus['voice']['runtime'] {
  return {
    ffmpeg: true,
    ffprobe: true,
    python: true,
    rvc: false,
    rmvpe: false,
    contentVec: false
  }
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolvePromise: (value: T) => void = () => undefined
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })
  return { promise, resolve: resolvePromise }
}
