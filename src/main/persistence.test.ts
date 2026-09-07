import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '' } }))

import { mergeWithDefaults, migrateV1toV2, migrateV2toV3, DEFAULT_DATA } from './persistence'
import { BUILTIN_PRESETS, defaultTheme } from '../shared/themeModel'
import type { PersistedData } from '../shared/types'

describe('mergeWithDefaults', () => {
  it('null returns defaults', () => {
    expect(mergeWithDefaults(null)).toEqual(DEFAULT_DATA)
  })
  it('defaults are version 3 with theme engine appearance', () => {
    const d = mergeWithDefaults(null)
    expect(d.version).toBe(3)
    expect(d.appearance).toEqual({
      skin: 'spotify-dark',
      theme: defaultTheme(),
      customThemes: {},
      scale: 1,
    })
    expect(d.playback).toEqual({ crossfadeSec: 0 })
    expect(d.playStats).toEqual({})
    expect(d.lastfmApiKey).toBe('')
    expect(d.lastfmProxy).toBe('')
    expect(d.importSources).toEqual({})
    expect(d.importedTracks).toEqual([])
  })
  it('partial v3 data merges with defaults', () => {
    const r = mergeWithDefaults({ volume: 0.5, musicFolders: ['D:\\Music'] })
    expect(r.volume).toBe(0.5)
    expect(r.musicFolders).toEqual(['D:\\Music'])
    expect(r.playlists).toEqual([])
    expect(r.version).toBe(3)
  })
  it('eqGains default has 10 zeros', () => {
    expect(mergeWithDefaults(null).eqGains).toHaveLength(10)
  })
  it('v3 data passes through unchanged', () => {
    const v3: PersistedData = {
      ...DEFAULT_DATA,
      volume: 0.3,
      appearance: {
        skin: 'Моя тема',
        theme: { ...defaultTheme(), accent: '#8B5CF6', radius: 12 },
        customThemes: { 'Моя тема': { ...defaultTheme(), accent: '#8B5CF6', radius: 12 } },
        scale: 1.1,
      },
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
    expect(mergeWithDefaults(v3)).toEqual(v3)
  })
  it('v2-shaped data migrates to v3 keeping old values', () => {
    const v2 = {
      version: 2 as const,
      musicFolders: ['C:\\Tunes'],
      playlists: [{ id: 'p1', name: 'Mix', trackIds: [], createdAt: 1 }],
      lyricsOverrides: { t1: 'la' },
      volume: 0.4,
      eqGains: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      appearance: { skin: 'midnight', accent: '#8B5CF6', radius: 12, scale: 1.05 },
      playback: { crossfadeSec: 5 },
      playStats: { 'local:x': { count: 3, lastPlayed: 123 } },
      lastfmApiKey: 'key',
      lastfmProxy: 'http://127.0.0.1:8080',
      importSources: { vk: { token: 't' } },
      importedTracks: [],
    }
    const r = mergeWithDefaults(v2)
    expect(r.version).toBe(3)
    expect(r.musicFolders).toEqual(['C:\\Tunes'])
    expect(r.playlists).toEqual(v2.playlists)
    expect(r.volume).toBe(0.4)
    expect(r.eqGains).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(r.lastfmApiKey).toBe('key')
    expect(r.lastfmProxy).toBe('http://127.0.0.1:8080')
    // appearance → тема пресета midnight с акцентом/радиусом пользователя
    expect(r.appearance.skin).toBe('midnight')
    expect(r.appearance.scale).toBe(1.05)
    expect(r.appearance.customThemes).toEqual({})
    expect(r.appearance.theme).toEqual({
      ...BUILTIN_PRESETS['midnight'],
      accent: '#8B5CF6',
      radius: 12,
    })
    expect(r.hiddenTracks).toEqual([])
  })
  it('v2 data with unknown skin falls back to default theme', () => {
    const r = mergeWithDefaults({
      version: 2 as const,
      appearance: { skin: 'no-such-skin', accent: '#FF0000', radius: 4, scale: 1 },
    })
    expect(r.version).toBe(3)
    expect(r.appearance.skin).toBe('no-such-skin')
    expect(r.appearance.theme).toEqual({ ...defaultTheme(), accent: '#FF0000', radius: 4 })
  })
  it('v2 data without appearance gets default appearance', () => {
    const r = mergeWithDefaults({ version: 2 as const, volume: 0.1 })
    expect(r.version).toBe(3)
    expect(r.volume).toBe(0.1)
    expect(r.appearance).toEqual(DEFAULT_DATA.appearance)
  })
  it('v1-shaped data migrates to v3 keeping old values', () => {
    const v1 = {
      version: 1 as const,
      musicFolders: ['C:\\Tunes'],
      playlists: [{ id: 'p1', name: 'Mix', trackIds: [], createdAt: 1 }],
      lyricsOverrides: { t1: 'la' },
      volume: 0.4,
      eqGains: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    }
    const r = mergeWithDefaults(v1)
    expect(r.version).toBe(3)
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
  it('defaults hiddenTracks to empty for v3 data without the field', () => {
    // файл v3, записанный до V3-2, не содержит hiddenTracks — подставляется дефолт
    expect(mergeWithDefaults({ version: 3, volume: 0.5 }).hiddenTracks).toEqual([])
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
    expect(r.playlists).toEqual([])
  })
})

describe('migrateV2toV3', () => {
  it('maps skin to builtin preset with user accent/radius', () => {
    const r = migrateV2toV3({
      version: 2,
      appearance: { skin: 'liquid-glass', accent: '#EC4899', radius: 20, scale: 1.1 },
    })
    expect(r.version).toBe(3)
    expect(r.appearance.skin).toBe('liquid-glass')
    expect(r.appearance.theme.panelMaterial).toBe('glass')
    expect(r.appearance.theme.accent).toBe('#EC4899')
    expect(r.appearance.theme.radius).toBe(20)
    expect(r.appearance.scale).toBe(1.1)
  })
  it('fills missing appearance pieces with defaults', () => {
    const r = migrateV2toV3({ version: 2 })
    expect(r.appearance).toEqual(DEFAULT_DATA.appearance)
  })
})
