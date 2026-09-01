import { describe, it, expect, vi, afterEach } from 'vitest'
import { vkAudioGetWith, vkAudioGet, type Fetcher } from './vk'

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
