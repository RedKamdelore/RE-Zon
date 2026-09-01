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

export async function vkAudioGetWith(fetcher: Fetcher, token: string): Promise<ImportedTrack[]> {
  const url =
    `${API_BASE}/audio.get?access_token=${encodeURIComponent(token)}&v=${API_VERSION}`
  const res = await fetcher(url)
  if (!res.ok) throw new Error(`VK: HTTP ${res.status}`)
  const data = (await res.json()) as VkAudioGetResponse
  // VK отвечает 200 даже на ошибки API — смотрим поле error
  if (data.error && typeof data.error.error_code === 'number') {
    throw new Error(vkErrorMessage(data.error.error_code, data.error.error_msg ?? ''))
  }
  const items = data.response?.items
  if (!Array.isArray(items)) return []
  return items.map((it) => ({
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
