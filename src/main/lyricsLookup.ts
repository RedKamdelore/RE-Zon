import { parseLrc } from '../shared/lyrics'
import type { LyricsLookupRequest, LyricsLookupResult } from '../shared/lyricsLookup'

interface LrcRecord {
  trackName?: string
  artistName?: string
  albumName?: string
  duration?: number
  syncedLyrics?: string | null
  plainLyrics?: string | null
  instrumental?: boolean
}

interface LrcApiRecord {
  title?: string
  artist?: string
  album?: string
  duration?: number
  lrc?: string | null
  lyrics?: string | null
}

const MAX_TEXT = 120_000
const normalize = (value: string): string => value.toLocaleLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const durationDistance = (duration: number | undefined, requested: number | undefined): number =>
  typeof duration === 'number' && Number.isFinite(duration) && duration > 0 && requested ? Math.abs(duration - requested) : Number.POSITIVE_INFINITY

function matching(record: { title?: string; artist?: string; album?: string; duration?: number }, request: LyricsLookupRequest): boolean {
  if (normalize(record.title ?? '') !== normalize(request.title) || normalize(record.artist ?? '') !== normalize(request.artist)) return false
  const distance = durationDistance(record.duration, request.durationSec)
  if (distance !== Number.POSITIVE_INFINITY && distance > 4) return false
  // Album helps distinguish recordings when upstream duration is missing.
  if (request.durationSec && distance === Number.POSITIVE_INFINITY && request.album && record.album && normalize(record.album) !== normalize(request.album)) return false
  return true
}

function validSynced(text: unknown): string | null {
  if (typeof text !== 'string') return null
  const limited = text.trim().slice(0, MAX_TEXT)
  return parseLrc(limited).some(line => !!line.text) ? limited : null
}

function validPlain(text: unknown): string | null {
  return typeof text === 'string' ? text.trim().slice(0, MAX_TEXT) || null : null
}

function plausibleTiming(text: string, requestedSec: number | undefined, recordSec: number | undefined): boolean {
  if (!requestedSec || !Number.isFinite(requestedSec) || requestedSec <= 0) return true
  const lastLine = parseLrc(text).filter(line => !!line.text).at(-1)
  if (!lastLine || lastLine.timeSec > requestedSec + 8) return false
  if (typeof recordSec === 'number' && Number.isFinite(recordSec) && recordSec > 0) return true
  // Some provider records omit duration. Reject a likely shortened/live recording,
  // while allowing a normal instrumental outro after the final sung line.
  return requestedSec - lastLine.timeSec <= Math.max(45, requestedSec * 0.2)
}

function bestLrclib(records: unknown, request: LyricsLookupRequest): LyricsLookupResult | null {
  if (!Array.isArray(records)) return null
  const matches = records.slice(0, 30).filter((value): value is LrcRecord =>
    !!value && typeof value === 'object' && !value.instrumental && matching({
      title: value.trackName, artist: value.artistName, album: value.albumName, duration: value.duration,
    }, request))
  const ranked = matches.flatMap(record => {
    const timedText = validSynced(record.syncedLyrics)
    const synced = timedText && plausibleTiming(timedText, request.durationSec, record.duration) ? timedText : null
    const plain = validPlain(record.plainLyrics)
    if (!synced && !plain) return []
    return [{ record, text: synced ?? plain!, synced: !!synced }]
  }).sort((a, b) => Number(b.synced) - Number(a.synced) || durationDistance(a.record.duration, request.durationSec) - durationDistance(b.record.duration, request.durationSec))
  const found = ranked[0]
  return found ? { text: found.text, synced: found.synced, source: 'lrclib' } : null
}

function bestLrcApi(records: unknown, request: LyricsLookupRequest): LyricsLookupResult | null {
  if (!Array.isArray(records)) return null
  const ranked = records.slice(0, 30).flatMap((value: LrcApiRecord) => {
    if (!value || typeof value !== 'object' || !matching(value, request)) return []
    const text = validSynced(value.lrc) ?? validSynced(value.lyrics)
    return text && plausibleTiming(text, request.durationSec, value.duration) ? [{ value, text }] : []
  }).sort((a, b) => durationDistance(a.value.duration, request.durationSec) - durationDistance(b.value.duration, request.durationSec))
  return ranked[0] ? { text: ranked[0].text, synced: true, source: 'lrcapi' } : null
}

async function searchLrclib(request: LyricsLookupRequest, fetcher: typeof fetch): Promise<LyricsLookupResult | null> {
  const params = new URLSearchParams({ track_name: request.title, artist_name: request.artist })
  const response = await fetcher(`https://lrclib.net/api/search?${params}`, {
    headers: { 'User-Agent': 'ReZon/0.4 (lyrics lookup)' }, signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error(`LRCLIB search failed: ${response.status}`)
  return bestLrclib(await response.json(), request)
}

async function searchLrcApi(request: LyricsLookupRequest, fetcher: typeof fetch): Promise<LyricsLookupResult | null> {
  const params = new URLSearchParams({ title: request.title, artist: request.artist })
  if (request.album) params.set('album', request.album)
  const response = await fetcher(`https://api.lrc.cx/jsonapi?${params}`, { signal: AbortSignal.timeout(10000) })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`LrcAPI search failed: ${response.status}`)
  return bestLrcApi(await response.json(), request)
}

export async function lookupLyrics(request: LyricsLookupRequest, fetcher: typeof fetch = fetch): Promise<LyricsLookupResult | null> {
  if (!request || typeof request.title !== 'string' || typeof request.artist !== 'string') return null
  const title = request.title.trim().slice(0, 180), artist = request.artist.trim().slice(0, 180)
  if (!title || !artist) return null
  const cleanRequest: LyricsLookupRequest = {
    title, artist,
    album: typeof request.album === 'string' ? request.album.trim().slice(0, 180) : undefined,
    durationSec: typeof request.durationSec === 'number' && Number.isFinite(request.durationSec) && request.durationSec > 0 ? request.durationSec : undefined,
  }
  let plain: LyricsLookupResult | null = null
  const failures: unknown[] = []
  try {
    const found = await searchLrclib(cleanRequest, fetcher)
    if (found?.synced) return found
    plain = found
  } catch (error) { failures.push(error) }
  try {
    const found = await searchLrcApi(cleanRequest, fetcher)
    if (found) return found
  } catch (error) { failures.push(error) }
  if (plain) return plain
  if (failures.length) throw failures[0]
  return null
}
