import { BrowserWindow, session } from 'electron'
import { VK_PARTITION } from './vkWeb'
import { vkAudioGetWith } from './vk'
import type { ImportedTrack } from '../shared/matching'

export function prepareVkSession(partition = VK_PARTITION): void {
  const ses = session.fromPartition(partition)
  ses.setUserAgent(ses.getUserAgent().replace(/\sElectron\/\S+/g, '').replace(/\s(?:rezon|ReZon)\/\S+/gi, ''))
}

const pending = new Map<string, Promise<ImportedTrack[]>>()

/** Авторизацию выдаёт сама страница VK. Она остаётся в памяти main и окна. */
export function importVkBrowser(partition = VK_PARTITION): Promise<ImportedTrack[]> {
  if (!pending.has(partition)) pending.set(partition, runImport(partition).finally(() => { pending.delete(partition) }))
  return pending.get(partition)!
}

async function runImport(partition: string): Promise<ImportedTrack[]> {
  prepareVkSession(partition)
  const win = new BrowserWindow({ show: false, webPreferences: {
    partition, sandbox: true, contextIsolation: true, nodeIntegration: false,
    backgroundThrottling: false,
  } })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  let timer: ReturnType<typeof setTimeout> | undefined
  const work = async (): Promise<ImportedTrack[]> => {
    await win.loadURL('about:blank')
    win.webContents.debugger.attach('1.3')
    await win.webContents.debugger.sendCommand('Network.enable')
    let context: { token: string; query: string } | undefined
    win.webContents.debugger.on('message', (_event, method, params) => {
      if (method !== 'Network.requestWillBeSent') return
      try {
        const url = new URL(params.request.url)
        if (url.protocol !== 'https:' || url.hostname !== 'web.api.vk.ru' ||
          !/^\/method\/(audio|catalog)\./.test(url.pathname)) return
        const form = new URLSearchParams(params.request.postData ?? '')
        const token = form.get('access_token')
        if (token) {
          const query = new URLSearchParams()
          for (const key of ['v', 'client_id']) {
            const value = url.searchParams.get(key)
            if (value) query.set(key, value)
          }
          context = { token, query: query.toString() }
        }
      } catch { /* Не музыкальный запрос. */ }
    })
    // Не ждём завершения всех фоновых запросов VK; ждём музыкальную авторизацию.
    void win.loadURL('https://vk.ru/audio').catch(() => {})
    const start = Date.now()
    while (!context) {
      if (Date.now() - start > 40_000) throw new Error('Не удалось открыть музыку VK. Нажмите «Подключить VK» и повторите вход.')
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    const auth = context as { token: string; query: string }
    return vkAudioGetWith(async (requestUrl) => {
      const params = new URL(requestUrl).searchParams
      const request = {
        url: `https://web.api.vk.ru/method/audio.get?${auth.query}`,
        body: new URLSearchParams({ access_token: auth.token, count: '200', offset: params.get('offset') ?? '0' }).toString(),
      }
      const result = await win.webContents.executeJavaScript(`(async () => {
        const request = ${JSON.stringify(request)};
        const response = await fetch(request.url, {method: 'POST', credentials: 'include',
          headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: request.body});
        return {ok: response.ok, status: response.status, data: await response.json()};
      })()`)
      return { ok: result.ok, status: result.status, json: async () => result.data }
    }, 'browser-session')
  }
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('VK не завершил импорт за 2 минуты. Повторите обновление.')), 120_000)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
    if (!win.isDestroyed()) win.destroy()
  }
}
