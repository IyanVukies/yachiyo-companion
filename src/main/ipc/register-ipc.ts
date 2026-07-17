import { writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

import { app, clipboard, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'

import { IPC } from '../../shared/ipc'
import {
  assetKindSchema,
  booleanSchema,
  chatStartSchema,
  connectionTestSchema,
  reminderActionSchema,
  reminderScheduleSchema,
  requestIdSchema,
  settingsUpdateSchema,
  voiceRequestSchema
} from '../../shared/schemas'
import type {
  AppStatus,
  AssetStatus,
  ChatEvent,
  DiagnosticReport,
  NormalizedError,
  OperationResult
} from '../../shared/types'
import type { AssetValidator } from '../services/asset-validator'
import { HermesClient, HermesRequestError, type HermesConfig } from '../services/hermes-client'
import type { AppLogger } from '../services/logger'
import type { MockHermesServer } from '../services/mock-hermes-server'
import type { ProactiveService } from '../services/proactive-service'
import type { SecretVault } from '../services/secret-vault'
import type { SettingsStore } from '../services/settings-store'
import type { VoiceSidecar } from '../services/voice-sidecar'
import type { TrayController } from '../tray/tray-controller'
import type { DesktopWindowController } from '../windows/desktop-window'

type Context = {
  dataRoot: string
  projectRoot: string
  settingsStore: SettingsStore
  vault: SecretVault
  windowController: DesktopWindowController
  trayController: TrayController
  mockServer: MockHermesServer
  hermesClient: HermesClient
  voiceSidecar: VoiceSidecar
  assetValidator: AssetValidator
  proactiveService: ProactiveService
  logger: AppLogger
  getAssetStatus: () => AssetStatus
  setAssetStatus: (status: AssetStatus) => void
}

export function registerIpc(context: Context): void {
  const controllers = new Map<string, AbortController>()
  let connection: AppStatus['connection'] = 'mock'

  handle(IPC.appStatus, context, (): AppStatus => {
    const settings = context.settingsStore.get()
    return {
      version: app.getVersion(),
      connection: settings.connection.mode === 'mock' ? 'mock' : connection,
      mockServerReady: true,
      trayReady: context.trayController.isReady,
      clickThrough: settings.desktop.clickThrough,
      alwaysOnTop: settings.desktop.alwaysOnTop,
      autoStart: app.getLoginItemSettings().openAtLogin,
      voice: context.voiceSidecar.capabilities(),
      assets: context.getAssetStatus(),
      recoveryShortcut: 'Ctrl+Shift+F12'
    }
  })

  handle(IPC.settingsGet, context, () => context.settingsStore.view())
  handle(IPC.settingsUpdate, context, async (_event, input: unknown) => {
    const payload = settingsUpdateSchema.parse(input)
    const before = context.settingsStore.get()
    const view = await context.settingsStore.update(payload)
    app.setLoginItemSettings({ openAtLogin: view.desktop.autoStart })
    await context.windowController.setAlwaysOnTop(view.desktop.alwaysOnTop)
    await context.windowController.setClickThrough(view.desktop.clickThrough)
    context.logger.setLevel(view.logging.level)
    context.trayController.rebuildMenu()

    const assetsChanged =
      before.assets.live2dRoot !== view.assets.live2dRoot ||
      before.assets.voiceRoot !== view.assets.voiceRoot ||
      before.assets.cubismCorePath !== view.assets.cubismCorePath
    if (assetsChanged) {
      const assets = await context.assetValidator.scan(view.assets)
      context.setAssetStatus(assets)
      await context.voiceSidecar.restart(assets.voice.root)
    }
    connection = view.connection.mode === 'mock' ? 'mock' : 'offline'
    return context.settingsStore.view()
  })

  handle(IPC.settingsReset, context, async () => {
    const view = await context.settingsStore.reset()
    app.setLoginItemSettings({ openAtLogin: false })
    await context.windowController.setAlwaysOnTop(view.desktop.alwaysOnTop)
    await context.windowController.setClickThrough(false)
    await context.windowController.resetPosition()
    context.trayController.rebuildMenu()
    const assets = await context.assetValidator.scan(view.assets)
    context.setAssetStatus(assets)
    await context.voiceSidecar.restart(assets.voice.root)
    connection = 'mock'
    return context.settingsStore.view()
  })

  handle(IPC.assetsScan, context, async () => {
    const status = await context.assetValidator.scan(context.settingsStore.get().assets)
    context.setAssetStatus(status)
    return status
  })
  handle(IPC.assetsChoose, context, async (_event, value: unknown) => {
    const kind = assetKindSchema.parse(value)
    const options: Electron.OpenDialogOptions = {
      title:
        kind === 'live2d'
          ? 'Pilih folder atau ZIP Mao'
          : kind === 'voice'
            ? 'Pilih folder atau ZIP Kobo'
            : 'Pilih live2dcubismcore.min.js',
      properties: kind === 'cubism-core' ? ['openFile'] : ['openDirectory'],
      ...(kind === 'cubism-core' ? { filters: [{ name: 'Cubism Core', extensions: ['js'] }] } : {})
    }
    const parent = context.windowController.browserWindow
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    return { canceled: result.canceled, path: result.filePaths[0] ?? null }
  })
  handle(
    IPC.assetsOpenFolder,
    context,
    async (_event, value: unknown): Promise<OperationResult> => {
      const kind = z.enum(['live2d', 'voice']).parse(value)
      const assets = context.getAssetStatus()
      const root = kind === 'live2d' ? assets.live2d.root : assets.voice.root
      const fallback = join(context.projectRoot, 'project-assets', kind)
      const error = await shell.openPath(root ?? fallback)
      return error
        ? { ok: false, message: 'Folder aset tidak dapat dibuka.' }
        : { ok: true, message: 'Folder aset dibuka.' }
    }
  )

  handle(IPC.hermesTest, context, async (_event, input: unknown) => {
    const payload = connectionTestSchema.parse(input)
    const savedKey = await context.vault.get()
    const enteredKey = payload.apiKey?.trim()
    const effectiveKey = [enteredKey, savedKey].find(
      (candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0
    )
    const config =
      payload.mode === 'mock'
        ? {
            ...context.mockServer.config,
            timeoutMs: payload.timeoutMs
          }
        : {
            baseUrl: payload.baseUrl,
            apiKey: effectiveKey ?? '',
            model: payload.model,
            timeoutMs: payload.timeoutMs
          }
    connection = 'connecting'
    const result = await context.hermesClient.test(config)
    connection = result.ok ? 'connected' : result.status === 'auth-error' ? 'auth-error' : 'offline'
    return result
  })

  handle(IPC.chatStart, context, (_event, input: unknown): OperationResult => {
    const payload = chatStartSchema.parse(input)
    if (controllers.has(payload.requestId)) {
      return { ok: false, message: 'Permintaan chat ini sudah berjalan.' }
    }
    const controller = new AbortController()
    controllers.set(payload.requestId, controller)
    const webContents = context.windowController.browserWindow?.webContents
    webContents?.send(IPC.chatEvent, {
      type: 'started',
      requestId: payload.requestId
    } satisfies ChatEvent)

    void (async () => {
      let partialText = ''
      try {
        const config = await resolveHermesConfig(context)
        connection = context.settingsStore.get().connection.mode === 'mock' ? 'mock' : 'connecting'
        const result = await context.hermesClient.stream(
          config,
          payload.messages,
          controller.signal,
          (text) => {
            partialText += text
            webContents?.send(IPC.chatEvent, {
              type: 'delta',
              requestId: payload.requestId,
              text
            } satisfies ChatEvent)
          }
        )
        connection = context.settingsStore.get().connection.mode === 'mock' ? 'mock' : 'connected'
        if (result.metadata) {
          webContents?.send(IPC.chatEvent, {
            type: 'metadata',
            requestId: payload.requestId,
            metadata: result.metadata
          } satisfies ChatEvent)
        }
        webContents?.send(IPC.chatEvent, {
          type: 'done',
          requestId: payload.requestId,
          text: result.displayText
        } satisfies ChatEvent)
      } catch (error) {
        if (controller.signal.aborted) {
          webContents?.send(IPC.chatEvent, {
            type: 'cancelled',
            requestId: payload.requestId,
            partialText
          } satisfies ChatEvent)
        } else {
          const requestError =
            error instanceof HermesRequestError
              ? error
              : new HermesRequestError(unknownHermesError(), partialText)
          connection = context.settingsStore.get().connection.mode === 'mock' ? 'mock' : 'offline'
          webContents?.send(IPC.chatEvent, {
            type: 'error',
            requestId: payload.requestId,
            error: requestError.normalized,
            partialText: requestError.partialText || partialText
          } satisfies ChatEvent)
        }
      } finally {
        controllers.delete(payload.requestId)
      }
    })()
    return { ok: true, message: 'Permintaan chat dimulai.' }
  })

  handle(IPC.chatCancel, context, (_event, input: unknown): OperationResult => {
    const requestId = requestIdSchema.parse(input)
    const controller = controllers.get(requestId)
    if (!controller) return { ok: false, message: 'Tidak ada respons aktif.' }
    controller.abort()
    return { ok: true, message: 'Respons dihentikan.' }
  })

  handle(IPC.voiceCapabilities, context, () => context.voiceSidecar.capabilities())
  handle(IPC.voiceSynthesize, context, (_event, input: unknown) => {
    const request = voiceRequestSchema.parse(input)
    return context.voiceSidecar.synthesize(request)
  })
  handle(IPC.voiceStop, context, (): OperationResult => {
    context.voiceSidecar.stopCurrent()
    return { ok: true, message: 'Antrean suara dihentikan.' }
  })

  handle(
    IPC.windowClickThrough,
    context,
    async (_event, input: unknown): Promise<OperationResult> => {
      await context.windowController.setClickThrough(booleanSchema.parse(input))
      context.trayController.rebuildMenu()
      return { ok: true, message: 'Mode tembus klik diperbarui.' }
    }
  )
  handle(
    IPC.windowAlwaysOnTop,
    context,
    async (_event, input: unknown): Promise<OperationResult> => {
      await context.windowController.setAlwaysOnTop(booleanSchema.parse(input))
      context.trayController.rebuildMenu()
      return { ok: true, message: 'Pengaturan selalu di atas diperbarui.' }
    }
  )
  handle(IPC.windowHide, context, (): OperationResult => {
    context.windowController.hide()
    return { ok: true, message: 'Yachiyo disembunyikan ke tray.' }
  })
  handle(IPC.windowResetPosition, context, async (): Promise<OperationResult> => {
    await context.windowController.resetPosition()
    context.windowController.show()
    return { ok: true, message: 'Posisi jendela dipulihkan.' }
  })

  handle(IPC.proactiveTest, context, () => context.proactiveService.manualTest())
  handle(IPC.proactiveList, context, () => context.proactiveService.list())
  handle(IPC.proactiveSchedule, context, (_event, input: unknown) =>
    context.proactiveService.schedule(reminderScheduleSchema.parse(input))
  )
  handle(IPC.proactiveAction, context, (_event, input: unknown) => {
    const payload = reminderActionSchema.parse(input)
    return context.proactiveService.act(payload.id, payload.action)
  })

  handle(IPC.diagnosticsExport, context, async () => {
    const report = createDiagnosticReport(context)
    const options: Electron.SaveDialogOptions = {
      title: 'Simpan diagnostik aman',
      defaultPath: `yachiyo-diagnostics-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    }
    const parent = context.windowController.browserWindow
    const result = parent
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) {
      return { result: { ok: false, message: 'Ekspor dibatalkan.' }, report: null }
    }
    await writeFile(result.filePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    return { result: { ok: true, message: 'Diagnostik aman tersimpan.' }, report }
  })
  handle(IPC.clipboardWrite, context, (_event, input: unknown): OperationResult => {
    clipboard.writeText(z.string().max(100_000).parse(input))
    return { ok: true, message: 'Teks disalin.' }
  })

  context.proactiveService.onEvent((event) => {
    context.windowController.browserWindow?.webContents.send(IPC.proactiveEvent, event)
    if (event.type === 'delivered') context.windowController.show()
  })
}

function handle(
  channel: string,
  context: Context,
  handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
): void {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, async (event, ...args: unknown[]) => {
    if (event.sender !== context.windowController.browserWindow?.webContents) {
      throw new Error('IPC sender tidak tepercaya.')
    }
    try {
      return await handler(event, ...args)
    } catch (error) {
      context.logger.warn(`IPC ${channel} ditolak.`, error)
      if (error instanceof z.ZodError) {
        throw new Error('Input aplikasi tidak valid.', { cause: error })
      }
      throw error
    }
  })
}

async function resolveHermesConfig(context: Context): Promise<HermesConfig> {
  const settings = context.settingsStore.get()
  if (settings.connection.mode === 'mock') {
    return {
      ...context.mockServer.config,
      timeoutMs: settings.connection.timeoutMs,
      streaming: settings.connection.streaming,
      retryCount: settings.connection.retryCount,
      sessionId: settings.connection.sessionId
    }
  }
  return {
    baseUrl: settings.connection.baseUrl,
    apiKey: (await context.vault.get()) ?? '',
    model: settings.connection.model,
    timeoutMs: settings.connection.timeoutMs,
    streaming: settings.connection.streaming,
    retryCount: settings.connection.retryCount,
    sessionId: settings.connection.sessionId
  }
}

function unknownHermesError(): NormalizedError {
  return {
    code: 'UNKNOWN',
    title: 'Respons gagal',
    message: 'Respons tidak dapat diselesaikan, tetapi data lokal tetap aman.',
    dataSafe: true,
    availableFeatures: ['Avatar', 'Pengaturan', 'Pengingat lokal', 'Hermes mock'],
    nextAction: 'Coba lagi atau gunakan mode Mock.',
    retryable: true
  }
}

function createDiagnosticReport(context: Context): DiagnosticReport {
  const settings = context.settingsStore.get()
  return {
    generatedAt: new Date().toISOString(),
    appVersion: app.getVersion(),
    platform: `${process.platform}-${process.arch}`,
    settings: {
      schemaVersion: settings.schemaVersion,
      connection: {
        mode: settings.connection.mode,
        baseUrl: sanitizedUrl(settings.connection.baseUrl),
        modelConfigured: Boolean(settings.connection.model),
        timeoutMs: settings.connection.timeoutMs,
        streaming: settings.connection.streaming
      },
      voice: {
        mode: settings.voice.mode,
        ttsVoice: settings.voice.ttsVoice,
        rvc: {
          pitch: settings.voice.rvc.pitch,
          indexRate: settings.voice.rvc.indexRate,
          protect: settings.voice.rvc.protect,
          f0Method: settings.voice.rvc.f0Method,
          device: settings.voice.rvc.device
        }
      },
      proactive: settings.proactive,
      desktop: {
        alwaysOnTop: settings.desktop.alwaysOnTop,
        clickThrough: settings.desktop.clickThrough,
        autoStart: settings.desktop.autoStart,
        scale: settings.desktop.scale
      },
      assetNames: {
        live2d: settings.assets.live2dRoot ? basename(settings.assets.live2dRoot) : null,
        voice: settings.assets.voiceRoot ? basename(settings.assets.voiceRoot) : null,
        cubismCore: settings.assets.cubismCorePath ? basename(settings.assets.cubismCorePath) : null
      },
      hasApiKey: false
    },
    assets: diagnosticAssetSummary(context.getAssetStatus()),
    voice: context.voiceSidecar.capabilities(),
    checks: {
      contextIsolation: true,
      nodeIntegration: false,
      rendererSandbox: true,
      mockHermes: true,
      secretIncluded: false
    }
  }
}

function diagnosticAssetSummary(assets: AssetStatus): Record<string, unknown> {
  return {
    live2d: {
      state: assets.live2d.state,
      sourceKind: assets.live2d.sourceKind,
      modelName: assets.live2d.modelName,
      modelVersion: assets.live2d.modelVersion,
      textureSize: assets.live2d.textureSize,
      expressionCount: assets.live2d.expressions.length,
      motionCount: assets.live2d.motions.length,
      eyeBlinkParameters: assets.live2d.eyeBlinkParameters,
      lipSyncParameters: assets.live2d.lipSyncParameters,
      hasPhysics: assets.live2d.hasPhysics,
      hasPose: assets.live2d.hasPose,
      hasCore: assets.live2d.hasCore,
      issueCodes: assets.live2d.issues.map((item) => item.code),
      hashes: assets.live2d.hashes
    },
    voice: {
      state: assets.voice.state,
      sourceKind: assets.voice.sourceKind,
      metadata: assets.voice.metadata,
      runtime: assets.voice.runtime,
      issueCodes: assets.voice.issues.map((item) => item.code),
      hashes: assets.voice.hashes
    }
  }
}

function sanitizedUrl(value: string): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
    return `${url.protocol}//${local ? url.host : '[host-redacted]'}${url.pathname}`
  } catch {
    return '[invalid-url]'
  }
}
