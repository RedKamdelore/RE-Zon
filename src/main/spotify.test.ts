import { describe, it, expect, vi } from 'vitest'
import {
  spPkceVerifier,
  spPkceChallenge,
  spAuthUrl,
  matchSpotifyCallback,
  spExchangeWith,
  spRefreshWith,
  spPlaylistsWith,
  spPlaylistTracksWith,
  SPOTIFY_REDIRECT,
  type SpRequester,
} from './spotify'
import { createHash } from 'crypto'

describe('PKCE', () => {
  it('verifier is 43-char base64url (32 bytes)', () => {
    const v = spPkceVerifier()
    expect(v).toMatch(/^[\w-]{43}$/)
  })

  it('challenge = base64url(sha256(verifier)) без паддинга', () => {
    const v = 'some-verifier-string-43-chars-long-aaaaaaaaaa'
    const expected = createHash('sha256').update(v, 'utf8').digest('base64url')
    expect(spPkceChallenge(v)).toBe(expected)
    expect(spPkceChallenge(v)).not.toContain('=')
  })

  it('two verifiers differ (random)', () => {
    expect(spPkceVerifier()).not.toBe(spPkceVerifier())
  })
})

describe('spAuthUrl', () => {
  it('builds authorize URL with PKCE params', () => {
    const url = new URL(spAuthUrl('CLIENT', 'CHALLENGE', 'STATE'))
    expect(url.hostname).toBe('accounts.spotify.com')
    expect(url.pathname).toBe('/authorize')
    expect(url.searchParams.get('client_id')).toBe('CLIENT')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('redirect_uri')).toBe(SPOTIFY_REDIRECT)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBe('CHALLENGE')
    expect(url.searchParams.get('state')).toBe('STATE')
    expect(url.searchParams.get('scope')).toContain('playlist-read-private')
  })
})

describe('matchSpotifyCallback', () => {
  it('extracts code when state matches', () => {
    expect(matchSpotifyCallback(`${SPOTIFY_REDIRECT}?code=ABC&state=ST`, 'ST')).toEqual({ code: 'ABC' })
  })

  it('rejects mismatched state (CSRF guard)', () => {
    expect(matchSpotifyCallback(`${SPOTIFY_REDIRECT}?code=ABC&state=EVIL`, 'ST')).toBeNull()
  })

  it('rejects user denial (error param)', () => {
    expect(matchSpotifyCallback(`${SPOTIFY_REDIRECT}?error=access_denied&state=ST`, 'ST')).toBeNull()
  })

  it('ignores foreign urls', () => {
    expect(matchSpotifyCallback('https://open.spotify.com/', 'ST')).toBeNull()
  })
})

function okRequester(data: unknown, status = 200): SpRequester & ReturnType<typeof vi.fn> {
  return vi.fn(async () => ({ status, json: async () => data })) as never
}

describe('spExchangeWith', () => {
  it('POSTs authorization_code with verifier and parses tokens', async () => {
    const r = okRequester({ access_token: 'AT', refresh_token: 'RT' })
    const tokens = await spExchangeWith(r, 'CLIENT', 'CODE', 'VER')
    expect(tokens).toEqual({ accessToken: 'AT', refreshToken: 'RT' })
    const [url, init] = (r as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, { method: string; body: string }]
    expect(url).toBe('https://accounts.spotify.com/api/token')
    expect(init.method).toBe('POST')
    expect(init.body).toContain('grant_type=authorization_code')
    expect(init.body).toContain('code=CODE')
    expect(init.body).toContain('code_verifier=VER')
    expect(init.body).toContain('client_id=CLIENT')
    expect(init.body).toContain(`redirect_uri=${encodeURIComponent(SPOTIFY_REDIRECT)}`)
  })

  it('throws readable error on api failure', async () => {
    const r = okRequester({ error: 'invalid_grant', error_description: 'Code expired' }, 400)
    await expect(spExchangeWith(r, 'C', 'bad', 'V')).rejects.toThrow(/Code expired/)
  })

  it('throws with HTTP status when body empty', async () => {
    const r = okRequester({}, 500)
    await expect(spExchangeWith(r, 'C', 'x', 'V')).rejects.toThrow(/500/)
  })
})

describe('spRefreshWith', () => {
  it('POSTs refresh_token grant and keeps old refresh when absent', async () => {
    const r = okRequester({ access_token: 'AT2' })
    const t = await spRefreshWith(r, 'CLIENT', 'RT-OLD')
    expect(t).toEqual({ accessToken: 'AT2', refreshToken: 'RT-OLD' })
    const [, init] = (r as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, { body: string }]
    expect(init.body).toContain('grant_type=refresh_token')
    expect(init.body).toContain('refresh_token=RT-OLD')
  })
})

describe('spPlaylistsWith', () => {
  it('sends Bearer and paginates via next', async () => {
    const r: SpRequester = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          items: [
            { id: 'p1', name: 'Rock', tracks: { total: 3 } },
            { id: undefined, name: 'broken' },
          ],
          next: 'https://api.spotify.com/v1/me/playlists?offset=50',
        }),
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ items: [{ id: 'p2', name: 'Jazz' }], next: null }),
      }) as never
    const lists = await spPlaylistsWith(r, 'TOKEN')
    expect(lists.map((p) => p.name)).toEqual(['Rock', 'Jazz'])
    const calls = (r as unknown as ReturnType<typeof vi.fn>).mock.calls as Array<[string, { headers: Record<string, string> }]>
    expect(calls[0][1].headers.authorization).toBe('Bearer TOKEN')
    expect(calls[1][0]).toContain('offset=50')
  })

  it('401 → «сессия истекла»', async () => {
    const r = okRequester({ error: { message: 'The access token expired' } }, 401)
    await expect(spPlaylistsWith(r, 'T')).rejects.toThrow(/переподключите/)
  })

  it('429 → rate limit message', async () => {
    const r = okRequester({}, 429)
    await expect(spPlaylistsWith(r, 'T')).rejects.toThrow(/слишком много/)
  })
})

describe('spPlaylistTracksWith', () => {
  it('maps track name + joined artists, skips null tracks', async () => {
    const r = okRequester({
      items: [
        { track: { name: 'Song', artists: [{ name: 'A' }, { name: 'B' }] } },
        { track: null },
        { track: { name: undefined, artists: [] } },
      ],
      next: null,
    })
    const tracks = await spPlaylistTracksWith(r, 'T', 'pl-1')
    expect(tracks).toEqual([{ title: 'Song', artist: 'A, B' }])
  })

  it('paginates tracks via next', async () => {
    const r: SpRequester = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ items: [{ track: { name: 'One', artists: [] } }], next: 'next-url' }),
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ items: [{ track: { name: 'Two', artists: [] } }], next: null }),
      }) as never
    const tracks = await spPlaylistTracksWith(r, 'T', 'pl-1')
    expect(tracks.map((t) => t.title)).toEqual(['One', 'Two'])
  })
})
