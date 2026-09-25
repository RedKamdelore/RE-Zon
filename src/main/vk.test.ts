import { describe, it, expect, vi, afterEach } from 'vitest'
import { vkAudioGetWith, vkAudioGet, vkAuthUrl, matchVkAuthUrl, type Fetcher } from './vk'
import { VK_CLIENT_ID, VK_REDIRECT } from '../shared/connections'

function okFetcher(data: unknown): Fetcher {
  return vi.fn(async () => ({ ok: true, status: 200, json: async () => data }))
}

const VK_RESPONSE = {
  response: {
    count: 2,
    items: [
      {
        id: 456242341,
        owner_id: 12345,
        artist: 'Мумий Тролль',
        title: 'Владивосток 2000',
        duration: 243,
        url: 'https://cs9-1v4.vkuseraudio.net/p1/abc/audio.mp3',
        album: { id: 777, title: 'Морская' },
      },
      {
        id: 456242342,
        owner_id: 12345,
        artist: 'Кино',
        title: 'Группа крови',
        duration: 283,
        // url отсутствует — VK иногда скрывает поток
      },
    ],
  },
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('vkAudioGetWith', () => {
  it('loads all 2544 records when VK caps pages at 200 and the first has 197 URLs', async () => {
    const offsets: number[] = []
    const fetcher: Fetcher = async (url) => {
      const offset = Number(new URL(url).searchParams.get('offset'))
      offsets.push(offset)
      return { ok: true, status: 200, json: async () => ({ response: {
        count: 2544,
        items: Array.from({ length: Math.min(200, 2544 - offset) }, (_, i) => ({
          id: offset + i, owner_id: 1, artist: 'Artist', title: `Track ${offset + i}`,
          url: offset + i < 3 ? '' : 'https://example.com/track.mp3',
        })),
      } }) }
    }
    const tracks = await vkAudioGetWith(fetcher, 'T', async () => {})
    expect(tracks).toHaveLength(2544)
    expect(tracks.filter((track) => track.streamUrl)).toHaveLength(2541)
    expect(offsets).toEqual(Array.from({ length: 13 }, (_, i) => i * 200))
  })
  it('does not silently return a partial library if a later page is empty', async () => {
    let page = 0
    const fetcher: Fetcher = async () => ({ ok: true, status: 200, json: async () => ({
      response: { count: 3, items: page++ === 0 ? [{ id: 1, owner_id: 1 }] : [] },
    }) })
    await expect(vkAudioGetWith(fetcher, 'T', async () => {})).rejects.toThrow('получено только 1 из 3')
  })
  it('stops repeated pages instead of looping or returning duplicates', async () => {
    const fetcher = okFetcher({response:{count:3,items:[{id:1,owner_id:1}]}})
    await expect(vkAudioGetWith(fetcher, 'T', async () => {})).rejects.toThrow('повторяет страницу')
  })
  it('builds the audio.get URL with token and API version', async () => {
    const fetcher = okFetcher({ response: { count: 0, items: [] } })
    await vkAudioGetWith(fetcher, 'TOKEN 123')
    const url = (fetcher as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain('https://api.vk.com/method/audio.get')
    expect(url).toContain(`access_token=${encodeURIComponent('TOKEN 123')}`)
    expect(url).toContain('v=5.131')
  })

  it('maps items to ImportedTrack, keeping streamUrl when present', async () => {
    const tracks = await vkAudioGetWith(okFetcher(VK_RESPONSE), 'T')
    expect(tracks).toEqual([
      {
        title: 'Владивосток 2000',
        artist: 'Мумий Тролль',
        album: 'Морская',
        durationSec: 243,
        streamUrl: 'https://cs9-1v4.vkuseraudio.net/p1/abc/audio.mp3',
        extId: '12345_456242341',
      },
      {
        title: 'Группа крови',
        artist: 'Кино',
        album: undefined,
        durationSec: 283,
        streamUrl: undefined,
        extId: '12345_456242342',
      },
    ])
  })

  it('returns [] for an empty audio list', async () => {
    const tracks = await vkAudioGetWith(okFetcher({ response: { count: 0, items: [] } }), 'T')
    expect(tracks).toEqual([])
  })

  it('throws «недействительный токен» on error_code 5', async () => {
    const fetcher = okFetcher({ error: { error_code: 5, error_msg: 'User authorization failed' } })
    await expect(vkAudioGetWith(fetcher, 'bad')).rejects.toThrow(/недействительный токен/)
  })

  it('throws «нет доступа к аудио» on error_code 15', async () => {
    const fetcher = okFetcher({ error: { error_code: 15, error_msg: 'Access denied' } })
    await expect(vkAudioGetWith(fetcher, 'bad')).rejects.toThrow(/нет доступа к аудио/)
  })

  it('includes the code in the message for unknown errors', async () => {
    const fetcher = okFetcher({ error: { error_code: 10, error_msg: 'Internal server error' } })
    await expect(vkAudioGetWith(fetcher, 'bad')).rejects.toThrow(/10/)
  })

  it('throws a readable error on HTTP failure', async () => {
    const fetcher: Fetcher = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }))
    await expect(vkAudioGetWith(fetcher, 'T')).rejects.toThrow(/503/)
  })

  it('requests the first page with count=6000 and offset=0', async () => {
    const fetcher = okFetcher({ response: { count: 0, items: [] } })
    await vkAudioGetWith(fetcher, 'T')
    const url = (fetcher as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain('count=6000')
    expect(url).toContain('offset=0')
  })

  it('makes a single request when all items fit on the first page', async () => {
    const fetcher = okFetcher(VK_RESPONSE)
    const tracks = await vkAudioGetWith(fetcher, 'T')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(tracks).toHaveLength(2)
  })

  it('paginates with increasing offset until all items are fetched', async () => {
    const page = (from: number, n: number): unknown => ({
      response: {
        count: 5,
        items: Array.from({ length: n }, (_, i) => ({
          id: from + i,
          owner_id: 1,
          artist: `A${from + i}`,
          title: `T${from + i}`,
        })),
      },
    })
    const fetcher: Fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => page(0, 2) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => page(2, 2) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => page(4, 1) })
    const sleep = vi.fn(async () => {})
    const tracks = await vkAudioGetWith(fetcher, 'T', sleep)
    expect(tracks.map((t) => t.title)).toEqual(['T0', 'T1', 'T2', 'T3', 'T4'])
    expect(fetcher).toHaveBeenCalledTimes(3)
    const urls = (fetcher as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as string)
    expect(urls[0]).toContain('offset=0')
    expect(urls[1]).toContain('offset=2')
    expect(urls[2]).toContain('offset=4')
    // задержка между страницами (rate limit VK ~3 req/s), но не перед первой
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('propagates a readable error when a later page fails', async () => {
    const fetcher: Fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ response: { count: 5, items: [{ id: 1, owner_id: 1 }] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ error: { error_code: 6, error_msg: 'Too many requests per second' } }),
      })
    await expect(vkAudioGetWith(fetcher, 'T', async () => {})).rejects.toThrow(
      /слишком много запросов/,
    )
  })
})

describe('vkAudioGet', () => {
  it('delegates to the global fetch', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => VK_RESPONSE,
    }))
    vi.stubGlobal('fetch', fetchMock)
    const tracks = await vkAudioGet('TOKEN')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(tracks).toHaveLength(2)
  })
})

describe('vkAuthUrl', () => {
  it('builds Kate Mobile OAuth url with token response and revoke', () => {
    const url = new URL(vkAuthUrl())
    expect(url.hostname).toBe('oauth.vk.com')
    expect(url.pathname).toBe('/authorize')
    expect(url.searchParams.get('client_id')).toBe(String(VK_CLIENT_ID))
    expect(url.searchParams.get('response_type')).toBe('token')
    expect(url.searchParams.get('redirect_uri')).toBe(VK_REDIRECT)
    expect(url.searchParams.get('revoke')).toBe('1')
    expect(url.searchParams.get('display')).toBe('page')
  })
})

describe('matchVkAuthUrl', () => {
  const TOKEN = 'abc123'
  const okUrl = `https://oauth.vk.com/blank.html#access_token=${TOKEN}&expires_in=0&user_id=42`

  it('matches blank.html fragment with access_token', () => {
    const r = matchVkAuthUrl(okUrl)
    expect(r).not.toBeNull()
    expect(r!.token).toBe(TOKEN)
    expect(r!.userId).toBe('42')
    expect(r!.expiresIn).toBe(0)
  })

  it('parses 24h expiry', () => {
    const r = matchVkAuthUrl(
      'https://oauth.vk.com/blank.html#access_token=t&expires_in=86400&user_id=7',
    )
    expect(r!.expiresIn).toBe(86400)
  })

  it('ignores non-blank urls', () => {
    expect(matchVkAuthUrl('https://oauth.vk.com/authorize?client_id=1')).toBeNull()
    expect(matchVkAuthUrl('https://vk.com/feed')).toBeNull()
  })

  it('ignores blank.html without token fragment (login error)', () => {
    expect(matchVkAuthUrl('https://oauth.vk.com/blank.html#error=access_denied')).toBeNull()
    expect(matchVkAuthUrl('https://oauth.vk.com/blank.html')).toBeNull()
  })
})
