import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useLibraryStore, visibleTracks } from './libraryStore'
import { usePlaylistStore, setPersistedBase, getPersistedBase } from './playlistStore'
import { defaultTheme } from '@shared/themeModel'
import type { PersistedData, Track } from '@shared/types'

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
    ...overrides,
  }
}

describe('libraryStore.addTracks', () => {
  beforeEach(() => {
    useLibraryStore.setState({ tracks: [], loading: false, usingDemo: false })
    setPersistedBase(null)
  })

  afterEach(() => {
    vi.useRealTimers()
    delete (globalThis as Record<string, unknown>).window
    setPersistedBase(null)
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

  it('persists imported tracks via debounced saveData', () => {
    vi.useFakeTimers()
    const saveData = vi.fn().mockResolvedValue(undefined)
    ;(globalThis as Record<string, unknown>).window = { api: { saveData } }
    setPersistedBase(makeBase())
    const t = (id: string, sourceId: string): Track => ({
      id, sourceId, title: 'T', artist: 'A', album: 'X', durationSec: 1, filePath: 'https://x/a.mp3',
    })
    useLibraryStore.getState().addTracks([t('vk:1', 'vk'), t('sc:2', 'soundcloud')])
    vi.advanceTimersByTime(500)
    expect(saveData).toHaveBeenCalledTimes(1)
    const saved = saveData.mock.calls[0][0] as PersistedData
    expect(saved.importedTracks.map((x) => x.id)).toEqual(['vk:1', 'sc:2'])
    // база обновлена — следующий persist не затирает importedTracks
    expect(getPersistedBase()?.importedTracks.map((x) => x.id)).toEqual(['vk:1', 'sc:2'])
  })

  it('does not persist local/demo tracks', () => {
    vi.useFakeTimers()
    const saveData = vi.fn().mockResolvedValue(undefined)
    ;(globalThis as Record<string, unknown>).window = { api: { saveData } }
    setPersistedBase(makeBase())
    useLibraryStore.getState().addTracks([
      { id: 'local:x', sourceId: 'local', title: 'T', artist: 'A', album: 'X', durationSec: 1, filePath: 'C:\\a.mp3' },
      { id: 'vk:9', sourceId: 'vk', title: 'T', artist: 'A', album: 'X', durationSec: 1, filePath: 'https://x/9.mp3' },
    ])
    vi.advanceTimersByTime(500)
    const saved = saveData.mock.calls[0][0] as PersistedData
    expect(saved.importedTracks.map((x) => x.id)).toEqual(['vk:9'])
  })
})

describe('libraryStore.init imported tracks', () => {
  beforeEach(() => {
    useLibraryStore.setState({ tracks: [], loading: false, usingDemo: false })
    setPersistedBase(null)
  })

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window
    setPersistedBase(null)
  })

  const vkTrack: Track = {
    id: 'vk:1', sourceId: 'vk', title: 'VK Song', artist: 'A', album: 'VK', durationSec: 10, filePath: 'https://x/a.mp3',
  }

  it('restores persisted importedTracks after rescan', async () => {
    const local: Track = {
      id: 'local:a', sourceId: 'local', title: 'L', artist: 'A', album: 'X', durationSec: 1, filePath: 'C:\\a.mp3',
    }
    ;(globalThis as Record<string, unknown>).window = {
      api: { scanLibrary: vi.fn().mockResolvedValue([local]) },
    }
    await useLibraryStore.getState().init(makeBase({ importedTracks: [vkTrack] }))
    expect(useLibraryStore.getState().tracks.map((t) => t.id)).toEqual(['local:a', 'vk:1'])
  })

  it('restores persisted importedTracks over the demo library and dedupes by id', async () => {
    ;(globalThis as Record<string, unknown>).window = {
      api: { demoLibrary: vi.fn().mockResolvedValue([vkTrack]) },
    }
    await useLibraryStore.getState().init(makeBase({ musicFolders: [], importedTracks: [vkTrack] }))
    // дубликат из importedTracks отброшен — демо-трек с тем же id уже есть
    expect(useLibraryStore.getState().tracks.map((t) => t.id)).toEqual(['vk:1'])
    expect(useLibraryStore.getState().usingDemo).toBe(true)
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

describe('libraryStore hidden tracks', () => {
  const t = (id: string): Track => ({
    id, sourceId: 'local', title: 'T', artist: 'A', album: 'X', durationSec: 1, filePath: `C:\\${id}.mp3`,
  })

  beforeEach(() => {
    useLibraryStore.setState({
      tracks: [t('local:a'), t('local:b'), t('local:c')],
      hiddenIds: [],
      loading: false,
      usingDemo: false,
    })
    setPersistedBase(null)
  })

  afterEach(() => {
    vi.useRealTimers()
    delete (globalThis as Record<string, unknown>).window
    setPersistedBase(null)
  })

  it('hideTrack marks id hidden and visibleTracks filters it out', () => {
    useLibraryStore.getState().hideTrack('local:b')
    expect(useLibraryStore.getState().hiddenIds).toEqual(['local:b'])
    // tracks хранит все треки, visibleTracks — без скрытых
    expect(useLibraryStore.getState().tracks).toHaveLength(3)
    expect(visibleTracks(useLibraryStore.getState()).map((x) => x.id)).toEqual(['local:a', 'local:c'])
  })

  it('hideTrack is idempotent', () => {
    useLibraryStore.getState().hideTrack('local:b')
    useLibraryStore.getState().hideTrack('local:b')
    expect(useLibraryStore.getState().hiddenIds).toEqual(['local:b'])
  })

  it('unhideTrack returns the track to visibleTracks', () => {
    useLibraryStore.getState().hideTrack('local:b')
    useLibraryStore.getState().unhideTrack('local:b')
    expect(useLibraryStore.getState().hiddenIds).toEqual([])
    expect(visibleTracks(useLibraryStore.getState())).toHaveLength(3)
    // unhide не-скрытого трека — no-op
    useLibraryStore.getState().unhideTrack('local:b')
    expect(useLibraryStore.getState().hiddenIds).toEqual([])
  })

  it('visibleTracks is memoized by tracks/hiddenIds references', () => {
    const s = useLibraryStore.getState()
    expect(visibleTracks(s)).toBe(visibleTracks(s))
  })

  it('persists hiddenTracks via debounced saveData', () => {
    vi.useFakeTimers()
    const saveData = vi.fn().mockResolvedValue(undefined)
    ;(globalThis as Record<string, unknown>).window = { api: { saveData } }
    setPersistedBase(makeBase())
    useLibraryStore.getState().hideTrack('local:a')
    useLibraryStore.getState().hideTrack('local:c')
    vi.advanceTimersByTime(500)
    expect(saveData).toHaveBeenCalledTimes(1)
    expect((saveData.mock.calls[0][0] as PersistedData).hiddenTracks).toEqual(['local:a', 'local:c'])
    expect(getPersistedBase()?.hiddenTracks).toEqual(['local:a', 'local:c'])

    useLibraryStore.getState().unhideTrack('local:a')
    vi.advanceTimersByTime(500)
    expect((saveData.mock.calls[1][0] as PersistedData).hiddenTracks).toEqual(['local:c'])
  })

  it('init loads hiddenTracks into hiddenIds', async () => {
    useLibraryStore.setState({ tracks: [], hiddenIds: [] })
    ;(globalThis as Record<string, unknown>).window = {
      api: { scanLibrary: vi.fn().mockResolvedValue([t('local:a'), t('local:b')]) },
    }
    await useLibraryStore.getState().init(makeBase({ hiddenTracks: ['local:b'] }))
    expect(useLibraryStore.getState().hiddenIds).toEqual(['local:b'])
    expect(visibleTracks(useLibraryStore.getState()).map((x) => x.id)).toEqual(['local:a'])
  })
})
