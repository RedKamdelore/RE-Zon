import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useLyricsStore, getLyricsOverride, setLyricsOverride, setLyricOffset, searchLyrics } from './lyricsStore'
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
    useLyricsStore.setState({ overrides: {}, offsets: {}, automatic: {}, reports: {}, searching: {}, errors: {} })
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

  it('saves a bounded per-track timing correction and removes it on reset', () => {
    vi.useFakeTimers()
    const saveData = vi.fn().mockResolvedValue(undefined)
    ;(globalThis as Record<string, unknown>).window = { api: { saveData } }
    setPersistedBase(makeBase())
    setLyricOffset('local:t1', 0.5)
    setLyricOffset('local:t2', 20)
    expect(useLyricsStore.getState().offsets).toEqual({ 'local:t1': 0.5, 'local:t2': 10 })
    vi.advanceTimersByTime(500)
    expect((saveData.mock.calls[0][0] as PersistedData).lyricOffsets).toEqual({ 'local:t1': 0.5, 'local:t2': 10 })
    setLyricOffset('local:t1', 0)
    vi.advanceTimersByTime(500)
    expect((saveData.mock.calls[1][0] as PersistedData).lyricOffsets).toEqual({ 'local:t2': 10 })
  })

  it('keeps source-by-source results for the menu after a full search', async () => {
    const report = { best: { text: '[00:01.00]Line', synced: true, source: 'synclrc' as const }, sources: [
      { source: 'lrclib' as const, status: 'missing' as const },
      { source: 'lrcapi' as const, status: 'error' as const },
      { source: 'lrcmux' as const, status: 'missing' as const },
      { source: 'synclrc' as const, status: 'synced' as const, result: { text: '[00:01.00]Line', synced: true, source: 'synclrc' as const } },
    ] }
    const lookupLyricsReport = vi.fn().mockResolvedValue(report)
    ;(globalThis as Record<string, unknown>).window = { api: { lookupLyricsReport } }
    const track = { id: 'local:t1', sourceId: 'local', title: 'Song', artist: 'Artist', album: 'Album', durationSec: 180, filePath: 'song.mp3' }
    await searchLyrics(track, true)
    expect(lookupLyricsReport).toHaveBeenCalledWith({ title: 'Song', artist: 'Artist', album: 'Album', durationSec: 180, checkAll: true })
    expect(useLyricsStore.getState().reports[track.id]).toEqual(report)
    expect(useLyricsStore.getState().automatic[track.id]).toEqual(report.best)
  })

  it('keeps synchronized lyrics when a manual refresh only finds plain text', async () => {
    const timed = { text: '[00:01.00]Line', synced: true, source: 'lrclib' as const }
    const report = { best: { text: 'Line', synced: false, source: 'lrcmux' as const }, sources: [
      { source: 'lrclib' as const, status: 'error' as const },
      { source: 'lrcapi' as const, status: 'missing' as const },
      { source: 'lrcmux' as const, status: 'plain' as const, result: { text: 'Line', synced: false, source: 'lrcmux' as const } },
      { source: 'synclrc' as const, status: 'missing' as const },
    ] }
    useLyricsStore.setState({ automatic: { 'local:t1': timed } })
    ;(globalThis as Record<string, unknown>).window = { api: { lookupLyricsReport: vi.fn().mockResolvedValue(report) } }
    await searchLyrics({ id: 'local:t1', sourceId: 'local', title: 'Song', artist: 'Artist', album: 'Album', durationSec: 180, filePath: 'song.mp3' }, true)
    expect(useLyricsStore.getState().automatic['local:t1']).toEqual(timed)
    expect(useLyricsStore.getState().reports['local:t1']).toEqual(report)
  })

  it('retries previously cached plain lyrics while keeping synchronized results', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({
        plain: { text: 'old plain result', synced: false, source: 'lrclib' },
        invalid: { text: 'untimed result mislabeled by old lookup', synced: true, source: 'lrclib' },
        timed: { text: '[00:01.00]line', synced: true, source: 'lrcapi' },
      }),
    })
    vi.resetModules()
    try {
      const { useLyricsStore: freshStore } = await import('./lyricsStore')
      expect(freshStore.getState().automatic).toEqual({ timed: { text: '[00:01.00]line', synced: true, source: 'lrcapi' } })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
