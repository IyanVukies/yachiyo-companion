import { once } from 'node:events'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import type { ElectronApplication } from '@playwright/test'

import { writeStoredZip } from '../helpers/zip'

export async function quitApplication(application: ElectronApplication): Promise<boolean> {
  const child = application.process()
  if (child.exitCode !== null) return true
  await application.evaluate(({ app }) => app.quit()).catch(() => undefined)
  const exited = await Promise.race([
    once(child, 'exit').then(() => true),
    new Promise<false>((resolvePromise) => setTimeout(() => resolvePromise(false), 8_000))
  ])
  if (!exited) child.kill()
  return exited
}

export async function mockNextOpenDialog(
  application: ElectronApplication,
  selectedPath: string | null
): Promise<void> {
  await application.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = () =>
      Promise.resolve({
        canceled: path === null,
        filePaths: path === null ? [] : [path]
      })
  }, selectedPath)
}

export async function createExternalAssetFixtures(projectRoot: string): Promise<{
  root: string
  maoParent: string
  maoRuntime: string
  maoZip: string
  invalidMao: string
  koboParent: string
  cleanup: () => void
}> {
  const root = mkdtempSync(join(tmpdir(), 'yachiyo-assets-'))
  const namedRoot = join(root, 'Pilihan aset 日本語 dengan spasi')
  mkdirSync(namedRoot, { recursive: true })
  const maoParent = join(namedRoot, 'Mao parent folder')
  const koboParent = join(namedRoot, 'Kobo voice folder')
  symlinkSync(resolve(projectRoot, 'assets/source/mao_en'), maoParent, 'junction')
  symlinkSync(resolve(projectRoot, 'assets/source/kobo'), koboParent, 'junction')
  const invalidMao = join(namedRoot, 'Mao folder tidak valid')
  mkdirSync(invalidMao, { recursive: true })
  const maoZip = join(namedRoot, 'Mao valid 日本語.zip')
  await writeStoredZip(maoZip, testMaoEntries())

  return {
    root,
    maoParent,
    maoRuntime: join(maoParent, 'runtime'),
    maoZip,
    invalidMao,
    koboParent,
    cleanup: () => {
      for (const link of [maoParent, koboParent]) {
        try {
          unlinkSync(link)
        } catch {
          // The enclosing temporary directory cleanup remains the final fallback.
        }
      }
      rmSync(root, { recursive: true, force: true })
    }
  }
}

function testMaoEntries(): { name: string; data: Buffer | string }[] {
  const model = {
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
  const png = Buffer.alloc(24)
  Buffer.from('89504e470d0a1a0a', 'hex').copy(png)
  png.writeUInt32BE(64, 16)
  png.writeUInt32BE(128, 20)
  return [
    { name: 'runtime/mao_pro.model3.json', data: JSON.stringify(model) },
    { name: 'runtime/mao.moc3', data: Buffer.from([5, 0, 0, 0]) },
    { name: 'runtime/mao.png', data: png },
    { name: 'runtime/mao.physics3.json', data: '{}' },
    { name: 'runtime/mao.pose3.json', data: '{}' },
    { name: 'runtime/smile.exp3.json', data: '{"Parameters":[{}]}' },
    { name: 'runtime/idle.motion3.json', data: '{"Meta":{"Duration":1,"Loop":true}}' }
  ]
}
