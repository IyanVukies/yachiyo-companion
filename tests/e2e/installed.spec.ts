import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'

import { createExternalAssetFixtures, mockNextOpenDialog, quitApplication } from './helpers'

const projectRoot = resolve(import.meta.dirname, '../..')
const installedExecutable = resolve(projectRoot, 'output/installed-smoke/Yachiyo Companion.exe')
const screenshots = resolve(projectRoot, 'docs/screenshots')

test('installed 0.1.1 persists and rescans real Mao and Kobo selections', async () => {
  test.setTimeout(180_000)
  test.skip(!existsSync(installedExecutable), 'Install the NSIS build before this test.')
  mkdirSync(screenshots, { recursive: true })
  const dataDirectory = mkdtempSync(join(tmpdir(), 'yachiyo-installed-'))
  const assetFixtures = await createExternalAssetFixtures(projectRoot)
  let application: ElectronApplication | null = await launchInstalled(dataDirectory)

  try {
    expect(await application.evaluate(({ app }) => app.isPackaged)).toBe(true)
    expect(await application.evaluate(({ app }) => app.getVersion())).toBe('0.1.1')
    const page = await application.firstWindow()
    await page.getByRole('button', { name: 'Lanjut' }).click()
    await page.getByRole('button', { name: 'Lanjut' }).click()
    await page.getByRole('button', { name: 'Buka Yachiyo' }).click()
    await page.getByRole('button', { name: 'Atur' }).click()
    await page
      .getByLabel('Bagian pengaturan')
      .getByRole('button', { name: 'Aset', exact: true })
      .click()

    const mao = page.getByTestId('mao-asset-source')
    const kobo = page.getByTestId('kobo-asset-source')
    await mockNextOpenDialog(application, assetFixtures.maoRuntime)
    await mao.getByRole('button', { name: 'Pilih folder' }).click()
    await expect(mao.getByTestId('mao-selected-path')).toContainText(assetFixtures.maoRuntime)
    await expect(mao.getByTestId('mao-normalized-root')).toContainText(assetFixtures.maoRuntime)
    await expect(mao.getByText('core-missing')).toBeVisible()
    await expect(mao.getByText(/^8 ·/)).toBeVisible()
    await expect(mao.getByText(/^7 ·/)).toBeVisible()
    await expect(mao.getByText('ParamEyeLOpen, ParamEyeROpen')).toBeVisible()
    await expect(mao.getByText('ParamA')).toBeVisible()
    await expect(mao.getByRole('button', { name: 'Ganti folder' })).toBeVisible()
    await expect(mao.getByRole('button', { name: 'Pilih ZIP' })).toBeVisible()

    await mao.getByRole('button', { name: 'Scan ulang' }).click()
    await expect(
      mao.getByText('Struktur Mao valid. Pilih Cubism Core resmi untuk mengaktifkan avatar.')
    ).toBeVisible()

    await mockNextOpenDialog(application, assetFixtures.koboParent)
    const chooseKoboFolder = kobo.getByRole('button', { name: 'Pilih folder' })
    await chooseKoboFolder.scrollIntoViewIfNeeded()
    await expect(chooseKoboFolder).toBeEnabled()
    await chooseKoboFolder.click()
    await expect(kobo.getByTestId('kobo-selected-path')).toContainText(assetFixtures.koboParent)
    await expect(kobo.getByText('runtime-missing')).toBeVisible()
    await expect(kobo.getByText('kobov2.pth')).toBeVisible()
    await expect(kobo.getByText('added_IVF454_Flat_nprobe_1_kobov2_v2.index')).toBeVisible()
    await expect(
      kobo.getByText('Model Kobo valid. Runtime RVC belum lengkap, jadi Basic TTS tetap digunakan.')
    ).toBeVisible()
    await page.screenshot({ path: join(screenshots, '07-installed-asset-selection.png') })

    expect(await quitApplication(application)).toBe(true)
    application = null
    application = await launchInstalled(dataDirectory)
    const restored = await application.firstWindow()
    await expect(restored.locator('.onboarding-backdrop')).toHaveCount(0)
    await restored.getByRole('button', { name: 'Atur' }).click()
    await restored
      .getByLabel('Bagian pengaturan')
      .getByRole('button', { name: 'Aset', exact: true })
      .click()
    await expect(restored.getByTestId('mao-selected-path')).toContainText(assetFixtures.maoRuntime)
    await expect(restored.getByTestId('mao-normalized-root')).toContainText(
      assetFixtures.maoRuntime
    )
    await expect(restored.getByTestId('kobo-selected-path')).toContainText(assetFixtures.koboParent)
    await expect(restored.getByTestId('mao-asset-source').getByText('core-missing')).toBeVisible()
    await expect(
      restored.getByTestId('kobo-asset-source').getByText('runtime-missing')
    ).toBeVisible()
  } finally {
    if (application) await quitApplication(application)
    assetFixtures.cleanup()
    rmSync(dataDirectory, { recursive: true, force: true })
  }
})

function launchInstalled(dataDirectory: string): Promise<ElectronApplication> {
  return electron.launch({
    executablePath: installedExecutable,
    env: {
      ...process.env,
      YACHIYO_DATA_DIR: dataDirectory,
      YACHIYO_DISABLE_DEVTOOLS: '1'
    }
  })
}
