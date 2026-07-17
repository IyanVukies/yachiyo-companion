import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'

import {
  createExternalAssetFixtures,
  mockNextOpenDialog,
  preparePinnedVoiceRuntime,
  quitApplication
} from './helpers'

const projectRoot = resolve(import.meta.dirname, '../..')
const installedExecutable = resolve(projectRoot, 'output/installed-smoke/Yachiyo Companion.exe')
const screenshots = resolve(projectRoot, 'docs/screenshots')

test('installed 0.2.3 converts and plays Kobo RVC while Mao ParamA is active', async ({
  browserName
}, testInfo) => {
  test.setTimeout(600_000)
  expect(browserName).toBe('chromium')
  test.skip(!existsSync(installedExecutable), 'Install the NSIS build before this test.')
  mkdirSync(screenshots, { recursive: true })
  const profileParent = resolve(projectRoot, '.runtime-cache')
  mkdirSync(profileParent, { recursive: true })
  const dataDirectory = mkdtempSync(join(profileParent, 'installed profile 日本語 dengan spasi-'))
  const runtimeRoot = preparePinnedVoiceRuntime(projectRoot, dataDirectory)
  expect(existsSync(join(runtimeRoot, 'hubert_fairseq_base_ls960.pth'))).toBe(true)
  expect(existsSync(join(runtimeRoot, 'rmvpe.pt'))).toBe(true)
  const assetFixtures = await createExternalAssetFixtures(projectRoot)
  let application: ElectronApplication | null = await launchInstalled(dataDirectory)

  try {
    expect(await application.evaluate(({ app }) => app.isPackaged)).toBe(true)
    expect(await application.evaluate(({ app }) => app.getVersion())).toBe('0.2.3')
    expect(await application.evaluate(({ app }) => app.getPath('userData'))).toBe(dataDirectory)
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

    await mockNextOpenDialog(application, assetFixtures.cubismCore)
    await page.getByRole('button', { name: 'Pilih Core' }).click()
    await expect(page.getByTestId('core-selected-path')).toContainText(assetFixtures.cubismCore)
    await expect(mao.getByText('ready')).toBeVisible()

    await mockNextOpenDialog(application, assetFixtures.koboParent)
    const chooseKoboFolder = kobo.getByRole('button', { name: 'Pilih folder' })
    await chooseKoboFolder.scrollIntoViewIfNeeded()
    await chooseKoboFolder.click()
    await expect(kobo.getByTestId('kobo-selected-path')).toContainText(assetFixtures.koboParent)
    await expect(kobo.getByText('ready')).toBeVisible({ timeout: 60_000 })
    await expect(kobo.getByText('kobov2.pth')).toBeVisible()
    await expect(kobo.getByText('added_IVF454_Flat_nprobe_1_kobov2_v2.index')).toBeVisible()
    await expect(kobo.getByText('Model Kobo dan runtime RVC lengkap siap digunakan.')).toBeVisible()

    await page
      .getByLabel('Bagian pengaturan')
      .getByRole('button', { name: 'Suara', exact: true })
      .click()
    await expect(page.getByTestId('voice-runtime-status')).toContainText('Runtime RVC · ready')
    await expect(page.getByTestId('voice-runtime-status')).toContainText('HuBERT Base')
    await expect(page.getByTestId('voice-runtime-status')).toContainText('RMVPE')
    await page.getByRole('button', { name: 'RVC', exact: true }).click()
    await expect(page.getByRole('option', { name: 'CPU', exact: true })).toBeEnabled()

    const testButton = page.getByRole('button', { name: 'Tes RVC Kobo' })
    await expect(testButton).toBeEnabled()
    await testButton.click()
    await expect
      .poll(() => playbackSource(page), { timeout: 360_000, intervals: [1_000, 2_000, 5_000] })
      .toBe('sidecar-rvc')

    const proof = await voiceProof(page)
    expect(proof.runtime).toBe('ready')
    expect(proof.rvc).toBe(true)
    expect(proof.metrics?.conversionMs).toBeGreaterThan(0)
    expect(proof.metrics?.coldStartMs).toBeGreaterThan(0)
    expect(proof.metrics?.audioDurationMs).toBeGreaterThan(0)
    expect(proof.metrics?.peakRamMb).toBeGreaterThan(0)
    expect(proof.metrics?.outputBytes).toBeGreaterThan(44)
    expect(proof.playback?.durationMs).toBeGreaterThan(0)
    expect(proof.playback?.maxLipSync).toBeGreaterThan(0)
    await expect(page.getByTestId('voice-metrics')).toBeVisible()
    await expect(page.getByText(/Playback WebAudio selesai · lip-sync puncak/)).toBeVisible()
    await page.screenshot({ path: join(screenshots, '08-installed-rvc-playback.png') })

    await page.getByRole('button', { name: 'Simpan' }).click()
    await page.getByRole('button', { name: 'Tutup pengaturan' }).click()
    await expect(page.getByText('Mao runtime aktif', { exact: true })).toBeVisible({
      timeout: 30_000
    })
    await expectLive2DAvatarVisible(page)

    expect(await quitApplication(application)).toBe(true)
    application = null
    application = await launchInstalled(dataDirectory)
    const restored = await application.firstWindow()
    await expect(restored.locator('.onboarding-backdrop')).toHaveCount(0)
    await expect(restored.getByText('Mao runtime aktif', { exact: true })).toBeVisible({
      timeout: 30_000
    })
    await expectLive2DAvatarVisible(restored)
    const restarted = await voiceProof(restored)
    expect(restarted.sidecar).toBe('ready')
    expect(restarted.runtime).toBe('ready')
    expect(restarted.rvc).toBe(true)
    const savedMode = await restored.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          yachiyo: { getSettings: () => Promise<{ voice: { mode: string } }> }
        }
      ).yachiyo
      return (await api.getSettings()).voice.mode
    })
    expect(savedMode).toBe('rvc')
  } finally {
    if (application) await quitApplication(application)
    const logPath = join(dataDirectory, 'logs', 'yachiyo.log')
    if (existsSync(logPath)) await testInfo.attach('installed-yachiyo.log', { path: logPath })
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

async function expectLive2DAvatarVisible(
  page: Awaited<ReturnType<ElectronApplication['firstWindow']>>
): Promise<void> {
  const avatar = page.locator(
    '.avatar-transform-layer[data-avatar-variant="live2d"] .live2d-avatar'
  )
  const canvas = avatar.locator('canvas')
  await expect(avatar).toBeVisible()
  const bounds = await avatar.boundingBox()
  expect(bounds?.width).toBeGreaterThan(100)
  expect(bounds?.height).toBeGreaterThan(100)
  const canvasBounds = await canvas.boundingBox()
  expect(canvasBounds?.width).toBeGreaterThan(100)
  expect(canvasBounds?.height).toBeGreaterThan(100)
  expect(Number(await canvas.getAttribute('width'))).toBeGreaterThan(1)
  expect(Number(await canvas.getAttribute('height'))).toBeGreaterThan(1)
}

async function playbackSource(
  page: Awaited<ReturnType<ElectronApplication['firstWindow']>>
): Promise<string | null> {
  const proof = await voiceProof(page)
  return proof.playback?.source ?? null
}

async function voiceProof(page: Awaited<ReturnType<ElectronApplication['firstWindow']>>): Promise<{
  sidecar: string
  runtime: string
  rvc: boolean
  metrics: Record<string, number> | null
  playback: { source: string; durationMs: number; maxLipSync: number } | null
}> {
  return page.evaluate(async () => {
    const api = (
      globalThis as unknown as {
        yachiyo: {
          getVoiceCapabilities: () => Promise<{
            sidecar: string
            runtime: { state: string }
            rvc: boolean
            lastMetrics: Record<string, number> | null
            lastPlayback: {
              source: string
              durationMs: number
              maxLipSync: number
            } | null
          }>
        }
      }
    ).yachiyo
    const voice = await api.getVoiceCapabilities()
    return {
      sidecar: voice.sidecar,
      runtime: voice.runtime.state,
      rvc: voice.rvc,
      metrics: voice.lastMetrics,
      playback: voice.lastPlayback
    }
  })
}
