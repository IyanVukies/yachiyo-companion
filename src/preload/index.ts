import { contextBridge, ipcRenderer } from 'electron'

import { IPC, type YachiyoApi } from '../shared/ipc'
import type { ChatEvent, ProactiveEvent } from '../shared/types'

const api: YachiyoApi = {
  getAppStatus: () => ipcRenderer.invoke(IPC.appStatus),
  getSettings: () => ipcRenderer.invoke(IPC.settingsGet),
  updateSettings: (payload) => ipcRenderer.invoke(IPC.settingsUpdate, payload),
  resetSettings: () => ipcRenderer.invoke(IPC.settingsReset),
  scanAssets: () => ipcRenderer.invoke(IPC.assetsScan),
  chooseAssetSource: (request) => ipcRenderer.invoke(IPC.assetsChoose, request),
  applyAssetSelection: (token) => ipcRenderer.invoke(IPC.assetsApplySelection, { token }),
  openAssetFolder: (kind) => ipcRenderer.invoke(IPC.assetsOpenFolder, kind),
  testConnection: (payload) => ipcRenderer.invoke(IPC.hermesTest, payload),
  startChat: (payload) => ipcRenderer.invoke(IPC.chatStart, payload),
  cancelChat: (requestId) => ipcRenderer.invoke(IPC.chatCancel, requestId),
  onChatEvent: subscribeChat,
  getVoiceCapabilities: () => ipcRenderer.invoke(IPC.voiceCapabilities),
  setupVoiceRuntime: () => ipcRenderer.invoke(IPC.voiceRuntimeSetup),
  synthesizeVoice: (payload) => ipcRenderer.invoke(IPC.voiceSynthesize, payload),
  reportVoicePlayback: (payload) => ipcRenderer.invoke(IPC.voicePlaybackReport, payload),
  stopVoice: () => ipcRenderer.invoke(IPC.voiceStop),
  setClickThrough: (enabled) => ipcRenderer.invoke(IPC.windowClickThrough, enabled),
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke(IPC.windowAlwaysOnTop, enabled),
  hideWindow: () => ipcRenderer.invoke(IPC.windowHide),
  resetWindowPosition: () => ipcRenderer.invoke(IPC.windowResetPosition),
  sendTestReminder: () => ipcRenderer.invoke(IPC.proactiveTest),
  listReminders: () => ipcRenderer.invoke(IPC.proactiveList),
  scheduleReminder: (payload) => ipcRenderer.invoke(IPC.proactiveSchedule, payload),
  actOnReminder: (payload) => ipcRenderer.invoke(IPC.proactiveAction, payload),
  onProactiveEvent: subscribeProactive,
  onAppCommand: subscribeCommand,
  exportDiagnostics: () => ipcRenderer.invoke(IPC.diagnosticsExport),
  writeClipboard: (text) => ipcRenderer.invoke(IPC.clipboardWrite, text)
}

contextBridge.exposeInMainWorld('yachiyo', Object.freeze(api))

function subscribeChat(callback: (payload: ChatEvent) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: ChatEvent): void =>
    callback(payload)
  ipcRenderer.on(IPC.chatEvent, listener)
  return () => ipcRenderer.removeListener(IPC.chatEvent, listener)
}

function subscribeProactive(callback: (payload: ProactiveEvent) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: ProactiveEvent): void =>
    callback(payload)
  ipcRenderer.on(IPC.proactiveEvent, listener)
  return () => ipcRenderer.removeListener(IPC.proactiveEvent, listener)
}

function subscribeCommand(
  callback: (payload: 'chat' | 'settings' | 'reminders') => void
): () => void {
  const listener = (
    _event: Electron.IpcRendererEvent,
    payload: 'chat' | 'settings' | 'reminders'
  ): void => callback(payload)
  ipcRenderer.on(IPC.appCommand, listener)
  return () => ipcRenderer.removeListener(IPC.appCommand, listener)
}
