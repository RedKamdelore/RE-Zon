import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useLibraryStore } from './libraryStore'
import { usePlaylistStore, setPersistedBase, getPersistedBase } from './playlistStore'
import type { PersistedData, Track } from '@shared/types'

function makeBase(overrides: Partial<PersistedData> = {}): PersistedData {
  return {
    version: 1,
    musicFolders: ['C:\\Music'],
    playlists: [],
    lyricsOverrides: {},
    volume: 0.8,
    eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ...overrides,
  }
}

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
