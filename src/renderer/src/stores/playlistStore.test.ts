import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { usePlaylistStore, setPersistedBase, persistPatch } from './playlistStore'
import { defaultTheme } from '@shared/themeModel'
import type { PersistedData } from '@shared/types'

function makeBase(overrides: Partial<PersistedData> = {}): PersistedData {
  return {
    version: 3,
    musicFolders: ['C:\\Music'],
    playlists: [],
    lyricsOverrides: {},
    volume: 0.8,
    eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    appearance: { skin: 'spotify-dark', theme: defaultTheme(), customThemes: {}, scale: 1 },
    playback: { crossfadeSec: 0 },
    playStats: {},
    lastfmApiKey: '',
    lastfmProxy: '',
    importSources: {},
    importedTracks: [],
    ...overrides,
  }
}

describe('playlistStore', () => {
  beforeEach(() => {
    usePlaylistStore.setState({ playlists: [], loaded: false })
    setPersistedBase(null)
  })

  afterEach(() => {
    vi.useRealTimers()
    delete (globalThis as Record<string, unknown>).window
    setPersistedBase(null)
  })

  it('init stores playlists and marks loaded', () => {
    const pl = { id: 'pl-1', name: 'Test', trackIds: [], createdAt: 1 }
    usePlaylistStore.getState().init([pl])
    expect(usePlaylistStore.getState().playlists).toEqual([pl])
    expect(usePlaylistStore.getState().loaded).toBe(true)
  })

  it('create returns id and adds playlist with default name', () => {
    const id = usePlaylistStore.getState().create()
    const { playlists } = usePlaylistStore.getState()
    expect(playlists).toHaveLength(1)
    expect(playlists[0].id).toBe(id)
    expect(playlists[0].name).toBe('Мой плейлист №1')
    expect(playlists[0].trackIds).toEqual([])
  })

  it('create uses the smallest unused default-number after deletions', () => {
    const s = usePlaylistStore.getState()
    const id1 = s.create()
    s.create() // №2
    usePlaylistStore.getState().create() // №3
    usePlaylistStore.getState().remove(id1) // удаляем №1
    usePlaylistStore.getState().create()
    const names = usePlaylistStore.getState().playlists.map((p) => p.name)
    expect(names).toEqual(['Мой плейлист №2', 'Мой плейлист №3', 'Мой плейлист №1'])
  })

  it('create ignores custom names when numbering defaults', () => {
    usePlaylistStore.getState().create('Избранное')
    usePlaylistStore.getState().create()
    const names = usePlaylistStore.getState().playlists.map((p) => p.name)
    expect(names).toEqual(['Избранное', 'Мой плейлист №1'])
  })

  it('create uses the provided name', () => {
    usePlaylistStore.getState().create('Рок')
    expect(usePlaylistStore.getState().playlists[0].name).toBe('Рок')
  })

  it('rename changes the playlist name', () => {
    const id = usePlaylistStore.getState().create()
    usePlaylistStore.getState().rename(id, 'Новое имя')
    expect(usePlaylistStore.getState().playlists[0].name).toBe('Новое имя')
  })

  it('remove deletes the playlist', () => {
    const id = usePlaylistStore.getState().create()
    usePlaylistStore.getState().remove(id)
    expect(usePlaylistStore.getState().playlists).toHaveLength(0)
  })

  it('addTrack appends and dedupes', () => {
    const id = usePlaylistStore.getState().create()
    usePlaylistStore.getState().addTrack(id, 'local:t1')
    usePlaylistStore.getState().addTrack(id, 'local:t1')
    usePlaylistStore.getState().addTrack(id, 'local:t2')
    expect(usePlaylistStore.getState().playlists[0].trackIds).toEqual(['local:t1', 'local:t2'])
  })

  it('removeTrack removes by index', () => {
    const id = usePlaylistStore.getState().create()
    usePlaylistStore.getState().addTrack(id, 'local:t1')
    usePlaylistStore.getState().addTrack(id, 'local:t2')
    usePlaylistStore.getState().removeTrack(id, 0)
    expect(usePlaylistStore.getState().playlists[0].trackIds).toEqual(['local:t2'])
  })

  it('setCover sets coverDataUrl and persists it debounced', () => {
    vi.useFakeTimers()
    const saveData = vi.fn().mockResolvedValue(undefined)
    ;(globalThis as Record<string, unknown>).window = { api: { saveData } }
    setPersistedBase(makeBase())
    usePlaylistStore.getState().init([])

    const id = usePlaylistStore.getState().create()
    usePlaylistStore.getState().setCover(id, 'data:image/png;base64,AAAA')
    expect(usePlaylistStore.getState().playlists[0].coverDataUrl).toBe(
      'data:image/png;base64,AAAA',
    )

    vi.advanceTimersByTime(500)
    expect(saveData).toHaveBeenCalledTimes(1)
    const saved = saveData.mock.calls[0][0] as PersistedData
    expect(saved.playlists[0].coverDataUrl).toBe('data:image/png;base64,AAAA')
    expect(saved.musicFolders).toEqual(['C:\\Music'])
  })

  it('persists debounced (500ms) merged with the persisted base', () => {
    vi.useFakeTimers()
    const saveData = vi.fn().mockResolvedValue(undefined)
    ;(globalThis as Record<string, unknown>).window = { api: { saveData } }
    setPersistedBase(makeBase())
    usePlaylistStore.getState().init([])

    usePlaylistStore.getState().create()
    usePlaylistStore.getState().create()
    expect(saveData).not.toHaveBeenCalled()

    vi.advanceTimersByTime(500)
    expect(saveData).toHaveBeenCalledTimes(1)
    const saved = saveData.mock.calls[0][0] as PersistedData
    expect(saved.playlists).toHaveLength(2)
    expect(saved.volume).toBe(0.8)
    expect(saved.musicFolders).toEqual(['C:\\Music'])
  })

  it('keeps base fields from the latest base on subsequent saves', () => {
    vi.useFakeTimers()
    const saveData = vi.fn().mockResolvedValue(undefined)
    ;(globalThis as Record<string, unknown>).window = { api: { saveData } }
    setPersistedBase(makeBase())
    usePlaylistStore.getState().init([])

    usePlaylistStore.getState().create()
    vi.advanceTimersByTime(500)
    usePlaylistStore.getState().create()
    vi.advanceTimersByTime(500)
    expect(saveData).toHaveBeenCalledTimes(2)
    const saved = saveData.mock.calls[1][0] as PersistedData
    expect(saved.playlists).toHaveLength(2)
    expect(saved.volume).toBe(0.8)
  })

  it('persistPatch merges arbitrary fields (eqGains) debounced into the base', () => {
    vi.useFakeTimers()
    const saveData = vi.fn().mockResolvedValue(undefined)
    ;(globalThis as Record<string, unknown>).window = { api: { saveData } }
    const pl = { id: 'pl-1', name: 'Test', trackIds: [], createdAt: 1 }
    setPersistedBase(makeBase({ playlists: [pl] }))

    persistPatch({ eqGains: [12, 0, 0, 0, 0, 0, 0, 0, 0, 0] })
    persistPatch({ eqGains: [12, 5, 0, 0, 0, 0, 0, 0, 0, 0] })
    expect(saveData).not.toHaveBeenCalled()

    vi.advanceTimersByTime(500)
    expect(saveData).toHaveBeenCalledTimes(1)
    const saved = saveData.mock.calls[0][0] as PersistedData
    expect(saved.eqGains).toEqual([12, 5, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(saved.playlists).toEqual([pl])
    expect(saved.volume).toBe(0.8)
  })

  it('persistPatch merges volume debounced into the base (PlayerBar pattern)', () => {
    vi.useFakeTimers()
    const saveData = vi.fn().mockResolvedValue(undefined)
    ;(globalThis as Record<string, unknown>).window = { api: { saveData } }
    setPersistedBase(makeBase())

    // Паттерн PlayerBar.changeVolume: серия движений слайдера — один saveData
    persistPatch({ volume: 0.6 })
    persistPatch({ volume: 0.4 })
    persistPatch({ volume: 0.5 })
    expect(saveData).not.toHaveBeenCalled()

    vi.advanceTimersByTime(500)
    expect(saveData).toHaveBeenCalledTimes(1)
    const saved = saveData.mock.calls[0][0] as PersistedData
    expect(saved.volume).toBe(0.5)
    expect(saved.musicFolders).toEqual(['C:\\Music'])
    expect(saved.playlists).toEqual([])
  })

  it('mutations do not throw without window.api or persisted base', () => {
    expect(() => {
      usePlaylistStore.getState().create()
      vi.useFakeTimers()
      vi.advanceTimersByTime(1000)
    }).not.toThrow()
  })
})
