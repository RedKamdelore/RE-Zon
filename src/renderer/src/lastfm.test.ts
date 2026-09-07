// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchSimilar, fetchSimilarWith, type LfmCaller } from './lastfm'

const LFM_RESPONSE = {
  similartracks: {
    track: [
      { name: 'Song One', match: '0.95', artist: { name: 'Artist A' } },
      { name: 'Song Two', match: '0.50', artist: { name: 'Artist B' } },
    ],
  },
}

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).api
})

describe('fetchSimilarWith', () => {
  it('calls track.getSimilar with artist, track and limit', async () => {
    const caller: LfmCaller = vi.fn(async () => ({ similartracks: { track: [] } }))
    await fetchSimilarWith(caller, 'A & B', 'T/T')
    expect(caller).toHaveBeenCalledWith('track.getSimilar', {
      artist: 'A & B',
      track: 'T/T',
      limit: 20,
    })
  })

  it('maps similartracks to {name, artist, match}', async () => {
    const result = await fetchSimilarWith(async () => LFM_RESPONSE, 'A', 'T')
    expect(result).toEqual([
      { name: 'Song One', artist: 'Artist A', match: 0.95 },
      { name: 'Song Two', artist: 'Artist B', match: 0.5 },
    ])
  })

  it('accepts artist as a plain string', async () => {
    const caller: LfmCaller = async () => ({
      similartracks: { track: [{ name: 'X', match: 0.7, artist: 'Plain' }] },
    })
    const result = await fetchSimilarWith(caller, 'A', 'T')
    expect(result).toEqual([{ name: 'X', artist: 'Plain', match: 0.7 }])
  })

  it('returns [] when there are no similar tracks', async () => {
    const result = await fetchSimilarWith(async () => ({ similartracks: {} }), 'A', 'T')
    expect(result).toEqual([])
  })

  it('throws the Last.fm message when JSON contains an error field', async () => {
    const caller: LfmCaller = async () => ({ error: 6, message: 'Track not found' })
    await expect(fetchSimilarWith(caller, 'A', 'T')).rejects.toThrow('Track not found')
  })

  it('propagates caller errors (IPC failure from main)', async () => {
    const caller: LfmCaller = async () => {
      throw new Error('Last.fm недоступен из вашего региона')
    }
    await expect(fetchSimilarWith(caller, 'A', 'T')).rejects.toThrow(/региона/)
  })
})

describe('fetchSimilar', () => {
  it('returns [] when window.api is unavailable', async () => {
    const result = await fetchSimilar('A', 'T')
    expect(result).toEqual([])
  })

  it('routes through window.api.lastfmCall and maps the result', async () => {
    const lastfmCall = vi.fn(async () => ({ ok: true, data: LFM_RESPONSE }))
    ;(window as unknown as Record<string, unknown>).api = { lastfmCall }
    const result = await fetchSimilar('Artist A', 'Song One')
    expect(lastfmCall).toHaveBeenCalledWith('track.getSimilar', {
      artist: 'Artist A',
      track: 'Song One',
      limit: 20,
    })
    expect(result).toHaveLength(2)
  })

  it('rejects with the main-process error message on {ok:false}', async () => {
    const lastfmCall = vi.fn(async () => ({ ok: false, error: 'Last.fm: HTTP 500' }))
    ;(window as unknown as Record<string, unknown>).api = { lastfmCall }
    await expect(fetchSimilar('A', 'T')).rejects.toThrow('Last.fm: HTTP 500')
  })
})
