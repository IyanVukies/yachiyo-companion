import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'

import { defaultSettings } from '../../src/shared/schemas'

import { quitApplication } from './helpers'

const projectRoot = resolve(import.meta.dirname, '../..')
const screenshots = resolve(projectRoot, 'output/playwright')
const shortcut = 'CommandOrControl+Alt+Shift+F10'

test('Companion, Full Chat, and floating launcher share one desktop lifecycle', async () => {
  test.setTimeout(90_000)
  mkdirSync(screenshots, { recursive: true })
  const dataDirectory = mkdtempSync(join(tmpdir(), 'yachiyo-presentation-e2e-'))
  const settings = structuredClone(defaultSettings)
  settings.onboardingComplete = true
  settings.voice.mode = 'disabled'
  settings.proactive.enabled = false
  settings.desktop.alwaysOnTop = false
  settings.desktop.globalShortcut = shortcut
  settings.desktop.minimizeBehavior = 'launcher'
  settings.desktop.launcher.enabled = true
  settings.desktop.launcher.snapToEdge = true
  writeFileSync(join(dataDirectory, 'settings.json'), `${JSON.stringify(settings, null, 2)}\n`, {
    encoding: 'utf8'
  })

  const application = await electron.launch({
    args: [resolve(projectRoot, 'out/main/index.js')],
    cwd: projectRoot,
    env: {
      ...process.env,
      YACHIYO_DATA_DIR: dataDirectory,
      YACHIYO_DISABLE_DEVTOOLS: '1'
    }
  })

  try {
    const mainPage = await application.firstWindow()
    const rendererErrors: string[] = []
    mainPage.on('pageerror', (error) => rendererErrors.push(error.message))
    mainPage.on('console', (message) => {
      if (message.type() === 'error') rendererErrors.push(message.text())
    })
    await expect(mainPage).toHaveTitle('Yachiyo Companion')
    const compactComposer = mainPage.getByRole('textbox', {
      name: 'Pesan ringkas untuk Yachiyo'
    })
    await expect(compactComposer).toBeVisible({
      timeout: 30_000
    })
    await expect(mainPage.getByRole('button', { name: 'Buka percakapan lengkap' })).toBeVisible()

    await compactComposer.fill('Halo dari Companion Mode.')
    await mainPage.getByRole('button', { name: 'Kirim', exact: true }).click()

    const responseBubble = mainPage.getByLabel('Respons terbaru Yachiyo')
    await expect(responseBubble).toContainText('Ini respons dari Hermes mock lokal', {
      timeout: 15_000
    })
    await mainPage.screenshot({
      path: join(screenshots, 'companion-mode.png'),
      animations: 'disabled'
    })

    await compactComposer.fill('Draft ini harus tetap ada saat berpindah mode.')
    await mainPage.getByRole('button', { name: 'Buka percakapan lengkap' }).click()

    await expect(mainPage.getByRole('heading', { name: 'Chat dengan Yachiyo' })).toBeVisible()
    const fullChat = mainPage.getByLabel('Chat Yachiyo')
    await expect(fullChat.locator('.message[data-role="user"]')).toContainText(
      'Halo dari Companion Mode.'
    )
    await expect(
      fullChat
        .locator('.message[data-role="assistant"]')
        .filter({ hasText: 'Ini respons dari Hermes mock lokal' })
    ).toBeVisible()
    await expect(mainPage.getByLabel('Pesan untuk Yachiyo')).toHaveValue(
      'Draft ini harus tetap ada saat berpindah mode.'
    )
    await mainPage.screenshot({
      path: join(screenshots, 'full-chat-mode.png'),
      animations: 'disabled'
    })

    const launcherWindow = application.waitForEvent('window')
    await mainPage.getByRole('button', { name: 'Minimalkan Yachiyo' }).click()
    const launcherPage = await launcherWindow
    await launcherPage.waitForLoadState('domcontentloaded')
    await expect(launcherPage).toHaveTitle('Yachiyo Floating Launcher')
    await expect(launcherPage.locator('#launcher')).toBeVisible()

    await expect
      .poll(() => desktopWindowState(application))
      .toMatchObject({
        mainVisible: false,
        launcherVisible: true,
        launcherAlwaysOnTop: true,
        launcherInsideWorkArea: true,
        shortcutRegistered: true
      })
    await launcherPage.screenshot({
      path: join(screenshots, 'floating-launcher.png'),
      animations: 'disabled',
      omitBackground: true
    })

    await launcherPage.locator('#launcher').click()
    await expect
      .poll(() => desktopWindowState(application))
      .toMatchObject({
        mainVisible: true,
        mainFocused: true,
        launcherVisible: false
      })
    await expect(mainPage.getByRole('heading', { name: 'Chat dengan Yachiyo' })).toBeVisible()
    await expect(mainPage.getByLabel('Pesan untuk Yachiyo')).toHaveValue(
      'Draft ini harus tetap ada saat berpindah mode.'
    )
    expect(rendererErrors).toEqual([])
  } finally {
    await quitApplication(application)
    rmSync(dataDirectory, { recursive: true, force: true })
  }
})

async function desktopWindowState(application: ElectronApplication): Promise<{
  mainVisible: boolean
  mainFocused: boolean
  launcherVisible: boolean
  launcherAlwaysOnTop: boolean
  launcherInsideWorkArea: boolean
  shortcutRegistered: boolean
}> {
  return application.evaluate(({ BrowserWindow, globalShortcut, screen }, configuredShortcut) => {
    const windows = BrowserWindow.getAllWindows()
    const main = windows.find((window) => window.getTitle() === 'Yachiyo Companion')
    const launcher = windows.find((window) => window.getTitle() === 'Yachiyo Floating Launcher')
    const launcherBounds = launcher?.getBounds()
    const workArea = launcherBounds ? screen.getDisplayMatching(launcherBounds).workArea : null
    const launcherInsideWorkArea = Boolean(
      launcherBounds &&
      workArea &&
      launcherBounds.x >= workArea.x &&
      launcherBounds.y >= workArea.y &&
      launcherBounds.x + launcherBounds.width <= workArea.x + workArea.width &&
      launcherBounds.y + launcherBounds.height <= workArea.y + workArea.height
    )
    return {
      mainVisible: main?.isVisible() ?? false,
      mainFocused: main?.isFocused() ?? false,
      launcherVisible: launcher?.isVisible() ?? false,
      launcherAlwaysOnTop: launcher?.isAlwaysOnTop() ?? false,
      launcherInsideWorkArea,
      shortcutRegistered: globalShortcut.isRegistered(configuredShortcut)
    }
  }, shortcut)
}
