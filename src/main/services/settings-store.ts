import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import {
  defaultSettings,
  settingsSchema,
  settingsUpdateSchema,
  type Settings
} from '../../shared/schemas'
import type { SettingsView } from '../../shared/types'
import type { AppLogger } from './logger'
import type { SecretVault } from './secret-vault'

export class SettingsStore {
  private settings: Settings = structuredClone(defaultSettings)

  constructor(
    private readonly filePath: string,
    private readonly vault: SecretVault,
    private readonly logger: AppLogger
  ) {}

  async load(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    try {
      const raw = await readFile(this.filePath, 'utf8')
      const parsed: unknown = JSON.parse(raw)
      const result = settingsSchema.safeParse(parsed)
      if (!result.success) throw new Error('Schema pengaturan tidak valid.')
      this.settings = result.data
    } catch (error) {
      const existing = await readFile(this.filePath).catch(() => null)
      if (existing) {
        const corruptPath = `${this.filePath}.corrupt-${String(Date.now())}`
        await rename(this.filePath, corruptPath).catch(() => undefined)
        this.logger.warn('Pengaturan rusak dipindahkan dan default dipulihkan.', { corruptPath })
      }
      this.settings = structuredClone(defaultSettings)
      await this.persist()
      if (error instanceof SyntaxError) this.logger.warn('JSON pengaturan tidak dapat dibaca.')
    }
  }

  get(): Settings {
    return structuredClone(this.settings)
  }

  async view(): Promise<SettingsView> {
    return {
      ...this.get(),
      hasApiKey: await this.vault.has(),
      secureStorageAvailable: this.vault.available()
    }
  }

  async update(input: unknown): Promise<SettingsView> {
    const payload = settingsUpdateSchema.parse(input)
    if (payload.clearApiKey) await this.vault.clear()
    const apiKey = payload.apiKey?.trim()
    if (apiKey) await this.vault.set(apiKey)
    this.settings = payload.settings
    await this.persist()
    return this.view()
  }

  async updateWindowBounds(bounds: Settings['desktop']['windowBounds']): Promise<void> {
    this.settings = {
      ...this.settings,
      desktop: { ...this.settings.desktop, windowBounds: bounds }
    }
    await this.persist()
  }

  async reset(): Promise<SettingsView> {
    this.settings = structuredClone(defaultSettings)
    await this.vault.clear()
    await this.persist()
    return this.view()
  }

  private async persist(): Promise<void> {
    const validated = settingsSchema.parse(this.settings)
    const temporary = `${this.filePath}.tmp`
    await writeFile(temporary, `${JSON.stringify(validated, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600
    })
    await rename(temporary, this.filePath)
  }
}
