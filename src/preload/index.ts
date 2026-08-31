import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { PersistedData, Track } from '../shared/types'

const api = {
  loadData: (): Promise<PersistedData> => ipcRenderer.invoke('data:load'),
  saveData: (d: PersistedData): Promise<void> => ipcRenderer.invoke('data:save', d),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('library:pickFolder'),
  scanLibrary: (folders: string[]): Promise<Track[]> =>
    ipcRenderer.invoke('library:scan', folders),
  demoLibrary: (): Promise<Track[]> => ipcRenderer.invoke('library:demo'),
  pickCoverImage: (): Promise<string | null> => ipcRenderer.invoke('playlist:pickCover'),
  setMiniMode: (mini: boolean): Promise<void> => ipcRenderer.invoke('window:mini', mini),
  onPlayerCommand: (cb: (cmd: string) => void) => {
    const listener = (_e: IpcRendererEvent, cmd: string): void => cb(cmd)
    ipcRenderer.on('player:cmd', listener)
    return (): void => {
      ipcRenderer.removeListener('player:cmd', listener)
    }
  },
}

export type Api = typeof api
contextBridge.exposeInMainWorld('api', api)
