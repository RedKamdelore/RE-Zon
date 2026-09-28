import { describe, expect, it, vi } from 'vitest'
import { lookupLyrics } from './lyricsLookup'

const request = { title: 'Song', artist: 'Artist', durationSec: 180 }
const response = (records: unknown) => vi.fn(async () => ({ ok: true, json: async () => records })) as unknown as typeof fetch
const sources = (lrclib: unknown, lrcapi: unknown): typeof fetch => vi.fn(async (url: string) => ({
  ok: true,
  json: async () => url.includes('lrclib.net') ? lrclib : lrcapi,
})) as unknown as typeof fetch

describe('automatic lyrics lookup', () => {
  it('prefers timed lyrics for the same recording', async () => {
    const result = await lookupLyrics(request, response([
      { trackName: 'Song', artistName: 'Artist', duration: 180, plainLyrics: 'plain' },
      { trackName: 'Song', artistName: 'Artist', duration: 181, syncedLyrics: '[00:01.00]timed' },
    ]))
    expect(result).toEqual({ text: '[00:01.00]timed', synced: true, source: 'lrclib' })
  })
  it('rejects another version and another artist', async () => {
    expect(await lookupLyrics(request, response([
      { trackName: 'Song', artistName: 'Artist', duration: 220, syncedLyrics: 'wrong version' },
      { trackName: 'Song', artistName: 'Other', duration: 180, syncedLyrics: 'wrong artist' },
    ]))).toBeNull()
  })

  it('finds synchronized LrcAPI lyrics when LRCLIB has only plain text', async () => {
    const fetcher = sources(
      [{ trackName: 'Song', artistName: 'Artist', duration: 180, plainLyrics: 'plain' }],
      [
        { title: 'Song', artist: 'Other', duration: 180, lrc: '[00:01.00]wrong artist' },
        { title: 'Song', artist: 'Artist', duration: 225, lrc: '[00:01.00]wrong version' },
        { title: 'Song', artist: 'Artist', duration: 181, lrc: '[00:01.00]timed from second source' },
      ],
    )
    expect(await lookupLyrics(request, fetcher)).toEqual({ text: '[00:01.00]timed from second source', synced: true, source: 'lrcapi' })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('returns plain LRCLIB lyrics when the second source has no matching synchronized recording', async () => {
    const fetcher = sources(
      [{ trackName: 'Song', artistName: 'Artist', duration: 180, plainLyrics: 'plain' }],
      [{ title: 'Song', artist: 'Artist', duration: 180, lrc: 'text without timestamps' }],
    )
    expect(await lookupLyrics(request, fetcher)).toEqual({ text: 'plain', synced: false, source: 'lrclib' })
  })

  it('uses LrcAPI if LRCLIB is unavailable', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes('lrclib.net')) throw new Error('offline')
      return { ok: true, json: async () => [{ title: 'Song', artist: 'Artist', duration: 180, lrc: '[00:01.00]fallback' }] }
    }) as unknown as typeof fetch
    expect(await lookupLyrics(request, fetcher)).toEqual({ text: '[00:01.00]fallback', synced: true, source: 'lrcapi' })
  })

  it('accepts the documented legacy LrcAPI lyrics field', async () => {
    const fetcher = sources([], [{ title: 'Song', artist: 'Artist', duration: 180, lrc: '', lyrics: '[00:01.00]legacy' }])
    expect(await lookupLyrics(request, fetcher)).toEqual({ text: '[00:01.00]legacy', synced: true, source: 'lrcapi' })
  })

  it('does not mistake invalid timestamps for synchronized lyrics', async () => {
    const fetcher = sources(
      [{ trackName: 'Song', artistName: 'Artist', duration: 180, syncedLyrics: 'untimed', plainLyrics: 'plain' }],
      [],
    )
    expect(await lookupLyrics(request, fetcher)).toEqual({ text: 'plain', synced: false, source: 'lrclib' })
  })

  it('rejects a likely wrong LrcAPI recording when duration metadata is absent', async () => {
    const fetcher = sources([], [
      { title: 'Song', artist: 'Artist', lrc: '[00:01.00]start\n[01:30.00]last line' },
      { title: 'Song', artist: 'Artist', lrc: '[00:01.00]start\n[02:20.00]last line' },
    ])
    expect(await lookupLyrics(request, fetcher)).toEqual({ text: '[00:01.00]start\n[02:20.00]last line', synced: true, source: 'lrcapi' })
  })

  it('applies album and timestamp checks to LRCLIB records without duration', async () => {
    const fetcher = sources([
      { trackName: 'Song', artistName: 'Artist', albumName: 'Other album', syncedLyrics: '[00:01.00]start\n[02:50.00]last line' },
      { trackName: 'Song', artistName: 'Artist', albumName: 'Album', syncedLyrics: '[00:01.00]start\n[01:20.00]last line' },
    ], [])
    expect(await lookupLyrics({ ...request, album: 'Album' }, fetcher)).toBeNull()
  })
})
