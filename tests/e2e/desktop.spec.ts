import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'

import { quitApplication } from './helpers'

const projectRoot = resolve(import.meta.dirname, '../..')
const screenshots = resolve(projectRoot, 'docs/screenshots')

test('onboarding, secure bridge, mock chat, and settings work in Electron', async () => {
  mkdirSync(screenshots, { recursive: true })
  const dataDirectory = mkdtempSync(join(tmpdir(), 'yachiyo-e2e-'))
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  let application: ElectronApplication | null = await electron.launch({
    args: [resolve(projectRoot, 'out/main/index.js')],
    cwd: projectRoot,
    env: {
      ...process.env,
      YACHIYO_DATA_DIR: dataDirectory,
      YACHIYO_DISABLE_DEVTOOLS: '1'
    }
  })

  try {
    const page = await application.firstWindow()
    page.on('pageerror', (error) => pageErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })

    await expect(page).toHaveTitle('Yachiyo Companion')
    await expect
      .poll(() =>
        page.evaluate(() => typeof (globalThis as unknown as { yachiyo?: unknown }).yachiyo)
      )
      .toBe('object')
    await expect(
      page.getByRole('heading', {
        name: 'Teman desktop yang tetap tenang saat layanan lain offline.'
      })
    ).toBeVisible()
    await page.screenshot({ path: join(screenshots, '01-onboarding.png') })

    await page.getByRole('button', { name: 'Lanjut' }).click()
    await expect(page.getByText('Mao runtime')).toBeVisible()
    await expect(page.getByText(/Perlu dipasang setelah menerima lisensi Live2D/)).toBeVisible()
    await page.getByRole('button', { name: 'Lanjut' }).click()
    await expect(page.getByRole('heading', { name: 'Mulai aman dengan mock lokal.' })).toBeVisible()
    await page.getByRole('button', { name: 'Buka Yachiyo' }).click()

    await expect(page.getByText('Mock lokal', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Buka chat dengan Yachiyo' })).toBeVisible()
    await expect(page.getByText('Fallback aktif', { exact: true })).toBeVisible()
    await page.screenshot({ path: join(screenshots, '02-main-fallback.png') })

    const isolation = await page.evaluate(() => {
      const exposed = globalThis as unknown as {
        process?: unknown
        require?: unknown
        yachiyo?: unknown
      }
      return {
        bridgeFrozen: Object.isFrozen(exposed.yachiyo),
        bridgeKeys: Object.keys(exposed.yachiyo ?? {}),
        processType: typeof exposed.process,
        requireType: typeof exposed.require
      }
    })
    expect(isolation.bridgeFrozen).toBe(true)
    expect(isolation.bridgeKeys).toContain('startChat')
    expect(isolation.bridgeKeys).toContain('updateSettings')
    expect(isolation.processType).toBe('undefined')
    expect(isolation.requireType).toBe('undefined')
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
      'content',
      /object-src 'none'/
    )
    const assetProtocol = await page.evaluate(async () => {
      const valid = await fetch('yachiyo-asset://live2d/mao_pro.model3.json')
      const body = (await valid.json()) as { Version?: number }
      const traversal = await fetch('yachiyo-asset://live2d/%2e%2e%2f%2e%2e%2fpackage.json')
      return {
        validStatus: valid.status,
        version: body.Version ?? null,
        traversalStatus: traversal.status
      }
    })
    expect(assetProtocol).toEqual({ validStatus: 200, version: 3, traversalStatus: 404 })

    await page.getByRole('button', { name: 'Atur' }).click()
    await expect(page.getByRole('heading', { name: 'Pengaturan' })).toBeVisible()
    await page
      .getByLabel('Bagian pengaturan')
      .getByRole('button', { name: 'Suara', exact: true })
      .click()
    await page.getByRole('button', { name: 'Mati', exact: true }).click()
    await page.getByRole('button', { name: 'Simpan' }).click()
    await expect(page.getByText('Pengaturan tersimpan.')).toBeVisible()
    await page.getByRole('button', { name: 'Tutup pengaturan' }).click()

    await page.getByRole('button', { name: 'Chat', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Chat dengan Yachiyo' })).toBeVisible()
    await page.getByLabel('Pesan untuk Yachiyo').fill('Halo dari pengujian E2E.')
    await page.getByRole('button', { name: 'Kirim' }).click()
    await expect(page.getByText(/Ini respons dari Hermes mock lokal/)).toBeVisible({
      timeout: 15_000
    })
    await page.screenshot({ path: join(screenshots, '03-mock-chat.png') })
    await page.getByLabel('Pesan untuk Yachiyo').fill('/mock 500')
    await page.getByRole('button', { name: 'Kirim' }).click()
    await expect(page.getByRole('alert')).toContainText('status 500')
    await page.getByRole('button', { name: 'Tutup chat' }).click()

    await page.getByRole('button', { name: 'Atur' }).click()
    await page
      .getByLabel('Bagian pengaturan')
      .getByRole('button', { name: 'Aset', exact: true })
      .click()
    await expect(page.getByText('Cubism Core resmi', { exact: true })).toBeVisible()
    await expect(page.getByText(/Belum dipasang.*persetujuan lisensi Live2D/)).toBeVisible()
    await expect(page.getByText('Kobo RVC', { exact: true })).toBeVisible()
    await page.screenshot({ path: join(screenshots, '04-asset-status.png') })

    await page
      .getByLabel('Bagian pengaturan')
      .getByRole('button', { name: 'Hermes', exact: true })
      .click()
    await page.getByRole('button', { name: 'Tes koneksi' }).click()
    await expect(page.getByText(/Koneksi Hermes berhasil dan model ditemukan/)).toBeVisible()
    await page.getByRole('button', { name: 'Tutup pengaturan' }).click()

    await page.getByRole('button', { name: 'Ingat', exact: true }).click()
    await page.getByRole('button', { name: /Kirim notifikasi tes/ }).click()
    await expect(page.getByRole('status')).toContainText('Notifikasi tes dikirim.')
    await page.getByRole('button', { name: 'Tutup pengingat' }).click()

    expect(pageErrors).toEqual([])
    const expectedSecurityProbeErrors = consoleErrors.filter((message) =>
      message.includes('status of 404')
    )
    expect(expectedSecurityProbeErrors).toHaveLength(1)
    expect(
      consoleErrors.filter((message) => !expectedSecurityProbeErrors.includes(message))
    ).toEqual([])

    expect(await quitApplication(application)).toBe(true)
    application = null
    application = await electron.launch({
      args: [resolve(projectRoot, 'out/main/index.js')],
      cwd: projectRoot,
      env: {
        ...process.env,
        YACHIYO_DATA_DIR: dataDirectory,
        YACHIYO_DISABLE_DEVTOOLS: '1'
      }
    })
    const restoredPage = await application.firstWindow()
    await expect(restoredPage.getByText('Mock lokal', { exact: true })).toBeVisible()
    await expect(restoredPage.locator('.onboarding-backdrop')).toHaveCount(0)
    const restoredVoiceMode = await restoredPage.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          yachiyo?: { getSettings: () => Promise<{ voice: { mode: string } }> }
        }
      ).yachiyo
      return api ? (await api.getSettings()).voice.mode : null
    })
    expect(restoredVoiceMode).toBe('disabled')
    await restoredPage.screenshot({ path: join(screenshots, '05-restart-persistence.png') })
  } finally {
    if (application) await quitApplication(application)
    rmSync(dataDirectory, { recursive: true, force: true })
  }
})
