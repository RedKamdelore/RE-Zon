import { contextBridge, ipcRenderer } from 'electron'
import type { TrayPlayerState } from '../shared/trayPlayer'

contextBridge.exposeInMainWorld('trayApi', {
  state: (): Promise<TrayPlayerState | null> => ipcRenderer.invoke('tray:state'),
  onState: (callback: (state: TrayPlayerState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: TrayPlayerState): void => callback(state)
    ipcRenderer.on('tray:state', listener)
    return (): void => { ipcRenderer.removeListener('tray:state', listener) }
  },
  command: (command: string): void => { ipcRenderer.send('tray:command', command) },
  showMain: (): void => { ipcRenderer.send('tray:showMain') },
  hide: (): void => { ipcRenderer.send('tray:hide') },
})
