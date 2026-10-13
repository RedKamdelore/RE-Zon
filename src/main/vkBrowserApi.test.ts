import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { withVkBrowserApi, closeVkBrowserClients } from './vkBrowserApi'
import { importVkBrowser } from './vkBrowser'

const state = vi.hoisted(() => ({ windows: [] as any[], requests: [] as { url: string; body: string; partition: string }[], authenticate: true, answer: vi.fn() }))
vi.mock('electron', () => ({
  session: { fromPartition: () => ({ getUserAgent: () => 'Chrome ReZon/0.4 Electron/44', setUserAgent: vi.fn() }) },
  BrowserWindow: class extends EventEmitter {
    destroyed = false
    constructor(readonly options: any) { super(); state.windows.push(this) }
    webContents = {
      setWindowOpenHandler: vi.fn(),
      debugger: Object.assign(new EventEmitter(), { attach: vi.fn(), sendCommand: vi.fn().mockResolvedValue(undefined) }),
      executeJavaScript: vi.fn(async (script: string) => {
        const request = JSON.parse(script.match(/const request = (.*);/)![1])
        state.requests.push({ ...request, partition: this.options.webPreferences.partition })
        return { ok: true, data: await state.answer(request) }
      }),
    }
    async loadURL(url: string) {
      if (url !== 'https://vk.ru/audio' || !state.authenticate) return
      this.webContents.debugger.emit('message', {}, 'Network.requestWillBeSent', { request: {
        url: 'https://web.api.vk.ru/method/audio.get?v=5.199&client_id=1', postData: `access_token=auth-${this.options.webPreferences.partition}`,
      } })
    }
    isDestroyed() { return this.destroyed }
    destroy() { this.destroyed = true; this.emit('closed') }
  },
}))

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-12T12:00:00Z'))
  state.windows = []; state.requests = []; state.authenticate = true
  state.answer.mockReset().mockResolvedValue({ response: { lyrics: { text: ['Line'] } } })
})
afterEach(() => { closeVkBrowserClients(); vi.useRealTimers() })

it('reuses one isolated VK page for requests, spaces API calls and closes it after inactivity', async () => {
  const first = withVkBrowserApi('persist:one', api => api('audio.getLyrics', { audio_id: '1_2' }))
  const second = withVkBrowserApi('persist:one', api => api('audio.getLyrics', { audio_id: '1_3' }))
  await vi.advanceTimersByTimeAsync(349)
  expect(state.requests).toHaveLength(1)
  await vi.advanceTimersByTimeAsync(1)
  await Promise.all([first, second])
  expect(state.requests).toHaveLength(2)
  expect(state.windows).toHaveLength(1)
  expect(state.windows[0].options.webPreferences).toMatchObject({ sandbox: true, contextIsolation: true, nodeIntegration: false })
  expect(new URLSearchParams(state.requests[0].body).get('audio_id')).toBe('1_2')
  expect(new URL(state.requests[0].url).searchParams.get('v')).toBe('5.199')
  await vi.advanceTimersByTimeAsync(45_000)
  expect(state.windows[0].destroyed).toBe(true)
})

it('keeps account sessions separate and destroys only the disconnected account client', async () => {
  await withVkBrowserApi('persist:one', api => api('audio.getLyrics', { audio_id: '1_2' }))
  await withVkBrowserApi('persist:two', api => api('audio.getLyrics', { audio_id: '2_3' }))
  expect(state.windows).toHaveLength(2)
  expect(new URLSearchParams(state.requests[0].body).get('access_token')).toBe('auth-persist:one')
  expect(new URLSearchParams(state.requests[1].body).get('access_token')).toBe('auth-persist:two')
  closeVkBrowserClients('persist:one')
  expect(state.windows[0].destroyed).toBe(true)
  expect(state.windows[1].destroyed).toBe(false)
})

it('ends a stalled lyric lookup without running late API requests or leaving a hidden page', async () => {
  state.authenticate = false
  const work = vi.fn(async () => null)
  const result = withVkBrowserApi('persist:offline', work, 1000)
  const rejected = expect(result).rejects.toThrow('вовремя')
  await vi.advanceTimersByTimeAsync(1000)
  await rejected
  expect(work).not.toHaveBeenCalled()
  expect(state.requests).toHaveLength(0)
  expect(state.windows[0].destroyed).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})

it('preserves import pagination counts, offsets and concurrent import deduplication', async () => {
  state.answer.mockImplementation(async ({ body }: { body: string }) => {
    const params = new URLSearchParams(body)
    const offset = Number(params.get('offset'))
    return { response: { count: 2, items: [{ owner_id: 1, id: offset + 1, title: 'Song', artist: 'Artist', duration: 180 }] } }
  })
  const first = importVkBrowser('persist:library'), second = importVkBrowser('persist:library')
  expect(first).toBe(second)
  await vi.advanceTimersByTimeAsync(350)
  expect(await first).toHaveLength(2)
  expect(state.requests.map(request => new URLSearchParams(request.body).get('offset'))).toEqual(['0', '1'])
  expect(state.requests.map(request => new URLSearchParams(request.body).get('count'))).toEqual(['200', '200'])
})
