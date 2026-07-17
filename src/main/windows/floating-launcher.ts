import { join } from 'node:path'

import {
  BrowserWindow,
  ipcMain,
  Menu,
  screen,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type Rectangle
} from 'electron'

import { IPC } from '../../shared/ipc'
import { launcherDragSchema } from '../../shared/schemas'
import type { LauncherPosition, LauncherStatus } from '../../shared/types'
import type { AppLogger } from '../services/logger'
import type { SettingsStore } from '../services/settings-store'
import {
  clampLauncherPosition,
  launcherBounds,
  resolveLauncherPosition,
  snapLauncherPosition,
  type LauncherWorkArea
} from './launcher-placement'

export type FloatingLauncherActions = {
  onRestore: (command?: 'chat') => void
  onToggleMute: () => void | Promise<void>
  isMuted: () => boolean
  onSetMainAlwaysOnTop: (enabled: boolean) => void | Promise<void>
  isMainAlwaysOnTop: () => boolean
  onQuit: () => void
}

type DragState = {
  pointerX: number
  pointerY: number
  initialBounds: Rectangle
  moved: boolean
}

export class FloatingLauncherController {
  private window: BrowserWindow | null = null
  private ready = false
  private shouldShow = false
  private quitting = false
  private status: LauncherStatus = 'offline'
  private dragState: DragState | null = null

  private readonly dragListener = (event: IpcMainEvent, input: unknown): void => {
    if (!this.isTrustedSender(event)) return
    const parsed = launcherDragSchema.safeParse(input)
    if (!parsed.success) {
      this.logger.warn('Gerakan launcher ditolak karena payload tidak valid.')
      return
    }
    this.handleDrag(parsed.data)
  }

  constructor(
    private readonly preloadPath: string,
    private readonly settingsStore: SettingsStore,
    private readonly logger: AppLogger,
    private readonly actions: FloatingLauncherActions
  ) {
    this.registerIpc()
  }

  get browserWindow(): BrowserWindow | null {
    return this.window
  }

  get isVisible(): boolean {
    return this.window?.isVisible() ?? false
  }

  show(): void {
    const settings = this.settingsStore.get().desktop
    if (!settings.launcher.enabled) return
    this.shouldShow = true
    const window = this.create()
    this.applySettingsToWindow(window, true)
    if (this.ready) window.showInactive()
  }

  hide(): void {
    this.shouldShow = false
    this.window?.hide()
  }

  restore(command?: 'chat'): void {
    this.hide()
    this.actions.onRestore(command)
  }

  updateStatus(status: LauncherStatus): void {
    this.status = status
    this.sendViewState()
  }

  applySettings(): void {
    const settings = this.settingsStore.get().desktop
    if (!settings.launcher.enabled) {
      this.hide()
      return
    }
    if (!this.window) return
    this.applySettingsToWindow(this.window, true)
    this.sendViewState()
  }

  ensureVisible(): void {
    const window = this.window
    if (!window || window.isDestroyed()) return
    this.applySettingsToWindow(window, true)
  }

  showContextMenu(): void {
    const window = this.window
    if (!window || window.isDestroyed()) return
    const menu = Menu.buildFromTemplate([
      { label: 'Buka Yachiyo', click: () => this.restore() },
      { label: 'Buka Chat', click: () => this.restore('chat') },
      { type: 'separator' },
      {
        label: this.actions.isMuted() ? 'Unmute' : 'Mute',
        click: () => this.runAction('mute', this.actions.onToggleMute)
      },
      {
        label: 'Main window selalu di atas',
        type: 'checkbox',
        checked: this.actions.isMainAlwaysOnTop(),
        click: (item) =>
          this.runAction('always-on-top', () => this.actions.onSetMainAlwaysOnTop(item.checked))
      },
      { type: 'separator' },
      { label: 'Keluar', click: this.actions.onQuit }
    ])
    menu.popup({ window })
  }

  setQuitting(): void {
    this.quitting = true
    this.shouldShow = false
  }

  destroy(): void {
    this.setQuitting()
    ipcMain.removeHandler(IPC.launcherRestore)
    ipcMain.removeHandler(IPC.launcherOpenChat)
    ipcMain.removeHandler(IPC.launcherContextMenu)
    ipcMain.removeListener(IPC.launcherDrag, this.dragListener)
    const window = this.window
    this.window = null
    if (window && !window.isDestroyed()) window.destroy()
  }

  private create(): BrowserWindow {
    const current = this.window
    if (current && !current.isDestroyed()) return current

    const settings = this.settingsStore.get().desktop.launcher
    const position = this.resolvePosition(settings.size)
    const display = displayById(position.displayId)
    const bounds = launcherBounds(position, display, settings.size, settings.autoHidePartially)
    const window = new BrowserWindow({
      ...bounds,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      title: 'Yachiyo Floating Launcher',
      autoHideMenuBar: true,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        spellcheck: false,
        devTools: !process.env.YACHIYO_DISABLE_DEVTOOLS
      }
    })
    this.window = window
    this.ready = false
    window.setMenu(null)
    window.setAlwaysOnTop(true, 'floating')
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false })
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event, url) => {
      if (url !== window.webContents.getURL()) event.preventDefault()
    })
    window.webContents.on('render-process-gone', (_event, details) => {
      this.logger.warn('Renderer floating launcher berhenti.', {
        reason: details.reason,
        exitCode: details.exitCode
      })
    })
    window.webContents.on('did-finish-load', () => this.sendViewState())
    window.once('ready-to-show', () => {
      this.ready = true
      this.sendViewState()
      if (this.shouldShow) window.showInactive()
    })
    window.on('close', (event) => {
      if (this.quitting) return
      event.preventDefault()
      this.hide()
    })
    window.on('closed', () => {
      if (this.window === window) this.window = null
      this.ready = false
    })

    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (devUrl) void window.loadURL(`${devUrl.replace(/\/$/, '')}/launcher.html`)
    else void window.loadFile(join(import.meta.dirname, '../renderer/launcher.html'))
    return window
  }

  private registerIpc(): void {
    ipcMain.removeHandler(IPC.launcherRestore)
    ipcMain.handle(IPC.launcherRestore, (event) => {
      this.assertTrustedSender(event)
      this.restore()
    })
    ipcMain.removeHandler(IPC.launcherOpenChat)
    ipcMain.handle(IPC.launcherOpenChat, (event) => {
      this.assertTrustedSender(event)
      this.restore('chat')
    })
    ipcMain.removeHandler(IPC.launcherContextMenu)
    ipcMain.handle(IPC.launcherContextMenu, (event) => {
      this.assertTrustedSender(event)
      this.showContextMenu()
    })
    ipcMain.on(IPC.launcherDrag, this.dragListener)
  }

  private handleDrag(input: {
    phase: 'start' | 'move' | 'end'
    screenX: number
    screenY: number
  }): void {
    const window = this.window
    if (!window || window.isDestroyed()) return
    if (input.phase === 'start') {
      this.dragState = {
        pointerX: input.screenX,
        pointerY: input.screenY,
        initialBounds: window.getBounds(),
        moved: false
      }
      return
    }

    const drag = this.dragState
    if (!drag) return
    if (input.phase === 'move') {
      const deltaX = input.screenX - drag.pointerX
      const deltaY = input.screenY - drag.pointerY
      if (Math.hypot(deltaX, deltaY) < 4 && !drag.moved) return
      drag.moved = true
      const settings = this.settingsStore.get().desktop.launcher
      const display = toWorkArea(
        screen.getDisplayNearestPoint({
          x: Math.round(input.screenX),
          y: Math.round(input.screenY)
        })
      )
      const position = clampLauncherPosition(
        {
          displayId: display.id,
          x: drag.initialBounds.x + deltaX,
          y: drag.initialBounds.y + deltaY,
          snappedEdge: null
        },
        display,
        settings.size
      )
      window.setBounds({
        x: position.x,
        y: position.y,
        width: settings.size,
        height: settings.size
      })
      return
    }

    this.dragState = null
    if (!drag.moved) return
    const settings = this.settingsStore.get().desktop.launcher
    const currentBounds = window.getBounds()
    const display = toWorkArea(screen.getDisplayMatching(currentBounds))
    const position = settings.snapToEdge
      ? snapLauncherPosition(currentBounds.x, currentBounds.y, display, settings.size)
      : clampLauncherPosition(
          {
            displayId: display.id,
            x: currentBounds.x,
            y: currentBounds.y,
            snappedEdge: null
          },
          display,
          settings.size
        )
    this.applyPosition(window, position, display)
    void this.settingsStore.updateLauncherPosition(position).catch((error: unknown) => {
      this.logger.warn('Posisi floating launcher tidak dapat disimpan.', error)
    })
  }

  private applySettingsToWindow(window: BrowserWindow, persistCorrection: boolean): void {
    const settings = this.settingsStore.get().desktop.launcher
    const position = this.resolvePosition(settings.size)
    const display = displayById(position.displayId)
    this.applyPosition(window, position, display)
    if (persistCorrection && !samePosition(settings.position, position)) {
      void this.settingsStore.updateLauncherPosition(position).catch((error: unknown) => {
        this.logger.warn('Koreksi posisi launcher tidak dapat disimpan.', error)
      })
    }
  }

  private applyPosition(
    window: BrowserWindow,
    position: LauncherPosition,
    display: LauncherWorkArea
  ): void {
    const settings = this.settingsStore.get().desktop.launcher
    window.setBounds(launcherBounds(position, display, settings.size, settings.autoHidePartially))
  }

  private resolvePosition(size: number): LauncherPosition {
    const settings = this.settingsStore.get().desktop.launcher
    const displays = screen.getAllDisplays().map(toWorkArea)
    const primary = screen.getPrimaryDisplay()
    return resolveLauncherPosition(settings.position, displays, primary.id, size)
  }

  private sendViewState(): void {
    const window = this.window
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return
    window.webContents.send(IPC.launcherStatus, {
      status: this.status,
      showStatusIndicator: this.settingsStore.get().desktop.launcher.showStatusIndicator
    })
  }

  private isTrustedSender(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
    return event.sender === this.window?.webContents
  }

  private assertTrustedSender(event: IpcMainInvokeEvent): void {
    if (!this.isTrustedSender(event)) throw new Error('IPC floating launcher tidak tepercaya.')
  }

  private runAction(label: string, action: () => void | Promise<void>): void {
    void Promise.resolve()
      .then(action)
      .catch((error: unknown) => this.logger.warn(`Aksi launcher ${label} gagal.`, error))
  }
}

function displayById(displayId: number): LauncherWorkArea {
  const display = screen.getAllDisplays().find((candidate) => candidate.id === displayId)
  return toWorkArea(display ?? screen.getPrimaryDisplay())
}

function toWorkArea(display: Electron.Display): LauncherWorkArea {
  return { id: display.id, workArea: { ...display.workArea } }
}

function samePosition(left: LauncherPosition | null, right: LauncherPosition): boolean {
  return (
    left?.displayId === right.displayId &&
    left.x === right.x &&
    left.y === right.y &&
    left.snappedEdge === right.snappedEdge
  )
}
