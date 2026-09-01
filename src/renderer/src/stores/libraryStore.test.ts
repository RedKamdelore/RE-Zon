import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useLibraryStore } from './libraryStore'
import { usePlaylistStore, setPersistedBase, getPersistedBase } from './playlistStore'
import type { PersistedData, Track } from '@shared/types'

function makeBase(overrides: Partial<PersistedData> = {}): PersistedData {
  return {
    version: 2,
    musicFolders: ['C:\\Music'],
    playlists: [],
    lyricsOverrides: {},
    volume: 0.8,
    eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    appearance: { skin: 'spotify-dark', accent: '#1DB954', radius: 8, scale: 1 },
    playback: { crossfadeSec: 0 },
    playStats: {},
    lastfmApiKey: '',
    importSources: {},
    ...overrides,
  }
}

describe('libraryStore.addTracks', () => {
  beforeEach(() => {
    useLibraryStore.setState({ tracks: [], loading: false, usingDemo: false })
  })

  it('appends new tracks and dedupes by id', () => {
    const t = (id: string): Track => ({
      id, sourceId: 'vk', title: 'T', artist: 'A', album: 'VK', durationSec: 1, filePath: 'https://x/a.mp3',
    })
    useLibraryStore.getState().addTracks([t('vk:1'), t('vk:2')])
    expect(useLibraryStore.getState().tracks.map((x) => x.id)).toEqual(['vk:1', 'vk:2'])
    // повторный импорт не плодит дубликаты
    useLibraryStore.getState().addTracks([t('vk:2'), t('vk:3')])
    expect(useLibraryStore.getState().tracks.map((x) => x.id)).toEqual(['vk:1', 'vk:2', 'vk:3'])
  })
})

describe('libraryStore.addFolder', () => {
  beforeEach(() => {
    useLibraryStore.setState({ tracks: [], loading: false, usingDemo: false })
    usePlaylistStore.setState({ playlists: [], loaded: false })
    setPersistedBase(null)
  })

  afterEach(() => {
    vi.useRealTimers()
    delete (globalThis as Record<string, unknown>).window
    setPersistedBase(null)
  })

  it('updates the persisted base so a later playlist persist keeps musicFolders', async () => {
    vi.useFakeTimers()
    const saveData = vi.fn().mockResolvedValue(undefined)
    const scanned: Track[] = []
    ;(globalThis as Record<string, unknown>).window = {
      api: {
        pickFolder: vi.fn().mockResolvedValue('D:\\Tunes'),
        saveData,
        scanLibrary: vi.fn().mockResolvedValue(scanned),
      },
    }
    setPersistedBase(makeBase())

    await useLibraryStore.getState().addFolder()
    expect(saveData).toHaveBeenCalledTimes(1)
    expect((saveData.mock.calls[0][0] as PersistedData).musicFolders).toEqual([
      'C:\\Music',
      'D:\\Tunes',
    ])
    expect(getPersistedBase()?.musicFolders).toEqual(['C:\\Music', 'D:\\Tunes'])

    // Дебаунсированный persist из playlistStore не должен затереть musicFolders
    usePlaylistStore.getState().create()
    vi.advanceTimersByTime(500)
    expect(saveData).toHaveBeenCalledTimes(2)
    const saved = saveData.mock.calls[1][0] as PersistedData
    expect(saved.musicFolders).toEqual(['C:\\Music', 'D:\\Tunes'])
    expect(saved.playlists).toHaveLength(1)
  })

  it('does nothing when the picker is canceled', async () => {
    const saveData = vi.fn().mockResolvedValue(undefined)
    const scanLibrary = vi.fn()
    ;(globalThis as Record<string, unknown>).window = {
      api: { pickFolder: vi.fn().mockResolvedValue(null), saveData, scanLibrary },
    }
    setPersistedBase(makeBase())

    await useLibraryStore.getState().addFolder()
    expect(saveData).not.toHaveBeenCalled()
    expect(scanLibrary).not.toHaveBeenCalled()
  })
})

describe('libraryStore.removeFolder', () => {
  beforeEach(() => {
    useLibraryStore.setState({ tracks: [], loading: false, usingDemo: false })
    setPersistedBase(null)
  })

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window
    setPersistedBase(null)
  })

  it('removes folder, persists and rescans the remaining folders', async () => {
    const saveData = vi.fn().mockResolvedValue(undefined)
    const tracks: Track[] = []
    const scanLibrary = vi.fn().mockResolvedValue(tracks)
    ;(globalThis as Record<string, unknown>).window = { api: { saveData, scanLibrary } }
    setPersistedBase(makeBase({ musicFolders: ['C:\\Music', 'D:\\Tunes'] }))

    await useLibraryStore.getState().removeFolder('D:\\Tunes')
    expect(saveData).toHaveBeenCalledTimes(1)
    expect((saveData.mock.calls[0][0] as PersistedData).musicFolders).toEqual(['C:\\Music'])
    expect(getPersistedBase()?.musicFolders).toEqual(['C:\\Music'])
    expect(scanLibrary).toHaveBeenCalledWith(['C:\\Music'])
    expect(useLibraryStore.getState().usingDemo).toBe(false)
  })

  it('falls back to demo library when the last folder is removed', async () => {
    const demo: Track[] = []
    const saveData = vi.fn().mockResolvedValue(undefined)
    const demoLibrary = vi.fn().mockResolvedValue(demo)
    ;(globalThis as Record<string, unknown>).window = { api: { saveData, demoLibrary } }
    setPersistedBase(makeBase())

    await useLibraryStore.getState().removeFolder('C:\\Music')
    expect(getPersistedBase()?.musicFolders).toEqual([])
    expect(demoLibrary).toHaveBeenCalled()
    expect(useLibraryStore.getState().usingDemo).toBe(true)
  })
})
