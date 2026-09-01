import { create } from 'zustand'
import type { PersistedData, Track } from '@shared/types'
import { getPersistedBase, setPersistedBase, persistPatch } from './playlistStore'

/** Внешние (не local/demo) треки — персистятся в importedTracks */
const isImported = (t: Track): boolean => t.sourceId !== 'local' && t.sourceId !== 'demo'

/** Слияние по id: базовые треки первыми, дубликаты из extra отбрасываются */
function mergeById(base: Track[], extra: Track[]): Track[] {
  const known = new Set(base.map((t) => t.id))
  return [...base, ...extra.filter((t) => !known.has(t.id))]
}

interface LibraryState {
  tracks: Track[]
  loading: boolean
  usingDemo: boolean
  init: (data?: PersistedData) => Promise<void> // data из App (единый loadData); без него — сам грузит
  addFolder: () => Promise<void> // pickFolder → persist musicFolders → rescan
  removeFolder: (folder: string) => Promise<void> // persist без папки → rescan (пусто → демо)
  addTracks: (tracks: Track[]) => void // внешние треки (VK и др.): дописывает, дедуп по id
}

export const useLibraryStore = create<LibraryState>()((set, get) => ({
  tracks: [],
  loading: true,
  usingDemo: false,

  addTracks: (incoming) => {
    const fresh = incoming.filter((t) => !get().tracks.some((x) => x.id === t.id))
    if (fresh.length === 0) return
    const tracks = [...get().tracks, ...fresh]
    set({ tracks })
    // Внешние треки персистим: плейлисты ссылаются на их id, иначе после
    // рестарта ссылки вели бы в никуда. Стрим-URL VK/SoundCloud сессионные и
    // со временем протухают — трек останется в библиотеке, а неудача
    // воспроизведения обрабатывается error-skip в подписках плеера.
    persistPatch({ importedTracks: tracks.filter(isImported) })
  },

  init: async (data) => {
    // Guard: plain browser dev без preload — window.api отсутствует
    if (typeof window === 'undefined' || !window.api) {
      set({ loading: false })
      return
    }
    try {
      const d = data ?? (await window.api.loadData())
      // Персистенс импортированных треков: докидываем их к отсканированной
      // библиотеке, чтобы плейлисты с vk:/sc: id ожили после рестарта
      const imported = d.importedTracks ?? []
      if (d.musicFolders.length === 0) {
        const tracks = await window.api.demoLibrary()
        set({ tracks: mergeById(tracks, imported), usingDemo: true, loading: false })
      } else {
        const tracks = await window.api.scanLibrary(d.musicFolders)
        set({ tracks: mergeById(tracks, imported), usingDemo: false, loading: false })
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
