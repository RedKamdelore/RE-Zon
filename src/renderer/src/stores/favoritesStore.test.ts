import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useFavoritesStore, isFavorite } from './favoritesStore'

describe('favoritesStore', () => {
  beforeEach(() => {
    useFavoritesStore.setState({ ids: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
    delete (globalThis as Record<string, unknown>).window
  })

  it('toggle adds and removes', () => {
    useFavoritesStore.getState().toggle('local:a')
    expect(useFavoritesStore.getState().ids).toEqual(['local:a'])
    expect(isFavorite('local:a')).toBe(true)
    useFavoritesStore.getState().toggle('local:a')
    expect(useFavoritesStore.getState().ids).toEqual([])
    expect(isFavorite('local:a')).toBe(false)
  })

  it('init replaces ids', () => {
    useFavoritesStore.getState().init(['x', 'y'])
    expect(useFavoritesStore.getState().ids).toEqual(['x', 'y'])
  })

  it('persists via debounced persistPatch', async () => {
    vi.useFakeTimers()
    const saveData = vi.fn().mockResolvedValue(undefined)
    ;(globalThis as Record<string, unknown>).window = { api: { saveData } }
    // база нужна persistPatch — сетапим через playlistStore
    const { setPersistedBase } = await import('./playlistStore')
    const { defaultTheme } = await import('@shared/themeModel')
    setPersistedBase({
      version: 4,
      musicFolders: [],
      playlists: [],
      lyricsOverrides: {},
      volume: 0.8,
      eqGains: new Array(10).fill(0),
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
    })
    useFavoritesStore.getState().toggle('local:z')
    vi.advanceTimersByTime(600)
    expect(saveData).toHaveBeenCalledTimes(1)
    const saved = saveData.mock.calls[0][0]
    expect(saved.favoriteIds).toEqual(['local:z'])
    setPersistedBase(null)
  })
})
