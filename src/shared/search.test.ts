import { describe, it, expect } from 'vitest'
import { searchTracks } from './search'
import type { Track } from './types'

const t = (id: string, title: string, artist: string, album: string): Track => ({
  id, sourceId: 'local', title, artist, album, durationSec: 0, filePath: '',
})

const lib = [
  t('1', 'Bohemian Rhapsody', 'Queen', 'A Night at the Opera'),
  t('2', 'Another One Bites the Dust', 'Queen', 'The Game'),
  t('3', 'Пора домой', 'Кино', 'Новая волна'),
]

describe('searchTracks', () => {
  it('empty query returns empty result', () => {
    expect(searchTracks(lib, '  ')).toEqual([])
  })
  it('matches title case-insensitively', () => {
    expect(searchTracks(lib, 'bohemian').map(x => x.id)).toEqual(['1'])
  })
  it('matches artist', () => {
    expect(searchTracks(lib, 'queen')).toHaveLength(2)
  })
  it('matches cyrillic', () => {
    expect(searchTracks(lib, 'КИНО').map(x => x.id)).toEqual(['3'])
  })
  it('matches album', () => {
    expect(searchTracks(lib, 'the game').map(x => x.id)).toEqual(['2'])
  })
})
