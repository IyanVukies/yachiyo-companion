import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  return {
    handlers,
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
    openPath: vi.fn(),
    writeText: vi.fn(),
    setLoginItemSettings: vi.fn()
  }
})

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.1.1-test',
    getLoginItemSettings: () => ({ openAtLogin: false }),
    setLoginItemSettings: electron.setLoginItemSettings
  },
  clipboard: { writeText: electron.writeText },
  dialog: {
    showOpenDialog: electron.showOpenDialog,
    showSaveDialog: electron.showSaveDialog
  },
  ipcMain: {
    removeHandler: (channel: string) => electron.handlers.delete(channel),
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      electron.handlers.set(channel, handler)
  },
  shell: { openPath: electron.openPath }
}))

import { registerIpc } from '../../src/main/ipc/register-ipc'
import { AppLogger } from '../../src/main/services/logger'
import { SettingsStore } from '../../src/main/services/settings-store'
import type { SecretVault } from '../../src/main/services/secret-vault'
import { IPC } from '../../src/shared/ipc'
import { defaultSettings, settingsSchema } from '../../src/shared/schemas'
import type { AssetApplyResult, AssetDialogResult, AssetStatus } from '../../src/shared/types'

const roots: string[] = []

beforeEach(() => {
  electron.handlers.clear()
  electron.showOpenDialog.mockReset()
  electron.showSaveDialog.mockReset()
  electron.openPath.mockReset()
  electron.writeText.mockReset()
  electron.setLoginItemSettings.mockReset()
})

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('asset IPC selection flow', () => {
  it('uses a folder dialog, one-time token, validation scan, and atomic persistence', async () => {
    const fixture = await ipcFixture()
    const selected = join(fixture.root, 'Aset Mao 日本語 dengan spasi')
    await mkdir(selected, { recursive: true })
    const scanned = maoStatus(join(selected, 'runtime'))
    fixture.scan.mockResolvedValue(scanned)
    electron.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [selected] })

    const choice = await invoke<AssetDialogResult>(IPC.assetsChoose, fixture.sender, {
      kind: 'live2d',
      source: 'folder'
    })

    expect(choice).toMatchObject({
      outcome: 'selected',
      selectedPath: selected,
      message: 'Folder Mao dipilih. Memindai aset…'
    })
    expect(choice.selectionToken).toMatch(/^[0-9a-f-]{36}$/i)
    const dialogOptions = electron.showOpenDialog.mock.calls[0]?.[1] as Electron.OpenDialogOptions
    expect(dialogOptions.title).toBe('Pilih folder Mao')
    expect(dialogOptions.properties).toEqual(['openDirectory'])
    expect(fixture.store.get().assets.live2dRoot).toBe('')

    const applied = await invoke<AssetApplyResult>(IPC.assetsApplySelection, fixture.sender, {
      token: choice.selectionToken
    })

    expect(applied).toMatchObject({
      outcome: 'applied',
      selectedPath: selected,
      normalizedRoot: join(selected, 'runtime'),
      assets: { live2d: { state: 'core-missing' } }
    })
    expect(fixture.scan).toHaveBeenCalledWith({
      live2dRoot: selected,
      voiceRoot: '',
      cubismCorePath: ''
    })
    expect(fixture.store.get().assets.live2dRoot).toBe(selected)
    const persisted = settingsSchema.parse(JSON.parse(await readFile(fixture.settingsPath, 'utf8')))
    expect(persisted.assets.live2dRoot).toBe(selected)
    expect(fixture.setAssetStatus).toHaveBeenCalledWith(scanned)
    expect(fixture.restartVoice).not.toHaveBeenCalled()

    const replay = await invoke<AssetApplyResult>(IPC.assetsApplySelection, fixture.sender, {
      token: choice.selectionToken
    })
    expect(replay.outcome).toBe('expired')
    expect(replay.message).toContain('kedaluwarsa')
  })

  it('exposes a real ZIP file action and restarts Kobo against the normalized root', async () => {
    const fixture = await ipcFixture()
    const selected = join(fixture.root, 'ZIP Kobo 日本語 dengan spasi.zip')
    await writeFile(selected, 'test zip placeholder')
    const scanned = koboStatus(join(fixture.root, 'cache', 'kobo'))
    fixture.scan.mockResolvedValue(scanned)
    electron.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [selected] })

    const choice = await invoke<AssetDialogResult>(IPC.assetsChoose, fixture.sender, {
      kind: 'voice',
      source: 'zip'
    })
    const dialogOptions = electron.showOpenDialog.mock.calls[0]?.[1] as Electron.OpenDialogOptions
    expect(dialogOptions.title).toBe('Pilih ZIP Kobo')
    expect(dialogOptions.properties).toEqual(['openFile'])
    expect(dialogOptions.filters).toEqual([{ name: 'ZIP Kobo', extensions: ['zip'] }])

    const applied = await invoke<AssetApplyResult>(IPC.assetsApplySelection, fixture.sender, {
      token: choice.selectionToken
    })

    expect(applied.outcome).toBe('applied')
    expect(applied.normalizedRoot).toBe(scanned.voice.root)
    expect(fixture.store.get().assets.voiceRoot).toBe(selected)
    expect(fixture.restartVoice).toHaveBeenCalledWith(scanned.voice.root)
    expect(fixture.scan).toHaveBeenCalledTimes(1)
  })

  it('returns explicit cancellation and malformed-dialog feedback without persistence', async () => {
    const fixture = await ipcFixture()
    electron.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] })

    const cancelled = await invoke<AssetDialogResult>(IPC.assetsChoose, fixture.sender, {
      kind: 'live2d',
      source: 'folder'
    })

    expect(cancelled).toEqual({
      outcome: 'cancelled',
      request: { kind: 'live2d', source: 'folder' },
      selectedPath: null,
      selectionToken: null,
      message: 'Folder Mao dibatalkan. Pilihan sebelumnya tidak diubah.'
    })
    expect(fixture.store.get().assets).toEqual(defaultSettings.assets)
    expect(fixture.scan).not.toHaveBeenCalled()

    electron.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [] })
    const malformed = await invoke<AssetDialogResult>(IPC.assetsChoose, fixture.sender, {
      kind: 'voice',
      source: 'folder'
    })
    expect(malformed.outcome).toBe('error')
    expect(malformed.message).toContain('tanpa mengembalikan path')
    expect(fixture.store.get().assets).toEqual(defaultSettings.assets)
  })

  it('validates request combinations, selected file type, sender, and settings-path bypasses', async () => {
    const fixture = await ipcFixture()
    const textFile = join(fixture.root, 'not-a-zip.txt')
    await writeFile(textFile, 'no')
    electron.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [textFile] })

    const invalidFile = await invoke<AssetDialogResult>(IPC.assetsChoose, fixture.sender, {
      kind: 'voice',
      source: 'zip'
    })
    expect(invalidFile.outcome).toBe('error')
    expect(invalidFile.message).toBe(
      'Pilihan bukan berkas ZIP yang valid. Pilihan sebelumnya tidak diubah.'
    )

    await expect(
      invoke<unknown>(IPC.assetsChoose, fixture.sender, { kind: 'live2d', source: 'file' })
    ).rejects.toThrow('Input aplikasi tidak valid.')
    await expect(
      invoke<unknown>(IPC.assetsChoose, {}, { kind: 'live2d', source: 'folder' })
    ).rejects.toThrow('IPC sender tidak tepercaya.')

    await expect(
      invoke<unknown>(IPC.settingsUpdate, fixture.sender, {
        settings: {
          ...defaultSettings,
          assets: { ...defaultSettings.assets, live2dRoot: textFile }
        }
      })
    ).rejects.toThrow('Path aset hanya dapat diubah melalui dialog pemilihan aset.')
  })
})

async function ipcFixture(): Promise<{
  root: string
  settingsPath: string
  store: SettingsStore
  sender: object
  scan: ReturnType<typeof vi.fn>
  restartVoice: ReturnType<typeof vi.fn>
  setAssetStatus: ReturnType<typeof vi.fn>
}> {
  const root = await mkdtemp(join(tmpdir(), 'yachiyo-ipc-'))
  roots.push(root)
  const settingsPath = join(root, 'settings.json')
  const vault = new MemoryVault()
  const logger = new AppLogger(join(root, 'app.log'), 'error')
  const store = new SettingsStore(settingsPath, vault, logger)
  await store.load()
  const sender = { send: vi.fn() }
  const scan = vi.fn().mockResolvedValue(missingStatus())
  const restartVoice = vi.fn().mockResolvedValue(undefined)
  const setAssetStatus = vi.fn()
  let currentStatus = missingStatus()
  setAssetStatus.mockImplementation((status: AssetStatus) => {
    currentStatus = status
  })

  registerIpc({
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
    mockServer: { config: {} },
    hermesClient: {},
    voiceSidecar: {
      restart: restartVoice,
      capabilities: () => ({
        sidecar: 'ready',
        edgeTts: true,
        browserTts: true,
        rvc: false,
        ffmpeg: true,
        device: 'cpu',
        detail: 'test'
      }),
      synthesize: vi.fn(),
      stopCurrent: vi.fn()
    },
    assetValidator: { scan, refreshRuntime: (status: AssetStatus) => status },
    proactiveService: {
      onEvent: vi.fn(),
      manualTest: vi.fn(),
      list: vi.fn(),
      schedule: vi.fn(),
      act: vi.fn()
    },
    logger,
    getAssetStatus: () => currentStatus,
    setAssetStatus
  } as never)

  return { root, settingsPath, store, sender, scan, restartVoice, setAssetStatus }
}

async function invoke<T>(channel: string, sender: object, input?: unknown): Promise<T> {
  const handler = electron.handlers.get(channel)
  if (!handler) throw new Error(`Missing IPC handler: ${channel}`)
  return (await handler({ sender }, input)) as T
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
      runtime: {
        ffmpeg: true,
        ffprobe: true,
        python: true,
        rvc: false,
        rmvpe: false,
        contentVec: false
      },
      issues: [{ code: 'VOICE_MISSING', message: 'Kobo belum ditemukan.' }],
      hashes: {}
    }
  }
}

function maoStatus(root: string): AssetStatus {
  const status = missingStatus()
  return {
    ...status,
    scannedAt: '2026-07-17T00:00:01.000Z',
    live2d: {
      ...status.live2d,
      state: 'core-missing',
      sourceKind: 'folder',
      root,
      entry: join(root, 'mao_pro.model3.json'),
      modelName: 'Niziiro Mao',
      modelVersion: 3,
      textures: [{ file: 'mao.png', width: 4096, height: 4096 }],
      expressions: [{ name: 'smile', file: 'smile.exp3.json', parameterCount: 1 }],
      motions: [],
      eyeBlinkParameters: ['ParamEyeLOpen', 'ParamEyeROpen'],
      lipSyncParameters: ['ParamA'],
      hasPhysics: true,
      hasPose: true,
      issues: [{ code: 'CUBISM_CORE_MISSING', message: 'Core belum dipilih.' }]
    }
  }
}

function koboStatus(root: string): AssetStatus {
  const status = missingStatus()
  return {
    ...status,
    scannedAt: '2026-07-17T00:00:02.000Z',
    voice: {
      ...status.voice,
      state: 'runtime-missing',
      sourceKind: 'zip',
      root,
      checkpoint: join(root, 'kobov2.pth'),
      index: join(root, 'added_IVF454_Flat_nprobe_1_kobov2_v2.index'),
      metadata: { version: 'v2', sampleRate: '48k', f0: true, info: '500epoch' },
      issues: [{ code: 'RVC_RUNTIME_MISSING', message: 'Runtime belum lengkap.' }]
    }
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
