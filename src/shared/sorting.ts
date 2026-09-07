import type { Track } from './types'

export type SortKey = 'title' | 'artist' | 'album' | 'durationSec'
export type SortDir = 'asc' | 'desc'

/**
 * Сравнение строк: localeCompare с базовой нормализацией (регистр/борды),
 * пустые строки уходят в конец независимо от направления.
 */
function cmpStr(a: string, b: string): number {
  const na = a.trim().toLowerCase()
  const nb = b.trim().toLowerCase()
  if (na === '' && nb !== '') return 1
  if (nb === '' && na !== '') return -1
  return na.localeCompare(nb, 'ru')
}

/** Компаратор треков по ключу (asc). desc = инверсия. */
export function compareTracks(key: SortKey, dir: SortDir): (a: Track, b: Track) => number {
  const sign = dir === 'asc' ? 1 : -1
  return (a, b) => {
    if (key === 'durationSec') return (a.durationSec - b.durationSec) * sign
    const r = cmpStr(a[key], b[key])
    // пустые значения не инвертируем (они всегда внизу)
    if ((a[key].trim() === '' || b[key].trim() === '') && r !== 0) return r
    return r * sign
  }
}

/** Сортировка списка (новый массив). Сохраняет относительный порядок равных. */
export function sortTracks(tracks: Track[], key: SortKey, dir: SortDir): Track[] {
  return [...tracks].sort(compareTracks(key, dir))
}

/** Следующее направление сортировки: asc → desc → сброс (null) */
export function nextSortDir(current: { key: SortKey; dir: SortDir } | null, key: SortKey): { key: SortKey; dir: SortDir } | null {
  if (current === null || current.key !== key) return { key, dir: 'asc' }
  if (current.dir === 'asc') return { key, dir: 'desc' }
  return null // третий клик — исходный порядок
}
