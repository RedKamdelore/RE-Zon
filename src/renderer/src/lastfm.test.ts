import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchSimilar, fetchSimilarWith, type Fetcher } from './lastfm'

function okFetcher(data: unknown): Fetcher {
  return vi.fn(async () => ({ ok: true, status: 200, json: async () => data }))
}

const LFM_RESPONSE = {
  similartracks: {
    track: [
      { name: 'Song One', match: '0.95', artist: { name: 'Artist A' } },
      { name: 'Song Two', match: '0.50', artist: { name: 'Artist B' } },
    ],
  },
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchSimilarWith', () => {
  it('returns [] and does not call fetcher when api key is empty', async () => {
    const fetcher = okFetcher(LFM_RESPONSE)
    const result = await fetchSimilarWith(fetcher, 'Artist', 'Title', '')
    expect(result).toEqual([])
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('builds the track.getSimilar URL with encoded params', async () => {
    const fetcher = okFetcher({ similartracks: { track: [] } })
    await fetchSimilarWith(fetcher, 'A & B', 'T/T', 'KEY')
    const url = (fetcher as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain('https://ws.audioscrobbler.com/2.0/?method=track.getSimilar')
    expect(url).toContain(`artist=${encodeURIComponent('A & B')}`)
    expect(url).toContain(`track=${encodeURIComponent('T/T')}`)
    expect(url).toContain('api_key=KEY')
    expect(url).toContain('format=json')
    expect(url).toContain('limit=20')
  })

  it('maps similartracks to {name, artist, match}', async () => {
    const result = await fetchSimilarWith(okFetcher(LFM_RESPONSE), 'A', 'T', 'KEY')
    expect(result).toEqual([
      { name: 'Song One', artist: 'Artist A', match: 0.95 },
      { name: 'Song Two', artist: 'Artist B', match: 0.5 },
    ])
  })

  it('returns [] when there are no similar tracks', async () => {
    const result = await fetchSimilarWith(okFetcher({ similartracks: {} }), 'A', 'T', 'KEY')
    expect(result).toEqual([])
  })

  it('throws a readable error on HTTP failure', async () => {
    const fetcher: Fetcher = vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) }))
    await expect(fetchSimilarWith(fetcher, 'A', 'T', 'KEY')).rejects.toThrow(/403/)
  })

  it('throws the Last.fm message when JSON contains an error field', async () => {
    const fetcher = okFetcher({ error: 6, message: 'Track not found' })
    await expect(fetchSimilarWith(fetcher, 'A', 'T', 'KEY')).rejects.toThrow('Track not found')
  })
})

describe('fetchSimilar', () => {
  it('delegates to the global fetch', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => LFM_RESPONSE,
    }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await fetchSimilar('Artist A', 'Song One', 'KEY')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(2)
  })
})
