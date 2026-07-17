import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

import { createExternalAssetFixtures, mockNextOpenDialog, quitApplication } from './helpers'

const projectRoot = resolve(import.meta.dirname, '../..')
const unpackedExecutable = resolve(projectRoot, 'release/win-unpacked/Yachiyo Companion.exe')
const screenshots = resolve(projectRoot, 'docs/screenshots')

test('packaged executable starts with clean-profile fallbacks and bundled sidecar', async () => {
  test.setTimeout(120_000)
  test.skip(!existsSync(unpackedExecutable), 'Run npm run package before the packaged smoke test.')
  mkdirSync(screenshots, { recursive: true })
  const dataDirectory = mkdtempSync(join(tmpdir(), 'yachiyo-packaged-'))
  const assetFixtures = await createExternalAssetFixtures(projectRoot)
  const application = await electron.launch({
    executablePath: unpackedExecutable,
    env: {
      ...process.env,
      YACHIYO_DATA_DIR: dataDirectory,
      YACHIYO_DISABLE_DEVTOOLS: '1'
    }
  })

  try {
    expect(await application.evaluate(({ app }) => app.isPackaged)).toBe(true)
    const page = await application.firstWindow()
    await expect(page).toHaveTitle('Yachiyo Companion')
    await expect
      .poll(() =>
        page.evaluate(() => typeof (globalThis as unknown as { yachiyo?: unknown }).yachiyo)
      )
      .toBe('object')
    await expect(page.getByText('Mock lokal', { exact: true })).toBeVisible()

    const status = await page.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          yachiyo: {
            getAppStatus: () => Promise<{
              assets: { live2d: { state: string }; voice: { state: string } }
              trayReady: boolean
              voice: { sidecar: string; edgeTts: boolean; ffmpeg: boolean; rvc: boolean }
            }>
          }
        }
      ).yachiyo
      return api.getAppStatus()
    })
    expect(status.assets.live2d.state).toBe('missing')
    expect(status.assets.voice.state).toBe('missing')
    expect(status.trayReady).toBe(true)
    expect(status.voice.sidecar).toBe('ready')
    expect(status.voice.edgeTts).toBe(true)
    expect(status.voice.ffmpeg).toBe(true)
    expect(status.voice.rvc).toBe(false)

    await page.getByRole('button', { name: 'Lanjut' }).click()
    await expect(page.getByText('Mao runtime')).toBeVisible()
    await page.getByRole('button', { name: 'Lanjut' }).click()
    await page.getByRole('button', { name: 'Buka Yachiyo' }).click()
    await expect(page.getByRole('button', { name: 'Buka chat dengan Yachiyo' })).toBeVisible()
    await expect(page.getByText('Fallback aktif', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Atur' }).click()
    await page
      .getByLabel('Bagian pengaturan')
      .getByRole('button', { name: 'Aset', exact: true })
      .click()
    const maoAssets = page.getByTestId('mao-asset-source')
    const koboAssets = page.getByTestId('kobo-asset-source')

    await mockNextOpenDialog(application, assetFixtures.maoParent)
    await maoAssets.getByRole('button', { name: 'Pilih folder' }).click()
    await expect(maoAssets.getByTestId('mao-selected-path')).toContainText(assetFixtures.maoParent)
    await expect(maoAssets.getByTestId('mao-normalized-root')).toContainText(
      assetFixtures.maoRuntime
    )
    await expect(maoAssets.getByText('core-missing')).toBeVisible()
    await expect(maoAssets.getByText(/^8 ·/)).toBeVisible()
    await expect(maoAssets.getByText(/^7 ·/)).toBeVisible()

    await mockNextOpenDialog(application, assetFixtures.koboParent)
    const chooseKoboFolder = koboAssets.getByRole('button', { name: 'Pilih folder' })
    await chooseKoboFolder.scrollIntoViewIfNeeded()
    await expect(chooseKoboFolder).toBeEnabled()
    await chooseKoboFolder.click()
    await expect(koboAssets.getByTestId('kobo-selected-path')).toContainText(
      assetFixtures.koboParent
    )
    await expect(koboAssets.getByText('runtime-missing')).toBeVisible()
    await expect(koboAssets.getByText('kobov2.pth')).toBeVisible()

    const externalStatus = await page.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          yachiyo: {
            getAppStatus: () => Promise<{
              assets: {
                live2d: {
                  state: string
                  root: string | null
                  expressions: unknown[]
                  motions: unknown[]
                }
                voice: { state: string; checkpoint: string | null; index: string | null }
              }
            }>
          }
        }
      ).yachiyo
      return api.getAppStatus()
    })
    expect(externalStatus.assets.live2d.state).toBe('core-missing')
    expect(externalStatus.assets.live2d.root).toBe(assetFixtures.maoRuntime)
    expect(externalStatus.assets.live2d.expressions).toHaveLength(8)
    expect(externalStatus.assets.live2d.motions).toHaveLength(7)
    expect(externalStatus.assets.voice.state).toBe('runtime-missing')
    expect(externalStatus.assets.voice.checkpoint).not.toBeNull()
    expect(externalStatus.assets.voice.index).not.toBeNull()

    await page.screenshot({ path: join(screenshots, '06-packaged-fallback.png') })
    await page.getByRole('button', { name: 'Tutup pengaturan' }).click()
    await page.reload()
    await expect(page.locator('.onboarding-backdrop')).toHaveCount(0)
    await page.getByRole('button', { name: 'Atur' }).click()
    await page
      .getByLabel('Bagian pengaturan')
      .getByRole('button', { name: 'Aset', exact: true })
      .click()
    await expect(page.getByTestId('mao-selected-path')).toContainText(assetFixtures.maoParent)
    await expect(page.getByTestId('kobo-selected-path')).toContainText(assetFixtures.koboParent)
    await page.getByRole('button', { name: 'Tutup pengaturan' }).click()
    await page.getByRole('button', { name: 'Sembunyikan ke tray' }).click()
    await expect
      .poll(() =>
        application.evaluate(
          ({ BrowserWindow }) => BrowserWindow.getAllWindows().at(0)?.isVisible() ?? false
        )
      )
      .toBe(false)
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().at(0)?.show())
    await expect
      .poll(() =>
        application.evaluate(
          ({ BrowserWindow }) => BrowserWindow.getAllWindows().at(0)?.isVisible() ?? false
        )
      )
      .toBe(true)
  } finally {
    expect(await quitApplication(application)).toBe(true)
    assetFixtures.cleanup()
    rmSync(dataDirectory, { recursive: true, force: true })
  }
})
