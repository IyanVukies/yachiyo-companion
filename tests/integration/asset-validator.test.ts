import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { AssetValidator } from '../../src/main/services/asset-validator'
import { AppLogger } from '../../src/main/services/logger'
import type { AssetStatus } from '../../src/shared/types'

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
