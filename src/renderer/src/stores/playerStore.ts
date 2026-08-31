import { create } from 'zustand'
import type { Track, RepeatMode } from '@shared/types'
import { nextIndex, prevIndex, buildShuffleOrder } from '@shared/queue'
import { AudioEngine, mediaUrl, clampVolume } from '../audio/engine'

/** Минимальный интерфейс движка для DI (в тестах подменяется фейком) */
export interface PlayerEngine {
  readonly element: HTMLAudioElement
  play: (url: string) => void
  pause: () => void
  resume: () => void
  seek: (sec: number) => void
  setVolume: (v: number) => void
  setEqGain: (band: number, db: number) => void
  load: (url: string) => void // src без воспроизведения ('' — очистить)
}

export interface PlayerState {
  queue: Track[] // текущая очередь треков
  order: number[] // позиции проигрывания (индексы queue); при shuffle — перемешаны
  pos: number // текущая позиция ВНУТРИ order
  playing: boolean
  shuffle: boolean
  repeat: RepeatMode
  currentSec: number
  volume: number // 0..1
  eqGains: number[] // 10 × dB
  playTracks: (tracks: Track[], startIndex: number) => void
  togglePlay: () => void
  next: (opts?: { manual?: boolean }) => void
  prev: () => void
  seek: (sec: number) => void
  setVolume: (v: number) => void
  setEqGain: (band: number, db: number) => void
  applyEqPreset: (gains: number[]) => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  enqueue: (track: Track) => void
  removeFromQueue: (position: number) => void // position внутри order
  moveInQueue: (fromPos: number, toPos: number) => void
}

const identityOrder = (length: number): number[] => Array.from({ length }, (_, i) => i)

export function createPlayerStore(engine: PlayerEngine) {
  const playAt = (state: Pick<PlayerState, 'queue' | 'order'>, pos: number): void => {
    engine.play(mediaUrl(state.queue[state.order[pos]].filePath))
  }

  return create<PlayerState>()((set, get) => ({
    queue: [],
    order: [],
    pos: 0,
    playing: false,
    shuffle: false,
    repeat: 'off',
    currentSec: 0,
    volume: 1,
    eqGains: new Array(10).fill(0),

    playTracks: (tracks, startIndex) => {
      if (tracks.length === 0) return
      const shuffle = get().shuffle
      const order = shuffle ? buildShuffleOrder(tracks.length, startIndex) : identityOrder(tracks.length)
      const pos = shuffle ? 0 : startIndex // при shuffle order[0] === startIndex
      set({ queue: tracks, order, pos, playing: true, currentSec: 0 })
      engine.setVolume(get().volume)
      get().eqGains.forEach((db, band) => engine.setEqGain(band, db))
      playAt(get(), pos)
    },

    togglePlay: () => {
      const { playing, queue } = get()
      if (queue.length === 0) return
      if (playing) {
        engine.pause()
        set({ playing: false })
      } else {
        engine.resume()
        set({ playing: true })
      }
    },

    next: (opts) => {
      const { order, pos, repeat, queue } = get()
      if (order.length === 0) return
      // Ручной skip всегда двигается вперёд: repeat 'one' трактуем как 'all',
      // иначе nextIndex() вернул бы ту же позицию (см. review note).
      const effectiveRepeat = opts?.manual && repeat === 'one' ? 'all' : repeat
      const nextPos = nextIndex(order, pos, order[pos], effectiveRepeat)
      if (nextPos === null) {
        engine.pause()
        set({ playing: false })
        return
      }
      set({ pos: nextPos, currentSec: 0, playing: true })
      playAt({ queue, order }, nextPos)
    },

    prev: () => {
      const { order, pos, queue } = get()
      if (order.length === 0) return
      // Spotify-поведение: если трек играет > 3 сек — перемотка в начало
      if (engine.element.currentTime > 3) {
        get().seek(0)
        return
      }
      const prevPos = prevIndex(order, pos)
      set({ pos: prevPos, currentSec: 0, playing: true })
      playAt({ queue, order }, prevPos)
    },

    seek: (sec) => {
      engine.seek(sec)
      set({ currentSec: sec })
    },

    setVolume: (v) => {
      const clamped = clampVolume(v)
      engine.setVolume(clamped)
      set({ volume: clamped })
    },

    setEqGain: (band, db) => {
      if (band < 0 || band >= get().eqGains.length) return
      engine.setEqGain(band, db)
      const eqGains = [...get().eqGains]
      eqGains[band] = db
      set({ eqGains })
    },

    applyEqPreset: (gains) => {
      gains.forEach((db, band) => engine.setEqGain(band, db))
      set({ eqGains: [...gains] })
    },

    toggleShuffle: () => {
      const { shuffle, queue, order, pos } = get()
      if (queue.length === 0) {
        set({ shuffle: !shuffle })
        return
      }
      const currentQueueIndex = order[pos]
      if (shuffle) {
        set({ shuffle: false, order: identityOrder(queue.length), pos: currentQueueIndex })
      } else {
        set({ shuffle: true, order: buildShuffleOrder(queue.length, currentQueueIndex), pos: 0 })
      }
    },

    cycleRepeat: () => {
      const nextMode: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' }
      set({ repeat: nextMode[get().repeat] })
    },

    enqueue: (track) => {
      const { queue, order } = get()
      set({ queue: [...queue, track], order: [...order, queue.length] })
    },

    // Упрощённая семантика: после удаления order перестраивается как identity
    // (shuffle-порядок теряется → shuffle сбрасывается в false),
    // pos указывает на текущий трек в новой очереди.
    // Если удалён играющий трек — воспроизведение останавливается, а src нового
    // текущего трека предзагружается через load(), чтобы togglePlay() не
    // воскресил удалённый трек (src элемента иначе остался бы старым).
    removeFromQueue: (position) => {
      const { queue, order, pos } = get()
      if (position < 0 || position >= order.length) return
      const removedQueueIndex = order[position]
      const playingQueueIndex = order[pos]
      const newQueue = queue.filter((_, i) => i !== removedQueueIndex)
      const newOrder = identityOrder(newQueue.length)
      if (removedQueueIndex === playingQueueIndex) {
        engine.pause()
        engine.load(newQueue.length > 0 ? mediaUrl(newQueue[0].filePath) : '')
        set({ queue: newQueue, order: newOrder, pos: 0, playing: false, currentSec: 0, shuffle: false })
      } else {
        const newPos = playingQueueIndex > removedQueueIndex ? playingQueueIndex - 1 : playingQueueIndex
        set({ queue: newQueue, order: newOrder, pos: newPos, shuffle: false })
      }
    },

    moveInQueue: (fromPos, toPos) => {
      const { order, pos } = get()
      if (fromPos < 0 || fromPos >= order.length || toPos < 0 || toPos >= order.length) return
      const currentQueueIndex = order[pos]
      const newOrder = [...order]
      const [moved] = newOrder.splice(fromPos, 1)
      newOrder.splice(toPos, 0, moved)
      // pos следует за играющим треком — текущий трек не меняется при drag-and-drop
      set({ order: newOrder, pos: newOrder.indexOf(currentQueueIndex) })
    },
  }))
}

// --- Синглтон с ленивым реальным движком ---
// AudioEngine создаётся только при первом обращении (AudioContext недоступен
// в тестах/до жеста пользователя), поэтому store остаётся импортируемым всегда.
let realEngine: AudioEngine | null = null
function getRealEngine(): AudioEngine {
  if (!realEngine) realEngine = new AudioEngine()
  return realEngine
}

const lazyEngine: PlayerEngine = {
  get element() {
    return getRealEngine().element
  },
  play: (url) => getRealEngine().play(url),
  pause: () => getRealEngine().pause(),
  resume: () => getRealEngine().resume(),
  seek: (sec) => getRealEngine().seek(sec),
  setVolume: (v) => getRealEngine().setVolume(v),
  setEqGain: (band, db) => getRealEngine().setEqGain(band, db),
  load: (url) => getRealEngine().load(url),
}

export const usePlayerStore = createPlayerStore(lazyEngine)

/** Движок синглтон-стора; первый вызов материализует реальный AudioEngine */
export function getPlayerEngine(): PlayerEngine {
  return getRealEngine()
}

// Текущая активная подписка — защита от двойной регистрации слушателей
let currentSubscription: (() => void) | null = null

/**
 * Подписка на события <audio>: вызывается один раз из App (поздний task).
 * Идемпотентна: повторный вызов снимает предыдущую подписку.
 * Возвращает функцию отписки.
 */
export function initPlayerSubscriptions(
  engine: PlayerEngine = getPlayerEngine(),
  store: typeof usePlayerStore = usePlayerStore,
): () => void {
  currentSubscription?.()
  const ac = new AbortController()
  const { signal } = ac
  engine.element.addEventListener(
    'timeupdate',
    () => {
      store.setState({ currentSec: engine.element.currentTime })
    },
    { signal },
  )
  engine.element.addEventListener(
    'ended',
    () => {
      store.getState().next() // auto-advance
    },
    { signal },
  )
  const unsubscribe = (): void => {
    ac.abort()
    if (currentSubscription === unsubscribe) currentSubscription = null
  }
  currentSubscription = unsubscribe
  return unsubscribe
}
