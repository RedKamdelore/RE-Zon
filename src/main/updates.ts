import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { UpdateController } from './updateController'
import { validateFeedUrl, type UpdatePreferences } from '../shared/updates'
import { startAutomaticUpdateChecks } from './updateSchedule'

export function registerUpdates(): UpdateController {
  const settingsPath = join(app.getPath('userData'), 'updates-settings.json')
  let defaults: { feedUrl?: string } = {}
  try { defaults = JSON.parse(readFileSync(join(app.isPackaged ? process.resourcesPath : app.getAppPath() + '/resources', 'updates.json'), 'utf8')) } catch {}
  let saved: Partial<UpdatePreferences> = {}
  try { saved = JSON.parse(readFileSync(settingsPath, 'utf8')) ?? {} } catch {}
  let feedUrl = ''
  try { feedUrl = validateFeedUrl(saved.feedUrl ?? defaults.feedUrl ?? '') } catch {}
  const prefs: UpdatePreferences = {
    channel: saved.channel === 'stable' || saved.channel === 'beta' ? saved.channel : app.getVersion().includes('-') ? 'beta' : 'stable',
    autoCheck: typeof saved.autoCheck === 'boolean' ? saved.autoCheck : true, feedUrl,
  }
  const controller = new UpdateController(autoUpdater, app.isPackaged, app.getVersion(), prefs, value => {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(settingsPath + '.tmp', JSON.stringify(value, null, 2))
    renameSync(settingsPath + '.tmp', settingsPath)
  }, state => {
    for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('updates:state', state)
  })
  ipcMain.handle('updates:state', () => controller.getState())
  ipcMain.handle('updates:preferences', (_event, patch: Partial<UpdatePreferences>) => controller.setPreferences(patch))
  ipcMain.handle('updates:check', () => controller.check())
  ipcMain.handle('updates:download', () => controller.download())
  ipcMain.handle('updates:install', () => controller.install())
  const stopAutomaticChecks = startAutomaticUpdateChecks(controller)
  app.once('before-quit', stopAutomaticChecks)
  return controller
}
