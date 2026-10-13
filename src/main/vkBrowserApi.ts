import { BrowserWindow, session } from 'electron'
import type { VkAudioApi, VkAudioMethod } from './vkLyrics'

const clients = new Map<string, VkBrowserClient>()
const METHODS = new Set<VkAudioMethod>(['audio.get', 'audio.search', 'audio.getById', 'audio.getLyrics'])
const pause = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/** One hidden VK page per account, reused briefly for import and lyric requests. */
class VkBrowserClient {
  private readonly win: BrowserWindow
  private auth?: { token: string; query: string }
  private readonly ready: Promise<void>
  private rejectReady!: (error: Error) => void
  private authTimer?: ReturnType<typeof setTimeout>
  private idleTimer?: ReturnType<typeof setTimeout>
  private tail: Promise<unknown> = Promise.resolve()
  private lastRequest = 0
  private active = 0
  private disposed = false

  constructor(readonly partition: string) {
    const ses = session.fromPartition(partition)
    ses.setUserAgent(ses.getUserAgent().replace(/\sElectron\/\S+/g, '').replace(/\s(?:rezon|ReZon)\/\S+/gi, ''))
    this.win = new BrowserWindow({ show: false, webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } })
    this.win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    this.ready = new Promise<void>((resolve, reject) => {
      this.rejectReady = reject
      this.authTimer = setTimeout(() => { reject(new Error('Не удалось открыть музыку VK. Повторите вход.')); this.close() }, 40_000)
      this.win.webContents.debugger.on('message', (_event, method, params) => {
        if (method !== 'Network.requestWillBeSent' || this.disposed) return
        try {
          const url = new URL(params.request.url)
          if (url.protocol !== 'https:' || url.hostname !== 'web.api.vk.ru' || !/^\/method\/(audio|catalog)\./.test(url.pathname)) return
          const token = new URLSearchParams(params.request.postData ?? '').get('access_token')
          if (!token) return
          const query = new URLSearchParams()
          for (const key of ['v', 'client_id']) { const value = url.searchParams.get(key); if (value) query.set(key, value) }
          this.auth = { token, query: query.toString() }
          clearTimeout(this.authTimer)
          resolve()
        } catch { /* Ignore requests outside VK music. */ }
      })
      void (async () => {
        await this.win.loadURL('about:blank')
        if (this.disposed) return
        this.win.webContents.debugger.attach('1.3')
        await this.win.webContents.debugger.sendCommand('Network.enable')
        if (!this.disposed) void this.win.loadURL('https://vk.ru/audio').catch(() => {})
      })().catch(() => { reject(new Error('Не удалось открыть музыку VK')); this.close() })
    })
    void this.ready.catch(() => {})
    this.win.on('closed', () => this.close())
  }

  async run<T>(work: (api: VkAudioApi) => Promise<T>, timeoutMs: number): Promise<T> {
    this.active++
    clearTimeout(this.idleTimer)
    let timer: ReturnType<typeof setTimeout> | undefined
    let expired = false
    try {
      return await Promise.race([
        (async () => {
          await this.ready
          if (expired || this.disposed) throw new Error('Запрос VK отменён')
          return work((method, params) => this.request(method, params, () => expired))
        })(),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { expired = true; reject(new Error('VK не завершил запрос вовремя')) }, timeoutMs) }),
      ])
    } finally {
      expired = true
      clearTimeout(timer)
      this.active--
      if (!this.active && !this.disposed) {
        if (!this.auth) this.close()
        else this.idleTimer = setTimeout(() => this.close(), 45_000)
      }
    }
  }

  private request(method: VkAudioMethod, params: Record<string, string>, expired: () => boolean): Promise<unknown> {
    if (!METHODS.has(method)) return Promise.reject(new Error('Метод VK недоступен'))
    const job = this.tail.catch(() => {}).then(async () => {
      const delay = 350 - (Date.now() - this.lastRequest)
      if (delay > 0) await pause(delay)
      if (expired() || this.disposed || !this.auth || this.win.isDestroyed()) throw new Error('Запрос VK отменён')
      this.lastRequest = Date.now()
      const request = { url: `https://web.api.vk.ru/method/${method}?${this.auth.query}`, body: new URLSearchParams({ ...params, access_token: this.auth.token }).toString() }
      const result = await this.win.webContents.executeJavaScript(`(async () => {
        const request = ${JSON.stringify(request)};
        const response = await fetch(request.url, {method: 'POST', credentials: 'include',
          headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: request.body, signal: AbortSignal.timeout(10000)});
        return {ok: response.ok, data: await response.json()};
      })()`)
      if (!result.ok) throw new Error('VK не ответил на запрос')
      return result.data
    })
    this.tail = job
    return job
  }

  close(): void {
    if (this.disposed) return
    this.disposed = true
    clearTimeout(this.authTimer)
    clearTimeout(this.idleTimer)
    this.rejectReady(new Error('Соединение VK закрыто'))
    if (clients.get(this.partition) === this) clients.delete(this.partition)
    if (!this.win.isDestroyed()) this.win.destroy()
  }
}

export function withVkBrowserApi<T>(partition: string, work: (api: VkAudioApi) => Promise<T>, timeoutMs = 20_000): Promise<T> {
  let client = clients.get(partition)
  if (!client) { client = new VkBrowserClient(partition); clients.set(partition, client) }
  return client.run(work, timeoutMs)
}

export function closeVkBrowserClients(partition?: string): void {
  if (partition) clients.get(partition)?.close()
  else for (const client of clients.values()) client.close()
}
