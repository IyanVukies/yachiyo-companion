import { Menu, nativeImage, Tray } from 'electron'

import type { SettingsStore } from '../services/settings-store'
import type { DesktopWindowController } from '../windows/desktop-window'

export class TrayController {
  private tray: Tray | null = null

  constructor(
    private readonly windowController: DesktopWindowController,
    private readonly settingsStore: SettingsStore,
    private readonly quit: () => void
  ) {}

  create(): void {
    if (this.tray) return
    const image = nativeImage.createFromDataURL(svgIcon()).resize({ width: 20, height: 20 })
    this.tray = new Tray(image)
    this.tray.setToolTip('Yachiyo Companion')
    this.tray.on('click', () => this.windowController.toggleVisibility())
    this.rebuildMenu()
  }

  get isReady(): boolean {
    return this.tray !== null && !this.tray.isDestroyed()
  }

  rebuildMenu(): void {
    const tray = this.tray
    if (!tray) return
    const settings = this.settingsStore.get()
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: 'Buka chat',
          click: () => this.windowController.show('chat')
        },
        {
          label: 'Pengingat',
          click: () => this.windowController.show('reminders')
        },
        {
          label: 'Pengaturan',
          click: () => this.windowController.show('settings')
        },
        { type: 'separator' },
        {
          label: 'Selalu di atas',
          type: 'checkbox',
          checked: settings.desktop.alwaysOnTop,
          click: (item) => {
            void this.windowController.setAlwaysOnTop(item.checked).then(() => this.rebuildMenu())
          }
        },
        {
          label: 'Mode tembus klik',
          type: 'checkbox',
          checked: settings.desktop.clickThrough,
          click: (item) => {
            void this.windowController.setClickThrough(item.checked).then(() => this.rebuildMenu())
          }
        },
        {
          label: 'Pulihkan mode klik  Ctrl+Shift+F12',
          click: () => {
            void this.windowController.setClickThrough(false).then(() => {
              this.windowController.show()
              this.rebuildMenu()
            })
          }
        },
        { type: 'separator' },
        { label: 'Keluar', click: this.quit }
      ])
    )
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }
}

function svgIcon(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#17243c"/><path d="M10 13c0-4 2.8-7 6-7s6 3 6 7v6c0 4-2.8 7-6 7s-6-3-6-7z" fill="#9cebdc"/><circle cx="13.4" cy="15" r="1.4" fill="#17243c"/><circle cx="18.6" cy="15" r="1.4" fill="#17243c"/><path d="M13 20c1.8 1.5 4.2 1.5 6 0" fill="none" stroke="#17243c" stroke-width="1.6" stroke-linecap="round"/></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}
