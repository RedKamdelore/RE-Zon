import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '' } }))

import { mergeWithDefaults, migrateV1toV2, DEFAULT_DATA } from './persistence'
import type { PersistedData } from '../shared/types'

describe('mergeWithDefaults', () => {
  it('null returns defaults', () => {
    expect(mergeWithDefaults(null)).toEqual(DEFAULT_DATA)
  })
  it('defaults are version 2 with new sections', () => {
    const d = mergeWithDefaults(null)
    expect(d.version).toBe(2)
    expect(d.appearance).toEqual({
      skin: 'spotify-dark',
      accent: '#1DB954',
      radius: 8,
      scale: 1,
    })
    expect(d.playback).toEqual({ crossfadeSec: 0 })
    expect(d.playStats).toEqual({})
    expect(d.lastfmApiKey).toBe('')
    expect(d.importSources).toEqual({})
    expect(d.importedTracks).toEqual([])
  })
  it('partial v2 data merges with defaults', () => {
    const r = mergeWithDefaults({ volume: 0.5, musicFolders: ['D:\\Music'] })
    expect(r.volume).toBe(0.5)
    expect(r.musicFolders).toEqual(['D:\\Music'])
    expect(r.playlists).toEqual([])
    expect(r.version).toBe(2)
  })
  it('eqGains default has 10 zeros', () => {
    expect(mergeWithDefaults(null).eqGains).toHaveLength(10)
  })
  it('v2 data passes through unchanged', () => {
    const v2: PersistedData = {
      ...DEFAULT_DATA,
      volume: 0.3,
      appearance: { skin: 'midnight', accent: '#8B5CF6', radius: 12, scale: 1.1 },
      playback: { crossfadeSec: 5 },
      playStats: { 'local:x': { count: 3, lastPlayed: 123 } },
      lastfmApiKey: 'key',
      importSources: { vk: { token: 't' } },
      importedTracks: [
        {
          id: 'vk:1_2',
          sourceId: 'vk',
          title: 'Song',
          artist: 'Artist',
          album: 'VK',
          durationSec: 100,
          filePath: 'https://example.com/a.mp3',
        },
      ],
    }
    expect(mergeWithDefaults(v2)).toEqual(v2)
  })
  it('v2 file without importedTracks (pre-V2-7) gets the default', () => {
    const { importedTracks: _omit, ...oldV2 } = DEFAULT_DATA
    const r = mergeWithDefaults(oldV2)
    expect(r.importedTracks).toEqual([])
  })
  it('v1-shaped data migrates to v2 keeping old values', () => {
    const v1 = {
      version: 1 as const,
      musicFolders: ['C:\\Tunes'],
      playlists: [{ id: 'p1', name: 'Mix', trackIds: [], createdAt: 1 }],
      lyricsOverrides: { t1: 'la' },
      volume: 0.4,
      eqGains: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    }
    const r = mergeWithDefaults(v1)
    expect(r.version).toBe(2)
    expect(r.musicFolders).toEqual(['C:\\Tunes'])
    expect(r.playlists).toEqual(v1.playlists)
    expect(r.lyricsOverrides).toEqual({ t1: 'la' })
    expect(r.volume).toBe(0.4)
    expect(r.eqGains).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    // Новые поля — дефолты
    expect(r.appearance).toEqual(DEFAULT_DATA.appearance)
    expect(r.playback).toEqual({ crossfadeSec: 0 })
    expect(r.playStats).toEqual({})
    expect(r.lastfmApiKey).toBe('')
    expect(r.importSources).toEqual({})
    expect(r.importedTracks).toEqual([])
  })
  it('partial v1-shaped data migrates with defaults for missing old fields', () => {
    const r = mergeWithDefaults({ version: 1 as const, volume: 0.1 })
    expect(r.version).toBe(2)
    expect(r.volume).toBe(0.1)
    expect(r.musicFolders).toEqual([])
    expect(r.appearance).toEqual(DEFAULT_DATA.appearance)
  })
})

describe('migrateV1toV2', () => {
  it('keeps v1 fields and adds v2 defaults', () => {
    const v1 = {
      version: 1 as const,
      musicFolders: ['E:\\Audio'],
      playlists: [],
      lyricsOverrides: {},
      volume: 0.7,
      eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    }
    const r = migrateV1toV2(v1)
    expect(r.version).toBe(2)
    expect(r.musicFolders).toEqual(['E:\\Audio'])
    expect(r.volume).toBe(0.7)
    expect(r.appearance).toEqual(DEFAULT_DATA.appearance)
    expect(r.playback).toEqual(DEFAULT_DATA.playback)
    expect(r.playStats).toEqual({})
    expect(r.lastfmApiKey).toBe('')
    expect(r.importSources).toEqual({})
  })
})
