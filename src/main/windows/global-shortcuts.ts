import { globalShortcut } from 'electron'

import type { AppLogger } from '../services/logger'
import type { SettingsStore } from '../services/settings-store'

export const RECOVERY_SHORTCUT = 'CommandOrControl+Shift+F12'

export class GlobalShortcutController {
  private configuredShortcut: string | null = null

  constructor(
    private readonly settingsStore: SettingsStore,
    private readonly logger: AppLogger,
    private readonly onRestore: () => void,
    private readonly onRecovery: () => void
  ) {}

  create(): void {
    if (!globalShortcut.register(RECOVERY_SHORTCUT, this.onRecovery)) {
      this.logger.warn('Shortcut pemulihan global tidak dapat didaftarkan.')
    }
    this.applySettings()
  }

  applySettings(): boolean {
    return this.applyAccelerator(this.settingsStore.get().desktop.globalShortcut)
  }

  applyAccelerator(accelerator: string): boolean {
    const next = accelerator.trim()
    if (!next || next === RECOVERY_SHORTCUT) {
      this.logger.warn(
        'Shortcut buka Yachiyo tidak valid atau bertabrakan dengan shortcut pemulihan.'
      )
      return false
    }
    if (this.configuredShortcut === next && globalShortcut.isRegistered(next)) return true

    const previous = this.configuredShortcut
    if (previous) globalShortcut.unregister(previous)
    try {
      if (!globalShortcut.register(next, this.onRestore)) {
        this.restorePrevious(previous)
        this.logger.warn('Shortcut buka Yachiyo tidak dapat didaftarkan.', { accelerator: next })
        return false
      }
      this.configuredShortcut = next
      return true
    } catch (error) {
      this.restorePrevious(previous)
      this.logger.warn('Shortcut buka Yachiyo ditolak oleh Electron.', error)
      return false
    }
  }

  destroy(): void {
    if (this.configuredShortcut) globalShortcut.unregister(this.configuredShortcut)
    globalShortcut.unregister(RECOVERY_SHORTCUT)
    this.configuredShortcut = null
  }

  private restorePrevious(previous: string | null): void {
    this.configuredShortcut = null
    if (previous && globalShortcut.register(previous, this.onRestore)) {
      this.configuredShortcut = previous
    }
  }
}
