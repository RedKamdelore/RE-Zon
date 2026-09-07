import type { ImportedTrack } from '../shared/matching'

/**
 * VK audio.get через пользовательский токен standalone-приложения.
 * Официальный API не выдаёт audio-методы обычным приложениям, поэтому
 * токен пользователь получает сам (vkhost.github.io и т.п.).
 * vkAudioGetWith принимает fetcher (DI для тестов), vkAudioGet — обёртка над fetch.
 */

export interface FetcherResponse {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

export type Fetcher = (url: string) => Promise<FetcherResponse>

const API_BASE = 'https://api.vk.com/method'
const API_VERSION = '5.131'
/** Макс. count за один запрос audio.get */
const PAGE_SIZE = 6000
/** VK разрешает ~3 запроса/сек — пауза между страницами */
const PAGE_DELAY_MS = 350

interface VkErrorBody {
  error_code?: number
  error_msg?: string
}

interface VkAudioItem {
  id?: number
  owner_id?: number
  artist?: string
  title?: string
  duration?: number
  url?: string
  album?: { title?: string }
}

interface VkAudioGetResponse {
  response?: { count?: number; items?: VkAudioItem[] }
  error?: VkErrorBody
}

/** Читаемые сообщения по кодам ошибок VK API */
function vkErrorMessage(code: number, msg: string): string {
  switch (code) {
    case 5:
      return `VK: недействительный токен (авторизация не удалась)`
    case 15:
    case 201:
    case 203:
      return `VK: нет доступа к аудио (метод audio.get запрещён для этого токена)`
    case 6:
    case 9:
      return `VK: слишком много запросов, попробуйте позже`
    default:
      return `VK: ошибка ${code}${msg ? ` — ${msg}` : ''}`
  }
}

export type Sleep = (ms: number) => Promise<void>

const defaultSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchPage(fetcher: Fetcher, token: string, offset: number): Promise<VkAudioGetResponse> {
  const url =
    `${API_BASE}/audio.get?access_token=${encodeURIComponent(token)}&v=${API_VERSION}` +
    `&count=${PAGE_SIZE}&offset=${offset}`
  const res = await fetcher(url)
  if (!res.ok) throw new Error(`VK: HTTP ${res.status}`)
  const data = (await res.json()) as VkAudioGetResponse
  // VK отвечает 200 даже на ошибки API — смотрим поле error
  if (data.error && typeof data.error.error_code === 'number') {
    throw new Error(vkErrorMessage(data.error.error_code, data.error.error_msg ?? ''))
  }
  return data
}

/**
 * audio.get постраничный (по умолчанию отдаёт ~100–200 треков),
 * поэтому крутим offset, пока не соберём response.count треков.
 * sleep инжектится в тестах, чтобы не ждать реальные задержки.
 */
export async function vkAudioGetWith(
  fetcher: Fetcher,
  token: string,
  sleep: Sleep = defaultSleep,
): Promise<ImportedTrack[]> {
  const collected: VkAudioItem[] = []
  let total = Infinity
  while (collected.length < total) {
    if (collected.length > 0) await sleep(PAGE_DELAY_MS)
    const data = await fetchPage(fetcher, token, collected.length)
    const items = data.response?.items
    if (!Array.isArray(items) || items.length === 0) break
    total = typeof data.response?.count === 'number' ? data.response.count : items.length
    collected.push(...items)
    // Если VK отдал меньше, чем осталось, — дальше страниц нет
    if (items.length < PAGE_SIZE && collected.length >= total) break
  }
  return collected.map((it) => ({
    title: it.title ?? '',
    artist: it.artist ?? '',
    album: it.album?.title,
    durationSec: typeof it.duration === 'number' ? it.duration : undefined,
    // url может отсутствовать, если VK скрывает поток — такие треки импортируются без звука
    streamUrl: it.url || undefined,
    extId: it.owner_id !== undefined && it.id !== undefined ? `${it.owner_id}_${it.id}` : undefined,
  }))
}

export function vkAudioGet(token: string): Promise<ImportedTrack[]> {
  return vkAudioGetWith((url) => fetch(url), token)
}
