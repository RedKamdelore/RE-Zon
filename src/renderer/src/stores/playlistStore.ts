import { create } from 'zustand'
import type { PersistedData, Playlist } from '@shared/types'
import {
  createPlaylist,
  renamePlaylist,
  addTrack as addTrackOp,
  removeTrack as removeTrackOp,
} from '@shared/playlists'

interface PlaylistState {
  playlists: Playlist[]
  loaded: boolean
  init: (playlists: Playlist[]) => void // вызывается из App после единственного loadData
  create: (name?: string) => string // возвращает id; default name «Мой плейлист №N»
  rename: (id: string, name: string) => void
  remove: (id: string) => void
  addTrack: (playlistId: string, trackId: string) => void
  removeTrack: (playlistId: string, index: number) => void
  setCover: (id: string, coverDataUrl: string) => void
}

// --- Persisted base -------------------------------------------------------
// Последний известный полный PersistedData. App сохраняет его после стартового
// loadData через setPersistedBase; дебаунсированный persist мержит в него
// актуальные playlists, не дёргая loadData повторно (и не затирая чужие поля).
// libraryStore.addFolder тоже использует базу, чтобы не читать диск лишний раз.
let persistedBase: PersistedData | null = null

export function setPersistedBase(data: PersistedData | null): void {
  persistedBase = data
}

export function getPersistedBase(): PersistedData | null {
  return persistedBase
}

// --- Debounced persist ----------------------------------------------------
const PERSIST_DELAY = 500
let persistTimer: ReturnType<typeof setTimeout> | null = null
let pendingPatch: Partial<PersistedData> = {}

/**
 * Общий дебаунсированный (500 мс) persist: мержит произвольные поля
 * (playlists, eqGains, …) в persistedBase и сохраняет через saveData.
 * Серия патчей внутри окна дебаунса накапливается в один saveData.
 */
export function persistPatch(patch: Partial<PersistedData>): void {
  pendingPatch = { ...pendingPatch, ...patch }
  if (persistTimer !== null) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    const merged = pendingPatch
    pendingPatch = {}
    if (typeof window === 'undefined' || !window.api || !persistedBase) return
    // Обновляем базу в памяти, чтобы следующие сохранения мержились с ней
    persistedBase = { ...persistedBase, ...merged }
    window.api.saveData(persistedBase).catch((e) => console.error('saveData failed:', e))
  }, PERSIST_DELAY)
}

function schedulePersist(playlists: Playlist[]): void {
  persistPatch({ playlists })
}

// --- Default name numbering ------------------------------------------------
// «Мой плейлист №N»: наименьший свободный N (дырки после удалений переиспользуются)
function nextDefaultName(playlists: Playlist[]): string {
  const used = new Set<number>()
  for (const p of playlists) {
    const m = /^Мой плейлист №(\d+)$/.exec(p.name)
    if (m) used.add(Number(m[1]))
  }
  let n = 1
  while (used.has(n)) n++
  return `Мой плейлист №${n}`
}

export const usePlaylistStore = create<PlaylistState>()((set, get) => {
  /** Применяет чистую операцию к плейлисту по id и планирует persist */
  const mutate = (id: string, op: (p: Playlist) => Playlist): void => {
    const playlists = get().playlists.map((p) => (p.id === id ? op(p) : p))
    set({ playlists })
    schedulePersist(playlists)
  }

  return {
    playlists: [],
    loaded: false,

    init: (playlists) => {
      set({ playlists, loaded: true })
      if (persistedBase) persistedBase = { ...persistedBase, playlists }
    },

    create: (name) => {
      const current = get().playlists
      const playlist = createPlaylist(current, name ?? nextDefaultName(current))
      const playlists = [...current, playlist]
      set({ playlists })
      schedulePersist(playlists)
      return playlist.id
    },

    rename: (id, name) => mutate(id, (p) => renamePlaylist(p, name)),

    remove: (id) => {
      const playlists = get().playlists.filter((p) => p.id !== id)
      set({ playlists })
      schedulePersist(playlists)
    },

    addTrack: (playlistId, trackId) => mutate(playlistId, (p) => addTrackOp(p, trackId)),

    removeTrack: (playlistId, index) => mutate(playlistId, (p) => removeTrackOp(p, index)),

    setCover: (id, coverDataUrl) => mutate(id, (p) => ({ ...p, coverDataUrl })),
  }
})
