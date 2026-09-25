import { app, BrowserWindow, protocol, net, dialog } from 'electron'
import { join, extname } from 'path'
import { pathToFileURL } from 'url'
import { registerIpc } from './ipc'
import { createTray } from './tray'
import { registerUpdates } from './updates'
import { applyPendingProfileReset } from './profileReset'
import { registerProfileReset } from './profileResetIpc'
import { MainWindowController } from './mainWindow'
import type { Tray } from 'electron'
import { registerOfflineDownloads } from './offlineIpc'
import { TrayPopup } from './trayPopup'
import { triggerAutomaticUpdateCheck } from './updateSchedule'
import type { UpdateController } from './updateController'

// Декодирует media://<base64url путь> → file stream
protocol.registerSchemesAsPrivileged([
  // corsEnabled обязателен: в packaged-режиме origin рендерера file://,
  // и fetch на media:// без этого флага блокируется CORS-проверкой схемы.
  { scheme: 'media', privileges: { stream: true, supportFetchAPI: true, corsEnabled: true, secure: true } },
])

const ALLOWED_MEDIA_EXT = new Set(['.mp3', '.flac', '.ogg', '.wav', '.m4a', '.opus'])

// Фиксируем userData на rezon независимо от productName сборки,
// чтобы dev- и packaged-версии делили одни и те же данные.
app.setPath('userData', join(app.getPath('appData'), 'rezon'))

function decodeMediaUrl(url: string): string {
  return Buffer.from(url.slice('media://'.length), 'base64url').toString('utf-8')
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 940, minHeight: 600,
    backgroundColor: '#171A1E',
    autoHideMenuBar: true,
    icon: app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

const primaryInstance = app.requestSingleInstanceLock()
const mainWindow = new MainWindowController(createWindow)
let tray: Tray | null = null
let trayPopup: TrayPopup | null = null
let updates: UpdateController | null = null
app.on('before-quit', () => {
  mainWindow.beginQuit()
  trayPopup?.destroy()
  tray?.destroy()
  tray = null
})
if (!primaryInstance) app.quit()
let profileReady = primaryInstance
if (primaryInstance) {
  try { applyPendingProfileReset(app.getPath('appData'), app.getPath('userData')) }
  catch {
    profileReady = false
    dialog.showErrorBox('Не удалось сбросить профиль', 'Закройте остальные процессы Re:Zon и запустите приложение снова. Сброс будет повторён; приложение не откроет частично очищенный профиль.')
    app.quit()
  }
}
app.on('second-instance', () => {
  if (profileReady && app.isReady()) {
    mainWindow.show()
    if (updates) triggerAutomaticUpdateCheck(updates)
  }
})

if (profileReady) app.whenReady().then(() => {
  protocol.handle('media', async (req) => {
    try {
      const filePath = decodeMediaUrl(req.url)
      // Прагматичный уровень защиты: allowlist по расширению, а не по списку
      // отсканированных файлов — иначе воспроизведение ломалось бы после
      // рестарта приложения до повторного сканирования библиотеки.
      if (!ALLOWED_MEDIA_EXT.has(extname(filePath).toLowerCase())) {
        return new Response('Forbidden', { status: 403 })
      }
      // CORS-заголовок обязателен: MediaElementAudioSourceNode в рендерере
      // использует crossOrigin='anonymous' — без него <audio> даёт тишину.
      const res = await net.fetch(pathToFileURL(filePath).toString())
      const headers = new Headers(res.headers)
      headers.set('Access-Control-Allow-Origin', '*')
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers,
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
  trayPopup = new TrayPopup(() => mainWindow.show(), command => mainWindow.send(command), () => mainWindow.current())
  mainWindow.ensure()
  registerIpc(() => mainWindow.ensure())
  registerOfflineDownloads()
  const currentUpdates = registerUpdates()
  updates = currentUpdates
  registerProfileReset(() => mainWindow.current(), () => !['checking', 'downloading', 'installing'].includes(currentUpdates.getState().phase))
  tray = createTray({ show: () => mainWindow.show(), showPopup: bounds => trayPopup?.toggle(bounds), send: command => mainWindow.send(command) })
  app.on('activate', () => mainWindow.show())
})

app.on('window-all-closed', () => {
  if (!tray && process.platform !== 'darwin') app.quit()
})
