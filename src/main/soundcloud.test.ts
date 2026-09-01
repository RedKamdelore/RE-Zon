import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  scResolveClientIdWith,
  scSearchTracksWith,
  scResolveStreamWith,
  scClearClientIdCache,
  type ScFetcher,
} from './soundcloud'

function textFetcher(map: Record<string, string>): ScFetcher {
  return vi.fn(async (url: string) => {
    const body = map[url]
    if (body === undefined) return { ok: false, status: 404, text: async () => '' }
    return { ok: true, status: 200, text: async () => body }
  })
}

// Реальный формат client_id — 32 символа в СМЕШАННОМ регистре
const CLIENT_ID = 'aB1c2D3eF4g5H6iJ7k8L9m0N1o2P3q4R'
const BUNDLE_MAIN = 'https://a-v2.sndcdn.com/assets/0-abc123.js'
const BUNDLE_APP = 'https://a-v2.sndcdn.com/assets/1-def456.js'

const HOME_HTML = `<html><head>
<script crossorigin src="${BUNDLE_MAIN}"></script>
<script crossorigin src="${BUNDLE_APP}"></script>
</head></html>`

const SEARCH_RESPONSE = JSON.stringify({
  collection: [
    {
      id: 123456,
      title: 'lofi dreams',
      duration: 183500,
      user: { username: 'chillhop' },
      media: {
        transcodings: [
          { url: 'https://api-v2.soundcloud.com/media/song/123456/stream/hls', format: { protocol: 'hls' } },
          { url: 'https://api-v2.soundcloud.com/media/song/123456/stream/progressive', format: { protocol: 'progressive' } },
        ],
      },
    },
    {
      id: 789,
      title: 'hls only',
      duration: 60000,
      user: { username: 'someone' },
      media: {
        transcodings: [
          { url: 'https://api-v2.soundcloud.com/media/song/789/stream/hls', format: { protocol: 'hls' } },
        ],
      },
    },
    {
      id: 555,
      title: 'no media',
      user: { username: 'ghost' },
    },
  ],
})

beforeEach(() => {
  scClearClientIdCache()
})

describe('scResolveClientIdWith', () => {
  it('scrapes script srcs from soundcloud.com and finds client_id in a bundle', async () => {
    const fetcher = textFetcher({
      'https://soundcloud.com': HOME_HTML,
      [BUNDLE_MAIN]: 'var x = 1;',
      [BUNDLE_APP]: `;client_id:"${CLIENT_ID}",env:"production";`,
    })
    const id = await scResolveClientIdWith(fetcher)
    expect(id).toBe(CLIENT_ID)
    // последний бандл страницы опрашивается первым, client_id найден в нём —
    // более ранний main-бандл даже не запрашивается
    const urls = (fetcher as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])
    expect(urls).toEqual(['https://soundcloud.com', BUNDLE_APP])
  })

  it('caches client_id: second call does not refetch', async () => {
    const fetcher = textFetcher({
      'https://soundcloud.com': HOME_HTML,
      [BUNDLE_APP]: `client_id:"${CLIENT_ID}"`,
    })
    await scResolveClientIdWith(fetcher)
    const calls = (fetcher as ReturnType<typeof vi.fn>).mock.calls.length
    const again = await scResolveClientIdWith(fetcher)
    expect(again).toBe(CLIENT_ID)
    expect((fetcher as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls)
  })

  it('tries the next bundle when one fails or lacks client_id', async () => {
    const fetcher = textFetcher({
      'https://soundcloud.com': HOME_HTML,
      // BUNDLE_APP отсутствует в map → 404
      [BUNDLE_MAIN]: `client_id:"${CLIENT_ID}"`,
    })
    const id = await scResolveClientIdWith(fetcher)
    expect(id).toBe(CLIENT_ID)
    // app-бандл (последний на странице) опрошен раньше main
    const urls = (fetcher as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])
    expect(urls.indexOf(BUNDLE_APP)).toBeLessThan(urls.indexOf(BUNDLE_MAIN))
  })

  it('throws a readable error when client_id is not found', async () => {
    const fetcher = textFetcher({
      'https://soundcloud.com': HOME_HTML,
      [BUNDLE_MAIN]: 'no id here',
      [BUNDLE_APP]: 'also none',
    })
    await expect(scResolveClientIdWith(fetcher)).rejects.toThrow(
      /не удалось получить доступ к SoundCloud/,
    )
  })

  it('throws a readable error when soundcloud.com is unreachable', async () => {
    const fetcher: ScFetcher = vi.fn(async () => {
      throw new Error('ENOTFOUND')
    })
    await expect(scResolveClientIdWith(fetcher)).rejects.toThrow(
      /не удалось получить доступ к SoundCloud/,
    )
  })
})

describe('scSearchTracksWith', () => {
  it('builds the search URL with query, client_id and limit', async () => {
    const fetcher = textFetcher({ '': '' })
    ;(fetcher as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => ({
      ok: true,
      status: 200,
      text: async () => (url.includes('/search/tracks') ? SEARCH_RESPONSE : ''),
    }))
    await scSearchTracksWith(fetcher, CLIENT_ID, 'lofi beats', 50)
    const url = (fetcher as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain('https://api-v2.soundcloud.com/search/tracks')
    expect(url).toContain(`q=${encodeURIComponent('lofi beats')}`)
    expect(url).toContain(`client_id=${CLIENT_ID}`)
    expect(url).toContain('limit=50')
  })

  it('maps tracks: progressive transcoding preferred, hls as fallback', async () => {
    const fetcher = textFetcher({ '': '' })
    ;(fetcher as ReturnType<typeof vi.fn>).mockImplementation(async () => ({
      ok: true,
      status: 200,
      text: async () => SEARCH_RESPONSE,
    }))
    const tracks = await scSearchTracksWith(fetcher, CLIENT_ID, 'lofi')
    expect(tracks).toEqual([
      {
        title: 'lofi dreams',
        artist: 'chillhop',
        durationSec: 184,
        streamUrl: `https://api-v2.soundcloud.com/media/song/123456/stream/progressive?client_id=${CLIENT_ID}`,
        extId: '123456',
      },
      {
        title: 'hls only',
        artist: 'someone',
        durationSec: 60,
        streamUrl: `https://api-v2.soundcloud.com/media/song/789/stream/hls?client_id=${CLIENT_ID}`,
        extId: '789',
      },
      {
        title: 'no media',
        artist: 'ghost',
        durationSec: undefined,
        streamUrl: undefined,
        extId: '555',
      },
    ])
  })

  it('returns [] for an empty collection', async () => {
    const fetcher: ScFetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ collection: [] }),
    }))
    expect(await scSearchTracksWith(fetcher, CLIENT_ID, 'zzz')).toEqual([])
  })

  it('throws on HTTP failure', async () => {
    const fetcher: ScFetcher = vi.fn(async () => ({ ok: false, status: 401, text: async () => '' }))
    await expect(scSearchTracksWith(fetcher, 'dead', 'lofi')).rejects.toThrow(/401/)
  })
})

describe('scResolveStreamWith', () => {
  it('returns the final stream URL from the transcoding JSON', async () => {
    const fetcher: ScFetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ url: 'https://cf-media.sndcdn.com/abc.128.mp3?Policy=...' }),
    }))
    const url = await scResolveStreamWith(fetcher, 'https://api-v2.soundcloud.com/media/x?client_id=y')
    expect(url).toBe('https://cf-media.sndcdn.com/abc.128.mp3?Policy=...')
  })

  it('throws when the response has no url', async () => {
    const fetcher: ScFetcher = vi.fn(async () => ({ ok: true, status: 200, text: async () => '{}' }))
    await expect(scResolveStreamWith(fetcher, 'https://x')).rejects.toThrow(/недоступен/)
  })
})
