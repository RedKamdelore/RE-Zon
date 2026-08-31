import { app, BrowserWindow, protocol, net } from 'electron'
import { join, extname } from 'path'
import { pathToFileURL } from 'url'
import { registerIpc } from './ipc'
import { createTray } from './tray'

// Декодирует media://<base64url путь> → file stream
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { stream: true, supportFetchAPI: true } },
])

const ALLOWED_MEDIA_EXT = new Set(['.mp3', '.flac', '.ogg', '.wav', '.m4a', '.opus'])

function decodeMediaUrl(url: string): string {
  return Buffer.from(url.slice('media://'.length), 'base64url').toString('utf-8')
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 940, minHeight: 600,
    backgroundColor: '#121212',
    autoHideMenuBar: true,
    icon: join(__dirname, '../../resources/icon.png'),
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

app.whenReady().then(() => {
  protocol.handle('media', (req) => {
    try {
      const filePath = decodeMediaUrl(req.url)
      // Прагматичный уровень защиты: allowlist по расширению, а не по списку
      // отсканированных файлов — иначе воспроизведение ломалось бы после
      // рестарта приложения до повторного сканирования библиотеки.
      if (!ALLOWED_MEDIA_EXT.has(extname(filePath).toLowerCase())) {
        return new Response('Forbidden', { status: 403 })
      }
      return net.fetch(pathToFileURL(filePath).toString())
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
  const win = createWindow()
  registerIpc(win)
  createTray(win)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
