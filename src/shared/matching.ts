import type { Track } from './types'

/**
 * Трек из внешнего источника (VK, Last.fm, …) до привязки к библиотеке.
 * streamUrl — прямой URL аудиопотока (VK audio.get), extId — стабильный id
 * в источнике (для дедупликации повторных импортов).
 */
export interface ImportedTrack {
  title: string
  artist: string
  album?: string
  durationSec?: number
  streamUrl?: string
  extId?: string
}

/** Результат IPC-импорта: ошибки VK отдаются текстом, а не отказом промиса */
export type VkImportResult =
  | { ok: true; tracks: ImportedTrack[] }
  | { ok: false; error: string }

/** То же для поиска SoundCloud (sc:search) */
export type ScSearchResult =
  | { ok: true; tracks: ImportedTrack[] }
  | { ok: false; error: string }

/** Нижний регистр + пунктуация → пробел + схлопывание пробелов (общая база) */
function normalizeBase(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/** Нормализация названия: выкидываем скобки и хвосты «feat./ft./prod. …» */
export function normalizeTitle(s: string): string {
  const noBrackets = s
    .toLowerCase()
    .replace(/[([][^\])]*[\])]/g, ' ')
    .replace(/\b(?:feat|ft|prod)\b\.?.*$/i, ' ')
  return normalizeBase(noBrackets)
}

export function normalizeArtist(s: string): string {
  return normalizeBase(s)
}

function bigrams(s: string): Set<string> {
  const set = new Set<string>()
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2))
  return set
}

/** Коэффициент Дайса по биграммам нормализованных строк, 0..1 */
export function similarity(a: string, b: string): number {
  const na = normalizeBase(a)
  const nb = normalizeBase(b)
  if (na === nb) return 1 // покрывает и пустые строки
  const ba = bigrams(na)
  const bb = bigrams(nb)
  if (ba.size === 0 || bb.size === 0) return 0
  let intersection = 0
  for (const g of ba) if (bb.has(g)) intersection++
  return (2 * intersection) / (ba.size + bb.size)
}

export interface MatchResult {
  imported: ImportedTrack
  match: Track | null
  score: number
}

const ARTIST_MIN = 0.6
const TITLE_WEIGHT = 0.7
const ARTIST_WEIGHT = 0.3

/**
 * Для каждого импортированного трека ищет лучшего кандидата в библиотеке.
 * Скор доминирует по названию; кандидат с artist-схожестью < 0.6 отсекается.
 * Лучший кандидат принимается только при score >= threshold, иначе match=null.
 */
export function matchTracks(
  imported: ImportedTrack[],
  library: Track[],
  threshold = 0.75,
): MatchResult[] {
  const candidates = library.map((t) => ({
    track: t,
    title: normalizeTitle(t.title),
    artist: normalizeArtist(t.artist),
  }))
  return imported.map((imp) => {
    const impTitle = normalizeTitle(imp.title)
    const impArtist = normalizeArtist(imp.artist)
    let best: Track | null = null
    let bestScore = 0
    for (const c of candidates) {
      const artistSim = similarity(impArtist, c.artist)
      if (artistSim < ARTIST_MIN) continue
      const titleSim = similarity(impTitle, c.title)
      const score = TITLE_WEIGHT * titleSim + ARTIST_WEIGHT * artistSim
      if (score > bestScore) {
        bestScore = score
        best = c.track
      }
    }
    if (bestScore < threshold) return { imported: imp, match: null, score: bestScore }
    return { imported: imp, match: best, score: bestScore }
  })
}
