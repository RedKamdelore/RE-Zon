import { EventEmitter } from 'node:events'
import { describe, it, expect, vi, beforeEach } from 'vitest'
const state = vi.hoisted(() => ({ win: null as any, order: [] as string[] }))
vi.mock('electron', () => ({
  shell: { openExternal: vi.fn() },
  BrowserWindow: class extends EventEmitter {
    webContents = Object.assign(new EventEmitter(), {
      session: {
        setProxy: vi.fn(async () => { state.order.push('proxy') }),
        closeAllConnections: vi.fn(async () => { state.order.push('connections') }),
        getUserAgent: () => 'Chrome/144.0 Electron/44.0 ReZon/0.3.0',
        setUserAgent: vi.fn(),
      },
      setUserAgent: vi.fn(), setWindowOpenHandler: vi.fn(),
    })
    constructor() { super(); state.win = this }
    close() { this.emit('closed') }
    loadURL = vi.fn(async () => { state.order.push('load') })
  },
}))
import { openAuthWindow } from './authWindow'
beforeEach(() => { state.order = [] })
describe('auth window network', () => {
  it('configures proxy before loading and returns HTTP 403 as a service error', async () => {
    const pending = openAuthWindow(null, { url: 'https://www.last.fm/api/auth', match: () => null,
      proxyUrl: 'http://localhost:8080', forbiddenMessage: 'Last.fm: HTTP 403', browserCompatibility: true })
    const assertion = expect(pending).rejects.toThrow('Last.fm: HTTP 403')
    await vi.waitFor(() => expect(state.order).toEqual(['proxy', 'connections', 'load']))
    expect(state.win.webContents.session.setProxy).toHaveBeenCalledWith({mode:'fixed_servers',proxyRules:'http://localhost:8080'})
    expect(state.win.webContents.setUserAgent).toHaveBeenCalledWith('Chrome/144.0')
    state.win.webContents.emit('did-navigate', {}, 'https://www.last.fm/api/auth', 403)
    await assertion
  })
  it('resets removed proxy to system mode and preserves cancellation', async () => {
    const pending = openAuthWindow(null, {url:'https://www.last.fm',match:()=>null,proxyUrl:''})
    await vi.waitFor(() => expect(state.order).toContain('load'))
    expect(state.win.webContents.session.setProxy).toHaveBeenCalledWith({mode:'system'})
    state.win.close()
    expect(await pending).toBeNull()
  })
  it('does not change other services network settings', async () => {
    const pending = openAuthWindow(null, {url:'https://example.com',match:()=>null})
    expect(state.win.webContents.session.setProxy).not.toHaveBeenCalled()
    state.win.close()
    expect(await pending).toBeNull()
  })
})

it('keeps the initial VK audio page open until the session is established',async()=>{
 vi.useFakeTimers()
 try {
  const validateMatch=vi.fn().mockResolvedValue(false)
  const pending=openAuthWindow(null,{url:'https://vk.ru/audio',match:url=>url==='https://vk.ru/audio'?true:null,validateMatch})
  const settled=vi.fn();void pending.then(settled)
  state.win.webContents.emit('did-navigate',{},'https://vk.ru/audio',200)
  await vi.advanceTimersByTimeAsync(1000)
  expect(settled).not.toHaveBeenCalled()
  validateMatch.mockResolvedValue(true)
  await vi.advanceTimersByTimeAsync(1000)
  expect(await pending).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
 } finally {vi.useRealTimers()}
})
it('does not close a newer login page after a stale session check completes',async()=>{
 let confirm!:(value:boolean)=>void
 const pending=openAuthWindow(null,{url:'https://vk.ru/audio',match:url=>url.endsWith('/audio')?true:null,validateMatch:()=>new Promise(resolve=>{confirm=resolve})})
 const settled=vi.fn();void pending.then(settled)
 state.win.webContents.emit('did-navigate',{},'https://vk.ru/audio',200)
 state.win.webContents.emit('did-navigate',{},'https://id.vk.com/login',200)
 confirm(true);await Promise.resolve();await Promise.resolve()
 expect(settled).not.toHaveBeenCalled()
 state.win.close();expect(await pending).toBeNull()
})
