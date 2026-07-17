import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import {
  defaultSettings,
  settingsSchema,
  settingsUpdateSchema,
  type Settings
} from '../../shared/schemas'
import type { SettingsView } from '../../shared/types'
import { normalizeHermesBaseUrl } from './hermes-client'
import type { AppLogger } from './logger'
import type { SecretVault } from './secret-vault'

export type HermesSettingsSnapshot = {
  settings: Settings
  apiKey: string
}

type StoredHermesCredential = {
  version: 1
  destination: string | null
  apiKey: string
}

export class SettingsStore {
  private settings: Settings = structuredClone(defaultSettings)
  private operationQueue: Promise<void> = Promise.resolve()

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
    await this.migrateLegacyCredential()
  }

  get(): Settings {
    return structuredClone(this.settings)
  }

  async view(): Promise<SettingsView> {
    return this.exclusive(() => this.viewUnlocked())
  }

  async getHermesSnapshot(): Promise<HermesSettingsSnapshot> {
    return this.exclusive(async () => {
      const settings = this.get()
      const credential = decodeCredential(await this.vault.get())
      const destination = credentialDestination(settings)
      return {
        settings,
        apiKey:
          credential && credential.destination !== null && credential.destination === destination
            ? credential.apiKey
            : ''
      }
    })
  }

  async update(input: unknown): Promise<SettingsView> {
    const payload = settingsUpdateSchema.parse(input)
    return this.exclusive(async () => {
      const apiKey = payload.apiKey?.trim()
      const credential = payload.clearApiKey
        ? { changed: true, raw: null }
        : apiKey
          ? { changed: true, raw: encodeCredential(payload.settings, apiKey) }
          : { changed: false, raw: null }
      return this.commit(payload.settings, credential)
    })
  }

  async updateWindowBounds(bounds: Settings['desktop']['windowBounds']): Promise<void> {
    await this.exclusive(async () => {
      const next = {
        ...this.settings,
        desktop: { ...this.settings.desktop, windowBounds: bounds }
      }
      await this.persist(next)
      this.settings = next
    })
  }

  async updateDesktop(
    patch: Partial<Omit<Settings['desktop'], 'windowBounds'>> & {
      windowBounds?: Settings['desktop']['windowBounds']
    }
  ): Promise<void> {
    await this.exclusive(async () => {
      const next = settingsSchema.parse({
        ...this.settings,
        desktop: { ...this.settings.desktop, ...patch }
      })
      await this.persist(next)
      this.settings = next
    })
  }

  async updateLauncherPosition(
    position: Settings['desktop']['launcher']['position']
  ): Promise<void> {
    await this.exclusive(async () => {
      const next = settingsSchema.parse({
        ...this.settings,
        desktop: {
          ...this.settings.desktop,
          launcher: { ...this.settings.desktop.launcher, position }
        }
      })
      await this.persist(next)
      this.settings = next
    })
  }

  async updateAssetPath(
    kind: 'live2d' | 'voice' | 'cubism-core',
    selectedPath: string
  ): Promise<SettingsView> {
    return this.exclusive(async () => {
      const key =
        kind === 'live2d' ? 'live2dRoot' : kind === 'voice' ? 'voiceRoot' : 'cubismCorePath'
      const next = settingsSchema.parse({
        ...this.settings,
        assets: { ...this.settings.assets, [key]: selectedPath }
      })
      await this.persist(next)
      this.settings = next
      return this.viewUnlocked()
    })
  }

  async reset(): Promise<SettingsView> {
    return this.exclusive(() =>
      this.commit(structuredClone(defaultSettings), { changed: true, raw: null })
    )
  }

  private async commit(
    nextSettings: Settings,
    credential: { changed: boolean; raw: string | null }
  ): Promise<SettingsView> {
    const previousSettings = this.settings
    const previousCredential = credential.changed ? await this.vault.get() : null
    try {
      if (credential.changed) await writeCredential(this.vault, credential.raw)
      await this.persist(nextSettings)
      this.settings = nextSettings
      return await this.viewUnlocked()
    } catch (error) {
      this.settings = previousSettings
      if (credential.changed) {
        await writeCredential(this.vault, previousCredential).catch(() => undefined)
      }
      await this.persist(previousSettings).catch(() => undefined)
      throw error
    }
  }

  private async viewUnlocked(): Promise<SettingsView> {
    return {
      ...this.get(),
      hasApiKey: await this.vault.has(),
      secureStorageAvailable: this.vault.available()
    }
  }

  private async migrateLegacyCredential(): Promise<void> {
    const raw = await this.vault.get()
    if (!raw || decodeCredential(raw)) return
    const apiKey = raw.trim()
    if (!apiKey) return
    await this.vault.set(encodeCredential(this.settings, apiKey))
  }

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.operationQueue
    let release = (): void => undefined
    this.operationQueue = new Promise<void>((resolvePromise) => {
      release = resolvePromise
    })
    await previous
    try {
      return await operation()
    } finally {
      release()
    }
  }

  private async persist(settings: Settings = this.settings): Promise<void> {
    const validated = settingsSchema.parse(settings)
    const temporary = `${this.filePath}.tmp`
    await writeFile(temporary, `${JSON.stringify(validated, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600
    })
    await rename(temporary, this.filePath)
  }
}

function encodeCredential(settings: Settings, apiKey: string): string {
  return JSON.stringify({
    version: 1,
    destination: credentialDestination(settings),
    apiKey
  } satisfies StoredHermesCredential)
}

function decodeCredential(raw: string | null): StoredHermesCredential | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as unknown
    if (!value || typeof value !== 'object') return null
    const candidate = value as Partial<StoredHermesCredential>
    if (
      candidate.version !== 1 ||
      (candidate.destination !== null && typeof candidate.destination !== 'string') ||
      typeof candidate.apiKey !== 'string'
    ) {
      return null
    }
    return {
      version: 1,
      destination: candidate.destination,
      apiKey: candidate.apiKey
    }
  } catch {
    return null
  }
}

function credentialDestination(settings: Settings): string | null {
  try {
    return normalizeHermesBaseUrl(settings.connection.baseUrl).toString()
  } catch {
    return null
  }
}

async function writeCredential(vault: SecretVault, raw: string | null): Promise<void> {
  if (raw === null) await vault.clear()
  else await vault.set(raw)
}
