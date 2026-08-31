import { contextBridge, ipcRenderer } from 'electron'
import type { PersistedData, Track } from '../shared/types'

const api = {
  loadData: (): Promise<PersistedData> => ipcRenderer.invoke('data:load'),
  saveData: (d: PersistedData): Promise<void> => ipcRenderer.invoke('data:save', d),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('library:pickFolder'),
  scanLibrary: (folders: string[]): Promise<Track[]> =>
    ipcRenderer.invoke('library:scan', folders),
  demoLibrary: (): Promise<Track[]> => ipcRenderer.invoke('library:demo'),
  setMiniMode: (mini: boolean): Promise<void> => ipcRenderer.invoke('window:mini', mini),
  onPlayerCommand: (cb: (cmd: string) => void) => {
    ipcRenderer.on('player:cmd', (_e, cmd) => cb(cmd))
  },
}

export type Api = typeof api
contextBridge.exposeInMainWorld('api', api)
