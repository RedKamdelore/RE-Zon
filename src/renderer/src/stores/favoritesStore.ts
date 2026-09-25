import { create } from 'zustand'
import { persistPatch } from './playlistStore'

interface FavoritesState {
  ids: string[] // id треков в «Любимом»
  init: (ids: string[]) => void // из App после loadData
  toggle: (id: string) => void
  setMany: (ids: string[], favorite: boolean) => void
}

/** Виртуальный плейлист «Любимое»: id-набор, персистится как favoriteIds */
export const useFavoritesStore = create<FavoritesState>()((set, get) => ({
  ids: [],

  init: (ids) => set({ ids }),

  setMany: (ids, favorite) => {
    const selected = new Set(ids)
    const next = favorite ? [...new Set([...get().ids, ...ids])] : get().ids.filter((id) => !selected.has(id))
    set({ ids: next })
    persistPatch({ favoriteIds: next })
  },

  toggle: (id) => {
    const has = get().ids.includes(id)
    const next = has ? get().ids.filter((x) => x !== id) : [...get().ids, id]
    set({ ids: next })
    persistPatch({ favoriteIds: next })
  },
}))

export function isFavorite(id: string): boolean {
  return useFavoritesStore.getState().ids.includes(id)
}
