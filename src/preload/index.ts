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
  publishTrayState: (state: import('../shared/trayPlayer').TrayPlayerState): void => { ipcRenderer.send('tray:publish', state) },
  offlineList: (): Promise<import('../shared/offline').OfflineItem[]> => ipcRenderer.invoke('offline:list'),
  offlineQueue: (track: Track): Promise<import('../shared/offline').OfflineItem[]> => ipcRenderer.invoke('offline:queue',track),
  offlineAutoQueue: (track: Track): Promise<import('../shared/offline').OfflineItem[]> => ipcRenderer.invoke('offline:autoQueue',track),
  offlineSettings: (): Promise<import('../shared/offlineSettings').OfflineSettings> => ipcRenderer.invoke('offline:settings'),
  offlineSetSettings: (patch: Partial<import('../shared/offlineSettings').OfflineSettings>): Promise<import('../shared/offlineSettings').OfflineSettings> => ipcRenderer.invoke('offline:setSettings',patch),
  offlineResolve: (id: string): Promise<string | null> => ipcRenderer.invoke('offline:resolve',id),
  offlineCancel: (id: string): Promise<import('../shared/offline').OfflineItem[]> => ipcRenderer.invoke('offline:cancel',id),
  offlineRemove: (id: string): Promise<import('../shared/offline').OfflineItem[]> => ipcRenderer.invoke('offline:remove',id),
  storageUsage: (paths: string[]): Promise<import('../main/storageUsage').StorageUsage> => ipcRenderer.invoke('storage:usage',paths),
  offlineOpenFolder: (): Promise<string> => ipcRenderer.invoke('offline:openFolder'),
  onOfflineState: (cb: (items: import('../shared/offline').OfflineItem[]) => void) => {
    const listener = (_e: IpcRendererEvent, items: import('../shared/offline').OfflineItem[]): void => cb(items)
    ipcRenderer.on('offline:state',listener)
    return () => ipcRenderer.removeListener('offline:state',listener)
  },
  resetProfile: (): Promise<boolean> => ipcRenderer.invoke('profile:reset'),
  pickLrc: (): Promise<string | null> => ipcRenderer.invoke('lyrics:pickLrc'),
  lookupLyrics: (request: import('../shared/lyricsLookup').LyricsLookupRequest): Promise<import('../shared/lyricsLookup').LyricsLookupResult | null> => ipcRenderer.invoke('lyrics:lookup', request),
  lookupLyricsReport: (request: import('../shared/lyricsLookup').LyricsLookupRequest): Promise<import('../shared/lyricsLookup').LyricsLookupReport> => ipcRenderer.invoke('lyrics:lookupReport', request),
  updatesState: (): Promise<import('../shared/updates').UpdateState> => ipcRenderer.invoke('updates:state'),
  updatesPreferences: (patch: Partial<import('../shared/updates').UpdatePreferences>): Promise<import('../shared/updates').UpdateState> => ipcRenderer.invoke('updates:preferences', patch),
  updatesCheck: (): Promise<import('../shared/updates').UpdateState> => ipcRenderer.invoke('updates:check'),
  updatesDownload: (): Promise<import('../shared/updates').UpdateState> => ipcRenderer.invoke('updates:download'),
  updatesInstall: (): Promise<import('../shared/updates').UpdateState> => ipcRenderer.invoke('updates:install'),
  onUpdateState: (cb: (state: import('../shared/updates').UpdateState) => void) => {
    const listener = (_e: IpcRendererEvent, state: import('../shared/updates').UpdateState): void => cb(state)
    ipcRenderer.on('updates:state', listener)
    return () => ipcRenderer.removeListener('updates:state', listener)
  },
  accountsList: (): Promise<import('../shared/accounts').AccountView[]> => ipcRenderer.invoke('accounts:list'),
  accountsConnect: (service:ServiceId,label:string,reconnectId?:string):Promise<{ok:true;account:import('../shared/accounts').AccountView}|{ok:false;error:string}> => ipcRenderer.invoke('accounts:connect',service,label,reconnectId),
  accountsUpdate: (id:string,patch:{label?:string;autoRefresh?:boolean}):Promise<import('../shared/accounts').AccountView> => ipcRenderer.invoke('accounts:update',id,patch),
  accountsDisconnect: (id:string):Promise<boolean> => ipcRenderer.invoke('accounts:disconnect',id),
  accountsImport: (id:string):Promise<{ok:true;library:import('../shared/accounts').AccountLibrary}|{ok:false;error:string}> => ipcRenderer.invoke('accounts:import',id),
  loadData: (): Promise<PersistedData> => ipcRenderer.invoke('data:load'),
  profileStatus: (): Promise<{ recovered: boolean }> => ipcRenderer.invoke('data:profileStatus'),
  openProfileFolder: (): Promise<string> => ipcRenderer.invoke('data:openFolder'),
  saveData: (d: PersistedData): Promise<void> => ipcRenderer.invoke('data:save', d),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('library:pickFolder'),
  scanLibrary: (folders: string[]): Promise<Track[]> =>
    ipcRenderer.invoke('library:scan', folders),
  demoLibrary: (): Promise<Track[]> => ipcRenderer.invoke('library:demo'),
  vkImport: (): Promise<VkImportResult> => ipcRenderer.invoke('vk:import'),
  findAlbumCover: (artist:string,album:string):Promise<string|null> => ipcRenderer.invoke('artwork:album',artist,album),
  scSearch: (query: string, cursor?: string): Promise<ScSearchResult> => ipcRenderer.invoke('sc:search', query, cursor),
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
  connectSpotify: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('connect:spotify'),
  spotifyImport: (): Promise<
    | { ok: true; playlists: Array<{ id: string; name: string; tracks: Array<{ title: string; artist: string }> }> }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('spotify:import'),
  connectYandex: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('connect:yandex'),
  yandexImport: (): Promise<
    | { ok: true; likes: Array<{ title: string; artist: string }> }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('yandex:import'),
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
