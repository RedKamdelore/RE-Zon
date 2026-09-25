import type { LyricsLookupRequest, LyricsLookupResult } from '../shared/lyricsLookup'

interface LrcRecord {
  trackName?: string
  artistName?: string
  duration?: number
  syncedLyrics?: string | null
  plainLyrics?: string | null
  instrumental?: boolean
}

const normalize = (value: string): string => value.toLocaleLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

function acceptable(record: LrcRecord, request: LyricsLookupRequest): boolean {
  if (record.instrumental || normalize(record.trackName ?? '') !== normalize(request.title)) return false
  if (normalize(record.artistName ?? '') !== normalize(request.artist)) return false
  if (request.durationSec && record.duration && Math.abs(record.duration - request.durationSec) > 4) return false
  return true
}

function best(records: LrcRecord[], request: LyricsLookupRequest): LyricsLookupResult | null {
  const matches = records.filter(record => acceptable(record, request))
  matches.sort((a, b) => {
    const lyricRank = (record: LrcRecord): number => record.syncedLyrics ? 2 : record.plainLyrics ? 1 : 0
    return lyricRank(b) - lyricRank(a) || Math.abs((a.duration ?? 0) - (request.durationSec ?? 0)) - Math.abs((b.duration ?? 0) - (request.durationSec ?? 0))
  })
  const record = matches[0]
  const text = record?.syncedLyrics?.trim() || record?.plainLyrics?.trim()
  return text ? { text: text.slice(0, 120_000), synced: !!record.syncedLyrics, source: 'lrclib' } : null
}

export async function lookupLyrics(request: LyricsLookupRequest, fetcher: typeof fetch = fetch): Promise<LyricsLookupResult | null> {
  if (!request || typeof request.title !== 'string' || typeof request.artist !== 'string') return null
  const title = request.title.trim().slice(0, 180), artist = request.artist.trim().slice(0, 180)
  if (!title || !artist) return null
  const params = new URLSearchParams({ track_name: title, artist_name: artist })
  const response = await fetcher(`https://lrclib.net/api/search?${params}`, { headers: { 'User-Agent': 'ReZon/0.4 (lyrics lookup)' }, signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error(`Lyrics search failed: ${response.status}`)
  const records: unknown = await response.json()
  if (!Array.isArray(records)) return null
  return best(records.slice(0, 30), { ...request, title, artist })
}
