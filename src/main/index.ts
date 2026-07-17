import { join, resolve } from 'node:path'

import { app, protocol, screen, session, type WebContents } from 'electron'

import { IPC } from '../shared/ipc'
import type { AssetStatus } from '../shared/types'
import { registerIpc } from './ipc/register-ipc'
import { AssetValidator } from './services/asset-validator'
import { configureAssetProtocol, registerAssetScheme } from './services/asset-protocol'
import { HermesClient } from './services/hermes-client'
import { AppLogger } from './services/logger'
import { MockHermesServer } from './services/mock-hermes-server'
import { ProactiveService } from './services/proactive-service'
import { ElectronSecretVault } from './services/secret-vault'
import { SettingsStore } from './services/settings-store'
import { VoiceSidecar } from './services/voice-sidecar'
import { TrayController } from './tray/tray-controller'
import { DesktopWindowController } from './windows/desktop-window'
import { FloatingLauncherController } from './windows/floating-launcher'
import { GlobalShortcutController } from './windows/global-shortcuts'

registerAssetScheme()

const customDataRoot = process.env.YACHIYO_DATA_DIR?.trim()
if (customDataRoot) app.setPath('userData', resolve(customDataRoot))
if (app.isPackaged) process.env.YACHIYO_DISABLE_DEVTOOLS = '1'

let windowController: DesktopWindowController | null = null
let launcherController: FloatingLauncherController | null = null
let trayController: TrayController | null = null
let shortcutController: GlobalShortcutController | null = null
let mockServer: MockHermesServer | null = null
let voiceSidecar: VoiceSidecar | null = null
let proactiveService: ProactiveService | null = null
let logger: AppLogger | null = null
let disposeIpc: (() => void) | null = null

const hasLock = app.requestSingleInstanceLock()
if (!hasLock) {
  app.quit()
} else {
  app.on('second-instance', () => windowController?.show())
  void app
    .whenReady()
    .then(startApplication)
    .catch((error: unknown) => {
      console.error('Yachiyo startup failed.', error)
      app.exit(1)
    })
}

async function startApplication(): Promise<void> {
  app.setAppUserModelId('com.yachiyo.companion')
  const projectRoot = app.isPackaged ? process.resourcesPath : process.cwd()
  const dataRoot = app.getPath('userData')
  logger = new AppLogger(join(dataRoot, 'logs', 'yachiyo.log'))
  logger.info('Yachiyo Companion mulai.', { version: app.getVersion(), packaged: app.isPackaged })

  const vault = new ElectronSecretVault(join(dataRoot, 'hermes-key.bin'))
  const settingsStore = new SettingsStore(join(dataRoot, 'settings.json'), vault, logger)
  await settingsStore.load()
  logger.setLevel(settingsStore.get().logging.level)

  mockServer = new MockHermesServer(logger)
  await mockServer.start()
  voiceSidecar = new VoiceSidecar(
    projectRoot,
    process.resourcesPath,
    join(dataRoot, 'temp', 'audio'),
    app.isPackaged
      ? join(dataRoot, 'voice-runtime', '0.2.0')
      : join(projectRoot, '.runtime-cache', 'models'),
    logger
  )
  const assetValidator = new AssetValidator(
    projectRoot,
    join(dataRoot, 'cache', 'assets'),
    logger,
    () => voiceSidecar?.runtimeStatus() ?? emptyVoiceRuntime()
  )
  let assetStatus = await assetValidator.scan(settingsStore.get().assets)
  configureAssetProtocol(
    projectRoot,
    () => assetStatus,
    () => settingsStore.get(),
    logger
  )
  await voiceSidecar.start(assetStatus.voice.root)
  assetStatus = assetValidator.refreshRuntime(assetStatus)

  configureSessionSecurity(() => settingsStore.get().privacy.microphoneEnabled)
  let quitting = false
  let cleanupComplete = false
  let cleanupPromise: Promise<void> | null = null
  const quit = (): void => {
    quitting = true
    windowController?.setQuitting()
    launcherController?.setQuitting()
    app.quit()
  }
  let lastVoiceMode: 'rvc' | 'basic' = settingsStore.get().voice.mode === 'rvc' ? 'rvc' : 'basic'
  const toggleMute = async (): Promise<void> => {
    const current = settingsStore.get()
    const muted = current.voice.mode === 'disabled'
    if (current.voice.mode === 'rvc' || current.voice.mode === 'basic') {
      lastVoiceMode = current.voice.mode
    }
    await settingsStore.update({
      settings: {
        ...current,
        voice: { ...current.voice, mode: muted ? lastVoiceMode : 'disabled' }
      }
    })
    if (!muted) voiceSidecar?.stopCurrent()
    windowController?.browserWindow?.webContents.send(IPC.appCommand, 'mute')
    trayController?.rebuildMenu()
  }

  launcherController = new FloatingLauncherController(
    join(import.meta.dirname, '../preload/launcher.cjs'),
    settingsStore,
    logger,
    {
      onRestore: (command) => windowController?.show(command),
      onToggleMute: toggleMute,
      isMuted: () => settingsStore.get().voice.mode === 'disabled',
      onSetMainAlwaysOnTop: async (enabled) => {
        await windowController?.setAlwaysOnTop(enabled)
        trayController?.rebuildMenu()
      },
      isMainAlwaysOnTop: () => settingsStore.get().desktop.alwaysOnTop,
      onQuit: quit
    }
  )
  windowController = new DesktopWindowController(
    join(import.meta.dirname, '../preload/index.cjs'),
    settingsStore,
    logger,
    {
      showLauncher: () => launcherController?.show(),
      hideLauncher: () => launcherController?.hide(),
      quit
    }
  )
  const mainWindow = windowController.create()
  configurePermissions(mainWindow.webContents, () => settingsStore.get().privacy.microphoneEnabled)

  trayController = new TrayController(windowController, settingsStore, {
    onToggleMute: toggleMute,
    isMuted: () => settingsStore.get().voice.mode === 'disabled',
    quit
  })
  trayController.create()

  proactiveService = new ProactiveService(
    join(dataRoot, 'reminders.json'),
    () => settingsStore.get(),
    logger
  )
  const hermesClient = new HermesClient()
  disposeIpc = registerIpc({
    dataRoot,
    projectRoot,
    settingsStore,
    vault,
    windowController,
    trayController,
    mockServer,
    hermesClient,
    voiceSidecar,
    assetValidator,
    proactiveService,
    logger,
    applyDesktopSettings: () => {
      windowController?.applySettings()
      launcherController?.applySettings()
    },
    applyGlobalShortcut: () => shortcutController?.applySettings() ?? true,
    setLauncherStatus: (status) => launcherController?.updateStatus(status),
    getAssetStatus: () => assetStatus,
    setAssetStatus: (status) => {
      assetStatus = status
    }
  })
  await proactiveService.start()

  shortcutController = new GlobalShortcutController(
    settingsStore,
    logger,
    () => windowController?.show(),
    () => {
      void windowController?.setClickThrough(false).then(() => {
        windowController?.show()
        trayController?.rebuildMenu()
      })
    }
  )
  shortcutController.create()

  const ensureWindowsVisible = (): void => {
    windowController?.ensureVisible()
    launcherController?.ensureVisible()
  }
  screen.on('display-added', ensureWindowsVisible)
  screen.on('display-removed', ensureWindowsVisible)
  screen.on('display-metrics-changed', ensureWindowsVisible)
  app.on('activate', () => windowController?.show())
  app.on('window-all-closed', () => {
    if (quitting) app.quit()
  })
  app.on('before-quit', (event) => {
    quitting = true
    windowController?.setQuitting()
    launcherController?.setQuitting()
    if (cleanupComplete) return
    event.preventDefault()
    if (cleanupPromise) return
    cleanupPromise = (async () => {
      proactiveService?.stop()
      disposeIpc?.()
      disposeIpc = null
      launcherController?.destroy()
      await Promise.allSettled([
        voiceSidecar?.stopAndWait() ?? Promise.resolve(),
        withTimeout(mockServer?.stop() ?? Promise.resolve(), 3_000)
      ])
    })()
      .catch((error: unknown) =>
        logger?.warn('Shutdown terkoordinasi tidak selesai bersih.', error)
      )
      .finally(() => {
        cleanupComplete = true
        app.quit()
      })
  })
  app.on('will-quit', () => {
    shortcutController?.destroy()
    protocol.unhandle('yachiyo-asset')
    trayController?.destroy()
    launcherController?.destroy()
  })
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<undefined>((resolvePromise) => {
        timer = setTimeout(() => resolvePromise(undefined), timeoutMs)
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function configureSessionSecurity(microphoneEnabled: () => boolean): void {
  const strictCsp = [
    "default-src 'self'",
    "script-src 'self' yachiyo-asset:",
    "style-src 'self'",
    "img-src 'self' data: blob: yachiyo-asset:",
    "font-src 'self'",
    "media-src 'self' data: blob:",
    process.env.ELECTRON_RENDERER_URL
      ? "connect-src 'self' yachiyo-asset: ws://127.0.0.1:* ws://localhost:* http://127.0.0.1:* http://localhost:*"
      : "connect-src 'self' yachiyo-asset:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'"
  ].join('; ')

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [strictCsp],
        'X-Content-Type-Options': ['nosniff'],
        'Referrer-Policy': ['no-referrer'],
        'Permissions-Policy': ['microphone=(self), camera=(), geolocation=()']
      }
    })
  })
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === 'media' && microphoneEnabled()
  })
}

function configurePermissions(
  trustedContents: WebContents,
  microphoneEnabled: () => boolean
): void {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = webContents === trustedContents && permission === 'media' && microphoneEnabled()
    callback(allowed)
  })
}

function emptyVoiceRuntime(): AssetStatus['voice']['runtime'] {
  return {
    ffmpeg: false,
    ffprobe: false,
    python: false,
    rvc: false,
    rmvpe: false,
    contentVec: false
  }
}

process.on('uncaughtException', (error) => logger?.error('Main process exception.', error))
process.on('unhandledRejection', (error) => logger?.error('Main process rejection.', error))
