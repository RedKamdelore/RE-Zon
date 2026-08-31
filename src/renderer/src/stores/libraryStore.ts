import { create } from 'zustand'
import type { Track } from '@shared/types'

interface LibraryState {
  tracks: Track[]
  loading: boolean
  usingDemo: boolean
  init: () => Promise<void> // loadData → folders? scanLibrary : demoLibrary
  addFolder: () => Promise<void> // pickFolder → persist musicFolders → rescan
}

export const useLibraryStore = create<LibraryState>()((set) => ({
  tracks: [],
  loading: true,
  usingDemo: false,

  init: async () => {
    // Guard: plain browser dev без preload — window.api отсутствует
    if (typeof window === 'undefined' || !window.api) {
      set({ loading: false })
      return
    }
    try {
      const data = await window.api.loadData()
      if (data.musicFolders.length === 0) {
        const tracks = await window.api.demoLibrary()
        set({ tracks, usingDemo: true, loading: false })
      } else {
        const tracks = await window.api.scanLibrary(data.musicFolders)
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
    const data = await window.api.loadData()
    const musicFolders = [...new Set([...data.musicFolders, folder])]
    await window.api.saveData({ ...data, musicFolders })
    set({ loading: true })
    const tracks = await window.api.scanLibrary(musicFolders)
    set({ tracks, usingDemo: false, loading: false })
  },
}))
