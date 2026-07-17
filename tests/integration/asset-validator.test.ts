import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { AssetValidator } from '../../src/main/services/asset-validator'
import { AppLogger } from '../../src/main/services/logger'
import type { AssetStatus } from '../../src/shared/types'
import { createStoredZip, writeStoredZip } from '../helpers/zip'

let root: string
let status: AssetStatus

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'yachiyo-assets-'))
  const validator = new AssetValidator(
    resolve('.'),
    join(root, 'cache'),
    new AppLogger(join(root, 'asset.log'), 'error'),
    () => ({
      ffmpeg: true,
      ffprobe: true,
      python: false,
      rvc: false,
      rmvpe: false,
      contentVec: false
    })
  )
  status = await validator.scan({ live2dRoot: '', voiceRoot: '', cubismCorePath: '' })
}, 30_000)

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('provided asset inspection', () => {
  it('reports the Mao runtime from its actual directory contents', () => {
    expect(status.live2d).toMatchObject({
      state: 'core-missing',
      sourceKind: 'folder',
      modelName: 'Niziiro Mao',
      modelVersion: 3,
      textureSize: { width: 4096, height: 4096 },
      hasPhysics: true,
      hasPose: true,
      hasCore: false
    })
    expect(status.live2d.expressions).toHaveLength(8)
    expect(status.live2d.motions).toHaveLength(7)
    expect(status.live2d.lipSyncParameters).toContain('ParamA')
    expect(status.live2d.eyeBlinkParameters).toEqual(
      expect.arrayContaining(['ParamEyeLOpen', 'ParamEyeROpen'])
    )
  })

  it('reports Kobo metadata without unpickling the checkpoint', () => {
    expect(status.voice).toMatchObject({
      state: 'runtime-missing',
      sourceKind: 'folder',
      metadata: { version: 'v2', sampleRate: '48k', f0: true, info: '500epoch' }
    })
    expect(status.voice.checkpoint).toMatch(/kobov2\.pth$/)
    expect(status.voice.index).toMatch(/\.index$/)
    expect(Object.keys(status.voice.hashes)).toHaveLength(2)
  })
})

describe('user-selected asset sources', () => {
  it('normalizes both the Mao parent and runtime folders with spaces and non-ASCII characters', async () => {
    const parent = join(root, 'Pilihan aset 日本語 dengan spasi', 'Mao')
    const runtime = await createMaoFixture(parent)
    const validator = fixtureValidator(
      join(root, 'isolated-project'),
      join(root, 'normalized-cache')
    )

    const fromParent = await validator.scan({
      live2dRoot: parent,
      voiceRoot: '',
      cubismCorePath: ''
    })
    const fromRuntime = await validator.scan({
      live2dRoot: runtime,
      voiceRoot: '',
      cubismCorePath: ''
    })

    for (const result of [fromParent, fromRuntime]) {
      expect(result.live2d).toMatchObject({
        state: 'core-missing',
        sourceKind: 'folder',
        root: runtime,
        hasPhysics: true,
        hasPose: true,
        eyeBlinkParameters: ['ParamEyeLOpen', 'ParamEyeROpen'],
        lipSyncParameters: ['ParamA']
      })
      expect(result.live2d.entry).toBe(join(runtime, 'mao_pro.model3.json'))
      expect(result.live2d.expressions).toHaveLength(1)
      expect(result.live2d.motions).toHaveLength(1)
      expect(result.live2d.textures).toEqual([{ file: 'mao.png', width: 64, height: 128 }])
    }
  })

  it('reads a Mao ZIP selected through a path with spaces and non-ASCII characters', async () => {
    const zipPath = join(root, 'Arsip aset 日本語', 'Mao valid dengan spasi.zip')
    await writeStoredZip(zipPath, maoZipEntries('bundle/runtime'))
    const validator = fixtureValidator(join(root, 'zip-project'), join(root, 'zip-cache'))

    const result = await validator.scan({
      live2dRoot: zipPath,
      voiceRoot: '',
      cubismCorePath: ''
    })

    expect(result.live2d.state).toBe('core-missing')
    expect(result.live2d.sourceKind).toBe('zip')
    expect(result.live2d.entry).toMatch(/mao_pro\.model3\.json$/)
    expect(result.live2d.textures).toEqual([{ file: 'mao.png', width: 64, height: 128 }])
  })

  it('shows an explicit invalid state instead of silently falling back from a missing selection', async () => {
    const missing = join(root, 'Folder hilang 日本語', 'Mao')
    const validator = fixtureValidator(resolve('.'), join(root, 'missing-cache'))

    const result = await validator.scan({
      live2dRoot: missing,
      voiceRoot: join(root, 'Kobo hilang'),
      cubismCorePath: ''
    })

    expect(result.live2d.state).toBe('invalid')
    expect(result.live2d.root).toBe(missing)
    expect(result.live2d.issues[0]?.code).toBe('LIVE2D_PATH_INVALID')
    expect(result.voice.state).toBe('invalid')
    expect(result.voice.issues[0]?.code).toBe('VOICE_PATH_INVALID')
  })

  it('uses core-missing until a compatible official-shaped Core validates, then reports ready', async () => {
    const parent = join(root, 'Core state 日本語', 'Mao')
    await createMaoFixture(parent)
    const core = join(root, 'Core state 日本語', 'live2dcubismcore.min.js')
    const validator = fixtureValidator(join(root, 'core-project'), join(root, 'core-cache'))

    const missingCore = await validator.scan({
      live2dRoot: parent,
      voiceRoot: '',
      cubismCorePath: ''
    })
    expect(missingCore.live2d.state).toBe('core-missing')

    await writeFile(core, 'window.Live2DCubismCore = { fake: true }; // Cubism Core')
    const invalidCore = await validator.scan({
      live2dRoot: parent,
      voiceRoot: '',
      cubismCorePath: core
    })
    expect(invalidCore.live2d.state).toBe('invalid')
    expect(invalidCore.live2d.hasCore).toBe(false)
    expect(invalidCore.live2d.issues.some((item) => item.code === 'CUBISM_CORE_INVALID')).toBe(true)

    await writeFile(
      core,
      '/* Cubism Core */ var Live2DCubismCore={Version:{csmGetVersion:function(){}},Moc:{},Model:{}};'
    )
    const ready = await validator.scan({
      live2dRoot: parent,
      voiceRoot: '',
      cubismCorePath: core
    })
    expect(ready.live2d.state).toBe('ready')
    expect(ready.live2d.hasCore).toBe(true)
  })

  it('reports equivalent Kobo inventory from folder and ZIP sources', async () => {
    const folder = join(root, 'Suara Kobo 日本語 dengan spasi')
    await mkdir(folder, { recursive: true })
    const checkpoint = createStoredZip([{ name: 'archive/data.pkl', data: 'v2 48k f0 500epoch' }])
    await writeFile(join(folder, 'kobov2.pth'), checkpoint)
    await writeFile(join(folder, 'added_IVF454_Flat_nprobe_1_kobov2_v2.index'), 'index')
    const outerZip = join(root, 'ZIP Kobo 日本語', 'kobo model.zip')
    await writeStoredZip(outerZip, [
      { name: 'kobo/kobov2.pth', data: checkpoint },
      { name: 'kobo/added_IVF454_Flat_nprobe_1_kobov2_v2.index', data: 'index' }
    ])
    const validator = fixtureValidator(join(root, 'voice-project'), join(root, 'voice-cache'))

    const fromFolder = await validator.scan({
      live2dRoot: '',
      voiceRoot: folder,
      cubismCorePath: ''
    })
    const fromZip = await validator.scan({
      live2dRoot: '',
      voiceRoot: outerZip,
      cubismCorePath: ''
    })

    for (const result of [fromFolder, fromZip]) {
      expect(result.voice.state).toBe('runtime-missing')
      expect(result.voice.metadata).toEqual({
        version: 'v2',
        sampleRate: '48k',
        f0: true,
        info: '500epoch'
      })
      expect(result.voice.checkpoint).toMatch(/kobov2\.pth$/)
      expect(result.voice.index).toMatch(/\.index$/)
    }
    expect(fromFolder.voice.sourceKind).toBe('folder')
    expect(fromZip.voice.sourceKind).toBe('zip')
  })

  it('retains ZIP traversal protection during user-selected scans', async () => {
    const zipPath = join(root, 'malicious.zip')
    const escaped = join(root, 'escaped.txt')
    await writeStoredZip(zipPath, [{ name: '../../escaped.txt', data: 'blocked' }], {
      allowUnsafeNames: true
    })
    const validator = fixtureValidator(join(root, 'safe-project'), join(root, 'safe-cache'))

    const result = await validator.scan({
      live2dRoot: zipPath,
      voiceRoot: '',
      cubismCorePath: ''
    })

    expect(result.live2d.state).toBe('invalid')
    expect(result.live2d.issues[0]?.message).toBe('ZIP berisi path tidak aman dan ditolak.')
    await expect(access(escaped)).rejects.toThrow()
  })
})

function fixtureValidator(projectRoot: string, cacheRoot: string): AssetValidator {
  return new AssetValidator(
    projectRoot,
    cacheRoot,
    new AppLogger(join(root, `asset-${String(Math.random())}.log`), 'error'),
    () => ({
      ffmpeg: true,
      ffprobe: true,
      python: false,
      rvc: false,
      rmvpe: false,
      contentVec: false
    })
  )
}

async function createMaoFixture(parent: string): Promise<string> {
  const runtime = join(parent, 'runtime')
  await mkdir(runtime, { recursive: true })
  for (const entry of maoZipEntries('')) {
    const target = join(runtime, entry.name)
    await mkdir(resolve(target, '..'), { recursive: true })
    await writeFile(target, entry.data)
  }
  return runtime
}

function maoZipEntries(prefix: string): { name: string; data: Buffer | string }[] {
  const at = (name: string): string => (prefix ? `${prefix}/${name}` : name)
  return [
    { name: at('mao_pro.model3.json'), data: JSON.stringify(maoModelJson()) },
    { name: at('mao.moc3'), data: Buffer.from([5, 0, 0, 0]) },
    { name: at('mao.png'), data: pngHeader(64, 128) },
    { name: at('mao.physics3.json'), data: '{}' },
    { name: at('mao.pose3.json'), data: '{}' },
    { name: at('smile.exp3.json'), data: '{"Parameters":[{}]}' },
    {
      name: at('idle.motion3.json'),
      data: '{"Meta":{"Duration":1.5,"Loop":true}}'
    }
  ]
}

function maoModelJson(): Record<string, unknown> {
  return {
    Version: 3,
    FileReferences: {
      Moc: 'mao.moc3',
      Textures: ['mao.png'],
      Physics: 'mao.physics3.json',
      Pose: 'mao.pose3.json',
      Expressions: [{ Name: 'smile', File: 'smile.exp3.json' }],
      Motions: { Idle: [{ File: 'idle.motion3.json' }] }
    },
    Groups: [
      { Target: 'Parameter', Name: 'EyeBlink', Ids: ['ParamEyeLOpen', 'ParamEyeROpen'] },
      { Target: 'Parameter', Name: 'LipSync', Ids: ['ParamA'] }
    ]
  }
}

function pngHeader(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24)
  Buffer.from('89504e470d0a1a0a', 'hex').copy(buffer)
  buffer.writeUInt32BE(width, 16)
  buffer.writeUInt32BE(height, 20)
  return buffer
}
