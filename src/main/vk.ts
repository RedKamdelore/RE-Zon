import type { ImportedTrack } from '../shared/matching'
import { VK_CLIENT_ID, VK_REDIRECT, VK_SCOPE } from '../shared/connections'

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
  album?: { id?: number; owner_id?: number; title?: string; thumb?: { photo_300?: string; photo_600?: string } }
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
  const seen = new Set<string>()
  let offset = 0
  let total = Infinity
  while (collected.length < total) {
    if (collected.length > 0) await sleep(PAGE_DELAY_MS)
    const data = await fetchPage(fetcher, token, offset)
    const items = data.response?.items
    if (!Array.isArray(items)) throw new Error('VK: некорректный ответ audio.get')
    if (items.length === 0) {
      if (Number.isFinite(total) && offset < total) {
        throw new Error(`VK: получено только ${offset} из ${total} записей. Повторите импорт — текущий плейлист сохранён.`)
      }
      break
    }
    total = typeof data.response?.count === 'number' ? data.response.count : Infinity
    offset += items.length
    let fresh = 0
    for (const item of items) {
      const key = item.owner_id !== undefined && item.id !== undefined ? `${item.owner_id}_${item.id}` : JSON.stringify(item)
      if (seen.has(key)) continue
      seen.add(key)
      collected.push(item)
      fresh++
    }
    if (!fresh) throw new Error('VK: API повторяет страницу аудио. Полный список не получен, текущий плейлист сохранён.')
    if (offset >= total) break
    // Если VK отдал меньше, чем осталось, — дальше страниц нет
    if (items.length < PAGE_SIZE && collected.length >= total) break
  }
  return collected.map((it) => ({
    title: it.title ?? '',
    artist: it.artist ?? '',
    album: it.album?.title,
    albumId: it.album?.id !== undefined && it.album?.owner_id !== undefined ? `vk:${it.album.owner_id}:${it.album.id}` : undefined,
    coverUrl: it.album?.thumb?.photo_600 ?? it.album?.thumb?.photo_300,
    durationSec: typeof it.duration === 'number' ? it.duration : undefined,
    // url может отсутствовать, если VK скрывает поток — такие треки импортируются без звука
    streamUrl: it.url || undefined,
    extId: it.owner_id !== undefined && it.id !== undefined ? `${it.owner_id}_${it.id}` : undefined,
  }))
}

export function vkAudioGet(token: string): Promise<ImportedTrack[]> {
  return vkAudioGetWith((url) => fetch(url), token)
}

// --- OAuth-флоу «Подключить VK» (V3-3) --------------------------------------

/** URL открытия окна авторизации VK (Kate Mobile, как в vkhost) */
export function vkAuthUrl(): string {
  return (
    `https://oauth.vk.com/authorize?client_id=${VK_CLIENT_ID}&scope=${VK_SCOPE}` +
    `&redirect_uri=${encodeURIComponent(VK_REDIRECT)}&display=page&response_type=token&revoke=1`
  )
}

export interface VkAuthResult {
  token: string
  userId: string
  expiresIn: number // сек; 0 — бессрочный (offline-право)
}

/**
 * Матчит URL blank-страницы VK: токен приходит в fragment
 * (#access_token=…&user_id=…). null — ещё не доехали.
 */
export function matchVkAuthUrl(url: string): VkAuthResult | null {
  if (!url.startsWith('https://oauth.vk.com/blank.html')) return null
  const fragment = url.split('#')[1]
  if (!fragment || !fragment.includes('access_token=')) return null
  const params = new URLSearchParams(fragment)
  const token = params.get('access_token')
  if (!token) return null
  return {
    token,
    userId: params.get('user_id') ?? '',
    expiresIn: Number(params.get('expires_in') ?? '0'),
  }
}
