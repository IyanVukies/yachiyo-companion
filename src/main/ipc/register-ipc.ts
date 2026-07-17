import { randomUUID } from 'node:crypto'
import { stat, writeFile } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'

import {
  app,
  clipboard,
  dialog,
  ipcMain,
  shell,
  type IpcMainInvokeEvent,
  type WebContents
} from 'electron'
import { z } from 'zod'

import { IPC } from '../../shared/ipc'
import {
  assetSelectionRequestSchema,
  assetSelectionTokenSchema,
  booleanSchema,
  chatStartSchema,
  connectionTestSchema,
  reminderActionSchema,
  reminderScheduleSchema,
  requestIdSchema,
  type Settings,
  settingsUpdateSchema,
  voicePlaybackReportSchema,
  voiceRequestSchema
} from '../../shared/schemas'
import type {
  AppStatus,
  AssetApplyResult,
  AssetDialogResult,
  AssetSelectionRequest,
  AssetStatus,
  ChatEvent,
  DiagnosticReport,
  HermesConnectionStatus,
  NormalizedError,
  OperationResult
} from '../../shared/types'
import type { AssetValidator } from '../services/asset-validator'
import {
  HermesClient,
  HermesRequestError,
  normalizeHermesApiKey,
  normalizeHermesBaseUrl,
  sameHermesDestination
} from '../services/hermes-client'
import { HermesRuntime } from '../services/hermes-runtime'
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

type PendingAssetSelection = {
  request: AssetSelectionRequest
  selectedPath: string
  expiresAt: number
}

const ASSET_SELECTION_TTL_MS = 5 * 60_000
const MAX_PENDING_ASSET_SELECTIONS = 8

export function registerIpc(context: Context): () => void {
  const controllers = new Map<string, AbortController>()
  const pendingAssetSelections = new Map<string, PendingAssetSelection>()
  const hermesRuntime = new HermesRuntime({
    settingsStore: context.settingsStore,
    mockServer: context.mockServer,
    hermesClient: context.hermesClient,
    logger: context.logger
  })
  const unsubscribeHermes = hermesRuntime.onStatus((status) => {
    context.windowController.browserWindow?.webContents.send(IPC.hermesStatus, status)
  })

  handle(IPC.appStatus, context, (): AppStatus => {
    const settings = context.settingsStore.get()
    const hermes = hermesRuntime.getStatus()
    return {
      version: app.getVersion(),
      connection: hermes.state,
      hermes,
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
    if (
      before.assets.live2dRoot !== payload.settings.assets.live2dRoot ||
      before.assets.voiceRoot !== payload.settings.assets.voiceRoot ||
      before.assets.cubismCorePath !== payload.settings.assets.cubismCorePath
    ) {
      throw new Error('Path aset hanya dapat diubah melalui dialog pemilihan aset.')
    }
    const settings = normalizeConnectionSettings(payload.settings)
    const explicitKey =
      payload.apiKey === undefined ? undefined : normalizeHermesApiKey(payload.apiKey)
    const destinationChanged =
      before.connection.baseUrl.trim() !== settings.connection.baseUrl.trim() &&
      !sameHermesDestination(before.connection.baseUrl, settings.connection.baseUrl)
    if (destinationChanged && (await context.vault.has()) && !explicitKey && !payload.clearApiKey) {
      throw new Error('Masukkan ulang API key saat Base URL Hermes berubah.')
    }
    const view = await context.settingsStore.update({
      ...payload,
      settings,
      ...(explicitKey ? { apiKey: explicitKey } : { apiKey: undefined })
    })
    void hermesRuntime.settingsChanged().catch(() => {
      context.logger.warn('Konfigurasi Hermes tersimpan, tetapi pemeriksaan ulang gagal.', {
        errorType: 'runtime-refresh'
      })
    })
    app.setLoginItemSettings({ openAtLogin: view.desktop.autoStart })
    await context.windowController.setAlwaysOnTop(view.desktop.alwaysOnTop)
    await context.windowController.setClickThrough(view.desktop.clickThrough)
    context.logger.setLevel(view.logging.level)
    context.trayController.rebuildMenu()

    return view
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
    void hermesRuntime.settingsChanged().catch(() => {
      context.logger.warn('Reset Hermes tersimpan, tetapi refresh runtime gagal.', {
        errorType: 'runtime-refresh'
      })
    })
    return context.settingsStore.view()
  })

  handle(IPC.assetsScan, context, async () => {
    return refreshAssets(context, context.settingsStore.get().assets, true)
  })
  handle(IPC.assetsChoose, context, async (_event, value: unknown): Promise<AssetDialogResult> => {
    const request = assetSelectionRequestSchema.parse(value)
    pruneAssetSelections(pendingAssetSelections)
    const options = assetDialogOptions(request)
    const parent = context.windowController.browserWindow
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled) {
      return {
        outcome: 'cancelled',
        request,
        selectedPath: null,
        selectionToken: null,
        message: selectionCancelledMessage(request)
      }
    }

    const rawPath = result.filePaths[0]?.trim() ?? ''
    if (!rawPath) {
      return {
        outcome: 'error',
        request,
        selectedPath: null,
        selectionToken: null,
        message: 'Dialog ditutup tanpa mengembalikan path. Pilihan sebelumnya tidak diubah.'
      }
    }

    const selectedPath = resolve(rawPath)
    const validationError = await validateDialogSelection(selectedPath, request)
    if (validationError) {
      return {
        outcome: 'error',
        request,
        selectedPath,
        selectionToken: null,
        message: validationError
      }
    }

    for (const [token, pending] of pendingAssetSelections) {
      if (pending.request.kind === request.kind) pendingAssetSelections.delete(token)
    }
    if (pendingAssetSelections.size >= MAX_PENDING_ASSET_SELECTIONS) {
      const oldestToken = pendingAssetSelections.keys().next().value
      if (oldestToken) pendingAssetSelections.delete(oldestToken)
    }
    const selectionToken = randomUUID()
    pendingAssetSelections.set(selectionToken, {
      request,
      selectedPath,
      expiresAt: Date.now() + ASSET_SELECTION_TTL_MS
    })
    return {
      outcome: 'selected',
      request,
      selectedPath,
      selectionToken,
      message: `${selectionLabel(request)} dipilih. Memindai aset…`
    }
  })
  handle(
    IPC.assetsApplySelection,
    context,
    async (_event, value: unknown): Promise<AssetApplyResult> => {
      const { token } = assetSelectionTokenSchema.parse(value)
      pruneAssetSelections(pendingAssetSelections)
      const pending = pendingAssetSelections.get(token)
      pendingAssetSelections.delete(token)
      if (!pending) {
        return {
          outcome: 'expired',
          selectedPath: null,
          normalizedRoot: null,
          settings: await context.settingsStore.view(),
          assets: context.getAssetStatus(),
          message: 'Pilihan aset kedaluwarsa. Pilih sumber aset sekali lagi.'
        }
      }

      const current = context.settingsStore.get()
      const proposedAssets = withSelectedAssetPath(
        current.assets,
        pending.request.kind,
        pending.selectedPath
      )
      let assets = await context.assetValidator.scan(proposedAssets)
      const settings = await context.settingsStore.updateAssetPath(
        pending.request.kind,
        pending.selectedPath
      )
      if (pending.request.kind === 'voice') {
        await context.voiceSidecar.restart(assets.voice.root)
        assets = context.assetValidator.refreshRuntime(assets)
      }
      context.setAssetStatus(assets)
      return {
        outcome: 'applied',
        selectedPath: pending.selectedPath,
        normalizedRoot: pending.request.kind === 'voice' ? assets.voice.root : assets.live2d.root,
        settings,
        assets,
        message: 'Pilihan aset dipindai dan disimpan.'
      }
    }
  )
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
    return hermesRuntime.testDraft(payload)
  })

  handle(IPC.chatStart, context, (_event, input: unknown): OperationResult => {
    const payload = chatStartSchema.parse(input)
    if (controllers.has(payload.requestId)) {
      return { ok: false, message: 'Permintaan chat ini sudah berjalan.' }
    }
    const controller = new AbortController()
    controllers.set(payload.requestId, controller)
    const webContents = context.windowController.browserWindow?.webContents
    sendChatEvent(webContents, context.logger, {
      type: 'started',
      requestId: payload.requestId
    })

    void (async () => {
      let partialText = ''
      try {
        const result = await hermesRuntime.stream(payload.messages, controller.signal, (text) => {
          partialText += text
          sendChatEvent(webContents, context.logger, {
            type: 'delta',
            requestId: payload.requestId,
            text
          })
        })
        if (result.metadata) {
          sendChatEvent(webContents, context.logger, {
            type: 'metadata',
            requestId: payload.requestId,
            metadata: result.metadata
          })
        }
        sendChatEvent(webContents, context.logger, {
          type: 'done',
          requestId: payload.requestId,
          text: result.displayText
        })
      } catch (error) {
        if (controller.signal.aborted) {
          sendChatEvent(webContents, context.logger, {
            type: 'cancelled',
            requestId: payload.requestId,
            partialText
          })
        } else {
          const requestError =
            error instanceof HermesRequestError
              ? error
              : new HermesRequestError(unknownHermesError(), partialText)
          sendChatEvent(webContents, context.logger, {
            type: 'error',
            requestId: payload.requestId,
            error: requestError.normalized,
            partialText: requestError.partialText || partialText
          })
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

  handle(IPC.voiceCapabilities, context, async () => {
    const capabilities = await context.voiceSidecar.refreshCapabilities()
    context.setAssetStatus(context.assetValidator.refreshRuntime(context.getAssetStatus()))
    return capabilities
  })
  handle(IPC.voiceRuntimeSetup, context, async () => {
    const capabilities = await context.voiceSidecar.setupRuntime()
    context.setAssetStatus(context.assetValidator.refreshRuntime(context.getAssetStatus()))
    return capabilities
  })
  handle(IPC.voiceSynthesize, context, (_event, input: unknown) => {
    const request = voiceRequestSchema.parse(input)
    return context.voiceSidecar.synthesize(request)
  })
  handle(IPC.voicePlaybackReport, context, (_event, input: unknown): OperationResult => {
    const report = voicePlaybackReportSchema.parse(input)
    return context.voiceSidecar.reportPlayback(report)
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
    const report = createDiagnosticReport(context, hermesRuntime.getStatus())
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

  void hermesRuntime.start().catch((error: unknown) => {
    context.logger.warn('Pemeriksaan awal Hermes gagal.', error)
  })
  return () => {
    unsubscribeHermes()
    hermesRuntime.stop()
  }
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
      context.logger.warn(`IPC ${channel} ditolak.`, safeIpcErrorDetail(error))
      if (error instanceof z.ZodError) {
        throw new Error('Input aplikasi tidak valid.', { cause: error })
      }
      throw error
    }
  })
}

function safeIpcErrorDetail(error: unknown): Record<string, unknown> {
  if (error instanceof z.ZodError) {
    return {
      errorType: 'validation',
      issues: error.issues.map((issue) => ({ code: issue.code, path: issue.path.join('.') }))
    }
  }
  return {
    errorType: error instanceof Error ? error.name : 'unknown'
  }
}

function sendChatEvent(
  webContents: WebContents | undefined,
  logger: AppLogger,
  event: ChatEvent
): void {
  try {
    if (!webContents) return
    webContents.send(IPC.chatEvent, event)
  } catch {
    logger.warn('Event chat tidak dapat dikirim ke renderer.', { eventType: event.type })
  }
}

function assetDialogOptions(request: AssetSelectionRequest): Electron.OpenDialogOptions {
  if (request.kind === 'cubism-core') {
    return {
      title: 'Pilih live2dcubismcore.min.js resmi',
      properties: ['openFile'],
      filters: [{ name: 'Cubism Core for Web', extensions: ['js'] }]
    }
  }
  const assetName = request.kind === 'live2d' ? 'Mao' : 'Kobo'
  return request.source === 'folder'
    ? {
        title: `Pilih folder ${assetName}`,
        properties: ['openDirectory']
      }
    : {
        title: `Pilih ZIP ${assetName}`,
        properties: ['openFile'],
        filters: [{ name: `ZIP ${assetName}`, extensions: ['zip'] }]
      }
}

async function validateDialogSelection(
  selectedPath: string,
  request: AssetSelectionRequest
): Promise<string | null> {
  if (selectedPath.length > 1_024) {
    return 'Path yang dipilih terlalu panjang. Pilihan sebelumnya tidak diubah.'
  }
  const details = await stat(selectedPath).catch(() => null)
  if (!details) return 'Path yang dipilih sudah tidak tersedia. Pilihan sebelumnya tidak diubah.'
  if (request.source === 'folder') {
    return details.isDirectory()
      ? null
      : 'Pilihan bukan folder. Gunakan “Pilih ZIP” untuk arsip .zip.'
  }
  if (request.source === 'zip') {
    return details.isFile() && extname(selectedPath).toLowerCase() === '.zip'
      ? null
      : 'Pilihan bukan berkas ZIP yang valid. Pilihan sebelumnya tidak diubah.'
  }
  return details.isFile() && basename(selectedPath).toLowerCase() === 'live2dcubismcore.min.js'
    ? null
    : 'Pilih berkas live2dcubismcore.min.js resmi dari Cubism SDK for Web.'
}

function selectionCancelledMessage(request: AssetSelectionRequest): string {
  return `${selectionLabel(request)} dibatalkan. Pilihan sebelumnya tidak diubah.`
}

function selectionLabel(request: AssetSelectionRequest): string {
  if (request.kind === 'cubism-core') return 'Pemilihan Cubism Core'
  const name = request.kind === 'live2d' ? 'Mao' : 'Kobo'
  return request.source === 'zip' ? `ZIP ${name}` : `Folder ${name}`
}

function pruneAssetSelections(selections: Map<string, PendingAssetSelection>): void {
  const now = Date.now()
  for (const [token, selection] of selections) {
    if (selection.expiresAt <= now) selections.delete(token)
  }
}

function withSelectedAssetPath(
  assets: {
    live2dRoot: string
    voiceRoot: string
    cubismCorePath: string
  },
  kind: AssetSelectionRequest['kind'],
  selectedPath: string
): { live2dRoot: string; voiceRoot: string; cubismCorePath: string } {
  const key = kind === 'live2d' ? 'live2dRoot' : kind === 'voice' ? 'voiceRoot' : 'cubismCorePath'
  return { ...assets, [key]: selectedPath }
}

async function refreshAssets(
  context: Context,
  configured: { live2dRoot: string; voiceRoot: string; cubismCorePath: string },
  restartVoice: boolean
): Promise<AssetStatus> {
  let status = await context.assetValidator.scan(configured)
  if (restartVoice) {
    await context.voiceSidecar.restart(status.voice.root)
    status = context.assetValidator.refreshRuntime(status)
  }
  context.setAssetStatus(status)
  return status
}

function normalizeConnectionSettings(settings: Settings): Settings {
  if (settings.connection.mode !== 'hermes') return settings
  try {
    const normalizedBaseUrl = normalizeHermesBaseUrl(settings.connection.baseUrl).toString()
    return {
      ...settings,
      connection: { ...settings.connection, baseUrl: normalizedBaseUrl }
    }
  } catch {
    throw new Error('Base URL Hermes tidak valid. Gunakan alamat HTTP(S) tanpa kredensial URL.')
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
    retryable: true,
    category: 'response',
    httpStatus: null,
    endpoint: null,
    responseSummary: null
  }
}

function createDiagnosticReport(
  context: Context,
  hermes: HermesConnectionStatus
): DiagnosticReport {
  const settings = context.settingsStore.get()
  return {
    generatedAt: new Date().toISOString(),
    appVersion: app.getVersion(),
    platform: `${process.platform}-${process.arch}`,
    settings: {
      schemaVersion: settings.schemaVersion,
      connection: {
        mode: settings.connection.mode,
        baseUrl: sanitizedUrl(hermes.diagnostics.normalizedBaseUrl ?? settings.connection.baseUrl),
        selectedModel: settings.connection.model,
        timeoutMs: settings.connection.timeoutMs,
        retryCount: settings.connection.retryCount,
        streaming: settings.connection.streaming,
        status: hermes.state,
        endpoints: {
          models: sanitizedUrl(hermes.diagnostics.modelsEndpoint ?? ''),
          chat: sanitizedUrl(hermes.diagnostics.chatEndpoint ?? '')
        },
        lastCheck: {
          phase: hermes.diagnostics.phase,
          activeEndpoint: sanitizedUrl(hermes.diagnostics.activeEndpoint ?? ''),
          httpStatus: hermes.diagnostics.httpStatus,
          errorCategory: hermes.diagnostics.errorCategory,
          responseSummary: hermes.diagnostics.responseSummary,
          checkedAt: hermes.diagnostics.checkedAt
        }
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
      secretIncluded: false,
      hermesState: hermes.state
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
      textures: assets.live2d.textures.map((texture) => ({
        file: texture.file,
        width: texture.width,
        height: texture.height
      })),
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
