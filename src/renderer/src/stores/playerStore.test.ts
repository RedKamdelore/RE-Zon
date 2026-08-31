import { describe, it, expect, beforeEach } from 'vitest'
import { createPlayerStore, type PlayerEngine } from './playerStore'
import { mediaUrl } from '../audio/engine'
import type { Track } from '@shared/types'

interface FakeCalls {
  play: string[]
  pause: number
  resume: number
  seek: number[]
  setVolume: number[]
  setEqGain: [number, number][]
}

function makeFakeEngine(): { engine: PlayerEngine; calls: FakeCalls } {
  const calls: FakeCalls = { play: [], pause: 0, resume: 0, seek: [], setVolume: [], setEqGain: [] }
  const engine: PlayerEngine = {
    element: { currentTime: 0 } as HTMLAudioElement,
    play: (url) => { calls.play.push(url) },
    pause: () => { calls.pause++ },
    resume: () => { calls.resume++ },
    seek: (s) => { calls.seek.push(s) },
    setVolume: (v) => { calls.setVolume.push(v) },
    setEqGain: (b, d) => { calls.setEqGain.push([b, d]) },
  }
  return { engine, calls }
}

function makeTrack(n: number): Track {
  return {
    id: `local:t${n}`,
    sourceId: 'local',
    title: `Track ${n}`,
    artist: 'Artist',
    album: 'Album',
    durationSec: 180,
    filePath: `C:\\Music\\track${n}.mp3`,
  }
}

const TRACKS = [makeTrack(1), makeTrack(2), makeTrack(3)]

describe('playerStore', () => {
  let engine: PlayerEngine
  let calls: FakeCalls
  let store: ReturnType<typeof createPlayerStore>

  beforeEach(() => {
    ;({ engine, calls } = makeFakeEngine())
    store = createPlayerStore(engine)
  })

  it('playTracks sets queue, pos points at startIndex, engine.play called with media:// URL, playing=true', () => {
    store.getState().playTracks(TRACKS, 1)
    const s = store.getState()
    expect(s.queue).toEqual(TRACKS)
    expect(s.order).toEqual([0, 1, 2])
    expect(s.pos).toBe(1)
    expect(s.playing).toBe(true)
    expect(calls.play).toHaveLength(1)
    expect(calls.play[0]).toBe(mediaUrl(TRACKS[1].filePath))
    expect(calls.play[0].startsWith('media://')).toBe(true)
  })

  it('next auto at end with repeat off stops playing', () => {
    store.getState().playTracks(TRACKS, 2)
    store.getState().next()
    const s = store.getState()
    expect(s.playing).toBe(false)
    expect(calls.play).toHaveLength(1) // no new track loaded
  })

  it('next auto at end with repeat all wraps to first track', () => {
    store.getState().playTracks(TRACKS, 2)
    store.getState().cycleRepeat() // off -> all
    store.getState().next()
    const s = store.getState()
    expect(s.playing).toBe(true)
    expect(s.pos).toBe(0)
    expect(calls.play).toHaveLength(2)
    expect(calls.play[1]).toBe(mediaUrl(TRACKS[0].filePath))
  })

  it('next auto with repeat one replays the same track', () => {
    store.getState().playTracks(TRACKS, 1)
    store.getState().cycleRepeat() // off -> all
    store.getState().cycleRepeat() // all -> one
    store.getState().next()
    const s = store.getState()
    expect(s.playing).toBe(true)
    expect(s.pos).toBe(1)
    expect(calls.play).toHaveLength(2)
    expect(calls.play[1]).toBe(calls.play[0])
  })

  it('next manual with repeat one advances to the next track', () => {
    store.getState().playTracks(TRACKS, 0)
    store.getState().cycleRepeat()
    store.getState().cycleRepeat() // repeat = one
    store.getState().next({ manual: true })
    const s = store.getState()
    expect(s.pos).toBe(1)
    expect(calls.play).toHaveLength(2)
    expect(calls.play[1]).toBe(mediaUrl(TRACKS[1].filePath))
  })

  it('next manual at end with repeat off stops playing', () => {
    store.getState().playTracks(TRACKS, 2)
    store.getState().next({ manual: true })
    expect(store.getState().playing).toBe(false)
  })

  it('prev with currentTime > 3 seeks to 0 instead of switching track', () => {
    store.getState().playTracks(TRACKS, 1)
    ;(engine.element as { currentTime: number }).currentTime = 10
    store.getState().prev()
    const s = store.getState()
    expect(s.pos).toBe(1) // same track
    expect(calls.seek).toEqual([0])
    expect(calls.play).toHaveLength(1) // no reload
  })

  it('prev with currentTime <= 3 switches to previous track', () => {
    store.getState().playTracks(TRACKS, 2)
    ;(engine.element as { currentTime: number }).currentTime = 1
    store.getState().prev()
    const s = store.getState()
    expect(s.pos).toBe(1)
    expect(calls.play).toHaveLength(2)
    expect(calls.play[1]).toBe(mediaUrl(TRACKS[1].filePath))
  })

  it('toggleShuffle on/off keeps the currently-playing track, order stays a permutation', () => {
    store.getState().playTracks(TRACKS, 1)
    store.getState().toggleShuffle()
    let s = store.getState()
    expect(s.shuffle).toBe(true)
    expect([...s.order].sort()).toEqual([0, 1, 2])
    expect(s.queue[s.order[s.pos]].id).toBe('local:t2')

    store.getState().toggleShuffle()
    s = store.getState()
    expect(s.shuffle).toBe(false)
    expect(s.order).toEqual([0, 1, 2])
    expect(s.queue[s.order[s.pos]].id).toBe('local:t2')
    expect(calls.play).toHaveLength(1) // never reloaded
  })

  it('enqueue appends to queue and order', () => {
    store.getState().playTracks(TRACKS, 0)
    store.getState().enqueue(makeTrack(4))
    const s = store.getState()
    expect(s.queue).toHaveLength(4)
    expect(s.order).toEqual([0, 1, 2, 3])
  })

  it('removeFromQueue of an upcoming track shrinks queue and keeps current track', () => {
    store.getState().playTracks(TRACKS, 0)
    store.getState().removeFromQueue(2) // removes track3 (queue index 2)
    const s = store.getState()
    expect(s.queue.map((t) => t.id)).toEqual(['local:t1', 'local:t2'])
    expect(s.order).toEqual([0, 1])
    expect(s.queue[s.order[s.pos]].id).toBe('local:t1')
    expect(s.playing).toBe(true)
  })

  it('removeFromQueue of the playing track stops playback', () => {
    store.getState().playTracks(TRACKS, 1)
    store.getState().removeFromQueue(1) // position 1 in order = currently playing
    const s = store.getState()
    expect(s.queue).toHaveLength(2)
    expect(s.playing).toBe(false)
    expect(calls.pause).toBeGreaterThan(0)
  })

  it('moveInQueue reorders positions, current track unchanged', () => {
    store.getState().playTracks(TRACKS, 0)
    store.getState().moveInQueue(2, 0)
    const s = store.getState()
    expect(s.order).toEqual([2, 0, 1])
    expect(s.queue[s.order[s.pos]].id).toBe('local:t1')
  })

  it('setVolume calls engine and updates state', () => {
    store.getState().setVolume(0.5)
    expect(calls.setVolume).toEqual([0.5])
    expect(store.getState().volume).toBe(0.5)
  })

  it('setEqGain and applyEqPreset call engine and update state', () => {
    store.getState().setEqGain(3, 6)
    expect(calls.setEqGain).toEqual([[3, 6]])
    expect(store.getState().eqGains[3]).toBe(6)

    const preset = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    store.getState().applyEqPreset(preset)
    expect(store.getState().eqGains).toEqual(preset)
    expect(calls.setEqGain.slice(-10)).toEqual(preset.map((db, band) => [band, db]))
  })

  it('togglePlay pauses and resumes', () => {
    store.getState().playTracks(TRACKS, 0)
    store.getState().togglePlay()
    expect(store.getState().playing).toBe(false)
    expect(calls.pause).toBe(1)
    store.getState().togglePlay()
    expect(store.getState().playing).toBe(true)
    expect(calls.resume).toBe(1)
  })
})

describe('mediaUrl', () => {
  it('matches Node Buffer base64url encoding for a Cyrillic path', () => {
    const p = 'C:\\Music\\Русский\\Трек — пёсня 🎵.mp3'
    const expected = `media://${Buffer.from(p, 'utf-8').toString('base64url')}`
    expect(mediaUrl(p)).toBe(expected)
  })

  it('matches Buffer for an ASCII path', () => {
    const p = 'C:\\Music\\track 1 (live).flac'
    expect(mediaUrl(p)).toBe(`media://${Buffer.from(p, 'utf-8').toString('base64url')}`)
  })
})
