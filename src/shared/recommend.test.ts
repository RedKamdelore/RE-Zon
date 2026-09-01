import { describe, it, expect } from 'vitest'
import { localRecommendations } from './recommend'
import type { Track } from './types'

function makeTrack(id: string, over: Partial<Track> = {}): Track {
  return {
    id,
    sourceId: 'local',
    title: `Title ${id}`,
    artist: 'Someone Else',
    album: 'Other Album',
    durationSec: 180,
    filePath: `C:\\Music\\${id}.mp3`,
    ...over,
  }
}

const seed = makeTrack('local:seed', {
  title: 'Seed Song',
  artist: 'Seed Artist',
  album: 'Seed Album',
})

const DAY = 24 * 3600 * 1000

describe('localRecommendations', () => {
  it('excludes the seed track itself', () => {
    const result = localRecommendations(seed, [seed, makeTrack('local:a', { artist: 'Seed Artist' })], {})
    expect(result.map((r) => r.track.id)).not.toContain('local:seed')
  })

  it('excludes tracks with no relation and no stats', () => {
    const result = localRecommendations(seed, [seed, makeTrack('local:unrelated')], {})
    expect(result).toHaveLength(0)
  })

  it('weights same artist (+10) above same album (+6)', () => {
    const library = [
      seed,
      makeTrack('local:album', { album: 'Seed Album' }),
      makeTrack('local:artist', { artist: 'Seed Artist' }),
    ]
    const result = localRecommendations(seed, library, {})
    expect(result.map((r) => r.track.id)).toEqual(['local:artist', 'local:album'])
    expect(result[0].reason).toBe('Тот же исполнитель')
    expect(result[1].reason).toBe('Тот же альбом')
  })

  it('stacks artist and album bonuses', () => {
    const library = [
      seed,
      makeTrack('local:artist', { artist: 'Seed Artist' }),
      makeTrack('local:both', { artist: 'Seed Artist', album: 'Seed Album' }),
    ]
    const result = localRecommendations(seed, library, {})
    expect(result[0].track.id).toBe('local:both')
    expect(result[0].score).toBe(16)
  })

  it('play stats add popularity capped at 10', () => {
    const library = [seed, makeTrack('local:popular'), makeTrack('local:viral')]
    const stats = {
      'local:popular': { count: 3, lastPlayed: 0 },
      'local:viral': { count: 42, lastPlayed: 0 },
    }
    const result = localRecommendations(seed, library, stats)
    expect(result.map((r) => r.track.id)).toEqual(['local:viral', 'local:popular'])
    expect(result[0].score).toBe(10)
    expect(result[1].score).toBe(3)
    expect(result[0].reason).toBe('Часто слушаете')
  })

  it('recently played (within 7 days) gets a +2 boost', () => {
    const now = Date.now()
    const library = [seed, makeTrack('local:recent'), makeTrack('local:old')]
    const stats = {
      'local:recent': { count: 1, lastPlayed: now - DAY },
      'local:old': { count: 2, lastPlayed: now - 30 * DAY },
    }
    const result = localRecommendations(seed, library, stats)
    expect(result.map((r) => r.track.id)).toEqual(['local:recent', 'local:old'])
    expect(result[0].score).toBe(3)
    expect(result[1].score).toBe(2)
  })

  it('breaks score ties by title ascending', () => {
    const library = [
      seed,
      makeTrack('local:b', { artist: 'Seed Artist', title: 'B Song' }),
      makeTrack('local:a', { artist: 'Seed Artist', title: 'A Song' }),
    ]
    const result = localRecommendations(seed, library, {})
    expect(result.map((r) => r.track.title)).toEqual(['A Song', 'B Song'])
  })

  it('respects the limit', () => {
    const library = [seed, ...Array.from({ length: 30 }, (_, i) => makeTrack(`local:t${i}`, { artist: 'Seed Artist' }))]
    expect(localRecommendations(seed, library, {})).toHaveLength(20)
    expect(localRecommendations(seed, library, {}, 5)).toHaveLength(5)
  })
})
