import { describe, it, expect } from 'vitest'
import { sortTracks, nextSortDir, compareTracks, type SortKey, type SortDir } from './sorting'
import type { Track } from './types'

function track(title: string, artist: string, album: string, durationSec: number, id = title): Track {
  return { id, sourceId: 'local', title, artist, album, durationSec, filePath: `C:\\${id}.mp3` }
}

const TRACKS = [
  track('Владивосток 2000', 'Мумий Тролль', 'Морская', 243),
  track('Song', 'Artist B', 'Album Z', 100),
  track('song', 'artist a', 'album a', 300),
  track('Группа крови', 'Кино', 'Группа крови', 283),
]

describe('sortTracks', () => {
  it('sorts by title asc case-insensitively, cyrillic locale-aware', () => {
    const r = sortTracks(TRACKS, 'title', 'asc')
    // ru-локаль: кириллица перед латиницей; регистр не влияет
    expect(r.map((t) => t.title)).toEqual(['Владивосток 2000', 'Группа крови', 'Song', 'song'])
  })

  it('sorts by title desc (equal keys keep source order — stable sort)', () => {
    const desc = sortTracks(TRACKS, 'title', 'desc').map((t) => t.title)
    // кириллица в ru-локали перед латиницей → в desc латиница сверху;
    // «Song»/«song» равны (регистр игнорируется) → исходный порядок сохранён
    expect(desc).toEqual(['Song', 'song', 'Группа крови', 'Владивосток 2000'])
  })

  it('sorts by artist asc (cyrillic before latin in ru locale)', () => {
    const r = sortTracks(TRACKS, 'artist', 'asc')
    expect(r.map((t) => t.artist)).toEqual(['Кино', 'Мумий Тролль', 'artist a', 'Artist B'])
  })

  it('sorts by album asc', () => {
    const r = sortTracks(TRACKS, 'album', 'asc')
    expect(r.map((t) => t.album)).toEqual(['Группа крови', 'Морская', 'album a', 'Album Z'])
  })

  it('sorts by duration asc and desc (numeric)', () => {
    expect(sortTracks(TRACKS, 'durationSec', 'asc').map((t) => t.durationSec)).toEqual([100, 243, 283, 300])
    expect(sortTracks(TRACKS, 'durationSec', 'desc').map((t) => t.durationSec)).toEqual([300, 283, 243, 100])
  })

  it('returns a new array (input untouched)', () => {
    const input = [...TRACKS]
    sortTracks(input, 'title', 'desc')
    expect(input).toEqual(TRACKS)
  })

  it('keeps stable order for equal keys', () => {
    const same = [track('B', 'X', 'Al', 1, '1'), track('A', 'X', 'Al', 1, '2'), track('C', 'X', 'Al', 1, '3')]
    const r = sortTracks(same, 'title', 'asc')
    expect(r.map((t) => t.id)).toEqual(['2', '1', '3'])
  })
})

describe('empty values always sink', () => {
  it('empty album goes last even in asc', () => {
    const withEmpty = [...TRACKS, track('Empty', 'E', '', 10)]
    const r = sortTracks(withEmpty, 'album', 'asc')
    expect(r[r.length - 1].title).toBe('Empty')
  })

  it('empty album goes last even in desc', () => {
    const withEmpty = [...TRACKS, track('Empty', 'E', '', 10)]
    const r = sortTracks(withEmpty, 'album', 'desc')
    expect(r[r.length - 1].title).toBe('Empty')
  })
})

describe('nextSortDir', () => {
  it('null → asc on new key', () => {
    expect(nextSortDir(null, 'title')).toEqual({ key: 'title', dir: 'asc' })
  })

  it('asc → desc on same key', () => {
    expect(nextSortDir({ key: 'title', dir: 'asc' }, 'title')).toEqual({ key: 'title', dir: 'desc' })
  })

  it('desc → null (reset) on same key', () => {
    expect(nextSortDir({ key: 'title', dir: 'desc' }, 'title')).toBeNull()
  })

  it('clicking another key restarts from asc', () => {
    expect(nextSortDir({ key: 'title', dir: 'desc' }, 'album')).toEqual({ key: 'album', dir: 'asc' })
  })
})

describe('compareTracks direct', () => {
  it('is usable as Array.sort comparator', () => {
    const r = [...TRACKS].sort(compareTracks('durationSec' as SortKey, 'desc' as SortDir))
    expect(r[0].durationSec).toBe(300)
  })
})
