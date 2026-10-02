import { create } from 'zustand'
import type { Track, RepeatMode } from '@shared/types'
import { nextIndex, prevIndex, buildShuffleOrder } from '@shared/queue'
import { AudioEngine, resolveTrackUrl, clampVolume } from '../audio/engine'
import { useSettingsStore } from './settingsStore'
import { recordPlay } from './statsStore'
import { isScrobblable, flushSoon, enqueueScrobble } from '../scrobbler'

/** Минимальный интерфейс движка для DI (в тестах подменяется фейком) */
export interface PlayerEngine {
  readonly element: HTMLAudioElement
  play: (url: string) => void | Promise<void>
  pause: () => void
  resume: () => void | Promise<void>
  seek: (sec: number) => void
  setVolume: (v: number) => void
  setEqGain: (band: number, db: number) => void
  getLevel?: () => number
  load: (url: string) => void // src без воспроизведения ('' — очистить)
  crossfadeTo?: (url: string, durationSec: number) => void | Promise<void> // двухдековый движок; вызовы защищены проверкой
  elements?: HTMLAudioElement[] // элементы всех дек (подписки); по умолчанию [element]
}

export interface PlayerState {
  queue: Track[] // текущая очередь треков
  order: number[] // позиции проигрывания (индексы queue); при shuffle — перемешаны
  pos: number // текущая позиция ВНУТРИ order
  playing: boolean
  playbackError: string | null
  shuffle: boolean
  repeat: RepeatMode
  currentSec: number
  volume: number // 0..1
  eqGains: number[] // 10 × dB
  playTracks: (tracks: Track[], startIndex: number) => void
  togglePlay: () => void
  stop: () => void
  next: (opts?: { manual?: boolean; failed?: boolean }) => void
  prev: () => void
  seek: (sec: number) => void
  setVolume: (v: number) => void
  setEqGain: (band: number, db: number) => void
  applyEqPreset: (gains: number[]) => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  enqueue: (track: Track) => void
  playNext: (track: Track) => void // вставка сразу после текущей позиции в order
  removeFromQueue: (position: number) => void // position внутри order
  moveInQueue: (fromPos: number, toPos: number) => void
  playQueuePosition: (position: number) => void
  /** Внутренний триггер автокроссфейда — вызывается из timeupdate-подписки */
  retryAlternative: () => boolean
  failCurrent: () => void
  markPlaybackStarted: () => void
  maybeStartCrossfade: () => void
}

const identityOrder = (length: number): number[] => Array.from({ length }, (_, i) => i)
const isNetworkTrack = (track: Track): boolean => /^https?:\/\//i.test(track.filePath) || !['local', 'demo'].includes(track.sourceId)

/**
 * getCrossfadeSec инжектируется (тесты передают своё значение);
 * по умолчанию читает настройку playback.crossfadeSec из settingsStore.
 */
export function createPlayerStore(
  engine: PlayerEngine,
  getCrossfadeSec: () => number = () => useSettingsStore.getState().playback.crossfadeSec,
) {
  // Флаг «кроссфейд для текущего трека уже запущен» — защита от повторного
  // срабатывания на каждый timeupdate в окне затихания. Перевзводится на
  // playTracks/next/prev и при выходе из окна конца трека (новый трек, seek назад).
  let crossfadeDone = false
  let startRevision = 0
  let consecutiveFailures = 0
  let stopped = false
  let resolving = false
  let pendingPlayId: string | null = null
  return create<PlayerState>()((set, get) => {
  /**
   * SoundCloud: filePath — transcoding API URL (отдаёт JSON {url}), финальный
   * mp3 резолвим лениво при старте. Общая точка для play/crossfade-путей:
   * onReady вызывается с финальным URL (для локальных/VK — синхронно),
   * onFail — только при ошибке SC-резолва.
   */
  const resolvePlayableUrl = (
    track: Track,
    onReady: (url: string) => void,
    onFail: (e: unknown) => void,
  ): void => {
    if (track.sourceId === 'direct' && typeof window !== 'undefined' && typeof window.api?.offlineResolve === 'function') {
      window.api.offlineResolve(track.id).then(
        path => onReady(resolveTrackUrl(path ? { ...track, filePath: path } : track)),
        () => onReady(resolveTrackUrl(track)),
      )
      return
    }
    if (
      track.sourceId === 'soundcloud' &&
      typeof window !== 'undefined' &&
      typeof window.api?.scResolveStream === 'function'
    ) {
      window.api.scResolveStream(track.filePath).then(onReady, onFail)
    } else {
      onReady(resolveTrackUrl(track))
    }
  }

  const saveDirectAfterPlay = (track: Track): void => {
    if (track.sourceId === 'direct' && typeof window !== 'undefined') {
      void window.api?.offlineAutoQueue?.(track).catch(error => console.warn('Automatic offline save failed:', error))
    }
  }

  const loadTrack = (track: Track | undefined): void => {
    if (!track) { engine.load(''); return }
    resolvePlayableUrl(track,url => {
      const current = get().queue[get().order[get().pos]]
      if (current?.id === track.id) engine.load(url)
    },() => engine.load(''))
  }

  const watchStart = (result: void | Promise<void>, revision: number, trackId: string): void => {
    if (!result || typeof result.then !== 'function') return
    void result.catch(error => {
      if (error instanceof Error && error.name === 'AbortError') return
      const current = get().queue[get().order[get().pos]]
      if (revision === startRevision && get().playing && current?.id === trackId) get().failCurrent()
    })
  }

  const playAt = (state: Pick<PlayerState, 'queue' | 'order' | 'next'>, pos: number): void => {
    const track = state.queue[state.order[pos]]
    const revision = ++startRevision
    resolving = true
    resolvePlayableUrl(
      track,
      (url) => {
        // За время резолва пользователь мог переключить трек — не переигрываем
        const current = get().queue[get().order[get().pos]]
        if (revision === startRevision) resolving = false
        if (revision === startRevision && get().playing && current?.id === track.id) { pendingPlayId = track.id; watchStart(engine.play(url), revision, track.id); saveDirectAfterPlay(track) }
      },
      (e) => {
        console.error('soundcloud resolve failed:', e)
        const current = get().queue[get().order[get().pos]]
        if (revision === startRevision) resolving = false
        if (revision === startRevision && get().playing && current?.id === track.id) get().failCurrent()
      },
    )
    // The playing event confirms the audio actually started before statistics are recorded.
  }

  // Кроссфейд: URL резолвится так же, как в playAt (SoundCloud — финальный mp3,
  // а не transcoding JSON URL, иначе движок получил бы JSON и error-skipнул трек).
  // pos уже переключён на трек; стейл-проверка и ошибка-резолва общие с playAt.
  const crossfadeToTrack = (track: Track, xfSec: number): void => {
    if (!engine.crossfadeTo) return
    const revision = ++startRevision
    resolving = true
    resolvePlayableUrl(
      track,
      (url) => {
        // За время резолва пользователь мог переключить трек — не переигрываем
        const current = get().queue[get().order[get().pos]]
        if (revision === startRevision) resolving = false
        if (revision !== startRevision || !get().playing || current?.id !== track.id) return
        pendingPlayId = track.id
        watchStart(engine.crossfadeTo?.(url, xfSec), revision, track.id)
        saveDirectAfterPlay(track)
      },
      (e) => {
        console.error('soundcloud resolve failed:', e)
        const current = get().queue[get().order[get().pos]]
        if (revision === startRevision) resolving = false
        if (revision === startRevision && get().playing && current?.id === track.id) get().failCurrent()
      },
    )
  }

  return {
    retryAlternative: () => {
      const state=get(), index=state.order[state.pos], current=state.queue[index]
      const alternatives=current?.alternateSources ?? []
      if(!alternatives.length)return false
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      const alternativeIndex = offline ? alternatives.findIndex(track => !isNetworkTrack(track)) : 0
      if (alternativeIndex < 0) return false
      const next = alternatives[alternativeIndex]
      const remaining = alternatives.filter((_, i) => i !== alternativeIndex)
      const queue=state.queue.map((t,i)=>i===index?{...next,alternateSources:remaining}:t)
      stopped = false
      set({queue,currentSec:0,playing:true,playbackError:null})
      playAt(get(),state.pos)
      return true
    },
    failCurrent: () => {
      const state = get()
      if (!state.playing || !state.order.length) return
      const track = state.queue[state.order[state.pos]]
      if (!track) return
      consecutiveFailures++
      if (consecutiveFailures < 2 && state.retryAlternative()) return
      if (isNetworkTrack(track) || consecutiveFailures >= 2) {
        state.stop()
        set({playbackError: isNetworkTrack(track)
          ? 'Не удалось загрузить запись. Проверьте интернет и нажмите «Слушать», чтобы повторить.'
          : 'Не удалось воспроизвести записи. Проверьте файлы и попробуйте снова.'})
        return
      }
      state.next({failed:true})
      if (!get().playing) {
        get().stop()
        set({playbackError:'Не удалось воспроизвести запись. Проверьте файл и попробуйте снова.'})
      }
    },
    markPlaybackStarted: () => {
      if (!get().playing) return
      consecutiveFailures = 0
      const track=get().queue[get().order[get().pos]]
      if (track && pendingPlayId === track.id) {
        pendingPlayId = null
        recordPlay(track.id)
      }
    },
    queue: [],
    order: [],
    pos: 0,
    playing: false,
    playbackError: null,
    shuffle: false,
    repeat: 'off',
    currentSec: 0,
    volume: 1,
    eqGains: new Array(10).fill(0),

    playTracks: (tracks, startIndex) => {
      if (tracks.length === 0) return
      crossfadeDone = false
      consecutiveFailures = 0
      stopped = false
      const shuffle = get().shuffle
      const order = shuffle ? buildShuffleOrder(tracks.length, startIndex) : identityOrder(tracks.length)
      const pos = shuffle ? 0 : startIndex // при shuffle order[0] === startIndex
      set({ queue: tracks, order, pos, playing: true, currentSec: 0, playbackError: null })
      engine.setVolume(get().volume)
      get().eqGains.forEach((db, band) => engine.setEqGain(band, db))
      playAt(get(), pos)
    },

    togglePlay: () => {
      const { playing, queue } = get()
      if (queue.length === 0) return
      if (playing) {
        if (resolving) { ++startRevision; resolving = false; stopped = true }
        engine.pause()
        set({ playing: false })
        flushSoon() // пауза — отправляем накопленные скробблы (V3-4c)
      } else {
        set({ playing: true, playbackError: null })
        if (stopped) {
          stopped = false
          consecutiveFailures = 0
          playAt(get(), get().pos)
        } else {
          const revision = startRevision
          const current = get().queue[get().order[get().pos]]
          watchStart(engine.resume(), revision, current?.id ?? '')
        }
      }
    },

    stop: () => {
      if (!get().order.length) return
      ++startRevision // ignore a stream URL that resolves after Stop
      resolving = false
      crossfadeDone = false
      stopped = true
      pendingPlayId = null
      engine.pause()
      try { engine.seek(0) } catch { /* A source may fail before it can seek. */ }
      set({playing:false,currentSec:0,playbackError:null})
      flushSoon()
    },

    next: (opts) => {
      const { order, pos, repeat, queue } = get()
      if (order.length === 0) return
      crossfadeDone = false
      if (!opts?.failed) consecutiveFailures = 0
      stopped = false
      // Ручной skip всегда двигается вперёд: repeat 'one' трактуем как 'all',
      // иначе nextIndex() вернул бы ту же позицию (см. review note).
      const effectiveRepeat = opts?.failed ? 'off' : opts?.manual && repeat === 'one' ? 'all' : repeat
      const nextPos = nextIndex(order, pos, order[pos], effectiveRepeat)
      if (nextPos === null) {
        engine.pause()
        set({ playing: false })
        return
      }
      // Ручной skip на ходу с кроссфейдером — плавный переход вместо жёсткого play
      const xfSec = opts?.manual && get().playing ? getCrossfadeSec() : 0
      set({ pos: nextPos, currentSec: 0, playing: true, playbackError: null })
      if (xfSec > 0 && engine.crossfadeTo) {
        crossfadeToTrack(queue[order[nextPos]], xfSec)
        return
      }
      playAt({ queue, order, next: get().next }, nextPos)
    },

    prev: () => {
      const { order, pos, queue } = get()
      if (order.length === 0) return
      crossfadeDone = false // prev — всегда жёсткое переключение
      consecutiveFailures = 0
      stopped = false
      // Spotify-поведение: если трек играет > 3 сек — перемотка в начало
      if (engine.element.currentTime > 3) {
        get().seek(0)
        return
      }
      const prevPos = prevIndex(order, pos)
      set({ pos: prevPos, currentSec: 0, playing: true, playbackError: null })
      playAt({ queue, order, next: get().next }, prevPos)
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
      if (queue.length === 0) {
        // Очередь была пуста: предзагружаем src (без autoplay), иначе
        // togglePlay() делал бы resume на пустом элементе — Play «играл» тишину
        loadTrack(track)
        set({ pos: 0, currentSec: 0 })
      }
    },

    // «Играть следующим»: трек встаёт в order сразу после текущей позиции.
    // Трек, уже присутствующий в очереди (по id), не дублируется — его старый
    // слот в order удаляется, pos переякоривается на играющий трек.
    // Воспроизведение не прерывается (движок не трогаем). Пустая очередь —
    // семантика enqueue (предзагрузка без autoplay).
    playNext: (track) => {
      const { queue, order, pos } = get()
      if (order.length === 0) {
        get().enqueue(track)
        return
      }
      const currentQueueIndex = order[pos]
      let newQueue = queue
      let newOrder = order
      let queueIndex = queue.findIndex((t) => t.id === track.id)
      if (queueIndex === currentQueueIndex) return // трек уже играет — no-op
      if (queueIndex >= 0) {
        const entryPos = newOrder.indexOf(queueIndex)
        if (entryPos >= 0) newOrder = [...newOrder.slice(0, entryPos), ...newOrder.slice(entryPos + 1)]
      } else {
        queueIndex = queue.length
        newQueue = [...queue, track]
      }
      const newPos = newOrder.indexOf(currentQueueIndex)
      newOrder = [...newOrder.slice(0, newPos + 1), queueIndex, ...newOrder.slice(newPos + 1)]
      set({ queue: newQueue, order: newOrder, pos: newPos })
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
        set({ queue: newQueue, order: newOrder, pos: 0, playing: false, currentSec: 0, shuffle: false })
        loadTrack(newQueue[0])
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

    playQueuePosition: (position) => {
      const { order } = get()
      if (!Number.isInteger(position) || position < 0 || position >= order.length) return
      crossfadeDone = false
      consecutiveFailures = 0
      stopped = false
      engine.pause()
      set({ pos: position, currentSec: 0, playing: true, playbackError: null })
      playAt(get(), position)
    },

    // Автокроссфейд: за crossfadeSec до конца трека запускает equal-power переход
    // на следующий (auto-next семантика nextIndex), pos переключается сразу —
    // UI показывает новый трек с начала затихания. repeat 'one' и crossfadeSec=0
    // не меняют старое поведение (auto-next по событию ended).
    maybeStartCrossfade: () => {
      const xfSec = getCrossfadeSec()
      if (xfSec <= 0 || !engine.crossfadeTo) return
      const { queue, order, pos, repeat, playing } = get()
      if (!playing || order.length === 0 || repeat === 'one') return
      const el = engine.element
      const track = queue[order[pos]]
      const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : track.durationSec
      const remaining = duration - el.currentTime
      if (remaining > xfSec) {
        crossfadeDone = false // вне окна конца трека — перевзводим (новый трек / seek назад)
        return
      }
      if (remaining <= 0 || crossfadeDone) return
      const nextPos = nextIndex(order, pos, order[pos], repeat)
      if (nextPos === null) return // конец очереди при repeat off — доигрываем до ended
      crossfadeDone = true
      set({ pos: nextPos, currentSec: 0, playing: true })
      crossfadeToTrack(queue[order[nextPos]], xfSec)
    },
  }
  })
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
  get elements() {
    return getRealEngine().elements
  },
  play: (url) => getRealEngine().play(url),
  pause: () => getRealEngine().pause(),
  resume: () => getRealEngine().resume(),
  seek: (sec) => getRealEngine().seek(sec),
  setVolume: (v) => getRealEngine().setVolume(v),
  setEqGain: (band, db) => getRealEngine().setEqGain(band, db),
  getLevel: () => getRealEngine().getLevel(),
  load: (url) => getRealEngine().load(url),
  crossfadeTo: (url, sec) => getRealEngine().crossfadeTo(url, sec),
}

export const usePlayerStore = createPlayerStore(lazyEngine)

/** Движок синглтон-стора; первый вызов материализует реальный AudioEngine */
export function getPlayerEngine(): PlayerEngine {
  return getRealEngine()
}

// Текущая активная подписка — защита от двойной регистрации слушателей
let currentSubscription: (() => void) | null = null

/** Обёртка для подписок: скроббл без throw (очередь не должна ронять плеер) */
const enqueueScrobbleQuiet = (track: Track): void => {
  try {
    enqueueScrobble(track)
  } catch {
    // очередь скробблинга не должна ломать воспроизведение
  }
}

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
  // Двухдековый движок: подписываемся на обе деки, но события неактивной
  // (затихающей при кроссфейде) игнорируем — иначе её ended вызвал бы лишний
  // auto-next, а timeupdate дёргал бы currentSec. У фейков/однодековых движков
  // elements отсутствует — одна подписка, а события без target не фильтруются.
  const elements = engine.elements ?? [engine.element]
  const fromActiveDeck = (e: Event): boolean => !e.target || e.target === engine.element
  for (const el of elements) {
    el.addEventListener('playing', (e) => {
      if (fromActiveDeck(e)) store.getState().markPlaybackStarted()
    }, { signal })
    el.addEventListener(
      'timeupdate',
      (e) => {
        if (!fromActiveDeck(e)) return
        store.setState({ currentSec: engine.element.currentTime })
        store.getState().maybeStartCrossfade()
        // Скробблинг (V3-4c): трек дослушан до порога Last.fm — в очередь
        const s = store.getState()
        if (s.order.length > 0) {
          const current = s.queue[s.order[s.pos]]
          if (current && isScrobblable(current, engine.element.currentTime)) {
            enqueueScrobbleQuiet(current)
          }
        }
      },
      { signal },
    )
    el.addEventListener(
      'ended',
      (e) => {
        if (!fromActiveDeck(e)) return
        // ended = трек точно дослушан — тоже кандидат в скроббл (если timeupdate
        // не успел; напр. короткий трек)
        const s = store.getState()
        if (s.order.length > 0) {
          const current = s.queue[s.order[s.pos]]
          if (current && isScrobblable(current, engine.element.duration || current.durationSec)) {
            enqueueScrobbleQuiet(current)
          }
        }
        store.getState().next() // auto-advance
      },
      { signal },
    )
    el.addEventListener(
      'error',
      (e) => {
        if (!fromActiveDeck(e)) return
        // Сетевая ошибка не должна промотать всю очередь. Локальный файл можно
        // пропустить один раз, но цепочка ошибок останавливает воспроизведение.
        console.error('audio source failed')
        store.getState().failCurrent()
      },
      { signal },
    )
  }
  const unsubscribe = (): void => {
    ac.abort()
    if (currentSubscription === unsubscribe) currentSubscription = null
  }
  currentSubscription = unsubscribe
  return unsubscribe
}
