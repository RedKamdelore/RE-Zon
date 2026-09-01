import { ipcMain, dialog, app, shell, BrowserWindow } from 'electron'
import { join, extname } from 'path'
import { readFile } from 'fs/promises'
import { loadData, saveData } from './persistence'
import { scanFolders, demoTracks } from './library'
import type { PersistedData } from '../shared/types'

const COVER_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

// electron-builder.yml (Task 15) будет копировать resources/demo в resourcesPath
const DEMO_DIR = app.isPackaged
  ? join(process.resourcesPath, 'demo')
  : join(__dirname, '../../resources/demo')

export function registerIpc(win: BrowserWindow): void {
  ipcMain.handle('data:load', () => loadData())
  ipcMain.handle('data:save', (_e, data: PersistedData) => saveData(data))
  ipcMain.handle('library:pickFolder', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('library:scan', (_e, folders: string[]) => scanFolders(folders))
  ipcMain.handle('library:demo', () => demoTracks(DEMO_DIR))
  ipcMain.handle('playlist:pickCover', async () => {
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Изображения', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    })
    if (r.canceled || r.filePaths.length === 0) return null
    const file = r.filePaths[0]
    const mime = COVER_MIME[extname(file).toLowerCase()]
    if (!mime) return null
    const buf = await readFile(file)
    return `data:${mime};base64,${buf.toString('base64')}`
  })
  ipcMain.handle('window:mini', (_e, mini: boolean) => {
    if (mini) { win.setAlwaysOnTop(true); win.setMinimumSize(360, 120); win.setSize(360, 140) }
    else { win.setAlwaysOnTop(false); win.setMinimumSize(940, 600); win.setSize(1280, 800) }
  })
  ipcMain.on('player:cmd', (_e, cmd: string) => win.webContents.send('player:cmd', cmd))
  ipcMain.on('shell:showItemInFolder', (_e, p: string) => shell.showItemInFolder(p))
}
