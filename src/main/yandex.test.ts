import { describe, it, expect, vi } from 'vitest'
import {
  yaAuthUrl,
  matchYaAuthUrl,
  yaExchangeWith,
  yaRefreshWith,
  yaLikesWith,
  YANDEX_CLIENT_ID,
  type YaRequester,
} from './yandex'

function okRequester(data: unknown, status = 200): YaRequester & ReturnType<typeof vi.fn> {
  return vi.fn(async () => ({ status, json: async () => data })) as never
}

describe('yaAuthUrl', () => {
  it('builds oauth.yandex.ru authorize url with client id and device name', () => {
    const url = new URL(yaAuthUrl())
    expect(url.hostname).toBe('oauth.yandex.ru')
    expect(url.pathname).toBe('/authorize')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe(YANDEX_CLIENT_ID)
    expect(url.searchParams.get('device_name')).toBe('Re:Zon')
  })
})

describe('matchYaAuthUrl', () => {
  it('extracts code from verification_code redirect', () => {
    expect(matchYaAuthUrl('https://oauth.yandex.ru/verification_code?code=ABC&foo=1')).toBe('ABC')
    expect(matchYaAuthUrl('https://oauth.yandex.ru/verification_code?code=123456')).toBe('123456')
  })

  it('ignores login page and foreign urls', () => {
    expect(matchYaAuthUrl('https://oauth.yandex.ru/authorize?response_type=code')).toBeNull()
    expect(matchYaAuthUrl('https://yandex.ru')).toBeNull()
  })
})

describe('yaExchangeWith', () => {
  it('POSTs authorization_code grant with device fields', async () => {
    const r = okRequester({ access_token: 'AT', refresh_token: 'RT' })
    const t = await yaExchangeWith(r, 'CODE')
    expect(t).toEqual({ accessToken: 'AT', refreshToken: 'RT' })
    const [url, init] = (r as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, { method: string; body: string }]
    expect(url).toBe('https://oauth.yandex.ru/token')
    expect(init.method).toBe('POST')
    expect(init.body).toContain('grant_type=authorization_code')
    expect(init.body).toContain('code=CODE')
    expect(init.body).toContain(`client_id=${YANDEX_CLIENT_ID}`)
    expect(init.body).toContain('device_name=Re%3AZon')
  })

  it('throws readable error on invalid code', async () => {
    const r = okRequester({ error: 'invalid_grant', error_description: 'Код неверен' }, 400)
    await expect(yaExchangeWith(r, 'bad')).rejects.toThrow(/Код неверен/)
  })
})

describe('yaRefreshWith', () => {
  it('POSTs refresh_token grant and keeps old refresh when absent', async () => {
    const r = okRequester({ access_token: 'AT2' })
    const t = await yaRefreshWith(r, 'RT-OLD')
    expect(t).toEqual({ accessToken: 'AT2', refreshToken: 'RT-OLD' })
    const [, init] = (r as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, { body: string }]
    expect(init.body).toContain('grant_type=refresh_token')
    expect(init.body).toContain('refresh_token=RT-OLD')
  })
})

describe('yaLikesWith', () => {
  it('sends OAuth header and maps liketracks to title/artist', async () => {
    const r = okRequester({
      library: {
        tracks: [
          { track: { title: 'Медленная заря', artists: [{ name: 'Аигел' }] } },
          { track: { title: 'Тень', artists: [{ name: 'Аигел' }, { name: 'feat' }] } },
          { track: {} },
        ],
      },
    })
    const likes = await yaLikesWith(r, 'TOKEN')
    expect(likes).toEqual([
      { title: 'Медленная заря', artist: 'Аигел' },
      { title: 'Тень', artist: 'Аигел, feat' },
    ])
    const [, init] = (r as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, { headers: Record<string, string> }]
    expect(init.headers.authorization).toBe('OAuth TOKEN')
  })

  it('401 → «сессия истекла»', async () => {
    const r = okRequester({}, 401)
    await expect(yaLikesWith(r, 'T')).rejects.toThrow(/переподключите/)
  })

  it('filter out fully empty entries', async () => {
    const r = okRequester({ library: { tracks: [{ track: {} }, { track: { title: 'X' } }] } })
    const likes = await yaLikesWith(r, 'T')
    expect(likes).toEqual([{ title: 'X', artist: '' }])
  })
})
