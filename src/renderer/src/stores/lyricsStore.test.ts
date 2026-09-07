import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useLyricsStore, getLyricsOverride, setLyricsOverride } from './lyricsStore'
import { setPersistedBase } from './playlistStore'
import { defaultTheme } from '@shared/themeModel'
import type { PersistedData } from '@shared/types'

function makeBase(overrides: Partial<PersistedData> = {}): PersistedData {
  return {
    version: 4,
    musicFolders: ['C:\\Music'],
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
    favoriteIds: [],
    ...overrides,
  }
}

describe('lyricsStore', () => {
  beforeEach(() => {
    useLyricsStore.setState({ overrides: {} })
    setPersistedBase(null)
  })

  afterEach(() => {
    vi.useRealTimers()
    delete (globalThis as Record<string, unknown>).window
    setPersistedBase(null)
  })

  it('init stores overrides', () => {
    useLyricsStore.getState().init({ 'local:t1': 'Привет' })
    expect(useLyricsStore.getState().overrides).toEqual({ 'local:t1': 'Привет' })
  })

  it('setLyricsOverride updates state, getLyricsOverride reads it', () => {
    expect(getLyricsOverride('local:t1')).toBeUndefined()
    setLyricsOverride('local:t1', 'Строка 1\nСтрока 2')
    expect(getLyricsOverride('local:t1')).toBe('Строка 1\nСтрока 2')
  })

  it('persists debounced (500ms) merged with the persisted base', () => {
    vi.useFakeTimers()
    const saveData = vi.fn().mockResolvedValue(undefined)
    ;(globalThis as Record<string, unknown>).window = { api: { saveData } }
    setPersistedBase(makeBase())

    setLyricsOverride('local:t1', 'A')
    setLyricsOverride('local:t2', 'B')
    expect(saveData).not.toHaveBeenCalled()

    vi.advanceTimersByTime(500)
    expect(saveData).toHaveBeenCalledTimes(1)
    const saved = saveData.mock.calls[0][0] as PersistedData
    expect(saved.lyricsOverrides).toEqual({ 'local:t1': 'A', 'local:t2': 'B' })
    expect(saved.volume).toBe(0.8)
    expect(saved.musicFolders).toEqual(['C:\\Music'])
  })

  it('keeps base fields from the latest base on subsequent saves', () => {
    vi.useFakeTimers()
    const saveData = vi.fn().mockResolvedValue(undefined)
    ;(globalThis as Record<string, unknown>).window = { api: { saveData } }
    setPersistedBase(makeBase())

    setLyricsOverride('local:t1', 'A')
    vi.advanceTimersByTime(500)
    setLyricsOverride('local:t2', 'B')
    vi.advanceTimersByTime(500)
    expect(saveData).toHaveBeenCalledTimes(2)
    const saved = saveData.mock.calls[1][0] as PersistedData
    expect(saved.lyricsOverrides).toEqual({ 'local:t1': 'A', 'local:t2': 'B' })
    expect(saved.volume).toBe(0.8)
  })

  it('mutations do not throw without window.api or persisted base', () => {
    expect(() => {
      setLyricsOverride('local:t1', 'A')
      vi.useFakeTimers()
      vi.advanceTimersByTime(1000)
    }).not.toThrow()
  })
})
