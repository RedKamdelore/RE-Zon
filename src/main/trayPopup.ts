import { BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'node:path'
import type { Rectangle } from 'electron'
import type { TrayPlayerState } from '../shared/trayPlayer'

const WIDTH = 306, HEIGHT = 306

export function popupPosition(bounds: Rectangle, workArea: Rectangle): {x: number; y: number} {
  const center = bounds.x + bounds.width / 2
  const x = Math.max(workArea.x, Math.min(Math.round(center - WIDTH / 2), workArea.x + workArea.width - WIDTH))
  const above = bounds.y - HEIGHT - 8
  const y = above >= workArea.y ? above : Math.min(bounds.y + bounds.height + 8, workArea.y + workArea.height - HEIGHT)
  return {x, y}
}

export class TrayPopup {
  private window: BrowserWindow | null = null
  private state: TrayPlayerState | null = null
  private lastBlur = 0
  private lastTrayClick = 0
  private loaded = false
  private pendingBounds: Rectangle | null = null
  constructor(private showMain: () => void, private send: (command: string) => void, private getMain: () => BrowserWindow | null) {
    ipcMain.on('tray:publish', (event, state: TrayPlayerState) => {
      if (event.sender === this.getMain()?.webContents && state && typeof state.title === 'string') this.publish(state)
    })
    ipcMain.handle('tray:state', () => this.state)
    ipcMain.on('tray:command', (event, command: string) => {
      if (event.sender !== this.window?.webContents || typeof command !== 'string') return
      if (['toggle','next','prev'].includes(command) || /^seek:\d+(\.\d+)?$/.test(command)) this.send(command)
    })
    ipcMain.on('tray:showMain', event => { if (event.sender === this.window?.webContents) { this.hide(); this.showMain() } })
    ipcMain.on('tray:hide', event => { if (event.sender === this.window?.webContents) this.hide() })
  }
  private ensure(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window
    const win = new BrowserWindow({
      width: WIDTH, height: HEIGHT, frame: false, resizable: false, movable: false,
      show: false, alwaysOnTop: true, skipTaskbar: true, transparent: true, backgroundColor: '#00000000',
      webPreferences: { preload: join(__dirname, '../preload/tray.js'), contextIsolation: true, sandbox: false },
    })
    win.on('blur', () => { this.lastBlur = Date.now(); this.pendingBounds = null; if (!win.isDestroyed()) win.hide() })
    win.webContents.on('did-finish-load', () => {
      this.loaded = true
      if (this.state && !win.webContents.isDestroyed()) win.webContents.send('tray:state', this.state)
      if (this.pendingBounds && this.window === win) {
        const bounds = this.pendingBounds
        this.pendingBounds = null
        this.show(bounds)
      }
    })
    win.on('closed', () => { if (this.window === win) { this.window = null; this.loaded = false; this.pendingBounds = null } })
    void win.loadFile(join(__dirname, '../renderer/tray.html')).catch(error => {
      console.error('Tray popup failed to load:', error)
      if (!win.isDestroyed()) win.destroy()
      this.pendingBounds = null
    })
    this.window = win
    return win
  }
  toggle(bounds: Rectangle): void {
    const now = Date.now()
    if (now - this.lastTrayClick < 300) return
    this.lastTrayClick = now
    const win = this.ensure()
    if (win.isVisible()) { this.hide(); return }
    if (!this.loaded) { this.pendingBounds = this.pendingBounds ? null : bounds; return }
    if (Date.now() - this.lastBlur < 250) return
    this.show(bounds)
  }
  private show(bounds: Rectangle): void {
    const win = this.window
    if (!win || win.isDestroyed()) return
    const display = screen.getDisplayNearestPoint({x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2})
    const position = popupPosition(bounds, display.workArea)
    win.setPosition(position.x, position.y)
    win.show(); win.focus()
    if (this.state && !win.webContents.isDestroyed() && !win.webContents.isLoadingMainFrame()) win.webContents.send('tray:state', this.state)
  }
  publish(state: TrayPlayerState): void {
    this.state = state
    const win = this.window
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed() && !win.webContents.isLoadingMainFrame()) win.webContents.send('tray:state', state)
  }
  hide(): void { this.pendingBounds = null; if (this.window && !this.window.isDestroyed()) this.window.hide() }
  destroy(): void { this.pendingBounds = null; if (this.window && !this.window.isDestroyed()) this.window.destroy() }
}
