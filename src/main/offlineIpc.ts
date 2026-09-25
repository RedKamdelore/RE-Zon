import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import type { Track } from '../shared/types'
import { CACHE_LIMITS, DEFAULT_OFFLINE_SETTINGS, type OfflineSettings } from '../shared/offlineSettings'
import { calculateStorageUsage } from './storageUsage'
import { OfflineDownloads } from './offline'

export function registerOfflineDownloads(): void {
  const settingsPath = join(app.getPath('userData'), 'offline-settings.json')
  let settings: OfflineSettings = { ...DEFAULT_OFFLINE_SETTINGS }
  try {
    const saved = JSON.parse(readFileSync(settingsPath, 'utf8'))
    settings.autoSaveDirect = saved.autoSaveDirect !== false
    if (CACHE_LIMITS.includes(saved.maxCacheBytes)) settings.maxCacheBytes = saved.maxCacheBytes
  } catch {}
  const manager = new OfflineDownloads(join(app.getPath('userData'),'offline'), state => {
    for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('offline:state',state)
  })
  manager.setLimit(settings.maxCacheBytes)
  ipcMain.handle('offline:list', () => manager.list())
  ipcMain.handle('offline:resolve', (_event, id: string) => typeof id === 'string' ? manager.resolve(id) : null)
  ipcMain.handle('offline:queue', (_event, track: Track) => {
    if (!track || track.sourceId !== 'direct') throw new Error('Этот источник не предоставляет прямую загрузку.')
    return manager.queue({trackId:track.id,title:track.title,artist:track.artist,url:track.filePath})
  })
  ipcMain.handle('offline:autoQueue', (_event, track: Track) => {
    if (!settings.autoSaveDirect || !track || track.sourceId !== 'direct') return manager.list()
    return manager.queue({trackId:track.id,title:track.title,artist:track.artist,url:track.filePath})
  })
  ipcMain.handle('offline:settings', () => ({ ...settings }))
  ipcMain.handle('offline:setSettings', (_event, patch: Partial<OfflineSettings>) => {
    if (!patch || (patch.autoSaveDirect !== undefined && typeof patch.autoSaveDirect !== 'boolean') || (patch.maxCacheBytes !== undefined && !CACHE_LIMITS.includes(patch.maxCacheBytes))) throw new Error('Некорректная настройка загрузок.')
    settings = {...settings,...patch}
    manager.setLimit(settings.maxCacheBytes)
    writeFileSync(settingsPath+'.tmp',JSON.stringify(settings))
    renameSync(settingsPath+'.tmp',settingsPath)
    return { ...settings }
  })
  ipcMain.handle('offline:cancel', (_event, id: string) => { manager.cancel(id); return manager.list() })
  ipcMain.handle('offline:remove', (_event, id: string) => { manager.remove(id); return manager.list() })
  ipcMain.handle('storage:usage', (_event, paths: unknown) => calculateStorageUsage(
    app.getPath('userData'), process.execPath, app.isPackaged,
    Array.isArray(paths) ? paths.filter((path): path is string => typeof path === 'string').slice(0, 50000) : [],
  ))
  ipcMain.handle('offline:openFolder', () => shell.openPath(join(app.getPath('userData'),'offline')))
}
