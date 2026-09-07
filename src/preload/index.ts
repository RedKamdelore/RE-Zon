import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { PersistedData, Track, LfmCallResult } from '../shared/types'
import type { VkImportResult, ScSearchResult } from '../shared/matching'
import type { ServiceId, ServiceConnection } from '../shared/connections'
import type { ScrobblePayload } from '../main/lastfm'

export type ConnectionStatusView = {
  connected: boolean
  connectedAt?: number
  userId?: string
  playlistName?: string
}

const api = {
  loadData: (): Promise<PersistedData> => ipcRenderer.invoke('data:load'),
  saveData: (d: PersistedData): Promise<void> => ipcRenderer.invoke('data:save', d),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('library:pickFolder'),
  scanLibrary: (folders: string[]): Promise<Track[]> =>
    ipcRenderer.invoke('library:scan', folders),
  demoLibrary: (): Promise<Track[]> => ipcRenderer.invoke('library:demo'),
  vkImport: (token: string): Promise<VkImportResult> => ipcRenderer.invoke('vk:import', token),
  scSearch: (query: string): Promise<ScSearchResult> => ipcRenderer.invoke('sc:search', query),
  scResolveStream: (url: string): Promise<string> => ipcRenderer.invoke('sc:resolveStream', url),
  lastfmCall: (method: string, params: Record<string, string | number>): Promise<LfmCallResult> =>
    ipcRenderer.invoke('lastfm:call', method, params),
  lastfmScrobble: (scrobbles: ScrobblePayload[]): Promise<{ ok: boolean; count?: number; error?: string }> =>
    ipcRenderer.invoke('lastfm:scrobble', scrobbles),
  pickCoverImage: (): Promise<string | null> => ipcRenderer.invoke('playlist:pickCover'),
  setMiniMode: (mini: boolean): Promise<void> => ipcRenderer.invoke('window:mini', mini),
  showItemInFolder: (path: string): void => {
    ipcRenderer.send('shell:showItemInFolder', path)
  },
  // --- Подключения сервисов (V3-3) ---
  connectionsList: (): Promise<Record<string, ConnectionStatusView>> =>
    ipcRenderer.invoke('connections:list'),
  connectionsSave: (
    id: ServiceId,
    conn: { token: string; userId?: string; refreshToken?: string },
  ): Promise<ConnectionStatusView> => ipcRenderer.invoke('connections:save', id, conn),
  connectionsDisconnect: (id: ServiceId): Promise<boolean> =>
    ipcRenderer.invoke('connections:disconnect', id),
  connectionsSetPlaylistName: (id: ServiceId, name: string): Promise<boolean> =>
    ipcRenderer.invoke('connections:setPlaylistName', id, name),
  connectVk: (): Promise<{ ok: boolean; error?: string; userId?: string }> =>
    ipcRenderer.invoke('connect:vk'),
  connectLastfm: (): Promise<{ ok: boolean; error?: string; username?: string }> =>
    ipcRenderer.invoke('connect:lastfm'),
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
