import type { Track } from './types'

export interface ScoredTrack {
  track: Track
  score: number
  reason: string
}

const WEEK_MS = 7 * 24 * 3600 * 1000

/**
 * Локальный движок рекомендаций: очки за совпадение исполнителя (+10),
 * альбома (+6), популярность из статистики прослушиваний (min(count, 10))
 * и буст свежести (+2, если трек играл за последние 7 дней).
 * Сид-трек исключается, нерелевантные треки (0 очков) не возвращаются.
 * Сортировка: score desc, при равенстве — title asc (детерминированно).
 */
export function localRecommendations(
  seed: Track,
  library: Track[],
  stats: Record<string, { count: number; lastPlayed: number }>,
  limit = 20,
): ScoredTrack[] {
  const now = Date.now()
  const scored: ScoredTrack[] = []
  for (const track of library) {
    if (track.id === seed.id) continue
    let score = 0
    let reason = ''
    if (track.artist === seed.artist) {
      score += 10
      reason = 'Тот же исполнитель'
    }
    if (track.album === seed.album) {
      score += 6
      if (!reason) reason = 'Тот же альбом'
    }
    const entry = stats[track.id]
    if (entry) {
      score += Math.min(entry.count, 10)
      if (now - entry.lastPlayed < WEEK_MS) score += 2
      if (!reason) reason = 'Часто слушаете'
    }
    if (score <= 0) continue
    scored.push({ track, score, reason })
  }
  scored.sort((a, b) => b.score - a.score || a.track.title.localeCompare(b.track.title))
  return scored.slice(0, limit)
}
