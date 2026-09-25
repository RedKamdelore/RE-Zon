import type { Track } from '@shared/types'
import { useConnectionsStore } from './stores/connectionsStore'

/**
 * Скробблинг Last.fm (V3-4c). Трек скробблится, когда проиграно ≥50%
 * длительности ИЛИ 4 минуты (правило Last.fm «полтрека или 4 минуты»).
 * Очередь накапливает ожидающие скробблы и отправляет батчами:
 * при добавлении N-го (FLUSH_AT) и при паузе/закрытии (flushSoon).
 * Не-Last.fm-подключение → очередь копится в памяти и улетает при
 * следующем подключении после старта приложения.
 */

/** Трек считается прослушанным после этой доли длительности */
export const SCROBBLE_FRACTION = 0.5
/** …или раньше, если длительность велика (4 мин — максимум ожидания) */
export const SCROBBLE_AFTER_SEC = 240

/** Готов ли трек к скробблу при текущей позиции (sec) */
export function isScrobblable(track: Track, sec: number): boolean {
  const threshold = Math.min(track.durationSec * SCROBBLE_FRACTION, SCROBBLE_AFTER_SEC)
  return sec >= threshold && sec > 3 // защита от мгновенного скипа
}

interface PendingScrobble {
  artist: string
  track: string
  album?: string
  /** unix-время, когда трек ЗАКОНЧИЛ играть (для Last.fm history) */
  timestamp: number
}

const queue: PendingScrobble[] = []
const FLUSH_AT = 10

let scrobbledThisPlay = new Set<string>() // трек-в-очереди не дублируем

/** Сброс внутреннего состояния — для тестов */
export function resetScrobblerState(): void {
  queue.length = 0
  scrobbledThisPlay = new Set()
}

/** Добавить прослушанный трек в очередь скробблинга (id-дедуп до flush) */
export function enqueueScrobble(track: Track, endedAtMs = Date.now()): void {
  if (scrobbledThisPlay.has(track.id)) return
  scrobbledThisPlay.add(track.id)
  queue.push({
    artist: track.artist,
    track: track.title,
    album: track.album === 'Неизвестный альбом' ? undefined : track.album,
    timestamp: Math.floor(endedAtMs / 1000),
  })
  if (queue.length >= FLUSH_AT) void flushScrobbles()
}

/** Отправить накопленные скробблы в Last.fm (через main-IPC) */
export async function flushScrobbles(): Promise<void> {
  if (queue.length === 0) return
  if (typeof window === 'undefined' || !window.api) return
  const lastfmConnected = useConnectionsStore.getState().statuses.lastfm?.connected
  if (!lastfmConnected) return // копим в памяти до подключения
  const batch = queue.splice(0, 50)
  try {
    const res = await window.api.lastfmScrobble(batch)
    if (!res.ok) throw new Error(res.error || 'Last.fm: ошибка отправки')
  } catch (e) {
    console.error('scrobble failed:', e)
    // сеть упала — вернём батч в голову очереди, отправим со следующим
    queue.unshift(...batch)
  }
}

/** Пауза/сворачивание — флашим вскоре (не блокируем UI) */
let flushTimer: ReturnType<typeof setTimeout> | null = null
export function flushSoon(): void {
  if (flushTimer !== null) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushScrobbles()
  }, 2000)
}
