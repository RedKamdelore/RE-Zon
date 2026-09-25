import { describe, expect, it, vi } from 'vitest'
import { lookupLyrics } from './lyricsLookup'

const request = { title: 'Song', artist: 'Artist', durationSec: 180 }
const response = (records: unknown) => vi.fn(async () => ({ ok: true, json: async () => records })) as unknown as typeof fetch

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
})
