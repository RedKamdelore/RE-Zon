import { describe, expect, it, vi } from 'vitest'
import { lookupVkLyricsWith, parseVkLyrics, type VkAudioApi, type VkLyricsRunner } from './vkLyrics'
import type { ServiceAccount } from '../shared/accounts'

const request = { title: 'Song', artist: 'Artist', durationSec: 180 }
const account: ServiceAccount = { id: 'vk:one', service: 'vk', label: 'VK', partition: 'persist:one', token: 'web-session', connectedAt: 1, autoRefresh: true }
const runWith = (api: VkAudioApi): VkLyricsRunner => (_account, work) => work(api)

describe('VK lyrics', () => {
  it('converts milliseconds precisely, preserves empty timing lines and distinguishes both formats', () => {
    const found = parseVkLyrics({ lyrics: { text: ['First', '', 'Second'], timestamps: [
      { begin: 162345, end: 164000, line: 'Second' }, { begin: 1250, end: 3000, line: 'First' }, { begin: 3000, end: 3500, line: '' },
    ] } }, 180)
    expect(found).toEqual({ source: 'vk', synced: true, text: '[00:01.250]First\n[00:03.000]\n[02:42.345]Second', plainText: 'First\n\nSecond' })
  })

  it('handles legacy text/LRC and does not invent timestamps for ordinary lyrics', () => {
    expect(parseVkLyrics({ text: 'Old plain text' })).toEqual({ source: 'vk', synced: false, text: 'Old plain text' })
    expect(parseVkLyrics({ text: '[00:01.25]Old timed text' })).toEqual({ source: 'vk', synced: true, text: '[00:01.25]Old timed text' })
    expect(parseVkLyrics({ lyrics: { text: ['Only plain'] } })).toEqual({ source: 'vk', synced: false, text: 'Only plain' })
    expect(parseVkLyrics({ lyrics: {} })).toBeNull()
  })

  it('rejects malformed or impossible timestamps and retains available plain text', () => {
    expect(parseVkLyrics({ lyrics: { timestamps: [{ begin: -1, line: 'bad' }, { begin: '1000', line: 'bad' }, { begin: Infinity, line: 'bad' }] } })).toBeNull()
    expect(parseVkLyrics({ lyrics: { text: ['Plain'], timestamps: [{ begin: 900000, line: 'Wrong recording' }] } }, 180)).toEqual({ source: 'vk', synced: false, text: 'Plain' })
    expect(parseVkLyrics({ text: '[09:00]Wrong recording' }, 180)).toBeNull()
  })

  it('requests the exact VK recording through its own connected account', async () => {
    const api = vi.fn<VkAudioApi>().mockResolvedValue({ response: { lyrics: { text: ['Line'], timestamps: [{ begin: 1000, line: 'Line' }] } } })
    const run = vi.fn(runWith(api))
    const second = { ...account, id: 'vk:two', partition: 'persist:two' }
    const found = await lookupVkLyricsWith({ ...request, vk: { audioId: '-200_123', accountId: second.id } }, [account, second], run)
    expect(run.mock.calls[0][0]).toEqual(second)
    expect(api).toHaveBeenCalledOnce()
    expect(api).toHaveBeenCalledWith('audio.getLyrics', { audio_id: '-200_123' })
    expect(found.status).toBe('both')
  })

  it('does not use another account when the track account was disconnected', async () => {
    const run = vi.fn(runWith(vi.fn()))
    expect((await lookupVkLyricsWith({ ...request, vk: { audioId: '1_2', accountId: 'vk:missing' } }, [account], run)).status).toBe('unavailable')
    expect((await lookupVkLyricsWith(request, [], run)).status).toBe('unavailable')
    expect(run).not.toHaveBeenCalled()
  })

  it('looks up older lyrics_id records after modern audio_id is unsupported', async () => {
    const api = vi.fn<VkAudioApi>().mockResolvedValueOnce({ error: { error_code: 100 } })
      .mockResolvedValueOnce({ response: [{ owner_id: 1, id: 2, lyrics_id: 77 }] })
      .mockResolvedValueOnce({ response: { text: 'Old text' } })
    const result = await lookupVkLyricsWith({ ...request, vk: { audioId: '1_2' } }, [account], runWith(api))
    expect(api.mock.calls).toEqual([['audio.getLyrics', { audio_id: '1_2' }], ['audio.getById', { audios: '1_2' }], ['audio.getLyrics', { lyrics_id: '77' }]])
    expect(result.result?.text).toBe('Old text')
    expect(result.status).toBe('plain')
  })

  it('searches other services songs conservatively and skips live/remix/different artist recordings', async () => {
    const api = vi.fn<VkAudioApi>().mockResolvedValueOnce({ response: { items: [
      { owner_id: 1, id: 10, title: 'Song (Live)', artist: 'Artist', duration: 180 },
      { owner_id: 1, id: 11, title: 'Song', artist: 'Other', duration: 180 },
      { owner_id: 1, id: 12, title: 'Song', artist: 'Artist', duration: 220 },
      { owner_id: 1, id: 13, title: 'Song', artist: 'Artist' },
      { owner_id: 1, id: 14, title: 'Song', artist: 'Artist', duration: 181 },
    ] } }).mockResolvedValueOnce({ response: { lyrics: { timestamps: [{ begin: 1000, line: 'Matching text' }] } } })
    const result = await lookupVkLyricsWith(request, [account], runWith(api))
    expect(api.mock.calls[1]).toEqual(['audio.getLyrics', { audio_id: '1_14' }])
    expect(api).toHaveBeenCalledTimes(2)
    expect(result.status).toBe('synced')
  })

  it('reports missing lyrics and hides upstream error details from the renderer', async () => {
    expect((await lookupVkLyricsWith(request, [account], runWith(vi.fn().mockResolvedValue({ response: { items: [] } })))).status).toBe('missing')
    const invalidSession = vi.fn().mockResolvedValue({ error: { error_code: 5, error_msg: 'secret upstream detail' } })
    expect(await lookupVkLyricsWith(request, [account], runWith(invalidSession))).toEqual({ source: 'vk', status: 'unavailable', message: 'Повторите вход в VK' })
    const outage = vi.fn().mockRejectedValue(new Error('token=secret'))
    const result = await lookupVkLyricsWith(request, [account], runWith(outage))
    expect(result.status).toBe('error')
    expect(JSON.stringify(result)).not.toContain('secret')
  })
})
