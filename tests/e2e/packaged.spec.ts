import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

import { quitApplication } from './helpers'

const projectRoot = resolve(import.meta.dirname, '../..')
const installedExecutable = resolve(projectRoot, 'output/installed-smoke/Yachiyo Companion.exe')
const unpackedExecutable = resolve(projectRoot, 'release/win-unpacked/Yachiyo Companion.exe')
const executable = existsSync(installedExecutable) ? installedExecutable : unpackedExecutable
const screenshots = resolve(projectRoot, 'docs/screenshots')

test('packaged executable starts with clean-profile fallbacks and bundled sidecar', async () => {
  test.skip(!existsSync(executable), 'Run npm run package before the packaged smoke test.')
  mkdirSync(screenshots, { recursive: true })
  const dataDirectory = mkdtempSync(join(tmpdir(), 'yachiyo-packaged-'))
  const application = await electron.launch({
    executablePath: executable,
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

    const externalStatus = await page.evaluate(
      async ({ live2dRoot, voiceRoot }) => {
        const api = (
          globalThis as unknown as {
            yachiyo: {
              getAppStatus: () => Promise<{
                assets: {
                  live2d: { state: string; expressions: unknown[]; motions: unknown[] }
                  voice: { state: string; checkpoint: string | null; index: string | null }
                }
              }>
              getSettings: () => Promise<
                Record<string, unknown> & {
                  assets: {
                    live2dRoot: string
                    voiceRoot: string
                    cubismCorePath: string
                  }
                  hasApiKey: boolean
                  secureStorageAvailable: boolean
                }
              >
              updateSettings: (payload: { settings: Record<string, unknown> }) => Promise<unknown>
            }
          }
        ).yachiyo
        const view = await api.getSettings()
        const { hasApiKey: _hasApiKey, secureStorageAvailable: _secureStorage, ...settings } = view
        void _hasApiKey
        void _secureStorage
        await api.updateSettings({
          settings: {
            ...settings,
            assets: { ...view.assets, live2dRoot, voiceRoot }
          }
        })
        return api.getAppStatus()
      },
      {
        live2dRoot: resolve(projectRoot, 'assets/source/mao_en'),
        voiceRoot: resolve(projectRoot, 'assets/source/kobo')
      }
    )
    expect(externalStatus.assets.live2d.state).toBe('core-missing')
    expect(externalStatus.assets.live2d.expressions).toHaveLength(8)
    expect(externalStatus.assets.live2d.motions).toHaveLength(7)
    expect(externalStatus.assets.voice.state).toBe('runtime-missing')
    expect(externalStatus.assets.voice.checkpoint).not.toBeNull()
    expect(externalStatus.assets.voice.index).not.toBeNull()
    await page.reload()

    await page.getByRole('button', { name: 'Lanjut' }).click()
    await expect(page.getByText('Mao runtime')).toBeVisible()
    await expect(page.getByText('8 ekspresi · 7 motion')).toBeVisible()
    await page.getByRole('button', { name: 'Lanjut' }).click()
    await page.getByRole('button', { name: 'Buka Yachiyo' }).click()
    await expect(page.getByRole('button', { name: 'Buka chat dengan Yachiyo' })).toBeVisible()
    await expect(page.getByText('Fallback aktif', { exact: true })).toBeVisible()
    await page.screenshot({ path: join(screenshots, '06-packaged-fallback.png') })
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
    rmSync(dataDirectory, { recursive: true, force: true })
  }
})
