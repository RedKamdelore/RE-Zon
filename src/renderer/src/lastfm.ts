/**
 * Last.fm track.getSimilar. fetchSimilarWith принимает fetcher (DI для тестов),
 * fetchSimilar — обёртка над глобальным fetch.
 */

export interface SimilarTrack {
  name: string
  artist: string
  match: number // 0..1
}

export interface FetcherResponse {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

export type Fetcher = (url: string) => Promise<FetcherResponse>

const API_BASE = 'https://ws.audioscrobbler.com/2.0/'

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
  fetcher: Fetcher,
  artist: string,
  title: string,
  apiKey: string,
): Promise<SimilarTrack[]> {
  if (!apiKey) return []
  const url =
    `${API_BASE}?method=track.getSimilar` +
    `&artist=${encodeURIComponent(artist)}` +
    `&track=${encodeURIComponent(title)}` +
    `&api_key=${encodeURIComponent(apiKey)}&format=json&limit=20`
  const res = await fetcher(url)
  if (!res.ok) throw new Error(`Last.fm: HTTP ${res.status}`)
  const data = (await res.json()) as LfmResponse
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

export function fetchSimilar(
  artist: string,
  title: string,
  apiKey: string,
): Promise<SimilarTrack[]> {
  return fetchSimilarWith((url) => fetch(url), artist, title, apiKey)
}
