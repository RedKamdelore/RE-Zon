import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '' } }))

import {
  mergeWithDefaults,
  migrateV1toV2,
  migrateV2toV3,
  migrateV3toV4,
  DEFAULT_DATA,
} from './persistence'
import { BUILTIN_PRESETS, defaultTheme } from '../shared/themeModel'
import type { PersistedData } from '../shared/types'

describe('mergeWithDefaults', () => {
  it('null returns defaults', () => {
    expect(mergeWithDefaults(null)).toEqual(DEFAULT_DATA)
  })
  it('defaults are version 4 with empty connections', () => {
    const d = mergeWithDefaults(null)
    expect(d.version).toBe(4)
    expect(d.connections).toEqual({})
    expect(d.lastfmApiSecret).toBe('')
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
  it('partial v4 data merges with defaults', () => {
    const r = mergeWithDefaults({ volume: 0.5, musicFolders: ['D:\\Music'] })
    expect(r.volume).toBe(0.5)
    expect(r.musicFolders).toEqual(['D:\\Music'])
    expect(r.playlists).toEqual([])
    expect(r.version).toBe(4)
  })
  it('eqGains default has 10 zeros', () => {
    expect(mergeWithDefaults(null).eqGains).toHaveLength(10)
  })
  it('v4 data passes through unchanged', () => {
    const v4: PersistedData = {
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
      lastfmApiSecret: 'sec',
      connections: { vk: { token: 't', connectedAt: 42, userId: '7' } },
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
    expect(mergeWithDefaults(v4)).toEqual(v4)
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
    expect(r.version).toBe(4)
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
    expect(r.connections).toEqual({})
  })
  it('v2 data with unknown skin falls back to default theme', () => {
    const r = mergeWithDefaults({
      version: 2 as const,
      appearance: { skin: 'no-such-skin', accent: '#FF0000', radius: 4, scale: 1 },
    })
    expect(r.version).toBe(4)
    expect(r.appearance.skin).toBe('no-such-skin')
    expect(r.appearance.theme).toEqual({ ...defaultTheme(), accent: '#FF0000', radius: 4 })
  })
  it('v2 data without appearance gets default appearance', () => {
    const r = mergeWithDefaults({ version: 2 as const, volume: 0.1 })
    expect(r.version).toBe(4)
    expect(r.volume).toBe(0.1)
    expect(r.appearance).toEqual(DEFAULT_DATA.appearance)
  })
  it('v1-shaped data migrates to v4 keeping old values', () => {
    const v1 = {
      version: 1 as const,
      musicFolders: ['C:\\Tunes'],
      playlists: [{ id: 'p1', name: 'Mix', trackIds: [], createdAt: 1 }],
      lyricsOverrides: { t1: 'la' },
      volume: 0.4,
      eqGains: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    }
    const r = mergeWithDefaults(v1)
    expect(r.version).toBe(4)
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
    expect(r.connections).toEqual({})
  })
  it('defaults hiddenTracks to empty for v3 data without the field', () => {
    // файл v3, записанный до V3-2, не содержит hiddenTracks — подставляется дефолт
    expect(mergeWithDefaults({ version: 3, volume: 0.5 }).hiddenTracks).toEqual([])
  })
  it('v3 importSources.vkToken migrates into connections.vk', () => {
    // V3-0 формат: токен VK хранился в importSources.vkToken
    const r = mergeWithDefaults({ version: 3 as const, importSources: { vkToken: 'tok3n' } })
    expect(r.version).toBe(4)
    expect(r.connections.vk).toEqual({ token: 'tok3n', connectedAt: 0 })
  })
  it('v3 with existing connections keeps them (no importSources override)', () => {
    const r = mergeWithDefaults({
      version: 3 as const,
      importSources: { vkToken: 'old' },
      connections: { vk: { token: 'new', connectedAt: 5 } },
    })
    expect(r.connections.vk).toEqual({ token: 'new', connectedAt: 5 })
  })
  it('v3 lastfmApiSecret carries over to v4', () => {
    const r = mergeWithDefaults({ version: 3 as const, lastfmApiSecret: 'shh' })
    expect(r.lastfmApiSecret).toBe('shh')
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

describe('migrateV3toV4', () => {
  it('adds connections, lastfmApiSecret and bumps version', () => {
    const r = migrateV3toV4({ version: 3, lastfmApiKey: 'k', lastfmApiSecret: 's' })
    expect(r.version).toBe(4)
    expect(r.connections).toEqual({})
    expect(r.lastfmApiSecret).toBe('s')
    expect(r.lastfmApiKey).toBe('k')
    expect(r.favoriteIds).toEqual([])
  })
  it('keeps favoriteIds through migration', () => {
    const r = migrateV3toV4({ version: 3 as const, favoriteIds: ['local:a', 'vk:1_2'] })
    expect(r.favoriteIds).toEqual(['local:a', 'vk:1_2'])
  })
  it('moves importSources.vkToken to connections.vk', () => {
    const r = migrateV3toV4({ version: 3, importSources: { vkToken: 'abc' } })
    expect(r.connections.vk).toEqual({ token: 'abc', connectedAt: 0 })
  })
  it('preserves full connections and does not invent others', () => {
    const conns = {
      lastfm: { token: 'sess', connectedAt: 1, userId: 'Red' },
      spotify: { token: 'x', connectedAt: 2, refreshToken: 'r' },
    }
    const r = migrateV3toV4({ version: 3, connections: conns })
    expect(r.connections).toEqual(conns)
  })
})
