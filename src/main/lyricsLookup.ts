import { parseLrc } from '../shared/lyrics'
import { LYRIC_SOURCE_IDS } from '../shared/lyricsLookup'
import type { LyricSourceId, LyricsLookupReport, LyricsLookupRequest, LyricsLookupResult, LyricsSourceStatus } from '../shared/lyricsLookup'

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

interface LrcMuxRecord {
  track?: { title?: string; artist?: string; album?: string; duration?: number }
  meta?: { instrumental?: boolean; source?: { name?: string } }
  lines?: Array<{ text?: string; start?: number }>
}

interface SyncLrcRecord {
  track?: string
  artist?: string
  album?: string
  duration?: number
  instrumental?: boolean
  synced?: string | null
  karaoke?: string | null
  plain?: string | null
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
  if (!found) return null
  const plainText = found.synced ? validPlain(found.record.plainLyrics)
    ?? ranked.find(candidate => !candidate.synced)?.text : null
  return { text: found.text, synced: found.synced, source: 'lrclib', ...(plainText ? { plainText } : {}) }
}

function bestLrcApi(records: unknown, request: LyricsLookupRequest): LyricsLookupResult | null {
  if (!Array.isArray(records)) return null
  const ranked = records.slice(0, 30).flatMap((value: LrcApiRecord) => {
    if (!value || typeof value !== 'object' || !matching(value, request)) return []
    const timed = validSynced(value.lrc) ?? validSynced(value.lyrics)
    const synced = timed && plausibleTiming(timed, request.durationSec, value.duration) ? timed : null
    const plain = value.lyrics && !validSynced(value.lyrics) ? validPlain(value.lyrics)
      : value.lrc && !validSynced(value.lrc) ? validPlain(value.lrc) : null
    return synced || plain ? [{ value, synced, plain }] : []
  }).sort((a, b) => Number(!!b.synced) - Number(!!a.synced) || durationDistance(a.value.duration, request.durationSec) - durationDistance(b.value.duration, request.durationSec))
  const found = ranked[0]
  if (!found) return null
  const plainText = found.synced ? found.plain ?? ranked.find(candidate => candidate.plain)?.plain : null
  return { text: found.synced ?? found.plain!, synced: !!found.synced, source: 'lrcapi', ...(plainText ? { plainText } : {}) }
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

async function searchLrcMux(request: LyricsLookupRequest, fetcher: typeof fetch): Promise<LyricsLookupResult | null> {
  const params = new URLSearchParams({ title: request.title, artist: request.artist })
  if (request.album) params.set('album', request.album)
  if (request.durationSec) params.set('duration', String(Math.round(request.durationSec)))
  const response = await fetcher(`https://api.lrcmux.dev/get?${params}`, { signal: AbortSignal.timeout(10000) })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`LrcMux search failed: ${response.status}`)
  const record: LrcMuxRecord = await response.json()
  if (!record || typeof record !== 'object' || record.meta?.instrumental || !record.track || !matching(record.track, request) || !Array.isArray(record.lines)) return null
  const lines = record.lines.slice(0, 1000).flatMap(line => {
    if (!line || typeof line.text !== 'string' || typeof line.start !== 'number' || !Number.isFinite(line.start) || line.start < 0) return []
    const centiseconds = Math.round(line.start / 10)
    const minutes = Math.floor(centiseconds / 6000)
    const seconds = Math.floor(centiseconds % 6000 / 100)
    const fraction = centiseconds % 100
    return [`[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(fraction).padStart(2, '0')}]${line.text.replace(/[\r\n]+/g, ' ').trim()}`]
  })
  const synced = validSynced(lines.join('\n'))
  const provider = typeof record.meta?.source?.name === 'string' ? record.meta.source.name.slice(0, 60) : undefined
  if (synced && plausibleTiming(synced, request.durationSec, record.track.duration)) return { text: synced, synced: true, source: 'lrcmux', provider }
  const plain = validPlain(record.lines.map(line => typeof line?.text === 'string' ? line.text : '').join('\n'))
  return plain ? { text: plain, synced: false, source: 'lrcmux', provider } : null
}

async function searchSyncLrc(request: LyricsLookupRequest, fetcher: typeof fetch): Promise<LyricsLookupResult | null> {
  const params = new URLSearchParams({ track: request.title, artist: request.artist })
  if (request.album) params.set('album', request.album)
  if (request.durationSec) params.set('duration', String(Math.round(request.durationSec)))
  const response = await fetcher(`https://api.synclrc.dev/lyrics?${params}`, { signal: AbortSignal.timeout(10000) })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`SyncLRC search failed: ${response.status}`)
  const record: SyncLrcRecord = await response.json()
  if (!record || typeof record !== 'object' || record.instrumental || !matching({ title: record.track, artist: record.artist, album: record.album, duration: record.duration }, request)) return null
  const karaoke = typeof record.karaoke === 'string' ? record.karaoke.replace(/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g, '') : null
  const synced = validSynced(record.synced) ?? validSynced(karaoke)
  if (synced && plausibleTiming(synced, request.durationSec, record.duration)) {
    const plainText = validPlain(record.plain)
    return { text: synced, synced: true, source: 'synclrc', ...(plainText ? { plainText } : {}) }
  }
  const plain = validPlain(record.plain)
  return plain ? { text: plain, synced: false, source: 'synclrc' } : null
}

const searches: Record<LyricSourceId, (request: LyricsLookupRequest, fetcher: typeof fetch) => Promise<LyricsLookupResult | null>> = {
  lrclib: searchLrclib, lrcapi: searchLrcApi, lrcmux: searchLrcMux, synclrc: searchSyncLrc,
}

export async function lookupLyricsReport(request: LyricsLookupRequest, fetcher: typeof fetch = fetch): Promise<LyricsLookupReport> {
  if (!request || typeof request.title !== 'string' || typeof request.artist !== 'string') return { best: null, sources: LYRIC_SOURCE_IDS.map(source => ({ source, status: 'skipped' })), checkedAll: request?.checkAll === true }
  const title = request.title.trim().slice(0, 180), artist = request.artist.trim().slice(0, 180)
  if (!title || !artist) return { best: null, sources: LYRIC_SOURCE_IDS.map(source => ({ source, status: 'skipped' })), checkedAll: request.checkAll === true }
  const cleanRequest: LyricsLookupRequest = {
    title, artist,
    album: typeof request.album === 'string' ? request.album.trim().slice(0, 180) : undefined,
    durationSec: typeof request.durationSec === 'number' && Number.isFinite(request.durationSec) && request.durationSec > 0 ? request.durationSec : undefined,
  }
  const perform = async (source: LyricSourceId): Promise<LyricsSourceStatus> => {
    try {
      const result = await searches[source](cleanRequest, fetcher)
      return result ? { source, status: result.synced ? result.plainText ? 'both' : 'synced' : 'plain', result } : { source, status: 'missing' }
    } catch { return { source, status: 'error' } }
  }
  const sources: LyricsSourceStatus[] = []
  let best: LyricsLookupResult | null = null
  if (request.checkAll === true) {
    sources.push(...await Promise.all(LYRIC_SOURCE_IDS.map(perform)))
  } else {
    // Two short waves keep the player responsive without querying every fallback
    // when the first catalogs already have synchronized lyrics.
    sources.push(...await Promise.all(LYRIC_SOURCE_IDS.slice(0, 2).map(perform)))
    if (sources.some(entry => entry.result?.synced)) sources.push(...LYRIC_SOURCE_IDS.slice(2).map(source => ({ source, status: 'skipped' as const })))
    else sources.push(...await Promise.all(LYRIC_SOURCE_IDS.slice(2).map(perform)))
  }
  best = sources.find(entry => entry.result?.synced)?.result ?? sources.find(entry => entry.result)?.result ?? null
  return { best, sources, checkedAll: request.checkAll === true }
}

export async function lookupLyrics(request: LyricsLookupRequest, fetcher: typeof fetch = fetch): Promise<LyricsLookupResult | null> {
  return (await lookupLyricsReport(request, fetcher)).best
}
