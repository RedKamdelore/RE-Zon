import { create } from 'zustand'
import type { PersistedData, Track } from '@shared/types'
import { getPersistedBase, setPersistedBase } from './playlistStore'

interface LibraryState {
  tracks: Track[]
  loading: boolean
  usingDemo: boolean
  init: (data?: PersistedData) => Promise<void> // data из App (единый loadData); без него — сам грузит
  addFolder: () => Promise<void> // pickFolder → persist musicFolders → rescan
  removeFolder: (folder: string) => Promise<void> // persist без папки → rescan (пусто → демо)
  addTracks: (tracks: Track[]) => void // внешние треки (VK и др.): дописывает, дедуп по id
}

export const useLibraryStore = create<LibraryState>()((set) => ({
  tracks: [],
  loading: true,
  usingDemo: false,

  addTracks: (incoming) => {
    set((state) => {
      const known = new Set(state.tracks.map((t) => t.id))
      const fresh = incoming.filter((t) => !known.has(t.id))
      return fresh.length > 0 ? { tracks: [...state.tracks, ...fresh] } : {}
    })
  },

  init: async (data) => {
    // Guard: plain browser dev без preload — window.api отсутствует
    if (typeof window === 'undefined' || !window.api) {
      set({ loading: false })
      return
    }
    try {
      const d = data ?? (await window.api.loadData())
      if (d.musicFolders.length === 0) {
        const tracks = await window.api.demoLibrary()
        set({ tracks, usingDemo: true, loading: false })
      } else {
        const tracks = await window.api.scanLibrary(d.musicFolders)
        set({ tracks, usingDemo: false, loading: false })
      }
    } catch (e) {
      console.error('library init failed:', e)
      set({ loading: false })
    }
  },

  addFolder: async () => {
    if (typeof window === 'undefined' || !window.api) return
    const folder = await window.api.pickFolder()
    if (!folder) return
    // База из памяти (см. playlistStore) — без лишнего чтения диска; fallback на loadData
    const data = getPersistedBase() ?? (await window.api.loadData())
    const musicFolders = [...new Set([...data.musicFolders, folder])]
    const updated = { ...data, musicFolders }
    await window.api.saveData(updated)
    // Обновляем базу в памяти: иначе следующий дебаунсированный persist
    // (playlists/lyrics/EQ/volume) мержится в старую базу и затирает musicFolders
    setPersistedBase(updated)
    set({ loading: true })
    const tracks = await window.api.scanLibrary(musicFolders)
    set({ tracks, usingDemo: false, loading: false })
  },

  removeFolder: async (folder) => {
    if (typeof window === 'undefined' || !window.api) return
    const data = getPersistedBase() ?? (await window.api.loadData())
    const musicFolders = data.musicFolders.filter((f) => f !== folder)
    const updated = { ...data, musicFolders }
    await window.api.saveData(updated)
    setPersistedBase(updated)
    set({ loading: true })
    if (musicFolders.length === 0) {
      const tracks = await window.api.demoLibrary()
      set({ tracks, usingDemo: true, loading: false })
    } else {
      const tracks = await window.api.scanLibrary(musicFolders)
      set({ tracks, usingDemo: false, loading: false })
    }
  },
}))
