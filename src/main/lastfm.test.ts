import { describe, it, expect, vi } from 'vitest'
import { lastfmApiWith, type LfmRequester } from './lastfm'

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
