import { beforeEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void

  class FakeWebContents {
    readonly listeners = new Map<string, Listener[]>()
    readonly send = vi.fn()
    readonly setWindowOpenHandler = vi.fn()
    destroyed = false
    url = 'file:///yachiyo/index.html'

    on(event: string, listener: Listener): this {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener])
      return this
    }

    getURL(): string {
      return this.url
    }

    isDestroyed(): boolean {
      return this.destroyed
    }
  }

  class FakeBrowserWindow {
    readonly webContents = new FakeWebContents()
    readonly listeners = new Map<string, Listener[]>()
    readonly onceListeners = new Map<string, Listener[]>()
    readonly options: Record<string, unknown>
    readonly setAlwaysOnTop = vi.fn()
    readonly setIgnoreMouseEvents = vi.fn()
    readonly loadURL = vi.fn(() => Promise.resolve())
    readonly loadFile = vi.fn(() => Promise.resolve())
    readonly setMenu = vi.fn()
    readonly setVisibleOnAllWorkspaces = vi.fn()
    readonly focus = vi.fn()
    readonly showInactive = vi.fn(() => {
      this.visible = true
    })
    readonly restore = vi.fn(() => {
      this.minimized = false
    })
    readonly minimize = vi.fn(() => {
      this.minimized = true
    })
    readonly destroy = vi.fn(() => {
      this.destroyed = true
    })
    visible = false
    minimized = false
    destroyed = false
    bounds = { x: 1_356, y: 156, width: 460, height: 720 }

    constructor(options: Record<string, unknown>) {
      this.options = options
      instances.push(this)
      if (
        typeof options.x === 'number' &&
        typeof options.y === 'number' &&
        typeof options.width === 'number' &&
        typeof options.height === 'number'
      ) {
        this.bounds = {
          x: options.x,
          y: options.y,
          width: options.width,
          height: options.height
        }
      }
    }

    on(event: string, listener: Listener): this {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener])
      return this
    }

    once(event: string, listener: Listener): this {
      this.onceListeners.set(event, [...(this.onceListeners.get(event) ?? []), listener])
      return this
    }

    emit(event: string, ...args: unknown[]): void {
      for (const listener of this.listeners.get(event) ?? []) listener(...args)
      for (const listener of this.onceListeners.get(event) ?? []) listener(...args)
      this.onceListeners.delete(event)
    }

    show(): void {
      this.visible = true
    }

    hide(): void {
      this.visible = false
    }

    isVisible(): boolean {
      return this.visible
    }

    isMinimized(): boolean {
      return this.minimized
    }

    isDestroyed(): boolean {
      return this.destroyed
    }

    getBounds(): { x: number; y: number; width: number; height: number } {
      return { ...this.bounds }
    }

    setBounds(bounds: { x: number; y: number; width: number; height: number }): void {
      this.bounds = { ...bounds }
    }
  }

  class FakeTray {
    readonly listeners = new Map<string, Listener[]>()
    readonly setToolTip = vi.fn()
    readonly setContextMenu = vi.fn()
    readonly destroy = vi.fn(() => {
      this.destroyed = true
    })
    destroyed = false

    constructor(image: unknown) {
      void image
      trays.push(this)
    }

    on(event: string, listener: Listener): this {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener])
      return this
    }

    emit(event: string): void {
      for (const listener of this.listeners.get(event) ?? []) listener()
    }

    isDestroyed(): boolean {
      return this.destroyed
    }
  }

  const instances: FakeBrowserWindow[] = []
  const trays: FakeTray[] = []
  const menuTemplates: unknown[][] = []
  const shortcutCallbacks = new Map<string, () => void>()
  const ipcHandlers = new Map<string, (event: unknown, input?: unknown) => unknown>()
  const ipcListeners = new Map<string, Listener>()

  const registerShortcut = vi.fn((accelerator: string, callback: () => void) => {
    shortcutCallbacks.set(accelerator, callback)
    return true
  })
  const unregisterShortcut = vi.fn((accelerator: string) => {
    shortcutCallbacks.delete(accelerator)
  })

  return {
    FakeBrowserWindow,
    FakeTray,
    instances,
    trays,
    menuTemplates,
    shortcutCallbacks,
    ipcHandlers,
    ipcListeners,
    registerShortcut,
    unregisterShortcut
  }
})

vi.mock('electron', () => ({
  BrowserWindow: electron.FakeBrowserWindow,
  dialog: { showMessageBox: vi.fn() },
  globalShortcut: {
    register: electron.registerShortcut,
    unregister: electron.unregisterShortcut,
    isRegistered: (accelerator: string) => electron.shortcutCallbacks.has(accelerator)
  },
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, input?: unknown) => unknown) =>
      electron.ipcHandlers.set(channel, handler),
    removeHandler: (channel: string) => electron.ipcHandlers.delete(channel),
    on: (channel: string, listener: (...args: unknown[]) => void) =>
      electron.ipcListeners.set(channel, listener),
    removeListener: (channel: string) => electron.ipcListeners.delete(channel)
  },
  Menu: {
    buildFromTemplate: (template: unknown[]) => {
      electron.menuTemplates.push(template)
      return { popup: vi.fn() }
    }
  },
  nativeImage: {
    createFromDataURL: () => ({ resize: () => ({}) })
  },
  screen: {
    getPrimaryDisplay: () => ({
      id: 1,
      workArea: { x: 0, y: 0, width: 1_920, height: 1_080 }
    }),
    getAllDisplays: () => [{ id: 1, workArea: { x: 0, y: 0, width: 1_920, height: 1_080 } }],
    getDisplayMatching: () => ({
      id: 1,
      workArea: { x: 0, y: 0, width: 1_920, height: 1_080 }
    }),
    getDisplayNearestPoint: () => ({
      id: 1,
      workArea: { x: 0, y: 0, width: 1_920, height: 1_080 }
    })
  },
  Tray: electron.FakeTray
}))

import { FloatingLauncherController } from '../../src/main/windows/floating-launcher'
import { GlobalShortcutController } from '../../src/main/windows/global-shortcuts'
import { DesktopWindowController } from '../../src/main/windows/desktop-window'
import { TrayController } from '../../src/main/tray/tray-controller'
import type { AppLogger } from '../../src/main/services/logger'
import type { SettingsStore } from '../../src/main/services/settings-store'
import { IPC } from '../../src/shared/ipc'
import { defaultSettings, type Settings } from '../../src/shared/schemas'

type MenuItem = {
  label?: string
  click?: (item: { checked: boolean }) => void
}

beforeEach(() => {
  electron.instances.splice(0)
  electron.trays.splice(0)
  electron.menuTemplates.splice(0)
  electron.shortcutCallbacks.clear()
  electron.ipcHandlers.clear()
  electron.ipcListeners.clear()
  electron.registerShortcut.mockClear()
  electron.unregisterShortcut.mockClear()
})

describe('desktop window lifecycle', () => {
  it('intercepts launcher minimize, hides main window, and shows the launcher', () => {
    const fixture = desktopFixture('launcher')
    const window = fixture.controller.create()
    const preventDefault = vi.fn()

    electron.instances[0]?.emit('minimize', { preventDefault })

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(window.isVisible()).toBe(false)
    expect(fixture.lifecycle.showLauncher).toHaveBeenCalledOnce()
    expect(fixture.lifecycle.hideLauncher).not.toHaveBeenCalled()
  })

  it('intercepts tray minimize, hides both the main window and launcher', () => {
    const fixture = desktopFixture('tray')
    const window = fixture.controller.create()
    const preventDefault = vi.fn()

    electron.instances[0]?.emit('minimize', { preventDefault })

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(window.isVisible()).toBe(false)
    expect(fixture.lifecycle.hideLauncher).toHaveBeenCalledOnce()
    expect(fixture.lifecycle.showLauncher).not.toHaveBeenCalled()
  })

  it('restores, shows, focuses, and forwards the requested presentation command', () => {
    const fixture = desktopFixture('launcher')
    const window = fixture.controller.create()
    const fakeWindow = electron.instances[0]
    expect(fakeWindow).toBeDefined()
    if (!fakeWindow) return
    fakeWindow.minimized = true
    fakeWindow.visible = false

    fixture.controller.show('chat')

    expect(fakeWindow.restore).toHaveBeenCalledOnce()
    expect(window.isVisible()).toBe(true)
    expect(fixture.lifecycle.hideLauncher).toHaveBeenCalledOnce()
    expect(fakeWindow.focus).toHaveBeenCalledOnce()
    expect(fakeWindow.webContents.send).toHaveBeenCalledWith('app:command', 'chat')
  })
})

describe('global restore shortcut', () => {
  it('registers the configured accelerator and restores through its callback', () => {
    const settings = structuredClone(defaultSettings)
    settings.desktop.globalShortcut = 'CommandOrControl+Shift+Y'
    const onRestore = vi.fn()
    const controller = new GlobalShortcutController(
      settingsStore(settings),
      logger(),
      onRestore,
      vi.fn()
    )

    controller.create()
    electron.shortcutCallbacks.get(settings.desktop.globalShortcut)?.()

    expect(electron.registerShortcut).toHaveBeenCalledWith(
      settings.desktop.globalShortcut,
      onRestore
    )
    expect(onRestore).toHaveBeenCalledOnce()
  })
})

describe('system tray restore entry points', () => {
  it('restores on single-click, double-click, Open, and opens chat from the menu', () => {
    const show = vi.fn()
    const controller = new TrayController(
      {
        show,
        setAlwaysOnTop: vi.fn(),
        setClickThrough: vi.fn()
      } as unknown as DesktopWindowController,
      settingsStore(structuredClone(defaultSettings)),
      { onToggleMute: vi.fn(), isMuted: () => false, quit: vi.fn() }
    )

    controller.create()
    const tray = electron.trays[0]
    expect(tray).toBeDefined()
    tray?.emit('click')
    tray?.emit('double-click')
    menuItem('Buka Yachiyo').click?.({ checked: false })
    menuItem('Buka chat').click?.({ checked: false })

    expect(show).toHaveBeenNthCalledWith(1)
    expect(show).toHaveBeenNthCalledWith(2)
    expect(show).toHaveBeenNthCalledWith(3)
    expect(show).toHaveBeenNthCalledWith(4, 'chat')
  })
})

describe('floating launcher IPC boundary', () => {
  it('accepts a trusted launcher click, hides the launcher, and restores main', async () => {
    const settings = structuredClone(defaultSettings)
    const onRestore = vi.fn()
    const controller = new FloatingLauncherController(
      'launcher-preload.js',
      settingsStore(settings),
      logger(),
      {
        onRestore,
        onToggleMute: vi.fn(),
        isMuted: () => false,
        onSetMainAlwaysOnTop: vi.fn(),
        isMainAlwaysOnTop: () => false,
        onQuit: vi.fn()
      }
    )
    controller.show()
    const window = controller.browserWindow
    const handler = electron.ipcHandlers.get(IPC.launcherRestore)
    expect(window).not.toBeNull()
    expect(handler).toBeDefined()

    await handler?.({ sender: window?.webContents })

    expect(window?.isVisible()).toBe(false)
    expect(onRestore).toHaveBeenCalledOnce()
  })

  it('rejects restore requests from an untrusted renderer', () => {
    const controller = new FloatingLauncherController(
      'launcher-preload.js',
      settingsStore(structuredClone(defaultSettings)),
      logger(),
      {
        onRestore: vi.fn(),
        onToggleMute: vi.fn(),
        isMuted: () => false,
        onSetMainAlwaysOnTop: vi.fn(),
        isMainAlwaysOnTop: () => false,
        onQuit: vi.fn()
      }
    )
    controller.show()

    expect(() =>
      electron.ipcHandlers.get(IPC.launcherRestore)?.({ sender: { send: vi.fn() } })
    ).toThrow('IPC floating launcher tidak tepercaya.')
  })
})

function desktopFixture(minimizeBehavior: Settings['desktop']['minimizeBehavior']): {
  controller: DesktopWindowController
  lifecycle: {
    showLauncher: ReturnType<typeof vi.fn>
    hideLauncher: ReturnType<typeof vi.fn>
    quit: ReturnType<typeof vi.fn>
  }
} {
  const settings = structuredClone(defaultSettings)
  settings.desktop.minimizeBehavior = minimizeBehavior
  const lifecycle = {
    showLauncher: vi.fn(),
    hideLauncher: vi.fn(),
    quit: vi.fn()
  }
  return {
    controller: new DesktopWindowController(
      'desktop-preload.js',
      settingsStore(settings),
      logger(),
      lifecycle
    ),
    lifecycle
  }
}

function settingsStore(settings: Settings): SettingsStore {
  return {
    get: () => settings,
    updateDesktop: vi.fn(() => Promise.resolve()),
    updateWindowBounds: vi.fn(() => Promise.resolve()),
    updateLauncherPosition: vi.fn(() => Promise.resolve())
  } as unknown as SettingsStore
}

function logger(): AppLogger {
  return {
    warn: vi.fn(),
    error: vi.fn()
  } as unknown as AppLogger
}

function menuItem(label: string): MenuItem {
  const template = electron.menuTemplates.at(-1) ?? []
  const item = (template as MenuItem[]).find((candidate) => candidate.label === label)
  if (!item) throw new Error(`Menu item not found: ${label}`)
  return item
}
