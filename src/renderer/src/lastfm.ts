/**
 * Last.fm track.getSimilar. Запросы идут через main-процесс (window.api.lastfmCall):
 * Last.fm блокирует API по региону, а из main запрос можно пустить через прокси.
 * fetchSimilarWith принимает caller (DI для тестов — симулирует IPC-слой),
 * fetchSimilar — обёртка над window.api.lastfmCall.
 */

export interface SimilarTrack {
  name: string
  artist: string
  match: number // 0..1
}

/** IPC-слой: method + params → сырой JSON Last.fm (ошибки прилетают исключением) */
export type LfmCaller = (
  method: string,
  params: Record<string, string | number>,
) => Promise<unknown>

interface LfmArtist {
  name?: string
}

interface LfmTrack {
  name?: string
  match?: string | number
  artist?: string | LfmArtist
}

interface LfmResponse {
  similartracks?: { track?: LfmTrack[] }
  error?: number
  message?: string
}

export async function fetchSimilarWith(
  caller: LfmCaller,
  artist: string,
  title: string,
): Promise<SimilarTrack[]> {
  const data = (await caller('track.getSimilar', {
    artist,
    track: title,
    limit: 20,
  })) as LfmResponse
  // Last.fm отвечает 200 даже на ошибки API — смотрим поле error
  if (typeof data.error === 'number') {
    throw new Error(data.message ? `Last.fm: ${data.message}` : `Last.fm: ошибка ${data.error}`)
  }
  const raw = data.similartracks?.track
  if (!Array.isArray(raw)) return []
  return raw.map((t) => ({
    name: t.name ?? '',
    artist: typeof t.artist === 'string' ? t.artist : (t.artist?.name ?? ''),
    match: Number(t.match) || 0,
  }))
}

export function fetchSimilar(artist: string, title: string): Promise<SimilarTrack[]> {
  const api = typeof window !== 'undefined' ? window.api : undefined
  if (!api?.lastfmCall) return Promise.resolve([])
  const caller: LfmCaller = async (method, params) => {
    const r = await api.lastfmCall(method, params)
    if (!r.ok) throw new Error(r.error)
    return r.data
  }
  return fetchSimilarWith(caller, artist, title)
}
