import { readFile, rm, writeFile } from 'node:fs/promises'

import { safeStorage } from 'electron'

export type SecretVault = {
  available: () => boolean
  has: () => Promise<boolean>
  get: () => Promise<string | null>
  set: (value: string) => Promise<void>
  clear: () => Promise<void>
}

export class ElectronSecretVault implements SecretVault {
  constructor(private readonly filePath: string) {}

  available(): boolean {
    return safeStorage.isEncryptionAvailable()
  }

  async has(): Promise<boolean> {
    return (await this.get()) !== null
  }

  async get(): Promise<string | null> {
    if (!this.available()) return null
    try {
      return safeStorage.decryptString(await readFile(this.filePath))
    } catch {
      return null
    }
  }

  async set(value: string): Promise<void> {
    if (!this.available()) {
      throw new Error('Penyimpanan kredensial Windows belum tersedia.')
    }
    await writeFile(this.filePath, safeStorage.encryptString(value), { mode: 0o600 })
  }

  async clear(): Promise<void> {
    await rm(this.filePath, { force: true })
  }
}
