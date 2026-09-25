import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import { MainWindowController } from './mainWindow'

class FakeWindow extends EventEmitter {
  destroyed = false
  minimized = false
  loading = false
  contentsDestroyed = false
  webContents = {
    isDestroyed: () => this.contentsDestroyed,
    isLoadingMainFrame: () => this.loading,
    send: vi.fn(),
    once: vi.fn(),
  }
  isDestroyed = () => this.destroyed
  isMinimized = () => this.minimized
  hide = vi.fn()
  restore = vi.fn(() => { this.minimized = false })
  show = vi.fn(() => { if (this.destroyed) throw new Error('Object has been destroyed') })
  focus = vi.fn()
  setMinimumSize = vi.fn()
  setSize = vi.fn()
  setAlwaysOnTop = vi.fn()
}
function setup() {
  const windows: FakeWindow[] = []
  const create = vi.fn(() => { const win = new FakeWindow(); windows.push(win); return win as unknown as BrowserWindow })
  const controller = new MainWindowController(create)
  controller.ensure()
  return { controller, create, windows }
}
describe('main window lifetime', () => {
  it('hides on close and reuses the same player when opened from the tray', () => {
    const {controller, create, windows} = setup()
    const preventDefault = vi.fn()
    windows[0].emit('close', {preventDefault})
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(windows[0].hide).toHaveBeenCalledOnce()
    controller.show()
    expect(create).toHaveBeenCalledOnce()
    expect(windows[0].show).toHaveBeenCalledOnce()
    controller.send('toggle')
    expect(windows[0].webContents.send).toHaveBeenCalledWith('player:cmd', 'toggle')
  })
  it('restores a minimized player before showing and focusing it', () => {
    const {controller, windows} = setup()
    windows[0].minimized = true
    controller.show()
    expect(windows[0].restore).toHaveBeenCalledOnce()
    expect(windows[0].restore.mock.invocationCallOrder[0]).toBeLessThan(windows[0].show.mock.invocationCallOrder[0])
    expect(windows[0].focus).toHaveBeenCalledOnce()
  })
  it('recreates a destroyed player and does not call the stale window', () => {
    const {controller, create, windows} = setup()
    windows[0].destroyed = true
    expect(() => controller.show()).not.toThrow()
    expect(create).toHaveBeenCalledTimes(2)
    expect(windows[0].show).not.toHaveBeenCalled()
    expect(windows[1].show).toHaveBeenCalledOnce()
    windows[0].emit('closed')
    controller.send('next')
    expect(windows[1].webContents.send).toHaveBeenCalledWith('player:cmd', 'next')
    expect(windows[0].webContents.send).not.toHaveBeenCalled()
  })
  it('ignores playback commands when window or renderer is unavailable', () => {
    const {controller, windows} = setup()
    windows[0].contentsDestroyed = true
    controller.send('toggle')
    windows[0].contentsDestroyed = false; windows[0].loading = true
    controller.send('next')
    windows[0].destroyed = true
    controller.send('prev')
    expect(windows[0].webContents.send).not.toHaveBeenCalled()
  })
  it('lets Exit and update installation close the window without recreating it', () => {
    const {controller, create, windows} = setup()
    controller.beginQuit()
    const preventDefault = vi.fn()
    windows[0].emit('close', {preventDefault})
    expect(preventDefault).not.toHaveBeenCalled()
    controller.show(); controller.send('toggle')
    expect(create).toHaveBeenCalledOnce()
    expect(windows[0].show).not.toHaveBeenCalled()
    expect(windows[0].webContents.send).not.toHaveBeenCalled()
  })
})
