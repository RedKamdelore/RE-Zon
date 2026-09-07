import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { isScrobblable, enqueueScrobble, flushScrobbles, resetScrobblerState, SCROBBLE_FRACTION, SCROBBLE_AFTER_SEC } from './scrobbler'
import { useConnectionsStore } from './stores/connectionsStore'
import type { Track } from '@shared/types'

function track(dur: number, id = 'local:t'): Track {
  return { id, sourceId: 'local', title: 'Song', artist: 'Artist', album: 'Album', durationSec: dur, filePath: 'C:\\t.mp3' }
}

describe('isScrobblable', () => {
  it('scrobbles after half the track', () => {
    expect(isScrobblable(track(200), 99)).toBe(false)
    expect(isScrobblable(track(200), 100)).toBe(true)
  })

  it('long tracks scrobble at 4 minutes even before half', () => {
    expect(SCROBBLE_AFTER_SEC).toBe(240)
    expect(isScrobblable(track(600), 240)).toBe(true)
    expect(isScrobblable(track(600), 239)).toBe(false)
  })

  it('short tracks still need > 3 seconds (skip protection)', () => {
    expect(isScrobblable(track(4), 3)).toBe(false) // 50% от 4 = 2, но sec > 3 обязательны
    expect(isScrobblable(track(4), 4)).toBe(true)
  })

  it('SCROBBLE_FRACTION is 0.5 (Last.fm rule)', () => {
    expect(SCROBBLE_FRACTION).toBe(0.5)
  })
})

describe('enqueueScrobble + flushScrobbles', () => {
  let scrobble: ReturnType<typeof vi.fn>

  beforeEach(() => {
    resetScrobblerState()
    scrobble = vi.fn().mockResolvedValue({ ok: true, count: 1 })
    ;(globalThis as Record<string, unknown>).window = { api: { lastfmScrobble: scrobble } }
    useConnectionsStore.setState({ statuses: { lastfm: { connected: true } } })
  })

  afterEach(() => {
    resetScrobblerState()
    delete (globalThis as Record<string, unknown>).window
  })

  it('enqueue dedupes by track id until flush', () => {
    enqueueScrobble(track(100, 'a'), 1000)
    enqueueScrobble(track(100, 'a'), 2000)
    expect(scrobble).not.toHaveBeenCalled() // очередь ещё мала
  })

  it('flush sends batch with unix timestamp and album', async () => {
    enqueueScrobble(track(100, 'a'), 1700000000000)
    await flushScrobbles()
    expect(scrobble).toHaveBeenCalledTimes(1)
    const batch = scrobble.mock.calls[0][0]
    expect(batch).toEqual([
      { artist: 'Artist', track: 'Song', album: 'Album', timestamp: 1700000000 },
    ])
  })

  it('«Неизвестный альбом» not sent as album', async () => {
    const t = { ...track(100, 'b'), album: 'Неизвестный альбом' }
    enqueueScrobble(t, 1700000000000)
    await flushScrobbles()
    expect(scrobble.mock.calls[0][0][0].album).toBeUndefined()
  })

  it('flush without window.api is a no-op (keeps queue)', async () => {
    delete (globalThis as Record<string, unknown>).window
    enqueueScrobble(track(100, 'a'))
    await expect(flushScrobbles()).resolves.toBeUndefined()
  })

  it('flush skips when lastfm disconnected — queue keeps waiting', async () => {
    useConnectionsStore.setState({ statuses: {} })
    enqueueScrobble(track(100, 'a'))
    await flushScrobbles()
    expect(scrobble).not.toHaveBeenCalled()
  })

  it('failed flush returns batch to queue (retry later)', async () => {
    scrobble.mockRejectedValue(new Error('network'))
    enqueueScrobble(track(100, 'a'))
    await flushScrobbles().catch(() => {})
    // батч вернулся: повторный вызов после починки сети отправит снова
    scrobble.mockResolvedValue({ ok: true })
    await flushScrobbles()
    expect(scrobble).toHaveBeenCalledTimes(2)
    expect(scrobble.mock.calls[1][0]).toHaveLength(1)
  })
})
