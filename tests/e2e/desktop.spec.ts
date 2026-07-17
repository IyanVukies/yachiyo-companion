import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'

import type { AppSettings, SettingsView } from '../../src/shared/types'

import { createExternalAssetFixtures, mockNextOpenDialog, quitApplication } from './helpers'

const projectRoot = resolve(import.meta.dirname, '../..')
const screenshots = resolve(projectRoot, 'docs/screenshots')

type HermesRequestRecord = {
  method: string
  path: string
  authorization: string | null
  contentType: string | null
  stream?: boolean
  lastMessage?: string
  responseKind?: string
}

test('onboarding, secure bridge, mock chat, and settings work in Electron', async () => {
  test.setTimeout(120_000)
  mkdirSync(screenshots, { recursive: true })
  const dataDirectory = mkdtempSync(join(tmpdir(), 'yachiyo-e2e-'))
  const assetFixtures = await createExternalAssetFixtures(projectRoot)
  const hermesServer = await startHermesServer()
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
    expect(isolation.bridgeKeys).toContain('chooseAssetSource')
    expect(isolation.bridgeKeys).toContain('applyAssetSelection')
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
    await expect(page.getByRole('alert')).toContainText('HTTP 500')
    await page.getByRole('button', { name: 'Tutup chat' }).click()

    await page.getByRole('button', { name: 'Atur' }).click()
    await page
      .getByLabel('Bagian pengaturan')
      .getByRole('button', { name: 'Aset', exact: true })
      .click()
    await expect(page.getByText('Cubism Core resmi', { exact: true })).toBeVisible()
    await expect(page.getByText('Kobo RVC', { exact: true })).toBeVisible()
    const maoAssets = page.getByTestId('mao-asset-source')
    const koboAssets = page.getByTestId('kobo-asset-source')

    await mockNextOpenDialog(application, null)
    await maoAssets.getByRole('button', { name: 'Pilih folder' }).click()
    await expect(
      maoAssets.getByText('Folder Mao dibatalkan. Pilihan sebelumnya tidak diubah.')
    ).toBeVisible()

    await mockNextOpenDialog(application, assetFixtures.maoZip)
    await maoAssets.getByRole('button', { name: 'Pilih ZIP' }).click()
    await expect(maoAssets.getByTestId('mao-selected-path')).toContainText(assetFixtures.maoZip)
    await expect(maoAssets.getByText('core-missing')).toBeVisible()
    await expect(maoAssets.getByText('1 · smile')).toBeVisible()
    await expect(maoAssets.getByText('mao.png (64×128)')).toBeVisible()

    await mockNextOpenDialog(application, assetFixtures.maoParent)
    await maoAssets.getByRole('button', { name: 'Ganti folder' }).click()
    await expect(maoAssets.getByTestId('mao-selected-path')).toContainText(assetFixtures.maoParent)
    await expect(maoAssets.getByTestId('mao-normalized-root')).toContainText(
      assetFixtures.maoRuntime
    )
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
    await expect(koboAssets.getByText(/^(ready|runtime-missing)$/)).toBeVisible({
      timeout: 30_000
    })
    await expect(koboAssets.getByText('kobov2.pth')).toBeVisible()
    await page
      .getByLabel('Bagian pengaturan')
      .getByRole('button', { name: 'Hermes', exact: true })
      .click()
    await page.getByLabel('Mode koneksi').getByRole('button', { name: 'Hermes VPS' }).click()
    await page.getByLabel('Base URL').fill(`${hermesServer.baseUrl}/v1/`)
    await page.getByLabel('Nama model').fill('hermes-agent')
    await page.getByLabel(/API key/).fill('  e2e-hermes-key  ')
    await page.getByRole('button', { name: 'Simpan' }).click()
    await expect(page.getByText('Pengaturan tersimpan.')).toBeVisible()
    await page.getByRole('button', { name: 'Tes koneksi' }).click()
    await expect(
      page
        .getByLabel('Diagnostik koneksi Hermes')
        .getByText('Koneksi Hermes berhasil, model ditemukan, dan chat completion terverifikasi.', {
          exact: true
        })
    ).toBeVisible()
    await expect(page.getByText('Hermes online', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Tutup pengaturan' }).click()
    await page.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          yachiyo?: {
            getSettings: () => Promise<SettingsView>
            updateSettings: (input: { settings: AppSettings }) => Promise<SettingsView>
          }
        }
      ).yachiyo
      if (!api) throw new Error('Yachiyo bridge unavailable')
      const view = await api.getSettings()
      await api.updateSettings({
        settings: {
          schemaVersion: view.schemaVersion,
          onboardingComplete: view.onboardingComplete,
          connection: { ...view.connection, streaming: false },
          voice: view.voice,
          proactive: view.proactive,
          desktop: view.desktop,
          assets: view.assets,
          privacy: view.privacy,
          logging: view.logging
        }
      })
    })

    await page.getByRole('button', { name: 'Chat', exact: true }).click()
    await page.getByLabel('Pesan untuk Yachiyo').fill('Pesan nyata untuk Hermes E2E.')
    await page.getByRole('button', { name: 'Kirim' }).click()
    await expect
      .poll(() => hermesServer.requests.at(-1), { timeout: 10_000 })
      .toMatchObject({
        method: 'POST',
        path: '/v1/chat/completions',
        stream: false,
        lastMessage: 'Pesan nyata untuk Hermes E2E.',
        responseKind: 'runtime-json'
      })
    await expect(page.getByText('REAL HERMES E2E', { exact: true })).toBeVisible({
      timeout: 15_000
    })

    await page.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          yachiyo?: {
            getSettings: () => Promise<SettingsView>
            updateSettings: (input: { settings: AppSettings }) => Promise<SettingsView>
          }
        }
      ).yachiyo
      if (!api) throw new Error('Yachiyo bridge unavailable')
      const view = await api.getSettings()
      await api.updateSettings({
        settings: {
          schemaVersion: view.schemaVersion,
          onboardingComplete: view.onboardingComplete,
          connection: { ...view.connection, streaming: true },
          voice: view.voice,
          proactive: view.proactive,
          desktop: view.desktop,
          assets: view.assets,
          privacy: view.privacy,
          logging: view.logging
        }
      })
    })
    await page.getByLabel('Pesan untuk Yachiyo').fill('Pesan streaming untuk Hermes E2E.')
    await page.getByRole('button', { name: 'Kirim' }).click()
    await expect
      .poll(
        () =>
          hermesServer.requests.findLast(
            (request) => request.lastMessage === 'Pesan streaming untuk Hermes E2E.'
          ),
        { timeout: 10_000 }
      )
      .toMatchObject({ stream: true, responseKind: 'runtime-sse' })
    await expect(page.getByText('REAL HERMES SSE E2E', { exact: true })).toBeVisible({
      timeout: 15_000
    })
    await page.getByRole('button', { name: 'Tutup chat' }).click()
    expect(hermesServer.requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'GET', path: '/v1/models' }),
        expect.objectContaining({
          method: 'POST',
          path: '/v1/chat/completions',
          authorization: 'Bearer e2e-hermes-key',
          contentType: 'application/json'
        })
      ])
    )

    await page.getByRole('button', { name: 'Ingat', exact: true }).click()
    await page.getByRole('button', { name: /Kirim notifikasi tes/ }).click()
    await expect(page.getByRole('status')).toContainText(
      /Notifikasi tes dikirim\.|Tes ditahan karena sedang quiet hours\./
    )
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
    await expect(restoredPage.getByText('Hermes online', { exact: true })).toBeVisible({
      timeout: 15_000
    })
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
    await restoredPage.getByRole('button', { name: 'Atur' }).click()
    await restoredPage
      .getByLabel('Bagian pengaturan')
      .getByRole('button', { name: 'Aset', exact: true })
      .click()
    await expect(restoredPage.getByTestId('mao-selected-path')).toContainText(
      assetFixtures.maoParent
    )
    await expect(restoredPage.getByTestId('kobo-selected-path')).toContainText(
      assetFixtures.koboParent
    )
    await restoredPage.screenshot({ path: join(screenshots, '05-restart-persistence.png') })
  } finally {
    if (application) await quitApplication(application)
    await hermesServer.close()
    assetFixtures.cleanup()
    rmSync(dataDirectory, { recursive: true, force: true })
  }
})

async function startHermesServer(): Promise<{
  baseUrl: string
  requests: HermesRequestRecord[]
  close: () => Promise<void>
}> {
  const requests: HermesRequestRecord[] = []
  const server = createServer((request, response) => {
    void handleHermesRequest(request, response, requests).catch(() => {
      response.writeHead(500).end()
    })
  })
  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolvePromise)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Hermes E2E server unavailable')
  return {
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
    requests,
    close: async () => {
      server.closeAllConnections()
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()))
    }
  }
}

async function handleHermesRequest(
  request: IncomingMessage,
  response: ServerResponse,
  requests: HermesRequestRecord[]
): Promise<void> {
  const method = request.method ?? 'GET'
  const path = request.url ?? '/'
  const record: HermesRequestRecord = {
    method,
    path,
    authorization: request.headers.authorization ?? null,
    contentType: request.headers['content-type'] ?? null
  }
  requests.push(record)
  if (request.headers.authorization !== 'Bearer e2e-hermes-key') {
    sendJson(response, 401, { error: 'unauthorized' })
    return
  }
  if (method === 'GET' && path === '/v1/models') {
    sendJson(response, 200, { data: [{ id: 'hermes-agent', object: 'model' }] })
    return
  }
  if (method !== 'POST' || path !== '/v1/chat/completions') {
    sendJson(response, 404, { error: 'not found' })
    return
  }
  const payload = JSON.parse(await readRequestBody(request)) as {
    model?: string
    messages?: { role?: string; content?: string }[]
    stream?: boolean
  }
  record.stream = payload.stream === true
  const lastMessage = payload.messages?.at(-1)?.content
  if (lastMessage !== undefined) record.lastMessage = lastMessage
  if (payload.model !== 'hermes-agent' || !Array.isArray(payload.messages)) {
    sendJson(response, 400, { error: 'invalid request' })
    return
  }
  if (payload.stream === false) {
    const content = lastMessage === 'Balas hanya ONLINE' ? 'ONLINE' : 'REAL HERMES E2E'
    record.responseKind = lastMessage === 'Balas hanya ONLINE' ? 'health-json' : 'runtime-json'
    sendJson(response, 200, { choices: [{ message: { role: 'assistant', content } }] })
    return
  }
  response.writeHead(200, { 'Content-Type': 'text/event-stream' })
  record.responseKind = 'runtime-sse'
  response.write(
    `data: ${JSON.stringify({ choices: [{ delta: { content: 'REAL HERMES SSE E2E' } }] })}\r\n\r\n`
  )
  response.end('data: [DONE]\r\n\r\n')
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array))
  return Buffer.concat(chunks).toString('utf8')
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const encoded = JSON.stringify(body)
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(encoded)
  })
  response.end(encoded)
}
