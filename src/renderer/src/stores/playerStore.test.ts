import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPlayerStore, initPlayerSubscriptions, type PlayerEngine } from './playerStore'
import { useStatsStore } from './statsStore'
import { mediaUrl } from '../audio/engine'
import type { Track } from '@shared/types'

interface FakeCalls {
  play: string[]
  pause: number
  resume: number
  seek: number[]
  setVolume: number[]
  setEqGain: [number, number][]
  load: string[]
  crossfade: [string, number][]
}

function makeFakeEngine(): { engine: PlayerEngine; calls: FakeCalls; fire: (type: string) => void } {
  const calls: FakeCalls = { play: [], pause: 0, resume: 0, seek: [], setVolume: [], setEqGain: [], load: [], crossfade: [] }
  const listeners = new Map<string, Set<EventListener>>()
  const element = {
    currentTime: 0,
    addEventListener: (type: string, fn: EventListener, opts?: { signal?: AbortSignal }) => {
      let set = listeners.get(type)
      if (!set) {
        set = new Set()
        listeners.set(type, set)
      }
      set.add(fn)
      opts?.signal?.addEventListener('abort', () => set.delete(fn))
    },
  }
  const engine: PlayerEngine = {
    element: element as unknown as HTMLAudioElement,
    play: (url) => { calls.play.push(url) },
    pause: () => { calls.pause++ },
    resume: () => { calls.resume++ },
    seek: (s) => { calls.seek.push(s) },
    setVolume: (v) => { calls.setVolume.push(v) },
    setEqGain: (b, d) => { calls.setEqGain.push([b, d]) },
    load: (url) => { calls.load.push(url) },
    crossfadeTo: (url, sec) => { calls.crossfade.push([url, sec]) },
  }
  const fire = (type: string) => listeners.get(type)?.forEach((fn) => fn({ type } as unknown as Event))
  return { engine, calls, fire }
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

  it('playTracks passes http(s) stream URLs to the engine untouched (no media://)', () => {
    const vkTrack: Track = {
      ...makeTrack(9),
      id: 'vk:1',
      sourceId: 'vk',
      filePath: 'https://cs9-5v4.vkuseraudio.net/p1/abc/audio.mp3?extra=1',
    }
    store.getState().playTracks([vkTrack], 0)
    expect(calls.play[0]).toBe(vkTrack.filePath)
    expect(calls.play[0].startsWith('media://')).toBe(false)
  })

  it('stops on a rejected network play request instead of skipping through the queue', async () => {
    engine.play = () => Promise.reject(new Error('Network unavailable'))
    store = createPlayerStore(engine)
    const remote: Track = { ...TRACKS[0], id: 'soundcloud:a', sourceId: 'soundcloud', filePath: 'https://example.com/a.mp3' }
    store.getState().playTracks([remote, TRACKS[1]], 0)
    await Promise.resolve()
    expect(store.getState().pos).toBe(0)
    expect(store.getState().playing).toBe(false)
    expect(store.getState().playbackError).toContain('Не удалось загрузить запись')
  })

  it('ignores an old play rejection after the user chooses another track', async () => {
    let rejectFirst!: (error: Error) => void
    let calls = 0
    engine.play = () => ++calls === 1 ? new Promise<void>((_resolve, reject) => { rejectFirst = reject }) : Promise.resolve()
    store = createPlayerStore(engine)
    const remote: Track = { ...TRACKS[0], id: 'soundcloud:a', sourceId: 'soundcloud', filePath: 'https://example.com/a.mp3' }
    store.getState().playTracks([remote, TRACKS[1]], 0)
    store.getState().next({ manual: true })
    rejectFirst(new Error('Old stream failed'))
    await Promise.resolve()
    expect(store.getState().pos).toBe(1)
    expect(store.getState().playing).toBe(true)
    expect(store.getState().playbackError).toBeNull()
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

  it('Stop pauses, resets the current track and Play starts it again', () => {
    store.getState().playTracks(TRACKS, 1)
    store.getState().seek(42)
    store.getState().stop()
    expect(store.getState()).toMatchObject({pos:1,playing:false,currentSec:0})
    expect(calls.pause).toBe(1)
    expect(calls.seek.at(-1)).toBe(0)
    store.getState().togglePlay()
    expect(store.getState().playing).toBe(true)
    expect(calls.play).toHaveLength(2)
    expect(calls.play[1]).toBe(mediaUrl(TRACKS[1].filePath))
    expect(calls.resume).toBe(0)
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

  it('playNext inserts a new track right after the current position; playback continues', () => {
    store.getState().playTracks(TRACKS, 0)
    store.getState().playNext(makeTrack(4))
    const s = store.getState()
    expect(s.queue).toHaveLength(4)
    expect(s.order).toEqual([0, 3, 1, 2])
    expect(s.pos).toBe(0) // текущий трек не изменился
    expect(s.playing).toBe(true)
    expect(calls.play).toHaveLength(1) // без перезагрузки движка
  })

  it('playNext dedupes a track already in queue: old order entry removed, inserted at pos+1', () => {
    store.getState().playTracks(TRACKS, 0)
    store.getState().playNext(TRACKS[2]) // уже в очереди (queue index 2)
    const s = store.getState()
    expect(s.queue).toHaveLength(3) // трек не дублируется
    expect(s.order).toEqual([0, 2, 1])
    expect(s.queue[s.order[s.pos]].id).toBe('local:t1')
    expect(s.playing).toBe(true)
  })

  it('playNext dedupe of a track before the current one re-anchors pos to the same track', () => {
    store.getState().playTracks(TRACKS, 1) // играет t2, pos=1
    store.getState().playNext(TRACKS[0]) // t1 находится ДО текущей позиции
    const s = store.getState()
    expect(s.queue).toHaveLength(3)
    expect(s.order).toEqual([1, 0, 2])
    expect(s.pos).toBe(0)
    expect(s.queue[s.order[s.pos]].id).toBe('local:t2')
    expect(s.playing).toBe(true)
    expect(calls.play).toHaveLength(1)
  })

  it('playNext on the currently playing track is a no-op', () => {
    store.getState().playTracks(TRACKS, 1)
    store.getState().playNext(TRACKS[1])
    const s = store.getState()
    expect(s.order).toEqual([0, 1, 2])
    expect(s.pos).toBe(1)
  })

  it('playNext onto an empty queue preloads src without autoplay (like enqueue)', () => {
    store.getState().playNext(TRACKS[0])
    const s = store.getState()
    expect(s.queue).toHaveLength(1)
    expect(s.order).toEqual([0])
    expect(s.pos).toBe(0)
    expect(s.playing).toBe(false)
    expect(calls.load).toEqual([mediaUrl(TRACKS[0].filePath)])
    expect(calls.play).toHaveLength(0)
  })

  it('enqueue onto empty queue preloads src; togglePlay then resumes with playing=true', () => {
    store.getState().enqueue(TRACKS[0])
    const s = store.getState()
    expect(s.queue).toHaveLength(1)
    expect(s.order).toEqual([0])
    expect(s.pos).toBe(0)
    expect(s.playing).toBe(false)
    expect(calls.load).toEqual([mediaUrl(TRACKS[0].filePath)])
    expect(calls.play).toHaveLength(0) // без autoplay

    store.getState().togglePlay()
    expect(store.getState().playing).toBe(true)
    expect(calls.resume).toBe(1)
    expect(calls.play).toHaveLength(0) // resume, а не play с новым URL
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

  it('plays an upcoming queue position without changing the queue order', () => {
    store.getState().playTracks(TRACKS, 0)
    store.getState().moveInQueue(2, 1)
    store.getState().playQueuePosition(1)
    const state=store.getState()
    expect(state.order).toEqual([0,2,1])
    expect(state.pos).toBe(1)
    expect(state.queue[state.order[state.pos]].id).toBe('local:t3')
    expect(calls.play.at(-1)).toBe(mediaUrl(TRACKS[2].filePath))
    store.getState().playQueuePosition(-1)
    expect(calls.play).toHaveLength(2)
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

  it('removeFromQueue of playing track preloads the new current track; togglePlay never touches the removed URL', () => {
    store.getState().playTracks(TRACKS, 1) // играет t2
    store.getState().removeFromQueue(1) // удаляем играющий t2
    const s = store.getState()
    expect(s.playing).toBe(false)
    // новый текущий трек (t1) предзагружен, но не играет
    expect(calls.load).toEqual([mediaUrl(TRACKS[0].filePath)])
    expect(calls.play).toHaveLength(1)
    store.getState().togglePlay()
    expect(calls.resume).toBe(1)
    expect(calls.play).toHaveLength(1) // resume, без play с URL удалённого трека
    expect(store.getState().playing).toBe(true)
  })

  it('removeFromQueue emptying the queue clears the engine src', () => {
    store.getState().playTracks([TRACKS[0]], 0)
    store.getState().removeFromQueue(0)
    const s = store.getState()
    expect(s.queue).toHaveLength(0)
    expect(s.playing).toBe(false)
    expect(calls.load).toEqual([''])
    store.getState().togglePlay() // пустая очередь — no-op
    expect(calls.resume).toBe(0)
  })

  it('removeFromQueue collapses shuffle: sets shuffle=false and keeps current track', () => {
    store.getState().playTracks(TRACKS, 1)
    store.getState().toggleShuffle()
    expect(store.getState().shuffle).toBe(true)
    store.getState().removeFromQueue(1) // удаляем не-играющий (pos 0 — текущий)
    const s = store.getState()
    expect(s.shuffle).toBe(false)
    expect(s.queue).toHaveLength(2)
    expect(s.order).toEqual([0, 1])
    expect(s.queue[s.order[s.pos]].id).toBe('local:t2')
    expect(s.playing).toBe(true)
  })

  it('removeFromQueue of a track before the playing one re-anchors pos to the same track', () => {
    store.getState().playTracks(TRACKS, 2) // играет t3, pos=2
    store.getState().removeFromQueue(0) // удаляем t1 (до играющего)
    const s = store.getState()
    expect(s.queue.map((t) => t.id)).toEqual(['local:t2', 'local:t3'])
    expect(s.pos).toBe(1)
    expect(s.queue[s.order[s.pos]].id).toBe('local:t3')
    expect(s.playing).toBe(true)
    expect(calls.play).toHaveLength(1) // без перезагрузки
  })

  it('setVolume clamps to [0,1]', () => {
    store.getState().setVolume(1.5)
    expect(calls.setVolume).toEqual([1])
    expect(store.getState().volume).toBe(1)
    store.getState().setVolume(-0.2)
    expect(calls.setVolume).toEqual([1, 0])
    expect(store.getState().volume).toBe(0)
  })

  it('setEqGain ignores out-of-range band indices', () => {
    store.getState().setEqGain(10, 5)
    store.getState().setEqGain(-1, 5)
    expect(calls.setEqGain).toEqual([])
    expect(store.getState().eqGains).toEqual(new Array(10).fill(0))
  })
})

describe('initPlayerSubscriptions', () => {
  let engine: PlayerEngine
  let calls: FakeCalls
  let fire: (type: string) => void
  let store: ReturnType<typeof createPlayerStore>

  beforeEach(() => {
    ;({ engine, calls, fire } = makeFakeEngine())
    store = createPlayerStore(engine)
  })

  it('timeupdate updates currentSec', () => {
    store.getState().playTracks(TRACKS, 0)
    initPlayerSubscriptions(engine, store)
    ;(engine.element as { currentTime: number }).currentTime = 42
    fire('timeupdate')
    expect(store.getState().currentSec).toBe(42)
  })

  it('ended auto-advances to the next track', () => {
    store.getState().playTracks(TRACKS, 0)
    initPlayerSubscriptions(engine, store)
    fire('ended')
    expect(store.getState().pos).toBe(1)
    expect(calls.play).toHaveLength(2)
    expect(calls.play[1]).toBe(mediaUrl(TRACKS[1].filePath))
  })

  it('double registration fires next only once per ended event', () => {
    store.getState().playTracks(TRACKS, 0)
    initPlayerSubscriptions(engine, store)
    initPlayerSubscriptions(engine, store) // повторный вызов не должен дублировать
    fire('ended')
    expect(calls.play).toHaveLength(2) // ровно один auto-next
    expect(store.getState().pos).toBe(1)
  })

  it('returned unsubscribe detaches listeners', () => {
    store.getState().playTracks(TRACKS, 0)
    const unsub = initPlayerSubscriptions(engine, store)
    unsub()
    fire('ended')
    expect(calls.play).toHaveLength(1) // no auto-next
    expect(store.getState().pos).toBe(0)
  })

  it('error event (deleted/moved file) auto-skips to the next track', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    store.getState().playTracks(TRACKS, 0)
    initPlayerSubscriptions(engine, store)
    fire('error')
    expect(store.getState().pos).toBe(1)
    expect(store.getState().playing).toBe(true)
    expect(calls.play).toHaveLength(2)
    expect(calls.play[1]).toBe(mediaUrl(TRACKS[1].filePath))
    errSpy.mockRestore()
  })

  it('error event at the end with repeat off stops playback', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    store.getState().playTracks(TRACKS, 2)
    initPlayerSubscriptions(engine, store)
    fire('error')
    expect(store.getState().playing).toBe(false)
    expect(calls.play).toHaveLength(1) // ничего нового не загружено
    errSpy.mockRestore()
  })

  it('does not advance through online tracks when a stream fails', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const streams = TRACKS.map((track, i) => ({...track,id:`vk:${i}`,sourceId:'vk',filePath:`https://example.test/${i}.mp3`}))
    store.getState().playTracks(streams, 0)
    store.getState().cycleRepeat() // repeat all must not create an error loop
    initPlayerSubscriptions(engine, store)
    fire('error')
    expect(store.getState()).toMatchObject({pos:0,playing:false,currentSec:0})
    expect(store.getState().playbackError).toContain('Проверьте интернет')
    expect(calls.play).toHaveLength(1)
    fire('error') // late event after Stop is ignored
    expect(calls.play).toHaveLength(1)
    errSpy.mockRestore()
  })

  it('uses a local alternative while offline instead of trying another stream', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('navigator',{onLine:false})
    const remote = {...TRACKS[0],id:'vk:1',sourceId:'vk',filePath:'https://example.test/one.mp3',alternateSources:[
      {...TRACKS[1],id:'vk:2',sourceId:'vk',filePath:'https://example.test/two.mp3'}, TRACKS[2],
    ]}
    try {
      store.getState().playTracks([remote],0)
      initPlayerSubscriptions(engine,store)
      fire('error')
      expect(store.getState().queue[0].id).toBe(TRACKS[2].id)
      expect(store.getState().playing).toBe(true)
      expect(calls.play.at(-1)).toBe(mediaUrl(TRACKS[2].filePath))
    } finally {vi.unstubAllGlobals();errSpy.mockRestore()}
  })

  it('stops after two consecutive local source failures', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    store.getState().playTracks(TRACKS, 0)
    initPlayerSubscriptions(engine, store)
    fire('error')
    expect(store.getState().pos).toBe(1)
    fire('error')
    expect(store.getState()).toMatchObject({pos:1,playing:false})
    expect(calls.play).toHaveLength(2)
    errSpy.mockRestore()
  })
})

describe('crossfade', () => {
  function makeXfStore(xfSec: number): ReturnType<typeof makeFakeEngine> & { store: ReturnType<typeof createPlayerStore> } {
    const fake = makeFakeEngine()
    const store = createPlayerStore(fake.engine, () => xfSec)
    return { ...fake, store }
  }

  it('crossfadeSec=5: timeupdate at duration−5 crossfades to next track once, pos advances immediately', () => {
    const { engine, calls, fire, store } = makeXfStore(5)
    store.getState().playTracks(TRACKS, 0)
    initPlayerSubscriptions(engine, store)
    // duration не задана на фейке → fallback на track.durationSec (180)
    ;(engine.element as { currentTime: number }).currentTime = 175
    fire('timeupdate')
    expect(calls.crossfade).toEqual([[mediaUrl(TRACKS[1].filePath), 5]])
    expect(calls.play).toHaveLength(1) // play() не вызывался — только crossfadeTo
    expect(store.getState().pos).toBe(1) // UI переключается в начале кроссфейда
    fire('timeupdate') // повторный timeupdate в окне затихания — без double-trigger
    fire('timeupdate')
    expect(calls.crossfade).toHaveLength(1)
  })

  it('manual next while playing with crossfade>0 uses crossfadeTo, not play', () => {
    const { calls, store } = makeXfStore(5)
    store.getState().playTracks(TRACKS, 0)
    store.getState().next({ manual: true })
    expect(calls.crossfade).toEqual([[mediaUrl(TRACKS[1].filePath), 5]])
    expect(calls.play).toHaveLength(1)
    expect(store.getState().pos).toBe(1)
  })

  it("repeat 'one' skips crossfade entirely", () => {
    const { engine, calls, fire, store } = makeXfStore(5)
    store.getState().playTracks(TRACKS, 0)
    store.getState().cycleRepeat() // off -> all
    store.getState().cycleRepeat() // all -> one
    initPlayerSubscriptions(engine, store)
    ;(engine.element as { currentTime: number }).currentTime = 175
    fire('timeupdate')
    expect(calls.crossfade).toHaveLength(0)
    expect(store.getState().pos).toBe(0)
  })

  it('crossfadeSec=0 keeps old behavior (ended -> hard play)', () => {
    const { engine, calls, fire, store } = makeXfStore(0)
    store.getState().playTracks(TRACKS, 0)
    initPlayerSubscriptions(engine, store)
    ;(engine.element as { currentTime: number }).currentTime = 179
    fire('timeupdate')
    expect(calls.crossfade).toHaveLength(0)
    fire('ended')
    expect(calls.play).toHaveLength(2)
    expect(calls.play[1]).toBe(mediaUrl(TRACKS[1].filePath))
    expect(store.getState().pos).toBe(1)
  })
})

describe('playStats recording', () => {
  function makeXf(xfSec: number): ReturnType<typeof makeFakeEngine> & { store: ReturnType<typeof createPlayerStore> } {
    const fake = makeFakeEngine()
    const store = createPlayerStore(fake.engine, () => xfSec)
    return { ...fake, store }
  }

  beforeEach(() => {
    useStatsStore.getState().init({})
  })

  it('playTracks records a play only after audio confirms it started', () => {
    const { engine, fire, store } = makeXf(0)
    initPlayerSubscriptions(engine, store)
    store.getState().playTracks(TRACKS, 1)
    expect(useStatsStore.getState().stats['local:t2']).toBeUndefined()
    fire('playing')
    expect(useStatsStore.getState().stats['local:t2']?.count).toBe(1)
  })

  it('next/prev record plays for newly started tracks', () => {
    const { engine, fire, store } = makeXf(0)
    initPlayerSubscriptions(engine, store)
    store.getState().playTracks(TRACKS, 0)
    fire('playing')
    store.getState().next({ manual: true })
    fire('playing')
    store.getState().prev()
    fire('playing')
    const stats = useStatsStore.getState().stats
    expect(stats['local:t1']?.count).toBe(2) // playTracks + prev
    expect(stats['local:t2']?.count).toBe(1) // next
  })

  it('crossfade transition records a play too', () => {
    const { engine, fire, store } = makeXf(5)
    store.getState().playTracks(TRACKS, 0)
    initPlayerSubscriptions(engine, store)
    ;(engine.element as { currentTime: number }).currentTime = 175
    fire('timeupdate')
    fire('playing')
    expect(useStatsStore.getState().stats['local:t2']?.count).toBe(1)
  })

  it('manual next with crossfade records a play', () => {
    const { engine, fire, store } = makeXf(5)
    initPlayerSubscriptions(engine, store)
    store.getState().playTracks(TRACKS, 0)
    store.getState().next({ manual: true })
    fire('playing')
    expect(useStatsStore.getState().stats['local:t2']?.count).toBe(1)
  })
})

describe('soundcloud stream resolution', () => {
  let engine: PlayerEngine
  let calls: FakeCalls
  let store: ReturnType<typeof createPlayerStore>

  const scTrack: Track = {
    id: 'sc:1',
    sourceId: 'soundcloud',
    title: 'lofi',
    artist: 'chillhop',
    album: 'SoundCloud',
    durationSec: 180,
    filePath: 'https://api-v2.soundcloud.com/media/song/1/stream/progressive?client_id=x',
  }

  beforeEach(() => {
    ;({ engine, calls } = makeFakeEngine())
    store = createPlayerStore(engine)
  })

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window
  })

  it('resolves the transcoding URL lazily at play time, then plays the final url', async () => {
    const scResolveStream = vi.fn().mockResolvedValue('https://cf-media.sndcdn.com/final.mp3')
    ;(globalThis as Record<string, unknown>).window = { api: { scResolveStream } }
    store.getState().playTracks([scTrack], 0)
    // sync engine.play не вызывается — ждём резолв
    expect(calls.play).toHaveLength(0)
    await vi.waitFor(() => expect(calls.play).toEqual(['https://cf-media.sndcdn.com/final.mp3']))
    expect(scResolveStream).toHaveBeenCalledWith(scTrack.filePath)
  })

  it('stops on a stream resolution error without skipping the queue', async () => {
    const scResolveStream = vi.fn().mockRejectedValue(new Error('HTTP 404'))
    ;(globalThis as Record<string, unknown>).window = { api: { scResolveStream } }
    store.getState().playTracks([scTrack, makeTrack(2)], 0)
    await vi.waitFor(() => expect(store.getState().playing).toBe(false))
    expect(store.getState().pos).toBe(0)
    expect(calls.play).toEqual([])
    expect(store.getState().playbackError).toContain('Проверьте интернет')
  })

  it('does not play a stale url if the user switched track during resolution', async () => {
    let resolveIt: (url: string) => void = () => {}
    const scResolveStream = vi.fn(
      () => new Promise<string>((res) => { resolveIt = res }),
    )
    ;(globalThis as Record<string, unknown>).window = { api: { scResolveStream } }
    store.getState().playTracks([scTrack, makeTrack(2)], 0)
    store.getState().next({ manual: true }) // ушли на track2 до завершения резолва
    resolveIt('https://cf-media.sndcdn.com/late.mp3')
    await Promise.resolve()
    expect(calls.play).toEqual([mediaUrl(makeTrack(2).filePath)])
  })

  it('does not start a pending stream after Stop and resolves it again on Play', async () => {
    const pending: Array<(url: string) => void> = []
    const scResolveStream = vi.fn(() => new Promise<string>(resolve => { pending.push(resolve) }))
    ;(globalThis as Record<string, unknown>).window = { api: { scResolveStream } }
    store.getState().playTracks([scTrack], 0)
    store.getState().stop()
    pending[0]('https://cf-media.sndcdn.com/late.mp3')
    await Promise.resolve()
    expect(calls.play).toEqual([])
    store.getState().togglePlay()
    expect(scResolveStream).toHaveBeenCalledTimes(2)
    pending[1]('https://cf-media.sndcdn.com/retry.mp3')
    await vi.waitFor(() => expect(calls.play).toEqual(['https://cf-media.sndcdn.com/retry.mp3']))
  })

  it('retries resolution when Play follows Pause during a pending stream', async () => {
    const pending: Array<(url: string) => void> = []
    const scResolveStream = vi.fn(() => new Promise<string>(resolve => { pending.push(resolve) }))
    ;(globalThis as Record<string, unknown>).window = { api: { scResolveStream } }
    store.getState().playTracks([scTrack], 0)
    store.getState().togglePlay() // pause before the URL resolves
    pending[0]('https://cf-media.sndcdn.com/old.mp3')
    await Promise.resolve()
    expect(calls.play).toEqual([])
    store.getState().togglePlay()
    expect(scResolveStream).toHaveBeenCalledTimes(2)
    pending[1]('https://cf-media.sndcdn.com/new.mp3')
    await vi.waitFor(() => expect(calls.play).toEqual(['https://cf-media.sndcdn.com/new.mp3']))
  })

  it('manual next with crossfade>0 into a SC track resolves the stream before crossfadeTo', async () => {
    const scResolveStream = vi.fn().mockResolvedValue('https://cf-media.sndcdn.com/final.mp3')
    ;(globalThis as Record<string, unknown>).window = { api: { scResolveStream } }
    const xfStore = createPlayerStore(engine, () => 5)
    xfStore.getState().playTracks([makeTrack(1), scTrack], 0)
    xfStore.getState().next({ manual: true })
    // sync crossfadeTo не вызывается — ждём резолв
    expect(calls.crossfade).toHaveLength(0)
    expect(xfStore.getState().pos).toBe(1) // UI переключается сразу
    await vi.waitFor(() =>
      expect(calls.crossfade).toEqual([['https://cf-media.sndcdn.com/final.mp3', 5]]),
    )
    expect(scResolveStream).toHaveBeenCalledWith(scTrack.filePath)
  })

  it('auto crossfade into a SC track resolves the stream before crossfadeTo', async () => {
    const scResolveStream = vi.fn().mockResolvedValue('https://cf-media.sndcdn.com/final.mp3')
    ;(globalThis as Record<string, unknown>).window = { api: { scResolveStream } }
    const fake = makeFakeEngine()
    const xfStore = createPlayerStore(fake.engine, () => 5)
    xfStore.getState().playTracks([makeTrack(1), scTrack], 0)
    initPlayerSubscriptions(fake.engine, xfStore)
    ;(fake.engine.element as { currentTime: number }).currentTime = 175
    fake.fire('timeupdate')
    expect(fake.calls.crossfade).toHaveLength(0) // sync не вызывается
    await vi.waitFor(() =>
      expect(fake.calls.crossfade).toEqual([['https://cf-media.sndcdn.com/final.mp3', 5]]),
    )
  })

  it('crossfade into an unavailable SC track stops at that track', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const scResolveStream = vi.fn().mockRejectedValue(new Error('HTTP 404'))
    ;(globalThis as Record<string, unknown>).window = { api: { scResolveStream } }
    const xfStore = createPlayerStore(engine, () => 5)
    xfStore.getState().playTracks([makeTrack(1), scTrack, makeTrack(3)], 0)
    xfStore.getState().next({ manual: true })
    expect(xfStore.getState().pos).toBe(1)
    await vi.waitFor(() => expect(xfStore.getState().playing).toBe(false))
    expect(calls.play).toEqual([mediaUrl(makeTrack(1).filePath)])
    expect(xfStore.getState().pos).toBe(1)
    expect(calls.crossfade).toHaveLength(0)
    errSpy.mockRestore()
  })

  it('does not crossfade to a stale url if the user switched track during resolution', async () => {
    let resolveIt: (url: string) => void = () => {}
    const scResolveStream = vi.fn(
      () => new Promise<string>((res) => { resolveIt = res }),
    )
    ;(globalThis as Record<string, unknown>).window = { api: { scResolveStream } }
    const xfStore = createPlayerStore(engine, () => 5)
    xfStore.getState().playTracks([makeTrack(1), scTrack, makeTrack(3)], 0)
    xfStore.getState().next({ manual: true }) // кроссфейд в scTrack, резолв висит
    xfStore.getState().next({ manual: true }) // ушли на track3 до завершения резолва
    resolveIt('https://cf-media.sndcdn.com/late.mp3')
    await Promise.resolve()
    expect(calls.crossfade).toEqual([[mediaUrl(makeTrack(3).filePath), 5]]) // только track3
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

describe('direct audio offline playback', () => {
  const directTrack: Track = {
    id: 'direct:example', sourceId: 'direct', title: 'Example', artist: 'Artist',
    album: '', durationSec: 0, filePath: 'https://audio.example.com/example.mp3',
  }

  afterEach(() => { delete (globalThis as Record<string, unknown>).window })

  it('queues a direct track for automatic saving after playback starts', async () => {
    const { engine, calls } = makeFakeEngine()
    const offlineAutoQueue = vi.fn().mockResolvedValue([])
    ;(globalThis as Record<string, unknown>).window = { api: { offlineResolve: vi.fn().mockResolvedValue(null), offlineAutoQueue } }
    createPlayerStore(engine).getState().playTracks([directTrack], 0)
    await vi.waitFor(() => expect(calls.play).toEqual([directTrack.filePath]))
    expect(offlineAutoQueue).toHaveBeenCalledOnce()
    expect(offlineAutoQueue).toHaveBeenCalledWith(directTrack)
  })

  it('plays the saved file when available', async () => {
    const { engine, calls } = makeFakeEngine()
    const offlineResolve = vi.fn().mockResolvedValue('C:\\ReZon\\offline\\example.mp3')
    ;(globalThis as Record<string, unknown>).window = { api: { offlineResolve } }
    createPlayerStore(engine).getState().playTracks([directTrack], 0)
    await vi.waitFor(() => expect(calls.play).toEqual([mediaUrl('C:\\ReZon\\offline\\example.mp3')]))
    expect(offlineResolve).toHaveBeenCalledWith(directTrack.id)
  })

  it('uses the remote URL when the copy is absent or lookup fails', async () => {
    for (const outcome of [null, new Error('Index unavailable')]) {
      const { engine, calls } = makeFakeEngine()
      const offlineResolve = outcome instanceof Error ? vi.fn().mockRejectedValue(outcome) : vi.fn().mockResolvedValue(outcome)
      ;(globalThis as Record<string, unknown>).window = { api: { offlineResolve } }
      createPlayerStore(engine).getState().playTracks([directTrack], 0)
      await vi.waitFor(() => expect(calls.play).toEqual([directTrack.filePath]))
    }
  })
})

describe('alternate playback sources',()=>{
  it('tries each alternative once without losing the following queue item',()=>{
    const {engine,calls}=makeFakeEngine()
    const store=createPlayerStore(engine)
    store.getState().playTracks([{...makeTrack(1),alternateSources:[makeTrack(2),makeTrack(3)]},makeTrack(4)],0)
    expect(store.getState().retryAlternative()).toBe(true)
    expect(store.getState().queue[0].id).toBe('local:t2')
    expect(store.getState().retryAlternative()).toBe(true)
    expect(store.getState().queue[0].id).toBe('local:t3')
    expect(store.getState().retryAlternative()).toBe(false)
    expect(store.getState().queue[1].id).toBe('local:t4')
    expect(calls.play).toHaveLength(3)
  })
})

it('audio errors try an alternative, then stop if it also fails before playing',()=>{
 const {engine,fire}=makeFakeEngine();const store=createPlayerStore(engine)
 store.getState().playTracks([{...makeTrack(1),alternateSources:[makeTrack(2)]},makeTrack(3)],0)
 const unsubscribe=initPlayerSubscriptions(engine,store)
 try {fire('error');expect(store.getState().pos).toBe(0);expect(store.getState().queue[0].id).toBe('local:t2');fire('error');expect(store.getState().pos).toBe(0);expect(store.getState().playing).toBe(false)}finally{unsubscribe()}
})

it('a successful alternative resets the failure counter',()=>{
 const {engine,fire}=makeFakeEngine();const store=createPlayerStore(engine)
 store.getState().playTracks([{...makeTrack(1),alternateSources:[makeTrack(2)]},makeTrack(3)],0)
 const unsubscribe=initPlayerSubscriptions(engine,store)
 try {fire('error');fire('playing');fire('error');expect(store.getState().pos).toBe(1);expect(store.getState().playing).toBe(true)}finally{unsubscribe()}
})

it('stops after the last broken source even when repeat is enabled',()=>{
 const {engine,fire}=makeFakeEngine();const store=createPlayerStore(engine)
 store.setState({repeat:'all'});store.getState().playTracks([makeTrack(1)],0)
 const unsubscribe=initPlayerSubscriptions(engine,store)
 try{fire('error');expect(store.getState().playing).toBe(false)}finally{unsubscribe()}
})
