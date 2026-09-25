import type { BrowserWindow } from 'electron'

/** Owns the player window independently of temporary login windows. */
export class MainWindowController {
  private window: BrowserWindow | null = null
  private quitting = false
  constructor(private create: () => BrowserWindow) {}

  current(): BrowserWindow | null {
    return !this.quitting && this.window && !this.window.isDestroyed() ? this.window : null
  }

  ensure(): BrowserWindow {
    if (this.quitting) throw new Error('Приложение завершает работу.')
    const current = this.current()
    if (current) return current
    const win = this.create()
    this.window = win
    win.on('close', event => {
      if (!this.quitting && !win.isDestroyed()) {
        event.preventDefault()
        win.hide()
      }
    })
    win.on('closed', () => { if (this.window === win) this.window = null })
    return win
  }

  show(): void {
    if (this.quitting) return
    const win = this.ensure()
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }


  send(command: string): void {
    const win = this.current()
    if (win && !win.webContents.isDestroyed() && !win.webContents.isLoadingMainFrame()) win.webContents.send('player:cmd', command)
  }

  beginQuit(): void { this.quitting = true }
}
