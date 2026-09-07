// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useStatsStore, recordPlay, getStats } from './statsStore'
import { setPersistedBase } from './playlistStore'
import { defaultTheme } from '@shared/themeModel'
import type { PersistedData } from '@shared/types'

function makeBase(overrides: Partial<PersistedData> = {}): PersistedData {
  return {
    version: 4,
    musicFolders: [],
    playlists: [],
    lyricsOverrides: {},
    volume: 0.8,
    eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    appearance: { skin: 'spotify-dark', theme: defaultTheme(), customThemes: {}, scale: 1 },
    playback: { crossfadeSec: 0 },
    playStats: {},
    lastfmApiKey: '',
    lastfmApiSecret: '',
    connections: {},
    lastfmProxy: '',
    importSources: {},
    importedTracks: [],
    hiddenTracks: [],
    ...overrides,
  }
}

describe('statsStore', () => {
  let saveData: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    saveData = vi.fn().mockResolvedValue(undefined)
    ;(window as unknown as Record<string, unknown>).api = { saveData }
    setPersistedBase(makeBase())
    useStatsStore.getState().init({})
  })

  afterEach(() => {
    vi.useRealTimers()
    setPersistedBase(null)
    delete (window as unknown as Record<string, unknown>).api
  })

  it('recordPlay creates a new entry with count 1 and lastPlayed ~ now', () => {
    recordPlay('local:a')
    const entry = getStats()['local:a']
    expect(entry.count).toBe(1)
    expect(Math.abs(entry.lastPlayed - Date.now())).toBeLessThan(1000)
  })

  it('recordPlay increments an existing entry', () => {
    useStatsStore.getState().init({ 'local:a': { count: 2, lastPlayed: 1000 } })
    recordPlay('local:a')
    const entry = getStats()['local:a']
    expect(entry.count).toBe(3)
    expect(entry.lastPlayed).toBeGreaterThan(1000)
  })

  it('preserves other entries when recording a play', () => {
    useStatsStore.getState().init({ 'local:other': { count: 5, lastPlayed: 42 } })
    recordPlay('local:a')
    expect(getStats()['local:other']).toEqual({ count: 5, lastPlayed: 42 })
  })

  it('persists stats via debounced saveData', () => {
    recordPlay('local:a')
    vi.advanceTimersByTime(600)
    expect(saveData).toHaveBeenCalledTimes(1)
    const saved = saveData.mock.calls[0][0] as PersistedData
    expect(saved.playStats['local:a'].count).toBe(1)
  })

  it('a burst of plays results in one saveData with final counts', () => {
    recordPlay('local:a')
    recordPlay('local:a')
    recordPlay('local:b')
    vi.advanceTimersByTime(600)
    expect(saveData).toHaveBeenCalledTimes(1)
    const saved = saveData.mock.calls[0][0] as PersistedData
    expect(saved.playStats['local:a'].count).toBe(2)
    expect(saved.playStats['local:b'].count).toBe(1)
  })

  it('keeps pre-existing persisted stats when saving new entries', () => {
    setPersistedBase(makeBase({ playStats: { 'local:old': { count: 7, lastPlayed: 1 } } }))
    recordPlay('local:a')
    vi.advanceTimersByTime(600)
    const saved = saveData.mock.calls[0][0] as PersistedData
    expect(saved.playStats['local:old']).toEqual({ count: 7, lastPlayed: 1 })
    expect(saved.playStats['local:a'].count).toBe(1)
  })

  it('works without window.api (no persist, no throw)', () => {
    delete (window as unknown as Record<string, unknown>).api
    expect(() => recordPlay('local:a')).not.toThrow()
    vi.advanceTimersByTime(600)
    expect(getStats()['local:a'].count).toBe(1)
    expect(saveData).not.toHaveBeenCalled()
  })
})
