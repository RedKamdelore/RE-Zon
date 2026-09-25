import { describe, it, expect, vi } from 'vitest'
import {
  lastfmApiWith,
  lfmSignature,
  lfmGetSessionWith,
  lfmScrobbleWith,
  lfmAuthUrl,
  matchLfmAuthUrl,
  type LfmRequester,
  type LfmScrobblerRequester,
  type ScrobblePayload,
} from './lastfm'

function okRequester(data: unknown, status = 200): LfmRequester {
  return vi.fn(async () => ({ status, json: async () => data }))
}

describe('lastfmApiWith', () => {
  it('builds the API URL with method, params, key and format=json', async () => {
    const requester = okRequester({ similartracks: { track: [] } })
    await lastfmApiWith({ requester }, 'track.getSimilar', { artist: 'A & B', track: 'T/T', limit: 20 }, 'KEY')
    const url = (requester as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain('https://ws.audioscrobbler.com/2.0/?method=track.getSimilar')
    expect(url).toContain(`artist=${encodeURIComponent('A & B')}`)
    expect(url).toContain(`track=${encodeURIComponent('T/T')}`)
    expect(url).toContain('limit=20')
    expect(url).toContain('api_key=KEY')
    expect(url).toContain('format=json')
  })

  it('returns parsed JSON on success', async () => {
    const data = { similartracks: { track: [{ name: 'X' }] } }
    const result = await lastfmApiWith({ requester: okRequester(data) }, 'track.getSimilar', {}, 'KEY')
    expect(result).toEqual(data)
  })

  it('throws when the API key is empty', async () => {
    const requester = okRequester({})
    await expect(
      lastfmApiWith({ requester }, 'track.getSimilar', {}, ''),
    ).rejects.toThrow(/API/)
    expect(requester).not.toHaveBeenCalled()
  })

  it('passes proxyUrl to the requester when set', async () => {
    const requester = okRequester({ ok: 1 })
    await lastfmApiWith({ requester }, 'track.getInfo', {}, 'KEY', 'http://127.0.0.1:8080')
    expect((requester as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe('http://127.0.0.1:8080')
  })

  it('does not pass proxyUrl when it is empty', async () => {
    const requester = okRequester({ ok: 1 })
    await lastfmApiWith({ requester }, 'track.getInfo', {}, 'KEY', '')
    expect((requester as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBeUndefined()
  })

  it('HTTP 403 + error 11 → сообщение про региональную блокировку', async () => {
    const requester = okRequester(
      { error: 11, message: 'Access Denied - You cannot access this service' },
      403,
    )
    await expect(
      lastfmApiWith({ requester }, 'track.getSimilar', {}, 'KEY'),
    ).rejects.toThrow(/недоступен из вашего региона/)
  })

  it('HTTP 500 → читаемая ошибка', async () => {
    const requester = okRequester({}, 500)
    await expect(
      lastfmApiWith({ requester }, 'track.getSimilar', {}, 'KEY'),
    ).rejects.toThrow(/500/)
  })

  it('JSON с полем error (200 OK) → сообщение Last.fm', async () => {
    const requester = okRequester({ error: 6, message: 'Track not found' })
    await expect(
      lastfmApiWith({ requester }, 'track.getSimilar', {}, 'KEY'),
    ).rejects.toThrow('Track not found')
  })

  it('сетевая ошибка → читаемое сообщение', async () => {
    const requester: LfmRequester = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    })
    await expect(
      lastfmApiWith({ requester }, 'track.getSimilar', {}, 'KEY'),
    ).rejects.toThrow(/ECONNREFUSED/)
  })
})

describe('lfmSignature', () => {
  it('md5 of sorted key-concat params + secret (official algorithm)', () => {
    // Документированный алгоритм: key1val1key2val2…secret (сортировка по ключу),
    // поля format/signature не участвуют
    const sig = lfmSignature({ method: 'auth.getSession', token: 'T', api_key: 'K' }, 'SECRET')
    const expected = require('crypto')
      .createHash('md5')
      .update('api_keyKmethodauth.getSessiontokenTSECRET', 'utf8')
      .digest('hex')
    expect(sig).toBe(expected)
  })

  it('excludes format and signature fields from the digest', () => {
    const withJunk = lfmSignature({ method: 'm', format: 'json', signature: 'zzz' }, 'S')
    const withoutJunk = lfmSignature({ method: 'm' }, 'S')
    expect(withJunk).toBe(withoutJunk)
  })
})

describe('lfmGetSessionWith', () => {
  it('requests auth.getSession with api_key, token, format and signature', async () => {
    const requester = okRequester({ session: { key: 'SK', name: 'user' } })
    await lfmGetSessionWith({ requester }, 'KEY', 'SECRET', 'TOKEN')
    const url = (requester as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain('method=auth.getSession')
    expect(url).toContain('token=TOKEN')
    expect(url).toContain('api_key=KEY')
    expect(url).toContain('format=json')
    expect(url).toMatch(/api_sig=[0-9a-f]{32}/)
  })

  it('returns session key and username', async () => {
    const requester = okRequester({ session: { key: 'SK', name: 'Red_Kamdelore' } })
    const r = await lfmGetSessionWith({ requester }, 'KEY', 'SECRET', 'T')
    expect(r).toEqual({ key: 'SK', username: 'Red_Kamdelore' })
  })

  it('throws without api key or secret', async () => {
    const requester = okRequester({})
    await expect(lfmGetSessionWith({ requester }, '', 'S', 'T')).rejects.toThrow(/API key/)
    await expect(lfmGetSessionWith({ requester }, 'K', '', 'T')).rejects.toThrow(/API key/)
    expect(requester).not.toHaveBeenCalled()
  })

  it('error 15 (not authorised) → readable message', async () => {
    const requester = okRequester({ error: 15, message: 'Not authorised' })
    await expect(lfmGetSessionWith({ requester }, 'K', 'S', 'bad-token')).rejects.toThrow(
      /Not authorised/,
    )
  })

  it('session missing → «сессия не выдана»', async () => {
    const requester = okRequester({ session: {} })
    await expect(lfmGetSessionWith({ requester }, 'K', 'S', 'T')).rejects.toThrow(/сессия/)
  })
})

describe('lfmScrobbleWith', () => {
  const scrobble: ScrobblePayload = {
    artist: 'Мумий Тролль',
    track: 'Владивосток 2000',
    album: 'Морская',
    timestamp: 1700000000,
  }

  function okScrobbler(data: unknown, status = 200): {
    post: ReturnType<typeof vi.fn>
  } & LfmScrobblerRequester {
    const post = vi.fn(async () => ({ status, json: async () => data }))
    return { post }
  }

  it('POSTs signed body with indexed track fields', async () => {
    const scrobbler = okScrobbler({ scrobbles: { scrobble: {} } })
    await lfmScrobbleWith({ requester: scrobbler }, 'KEY', 'SECRET', 'SK', '', [scrobble])
    const [url, body] = scrobbler.post.mock.calls[0] as [string, string]
    expect(url).toBe('https://ws.audioscrobbler.com/2.0/')
    expect(body).toContain('method=track.scrobble')
    expect(body).toContain('artist%5B0%5D=')
    expect(body).toContain('track%5B0%5D=')
    expect(body).toContain('timestamp%5B0%5D=1700000000')
    expect(body).toContain('api_key=KEY')
    expect(body).toContain('sk=SK')
    expect(body).toMatch(/api_sig=[0-9a-f]{32}/)
  })

  it('returns the number of scrobbled tracks', async () => {
    const scrobbler = okScrobbler({ scrobbles: { scrobble: {} } })
    const n = await lfmScrobbleWith(
      { requester: scrobbler },
      'K',
      'S',
      'SK',
      '',
      [scrobble, { ...scrobble, timestamp: 1700000001 }],
    )
    expect(n).toBe(2)
  })

  it('empty batch → 0 without a request', async () => {
    const scrobbler = okScrobbler({})
    const n = await lfmScrobbleWith({ requester: scrobbler }, 'K', 'S', 'SK', '', [])
    expect(n).toBe(0)
    expect(scrobbler.post).not.toHaveBeenCalled()
  })

  it('throws when key/secret/session missing', async () => {
    const scrobbler = okScrobbler({})
    await expect(lfmScrobbleWith({ requester: scrobbler }, '', 'S', 'SK', '', [scrobble])).rejects.toThrow(/настройках/)
    await expect(lfmScrobbleWith({ requester: scrobbler }, 'K', '', 'SK', '', [scrobble])).rejects.toThrow(/настройках/)
    await expect(lfmScrobbleWith({ requester: scrobbler }, 'K', 'S', '', '', [scrobble])).rejects.toThrow(/подключено/)
  })

  it('error in response → readable message', async () => {
    const scrobbler = okScrobbler({ error: 29, message: 'Rate limit exceeded' })
    await expect(
      lfmScrobbleWith({ requester: scrobbler }, 'K', 'S', 'SK', '', [scrobble]),
    ).rejects.toThrow(/Rate limit/)
  })

  it('region block → proxy hint message', async () => {
    const scrobbler = okScrobbler(
      { error: 11, message: 'Access Denied - You cannot access this service' },
      403,
    )
    await expect(
      lfmScrobbleWith({ requester: scrobbler }, 'K', 'S', 'SK', '', [scrobble]),
    ).rejects.toThrow(/регион/)
  })
})

describe('lfm auth url', () => {
  it('lfmAuthUrl embeds the api key', () => {
    expect(lfmAuthUrl('my key')).toBe('https://www.last.fm/api/auth/?api_key=my%20key&cb=http%3A%2F%2F127.0.0.1%3A8889%2Flastfm%2Fcallback')
  })

  it('matchLfmAuthUrl extracts token from auth callback (http and https)', () => {
    expect(matchLfmAuthUrl('http://www.last.fm/api/auth/?token=abc123')).toBe('abc123')
    expect(matchLfmAuthUrl('https://www.last.fm/api/auth/?token=x&foo=1')).toBe('x')
  })

  it('matchLfmAuthUrl ignores other pages and token-less auth pages', () => {
    expect(matchLfmAuthUrl('https://www.last.fm/music/Кино')).toBeNull()
    expect(matchLfmAuthUrl('https://www.last.fm/api/auth/')).toBeNull()
    expect(matchLfmAuthUrl('https://www.last.fm/login')).toBeNull()
  })
})

describe('Last.fm callback validation', () => {
  it('accepts the configured local callback and rejects lookalike hosts', () => {
    expect(matchLfmAuthUrl('http://127.0.0.1:8889/lastfm/callback?token=TEST')).toBe('TEST')
    expect(matchLfmAuthUrl('https://www.last.fm.evil.test/api/auth/?token=TEST')).toBeNull()
    expect(matchLfmAuthUrl('http://127.0.0.1:8889/other?token=TEST')).toBeNull()
  })
})
