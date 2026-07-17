import type { z } from 'zod'

import type {
  assetSelectionRequestSchema,
  avatarStateSchema,
  chatMessageSchema,
  settingsSchema,
  voiceRequestSchema
} from './schemas'

export type AvatarState = z.infer<typeof avatarStateSchema>
export type ChatMessage = z.infer<typeof chatMessageSchema>
export type AppSettings = z.infer<typeof settingsSchema>
export type VoiceRequest = z.infer<typeof voiceRequestSchema>

export type SettingsView = AppSettings & {
  hasApiKey: boolean
  secureStorageAvailable: boolean
}

export type MotionInfo = {
  group: string
  index: number
  name: string
  file: string
  durationSeconds: number | null
  loop: boolean | null
}

export type ExpressionInfo = {
  name: string
  file: string
  parameterCount: number
}

export type TextureInfo = {
  file: string
  width: number | null
  height: number | null
}

export type AssetIssue = {
  code: string
  message: string
  path?: string
}

export type Live2DAssetStatus = {
  state: 'ready' | 'missing' | 'invalid' | 'core-missing'
  sourceKind: 'zip' | 'folder' | 'none'
  root: string | null
  entry: string | null
  modelName: string | null
  modelVersion: number | null
  textureSize: { width: number; height: number } | null
  textures: TextureInfo[]
  expressions: ExpressionInfo[]
  motions: MotionInfo[]
  eyeBlinkParameters: string[]
  lipSyncParameters: string[]
  hasPhysics: boolean
  hasPose: boolean
  hasCore: boolean
  issues: AssetIssue[]
  hashes: Record<string, string>
}

export type VoiceAssetStatus = {
  state: 'ready' | 'missing' | 'invalid' | 'incomplete' | 'runtime-missing'
  sourceKind: 'zip' | 'folder' | 'none'
  root: string | null
  checkpoint: string | null
  index: string | null
  metadata: {
    version: string | null
    sampleRate: string | null
    f0: boolean | null
    info: string | null
  }
  runtime: {
    ffmpeg: boolean
    ffprobe: boolean
    python: boolean
    rvc: boolean
    rmvpe: boolean
    contentVec: boolean
  }
  issues: AssetIssue[]
  hashes: Record<string, string>
}

export type AssetStatus = {
  live2d: Live2DAssetStatus
  voice: VoiceAssetStatus
  scannedAt: string
}

export type VoiceCapabilities = {
  sidecar: 'ready' | 'starting' | 'offline'
  edgeTts: boolean
  browserTts: boolean
  rvc: boolean
  ffmpeg: boolean
  device: string
  detail: string
  runtime: VoiceRuntimeStatus
  deviceInfo: {
    selected: string
    cudaAvailable: boolean
    cudaName: string | null
    devices: string[]
    torch: string | null
    torchCuda: string | null
  }
  versions: Record<string, string | null>
  lastMetrics: VoiceMetrics | null
  lastPlayback: VoicePlaybackSummary | null
}

export type VoiceRuntimeStatus = {
  state: 'checking' | 'setup-required' | 'downloading' | 'ready' | 'error'
  stage: string
  progress: number
  downloadedBytes: number
  totalBytes: number
  currentAsset: string | null
  error: string | null
  assets: Record<
    string,
    {
      label: string
      state: string
      bytes: number
    }
  >
}

export type VoiceMetrics = {
  coldStartMs?: number
  conversionMs?: number
  featureMs?: number
  pitchMs?: number
  indexMs?: number
  inferMs?: number
  ttsMs?: number
  totalMs?: number
  cpuPercent?: number
  peakRamMb?: number
  sourceDurationMs?: number
  audioDurationMs?: number
  outputBytes?: number
  device?: string
  deviceName?: string
  silence?: boolean
}

export type VoicePlaybackSummary = {
  requestId: string
  source: 'sidecar-rvc' | 'sidecar-basic'
  playedAt: string
  durationMs: number
  maxLipSync: number
  metrics: VoiceMetrics | null
}

export type AppStatus = {
  version: string
  connection: 'mock' | 'connected' | 'connecting' | 'offline' | 'auth-error'
  mockServerReady: boolean
  trayReady: boolean
  clickThrough: boolean
  alwaysOnTop: boolean
  autoStart: boolean
  voice: VoiceCapabilities
  assets: AssetStatus
  recoveryShortcut: string
}

export type AvatarMetadata = {
  emotion?: AvatarState
  motion?: 'idle' | 'nod' | 'wave' | 'celebrate' | 'concerned'
  importance?: 'low' | 'normal' | 'high'
  requiresResponse?: boolean
}

export type ChatEvent =
  | { type: 'started'; requestId: string }
  | { type: 'delta'; requestId: string; text: string }
  | { type: 'metadata'; requestId: string; metadata: AvatarMetadata }
  | { type: 'done'; requestId: string; text: string }
  | {
      type: 'error'
      requestId: string
      error: NormalizedError
      partialText: string
    }
  | { type: 'cancelled'; requestId: string; partialText: string }

export type NormalizedError = {
  code:
    | 'AUTH'
    | 'RATE_LIMIT'
    | 'TIMEOUT'
    | 'OFFLINE'
    | 'SERVER'
    | 'MALFORMED_STREAM'
    | 'VALIDATION'
    | 'UNKNOWN'
  title: string
  message: string
  dataSafe: boolean
  availableFeatures: string[]
  nextAction: string
  retryable: boolean
}

export type Reminder = {
  id: string
  kind: 'morning' | 'evening' | 'custom' | 'event' | 'deadline' | 'inactivity' | 'manual'
  title: string
  body: string
  dedupeKey: string
  scheduledAt: string
  deliveredAt: string | null
  snoozedUntil: string | null
  dismissedAt: string | null
}

export type ProactiveEvent = {
  type: 'delivered' | 'updated'
  reminder: Reminder
}

export type DiagnosticReport = {
  generatedAt: string
  appVersion: string
  platform: string
  settings: Record<string, unknown>
  assets: Record<string, unknown>
  voice: VoiceCapabilities
  checks: Record<string, boolean | string>
}

export type VoiceResult = {
  ok: boolean
  source: 'sidecar-rvc' | 'sidecar-basic' | 'browser-basic' | 'disabled'
  mimeType: string | null
  audioBase64: string | null
  message: string
  fellBack: boolean
  requestId: string | null
  metrics: VoiceMetrics | null
}

export type ConnectionTestResult = {
  ok: boolean
  status: 'connected' | 'auth-error' | 'offline' | 'invalid' | 'timeout'
  message: string
  model: string | null
  warning: string | null
}

export type AssetSelectionRequest = z.infer<typeof assetSelectionRequestSchema>

export type AssetDialogResult = {
  outcome: 'selected' | 'cancelled' | 'error'
  request: AssetSelectionRequest
  selectedPath: string | null
  selectionToken: string | null
  message: string
}

export type AssetApplyResult = {
  outcome: 'applied' | 'expired'
  selectedPath: string | null
  normalizedRoot: string | null
  settings: SettingsView
  assets: AssetStatus
  message: string
}

export type OperationResult = {
  ok: boolean
  message: string
}
