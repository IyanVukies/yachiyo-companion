import type {
  AppSettings,
  AppStatus,
  AssetStatus,
  ChatEvent,
  ConnectionTestResult,
  DiagnosticReport,
  DialogResult,
  OperationResult,
  ProactiveEvent,
  SettingsView,
  VoiceCapabilities,
  VoiceResult
} from './types'

export const IPC = {
  appStatus: 'app:status',
  appCommand: 'app:command',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  settingsReset: 'settings:reset',
  assetsScan: 'assets:scan',
  assetsChoose: 'assets:choose',
  assetsOpenFolder: 'assets:open-folder',
  hermesTest: 'hermes:test',
  chatStart: 'chat:start',
  chatCancel: 'chat:cancel',
  chatEvent: 'chat:event',
  voiceCapabilities: 'voice:capabilities',
  voiceSynthesize: 'voice:synthesize',
  voiceStop: 'voice:stop',
  windowClickThrough: 'window:click-through',
  windowAlwaysOnTop: 'window:always-on-top',
  windowHide: 'window:hide',
  windowResetPosition: 'window:reset-position',
  proactiveTest: 'proactive:test',
  proactiveList: 'proactive:list',
  proactiveSchedule: 'proactive:schedule',
  proactiveAction: 'proactive:action',
  proactiveEvent: 'proactive:event',
  diagnosticsExport: 'diagnostics:export',
  clipboardWrite: 'clipboard:write'
} as const

export type YachiyoApi = {
  getAppStatus: () => Promise<AppStatus>
  getSettings: () => Promise<SettingsView>
  updateSettings: (payload: {
    settings: AppSettings
    apiKey?: string
    clearApiKey?: boolean
  }) => Promise<SettingsView>
  resetSettings: () => Promise<SettingsView>
  scanAssets: () => Promise<AssetStatus>
  chooseAssetFolder: (kind: 'live2d' | 'voice' | 'cubism-core') => Promise<DialogResult>
  openAssetFolder: (kind: 'live2d' | 'voice') => Promise<OperationResult>
  testConnection: (payload: {
    mode: 'mock' | 'hermes'
    baseUrl: string
    model: string
    timeoutMs: number
    apiKey?: string
  }) => Promise<ConnectionTestResult>
  startChat: (payload: {
    requestId: string
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
  }) => Promise<OperationResult>
  cancelChat: (requestId: string) => Promise<OperationResult>
  onChatEvent: (callback: (event: ChatEvent) => void) => () => void
  getVoiceCapabilities: () => Promise<VoiceCapabilities>
  synthesizeVoice: (payload: {
    text: string
    mode: 'rvc' | 'basic' | 'disabled'
    voice: string
    speed: number
    pitch: number
    rvc: AppSettings['voice']['rvc']
  }) => Promise<VoiceResult>
  stopVoice: () => Promise<OperationResult>
  setClickThrough: (enabled: boolean) => Promise<OperationResult>
  setAlwaysOnTop: (enabled: boolean) => Promise<OperationResult>
  hideWindow: () => Promise<OperationResult>
  resetWindowPosition: () => Promise<OperationResult>
  sendTestReminder: () => Promise<OperationResult>
  listReminders: () => Promise<import('./types').Reminder[]>
  scheduleReminder: (payload: {
    kind: 'custom' | 'event' | 'deadline'
    title: string
    body: string
    scheduledAt: string
  }) => Promise<OperationResult>
  actOnReminder: (payload: {
    id: string
    action: 'snooze-10' | 'snooze-60' | 'dismiss'
  }) => Promise<OperationResult>
  onProactiveEvent: (callback: (event: ProactiveEvent) => void) => () => void
  onAppCommand: (callback: (command: 'chat' | 'settings' | 'reminders') => void) => () => void
  exportDiagnostics: () => Promise<{ result: OperationResult; report: DiagnosticReport | null }>
  writeClipboard: (text: string) => Promise<OperationResult>
}
