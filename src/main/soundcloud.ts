import type { ImportedTrack } from '../shared/matching'

/**
 * SoundCloud public API без регистрации приложения: client_id вытаскивается
 * из JS-бандлов soundcloud.com (они отдаются с crossorigin на a-v2.sndcdn.com).
 * client_id кэшируется в памяти процесса; при смене бандлов кэш сбрасывается
 * перезапуском приложения.
 *
 * Функции *With принимают fetcher (DI для тестов), обёртки без суффикса — fetch.
 * Fetcher отдаёт text() — HTML/JS/JSON разбираются вручную.
 */

export interface ScFetcherResponse {
  ok: boolean
  status: number
  text: () => Promise<string>
}

export type ScFetcher = (url: string) => Promise<ScFetcherResponse>

const SC_HOME = 'https://soundcloud.com'
const API_BASE = 'https://api-v2.soundcloud.com'
/** client_id в бандлах лежит как client_id:"<32 alnum>" (регистр смешанный!) */
const CLIENT_ID_RE = /client_id:"([A-Za-z0-9]{32})"/
/** Скрипты-ассеты с crossorigin, в них и живёт client_id */
const SCRIPT_SRC_RE = /<script[^>]+src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g
/** Сколько последних бандлов страницы пробуем, прежде чем сдаться */
const BUNDLES_TO_TRY = 3

const ACCESS_ERROR = 'SoundCloud: не удалось получить доступ к SoundCloud'

let cachedClientId: string | null = null

/** Сброс кэша client_id — для тестов */
export function scClearClientIdCache(): void {
  cachedClientId = null
}

export async function scResolveClientIdWith(fetcher: ScFetcher): Promise<string> {
  if (cachedClientId) return cachedClientId
  let html: string
  try {
    const res = await fetcher(SC_HOME)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    html = await res.text()
  } catch (e) {
    throw new Error(`${ACCESS_ERROR} (${e instanceof Error ? e.message : String(e)})`)
  }
  const scripts = [...html.matchAll(SCRIPT_SRC_RE)].map((m) => m[1])
  // client_id лежит в основных бандлах, которые грузятся последними —
  // пробуем их в обратном порядке
  for (const src of scripts.slice(-BUNDLES_TO_TRY).reverse()) {
    try {
      const res = await fetcher(src)
      if (!res.ok) continue
      const m = CLIENT_ID_RE.exec(await res.text())
      if (m) {
        cachedClientId = m[1]
        return m[1]
      }
    } catch {
      // битый бандл — пробуем следующий
    }
  }
  throw new Error(ACCESS_ERROR)
}

interface ScTranscoding {
  url?: string
  format?: { protocol?: string }
}

interface ScTrackItem {
  id?: number
  title?: string
  duration?: number // миллисекунды
  user?: { username?: string }
  media?: { transcodings?: ScTranscoding[] }
}

interface ScSearchResponse {
  collection?: ScTrackItem[]
}

/**
 * Поиск треков. streamUrl — НЕ финальный mp3, а transcoding API URL
 * (+ client_id): он отдаёт JSON {url}, финальный поток резолвится
 * при воспроизведении (см. scResolveStreamWith / IPC sc:resolveStream).
 * Предпочитаем progressive (mp3), hls — только как fallback.
 */
export async function scSearchTracksWith(
  fetcher: ScFetcher,
  clientId: string,
  query: string,
  limit = 50,
): Promise<ImportedTrack[]> {
  const url =
    `${API_BASE}/search/tracks?q=${encodeURIComponent(query)}` +
    `&client_id=${encodeURIComponent(clientId)}&limit=${limit}`
  const res = await fetcher(url)
  if (!res.ok) throw new Error(`SoundCloud: HTTP ${res.status}`)
  const data = JSON.parse(await res.text()) as ScSearchResponse
  const items = data.collection
  if (!Array.isArray(items)) return []
  return items.map((t) => {
    const transcodings = t.media?.transcodings ?? []
    const chosen =
      transcodings.find((x) => x.format?.protocol === 'progressive' && x.url) ??
      transcodings.find((x) => x.url)
    return {
      title: t.title ?? '',
      artist: t.user?.username ?? '',
      durationSec: typeof t.duration === 'number' ? Math.round(t.duration / 1000) : undefined,
      streamUrl: chosen?.url ? `${chosen.url}?client_id=${clientId}` : undefined,
      extId: t.id !== undefined ? String(t.id) : undefined,
    }
  })
}

/** Transcoding API URL → финальный URL аудиопотока (JSON {url}) */
export async function scResolveStreamWith(fetcher: ScFetcher, transcodingUrl: string): Promise<string> {
  const res = await fetcher(transcodingUrl)
  if (!res.ok) throw new Error(`SoundCloud: HTTP ${res.status}`)
  const data = JSON.parse(await res.text()) as { url?: string }
  if (!data.url) throw new Error('SoundCloud: аудиопоток недоступен')
  return data.url
}

// --- Обёртки над реальным fetch (main-процесс) ---

const realFetcher: ScFetcher = (url) => fetch(url)

export function scResolveClientId(): Promise<string> {
  // Обход для сред, где soundcloud.com недоступен: client_id можно подсмотреть
  // в браузере (DevTools → Network → любой api-v2 запрос) и задать вручную
  if (process.env.SC_CLIENT_ID) return Promise.resolve(process.env.SC_CLIENT_ID)
  return scResolveClientIdWith(realFetcher)
}

export async function scSearch(query: string, limit = 50): Promise<ImportedTrack[]> {
  const clientId = await scResolveClientId()
  return scSearchTracksWith(realFetcher, clientId, query, limit)
}

export function scResolveStream(transcodingUrl: string): Promise<string> {
  return scResolveStreamWith(realFetcher, transcodingUrl)
}
