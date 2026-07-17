import { contextBridge, ipcRenderer } from 'electron'

import type { LauncherStatus } from '../shared/types'

type LauncherIpc = Pick<
  typeof import('../shared/ipc').IPC,
  'launcherRestore' | 'launcherOpenChat' | 'launcherContextMenu' | 'launcherDrag' | 'launcherStatus'
>

// Keep the sandboxed launcher preload standalone: Electron's sandbox cannot require
// Rollup's relative shared chunks. The type above keeps these values tied to the canonical IPC map.
const IPC: LauncherIpc = {
  launcherRestore: 'launcher:restore',
  launcherOpenChat: 'launcher:open-chat',
  launcherContextMenu: 'launcher:context-menu',
  launcherDrag: 'launcher:drag',
  launcherStatus: 'launcher:status'
}

export type LauncherViewState = {
  status: LauncherStatus
  showStatusIndicator: boolean
}

export type LauncherApi = {
  restore: () => Promise<void>
  openChat: () => Promise<void>
  showContextMenu: () => Promise<void>
  drag: (payload: { phase: 'start' | 'move' | 'end'; screenX: number; screenY: number }) => void
  onState: (callback: (state: LauncherViewState) => void) => () => void
}

const api: LauncherApi = {
  restore: () => ipcRenderer.invoke(IPC.launcherRestore),
  openChat: () => ipcRenderer.invoke(IPC.launcherOpenChat),
  showContextMenu: () => ipcRenderer.invoke(IPC.launcherContextMenu),
  drag: (payload) => ipcRenderer.send(IPC.launcherDrag, payload),
  onState: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: LauncherViewState): void =>
      callback(state)
    ipcRenderer.on(IPC.launcherStatus, listener)
    return () => ipcRenderer.removeListener(IPC.launcherStatus, listener)
  }
}

contextBridge.exposeInMainWorld('yachiyoLauncher', Object.freeze(api))
