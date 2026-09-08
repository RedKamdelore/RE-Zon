import { describe, it, expect, vi } from 'vitest'
import {
  vkParseAudioPage,
  vkPageLooksUnauthorized,
  matchVkWebAuthUrl,
  fetchVkAudioListWith,
  type VkWebFetcher,
} from './vkWeb'

/** Реалистичный фрагмент m.vk.com/audio: аудиозаписи в inline-json */
function audioHtml(tracks: Array<[number, number, string, string, number, string]>): string {
  const blocks = tracks
    .map(
      ([oid, id, artist, title, dur, url]) =>
        `{"id":${id},"owner_id":${oid},"title":"${title}","artist":"${artist}","duration":${dur},"url":"${url}","track_code":"abc"}`,
    )
    .join(',\n')
  return `<html><head></head><body><script>window.vk = { audios: [${blocks}] };</script><div class="audio_page"></div></body></html>`
}

describe('vkParseAudioPage', () => {
  it('extracts tracks with stable extIds and stream urls', () => {
    const html = audioHtml([
      [12345, 456, 'Мумий Тролль', 'Владивосток 2000', 243, 'https://psv4.vkuseraudio.net/c1/abc.mp3?extra=1'],
      [12345, 457, 'Кино', 'Группа крови', 283, 'https://psv4.vkuseraudio.net/c2/def.mp3?extra=2'],
    ])
    const tracks = vkParseAudioPage(html)
    expect(tracks).toEqual([
      {
        title: 'Владивосток 2000',
        artist: 'Мумий Тролль',
        durationSec: 243,
        streamUrl: 'https://psv4.vkuseraudio.net/c1/abc.mp3?extra=1',
        extId: '12345_456',
      },
      {
        title: 'Группа крови',
        artist: 'Кино',
        durationSec: 283,
        streamUrl: 'https://psv4.vkuseraudio.net/c2/def.mp3?extra=2',
        extId: '12345_457',
      },
    ])
  })

  it('deduplicates repeated audio ids on the page', () => {
    const one = audioHtml([[1, 2, 'A', 'T', 10, 'https://x.mp3']])
    const doubled = one + one
    expect(vkParseAudioPage(doubled)).toHaveLength(1)
  })

  it('tracks without url are kept (imported without stream)', () => {
    const html = audioHtml([[1, 2, 'A', 'T', 10, '']])
    const tracks = vkParseAudioPage(html)
    expect(tracks).toHaveLength(1)
    expect(tracks[0].streamUrl).toBeUndefined()
  })

  it('unescapes html entities inside json', () => {
    const html = `<script>[{"id":1,"owner_id":2,"title":"Big &quot;Hit&quot;","artist":"DJ &quot;X&quot;","duration":10,"url":"https://a.mp3"}]</script>`
    const tracks = vkParseAudioPage(html)
    expect(tracks[0]?.title).toBe('Big "Hit"')
    expect(tracks[0]?.artist).toBe('DJ "X"')
  })

  it('malformed json entries are skipped silently', () => {
    const html = `<script>{"id":1,"owner_id":2,"title":"x","artist":"y"},{"broken":true}</script>`
    const tracks = vkParseAudioPage(html)
    expect(tracks).toHaveLength(1)
  })

  it('empty page returns []', () => {
    expect(vkParseAudioPage('<html><body></body></html>')).toEqual([])
  })
})

describe('vkPageLooksUnauthorized', () => {
  it('login page is unauthorized', () => {
    expect(vkPageLooksUnauthorized('<html>… m.vk.com/login …</html>')).toBe(true)
  })
  it('audio page is authorized', () => {
    expect(vkPageLooksUnauthorized(audioHtml([[1, 2, 'A', 'T', 10, 'u']]))).toBe(false)
  })
})

describe('matchVkWebAuthUrl', () => {
  it('matches m.vk.com/audio after login redirect', () => {
    expect(matchVkWebAuthUrl('https://m.vk.com/audio')).toBe(true)
    expect(matchVkWebAuthUrl('https://m.vk.com/audio?from=login')).toBe(true)
  })
  it('login/other pages do not match', () => {
    expect(matchVkWebAuthUrl('https://m.vk.com/login?u=1')).toBeNull()
    expect(matchVkWebAuthUrl('https://vk.com/feed')).toBeNull()
  })
})

describe('fetchVkAudioListWith', () => {
  function pageFetcher(pages: string[], onPage?: (url: string) => void): VkWebFetcher {
    let call = 0
    return vi.fn(async (url: string) => {
      onPage?.(url)
      const html = pages[Math.min(call, pages.length - 1)]
      call++
      return { status: 200, html }
    }) as never
  }

  it('fetches first page tracks', async () => {
    const fetcher = pageFetcher([audioHtml([[1, 1, 'A', 'T1', 10, 'u1'], [1, 2, 'A', 'T2', 20, 'u2']])])
    const { tracks, unauthorized } = await fetchVkAudioListWith(fetcher, { maxPages: 1 })
    expect(unauthorized).toBe(false)
    expect(tracks.map((t) => t.extId)).toEqual(['1_1', '1_2'])
  })

  it('stops when a page yields no new tracks', async () => {
    const page1 = audioHtml([[1, 1, 'A', 'T1', 10, 'u1']])
    const fetcher = pageFetcher([page1, page1, page1])
    const { tracks } = await fetchVkAudioListWith(fetcher, { maxPages: 10 })
    expect(tracks).toHaveLength(1)
  })

  it('unauthorized page reports unauthorized', async () => {
    const fetcher: VkWebFetcher = async () => ({ status: 200, html: '<html>m.vk.com/login</html>' })
    const { unauthorized } = await fetchVkAudioListWith(fetcher)
    expect(unauthorized).toBe(true)
  })

  it('passes offset for pagination (offset=2000 per page)', async () => {
    const urls: string[] = []
    const page1 = audioHtml([[1, 1, 'A', 'T1', 10, 'u1']])
    const page2 = audioHtml([[1, 2, 'B', 'T2', 10, 'u2']])
    const fetcher: VkWebFetcher = vi.fn(async (url: string) => {
      urls.push(url)
      return { status: 200, html: url.includes('offset=2000') ? page2 : page1 }
    })
    const { tracks } = await fetchVkAudioListWith(fetcher, { maxPages: 5 })
    expect(urls[0]).toBe('https://m.vk.com/audio')
    expect(urls[1]).toBe('https://m.vk.com/audio?offset=2000')
    expect(tracks.map((t) => t.title)).toEqual(['T1', 'T2'])
  })
})
