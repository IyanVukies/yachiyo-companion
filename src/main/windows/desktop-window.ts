import { join } from 'node:path'

import { BrowserWindow, dialog, screen, type Rectangle } from 'electron'

import type { AppCommand } from '../../shared/types'
import type { AppLogger } from '../services/logger'
import type { SettingsStore } from '../services/settings-store'

const DEFAULT_WIDTH = 460
const DEFAULT_HEIGHT = 720
const EDGE_MARGIN = 24

export type DesktopWindowLifecycle = {
  showLauncher: () => void
  hideLauncher: () => void
  quit: () => void
}

export class DesktopWindowController {
  private window: BrowserWindow | null = null
  private quitting = false
  private boundsTimer: NodeJS.Timeout | null = null
  private closePromptOpen = false

  constructor(
    private readonly preloadPath: string,
    private readonly settingsStore: SettingsStore,
    private readonly logger: AppLogger,
    private readonly lifecycle: DesktopWindowLifecycle
  ) {}

  create(): BrowserWindow {
    const settings = this.settingsStore.get()
    const bounds = initialBounds(settings.desktop)
    const window = new BrowserWindow({
      ...bounds,
      minWidth: 390,
      minHeight: 600,
      maxWidth: 720,
      maxHeight: 1_000,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: true,
      maximizable: false,
      minimizable: true,
      fullscreenable: false,
      alwaysOnTop: settings.desktop.alwaysOnTop,
      skipTaskbar: false,
      hasShadow: false,
      title: 'Yachiyo Companion',
      autoHideMenuBar: true,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        spellcheck: true,
        devTools: !process.env.YACHIYO_DISABLE_DEVTOOLS
      }
    })
    this.window = window
    window.setAlwaysOnTop(settings.desktop.alwaysOnTop, 'floating')
    window.setIgnoreMouseEvents(settings.desktop.clickThrough, { forward: true })

    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event, url) => {
      const current = window.webContents.getURL()
      if (url !== current) event.preventDefault()
    })
    window.webContents.on('render-process-gone', (_event, details) => {
      this.logger.error('Renderer berhenti.', {
        reason: details.reason,
        exitCode: details.exitCode
      })
    })
    window.once('ready-to-show', () => window.show())
    window.on('show', () => this.lifecycle.hideLauncher())
    window.on('restore', () => this.lifecycle.hideLauncher())
    window.on('minimize', (event?: Electron.Event) => {
      const behavior = this.settingsStore.get().desktop.minimizeBehavior
      if (behavior === 'normal') {
        this.lifecycle.hideLauncher()
        return
      }
      event?.preventDefault()
      window.hide()
      if (behavior === 'launcher' && this.settingsStore.get().desktop.launcher.enabled) {
        this.lifecycle.showLauncher()
      } else {
        this.lifecycle.hideLauncher()
      }
    })
    window.on('close', (event) => {
      if (this.quitting) return
      event.preventDefault()
      const behavior = this.settingsStore.get().desktop.closeBehavior
      if (behavior === 'quit') {
        this.lifecycle.quit()
        return
      }
      if (behavior === 'ask') {
        void this.confirmClose(window)
        return
      }
      this.hideForClose()
    })
    window.on('move', () => this.queueBoundsSave())
    window.on('resize', () => this.queueBoundsSave())

    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (devUrl) void window.loadURL(devUrl)
    else void window.loadFile(join(import.meta.dirname, '../renderer/index.html'))
    return window
  }

  get browserWindow(): BrowserWindow | null {
    return this.window
  }

  show(command?: AppCommand): void {
    const window = this.window
    if (!window) return
    if (this.settingsStore.get().desktop.clickThrough) {
      void this.setClickThrough(false)
    }
    if (window.isMinimized()) window.restore()
    if (!window.isVisible()) window.show()
    this.lifecycle.hideLauncher()
    window.focus()
    if (command) window.webContents.send('app:command', command)
  }

  minimize(): void {
    const window = this.window
    if (!window || window.isDestroyed()) return
    const behavior = this.settingsStore.get().desktop.minimizeBehavior
    if (behavior === 'normal') {
      window.minimize()
      return
    }
    window.hide()
    if (behavior === 'launcher' && this.settingsStore.get().desktop.launcher.enabled) {
      this.lifecycle.showLauncher()
    } else {
      this.lifecycle.hideLauncher()
    }
  }

  toggleVisibility(): void {
    const window = this.window
    if (!window) return
    if (window.isVisible()) this.hide()
    else this.show()
  }

  hide(): void {
    this.window?.hide()
    const settings = this.settingsStore.get().desktop
    if (settings.minimizeBehavior === 'launcher' && settings.launcher.enabled) {
      this.lifecycle.showLauncher()
    } else {
      this.lifecycle.hideLauncher()
    }
  }

  applySettings(): void {
    const window = this.window
    if (!window || window.isDestroyed()) return
    const settings = this.settingsStore.get().desktop
    window.setAlwaysOnTop(settings.alwaysOnTop, 'floating')
    window.setIgnoreMouseEvents(settings.clickThrough, { forward: true })
  }

  async setClickThrough(enabled: boolean): Promise<void> {
    const window = this.window
    if (!window) return
    window.setIgnoreMouseEvents(enabled, { forward: true })
    await this.settingsStore.updateDesktop({ clickThrough: enabled })
  }

  async setAlwaysOnTop(enabled: boolean): Promise<void> {
    this.window?.setAlwaysOnTop(enabled, 'floating')
    await this.settingsStore.updateDesktop({ alwaysOnTop: enabled })
  }

  async resetPosition(): Promise<void> {
    const bounds = defaultBounds()
    this.window?.setBounds(bounds)
    await this.settingsStore.updateWindowBounds(bounds)
  }

  ensureVisible(): void {
    const window = this.window
    if (!window) return
    const corrected = correctBounds(window.getBounds())
    if (!sameBounds(window.getBounds(), corrected)) window.setBounds(corrected)
  }

  setQuitting(): void {
    this.quitting = true
    if (this.boundsTimer) {
      clearTimeout(this.boundsTimer)
      this.boundsTimer = null
    }
  }

  private hideForClose(): void {
    this.window?.hide()
    if (this.settingsStore.get().desktop.launcher.enabled) this.lifecycle.showLauncher()
    else this.lifecycle.hideLauncher()
  }

  private async confirmClose(window: BrowserWindow): Promise<void> {
    if (this.closePromptOpen) return
    this.closePromptOpen = true
    try {
      const result = await dialog.showMessageBox(window, {
        type: 'question',
        title: 'Tutup Yachiyo Companion?',
        message: 'Pilih apakah Yachiyo disembunyikan atau dihentikan sepenuhnya.',
        buttons: ['Sembunyikan', 'Keluar', 'Batal'],
        defaultId: 0,
        cancelId: 2,
        noLink: true
      })
      if (result.response === 0) this.hideForClose()
      if (result.response === 1) this.lifecycle.quit()
    } finally {
      this.closePromptOpen = false
    }
  }

  private queueBoundsSave(): void {
    if (this.boundsTimer) clearTimeout(this.boundsTimer)
    this.boundsTimer = setTimeout(() => {
      const window = this.window
      if (!window || window.isDestroyed() || window.isMinimized()) return
      const settings = this.settingsStore.get().desktop
      if (!settings.rememberPosition && !settings.rememberSize) return
      const current = correctBounds(window.getBounds())
      const previous = settings.windowBounds ?? defaultBounds()
      void this.settingsStore.updateWindowBounds({
        x: settings.rememberPosition ? current.x : previous.x,
        y: settings.rememberPosition ? current.y : previous.y,
        width: settings.rememberSize ? current.width : previous.width,
        height: settings.rememberSize ? current.height : previous.height
      })
    }, 350)
  }
}

function initialBounds(settings: ReturnType<SettingsStore['get']>['desktop']): Rectangle {
  const fallback = defaultBounds()
  const saved = settings.windowBounds
  if (!saved) return fallback
  return correctBounds({
    x: settings.rememberPosition ? saved.x : fallback.x,
    y: settings.rememberPosition ? saved.y : fallback.y,
    width: settings.rememberSize ? saved.width : fallback.width,
    height: settings.rememberSize ? saved.height : fallback.height
  })
}

function defaultBounds(): Rectangle {
  const area = screen.getPrimaryDisplay().workArea
  return {
    width: DEFAULT_WIDTH,
    height: Math.min(DEFAULT_HEIGHT, area.height - EDGE_MARGIN * 2),
    x: area.x + area.width - DEFAULT_WIDTH - EDGE_MARGIN,
    y: area.y + area.height - Math.min(DEFAULT_HEIGHT, area.height - EDGE_MARGIN * 2) - EDGE_MARGIN
  }
}

export function correctBounds(bounds: Rectangle | null): Rectangle {
  if (!bounds) return defaultBounds()
  const displays = screen.getAllDisplays()
  const intersects = displays.some((display) => intersectionArea(bounds, display.workArea) > 10_000)
  if (!intersects) return defaultBounds()
  const display = screen.getDisplayMatching(bounds)
  const area = display.workArea
  const width = Math.min(Math.max(bounds.width, 390), area.width)
  const height = Math.min(Math.max(bounds.height, 600), area.height)
  return {
    width,
    height,
    x: Math.min(Math.max(bounds.x, area.x), area.x + area.width - width),
    y: Math.min(Math.max(bounds.y, area.y), area.y + area.height - height)
  }
}

function intersectionArea(a: Rectangle, b: Rectangle): number {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  return width * height
}

function sameBounds(a: Rectangle, b: Rectangle): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}
