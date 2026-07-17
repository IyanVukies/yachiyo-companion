import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { AppLogger } from '../../src/main/services/logger'
import { SettingsStore } from '../../src/main/services/settings-store'
import { defaultSettings, settingsSchema } from '../../src/shared/schemas'
import type { SecretVault } from '../../src/main/services/secret-vault'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }))
  )
})

describe('settings persistence', () => {
  it('stores the API key only in the secret vault', async () => {
    const { root, path, store } = await fixture()
    roots.push(root)
    const settings = structuredClone(defaultSettings)
    settings.onboardingComplete = true
    settings.connection = {
      ...settings.connection,
      mode: 'hermes',
      baseUrl: 'http://127.0.0.1:20129/v1',
      model: 'hermes-agent'
    }
    await store.update({
      settings,
      apiKey: '  hermes-secret  '
    })

    const persisted = await readFile(path, 'utf8')
    expect(persisted).not.toContain('hermes-secret')
    expect((await store.getHermesSnapshot()).apiKey).toBe('hermes-secret')
    expect((await store.view()).hasApiKey).toBe(true)
  })

  it('recovers invalid JSON to safe defaults', async () => {
    const root = await mkdtemp(join(tmpdir(), 'yachiyo-settings-'))
    roots.push(root)
    const path = join(root, 'settings.json')
    await writeFile(path, '{broken', 'utf8')
    const store = new SettingsStore(
      path,
      new MemoryVault(),
      new AppLogger(join(root, 'app.log'), 'error')
    )

    await store.load()

    expect(store.get()).toEqual(defaultSettings)
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(defaultSettings)
  })

  it('reloads every Hermes runtime setting and the vault-backed key after startup', async () => {
    const { root, path, store, vault } = await fixture()
    roots.push(root)
    const settings = structuredClone(defaultSettings)
    settings.onboardingComplete = true
    settings.connection = {
      mode: 'hermes',
      baseUrl: 'http://127.0.0.1:20129/v1',
      model: 'hermes-agent',
      timeoutMs: 75_000,
      streaming: false,
      retryCount: 3,
      sessionId: 'persisted-session'
    }
    await store.update({ settings, apiKey: '  persisted-key  ' })

    const reloaded = new SettingsStore(
      path,
      vault,
      new AppLogger(join(root, 'reload.log'), 'error')
    )
    await reloaded.load()

    expect(reloaded.get().connection).toEqual(settings.connection)
    expect((await reloaded.getHermesSnapshot()).apiKey).toBe('persisted-key')
    expect(await reloaded.view()).toMatchObject({
      connection: settings.connection,
      hasApiKey: true
    })
    expect(await readFile(path, 'utf8')).not.toContain('persisted-key')
  })

  it('refuses to pair a credential with a different persisted destination', async () => {
    const { root, store } = await fixture()
    roots.push(root)
    const first = structuredClone(defaultSettings)
    first.connection = {
      ...first.connection,
      mode: 'hermes',
      baseUrl: 'http://127.0.0.1:20129/v1',
      model: 'hermes-agent'
    }
    await store.update({ settings: first, apiKey: 'destination-bound-key' })

    const moved = structuredClone(first)
    moved.connection.baseUrl = 'http://127.0.0.1:29999/v1'
    await store.update({ settings: moved })

    expect((await store.getHermesSnapshot()).apiKey).toBe('')
    expect((await store.view()).hasApiKey).toBe(true)
  })

  it('persists a dialog-selected asset path without changing secrets or unrelated settings', async () => {
    const { root, path, store, vault } = await fixture()
    roots.push(root)
    await store.update({
      settings: { ...defaultSettings, onboardingComplete: true },
      apiKey: 'vault-only'
    })
    const storedCredential = vault.value
    const selected = join(root, 'Aset Mao 日本語 dengan spasi', 'runtime')

    const view = await store.updateAssetPath('live2d', selected)

    expect(view.assets.live2dRoot).toBe(selected)
    expect(view.onboardingComplete).toBe(true)
    expect(vault.value).toBe(storedCredential)
    const persisted = settingsSchema.parse(JSON.parse(await readFile(path, 'utf8')))
    expect(persisted.assets.live2dRoot).toBe(selected)

    const reloaded = new SettingsStore(
      path,
      vault,
      new AppLogger(join(root, 'reload.log'), 'error')
    )
    await reloaded.load()
    expect(reloaded.get().assets.live2dRoot).toBe(selected)
  })
})

async function fixture(): Promise<{
  root: string
  path: string
  store: SettingsStore
  vault: MemoryVault
}> {
  const root = await mkdtemp(join(tmpdir(), 'yachiyo-settings-'))
  const path = join(root, 'settings.json')
  const vault = new MemoryVault()
  const store = new SettingsStore(path, vault, new AppLogger(join(root, 'app.log'), 'error'))
  await store.load()
  return { root, path, store, vault }
}

class MemoryVault implements SecretVault {
  value: string | null = null

  available(): boolean {
    return true
  }

  has(): Promise<boolean> {
    return Promise.resolve(this.value !== null)
  }

  get(): Promise<string | null> {
    return Promise.resolve(this.value)
  }

  set(value: string): Promise<void> {
    this.value = value
    return Promise.resolve()
  }

  clear(): Promise<void> {
    this.value = null
    return Promise.resolve()
  }
}
