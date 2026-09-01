import { describe, it, expect } from 'vitest'
import { normalizeTitle, normalizeArtist, similarity, matchTracks, type ImportedTrack } from './matching'
import type { Track } from './types'

function libTrack(title: string, artist: string, id = `local:${title}`): Track {
  return { id, sourceId: 'local', title, artist, album: 'Album', durationSec: 200, filePath: `C:\\Music\\${id}.mp3` }
}

describe('normalizeTitle', () => {
  it('lowercases, strips feat/ft/prod segments and brackets', () => {
    expect(normalizeTitle('Song (feat. X) [Remix]')).toBe('song')
    expect(normalizeTitle('Song ft. Someone')).toBe('song')
    expect(normalizeTitle('Track (prod. by Y)')).toBe('track')
  })

  it('strips punctuation and collapses whitespace', () => {
    expect(normalizeTitle('  Rock’n’Roll!!  ')).toBe('rock n roll')
    expect(normalizeTitle('A   B — C')).toBe('a b c')
  })

  it('keeps Cyrillic', () => {
    expect(normalizeTitle('Владивосток 2000')).toBe('владивосток 2000')
    expect(normalizeTitle('Кино — Группа крови')).toBe('кино группа крови')
  })
})

describe('normalizeArtist', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeArtist('  Мумий Тролль ')).toBe('мумий тролль')
    expect(normalizeArtist('Daft   Punk')).toBe('daft punk')
  })
})

describe('similarity', () => {
  it('returns 1 for identical strings', () => {
    expect(similarity('владивосток 2000', 'владивосток 2000')).toBe(1)
    expect(similarity('', '')).toBe(1)
  })

  it('returns low values for unrelated strings', () => {
    expect(similarity('aaaa bbbb', 'zzzz yyyy')).toBeLessThan(0.2)
  })

  it('is case/punctuation-insensitive and symmetric', () => {
    const s1 = similarity('Владивосток 2000', 'владивосток 2000')
    const s2 = similarity('владивосток 2000', 'Владивосток 2000')
    expect(s1).toBe(1)
    expect(s2).toBe(1)
    const a = similarity('song one', 'song two')
    const b = similarity('song two', 'song one')
    expect(a).toBeCloseTo(b, 10)
  })
})

describe('matchTracks', () => {
  const library = [
    libTrack('Владивосток 2000', 'Мумий Тролль', 'local:mt'),
    libTrack('Song', 'Artist One', 'local:song'),
    libTrack('Song', 'Artist Two', 'local:song2'),
  ]

  it('matches exact title+artist (Cyrillic)', () => {
    const imported: ImportedTrack[] = [{ title: 'Владивосток 2000', artist: 'Мумий Тролль' }]
    const [r] = matchTracks(imported, library)
    expect(r.match?.id).toBe('local:mt')
    expect(r.score).toBeGreaterThanOrEqual(0.75)
  })

  it('matches despite feat/brackets noise in library title', () => {
    const lib = [libTrack('Song (feat. X) [Remix]', 'Artist One', 'local:noisy')]
    const [r] = matchTracks([{ title: 'Song', artist: 'Artist One' }], lib)
    expect(r.match?.id).toBe('local:noisy')
  })

  it('rejects candidates with a different artist even when title matches', () => {
    const lib = [libTrack('Song', 'Completely Different', 'local:other')]
    const [r] = matchTracks([{ title: 'Song', artist: 'Artist One' }], lib)
    expect(r.match).toBeNull()
  })

  it('returns null match below threshold', () => {
    const [r] = matchTracks([{ title: 'Nothings Like This', artist: 'Nobody' }], library)
    expect(r.match).toBeNull()
    expect(r.score).toBeLessThan(0.75)
  })

  it('respects a custom threshold', () => {
    const imported: ImportedTrack[] = [{ title: 'Song', artist: 'Artist One' }]
    // «Live Version» без скобок — скобки нормализация бы срезала
    const lib = [libTrack('Song Live Version', 'Artist One', 'local:live')]
    const [loose] = matchTracks(imported, lib, 0.5)
    expect(loose.match?.id).toBe('local:live')
    const [strict] = matchTracks(imported, lib, 0.99)
    expect(strict.match).toBeNull()
  })

  it('picks the best candidate among several', () => {
    const [r] = matchTracks([{ title: 'Song', artist: 'Artist Two' }], library)
    expect(r.match?.id).toBe('local:song2')
  })
})
