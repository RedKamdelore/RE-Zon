import { create } from 'zustand'

export type View =
  | { name: 'home' }
  | { name: 'search' }
  | { name: 'playlist'; id: string }
  | { name: 'settings' }
  | { name: 'artist'; artist: string }
  | { name: 'album'; album: string; artist?: string }
  | { name: 'radio'; trackId: string }

interface NavState {
  view: View
  setView: (view: View) => void
}

/**
 * Навигация вынесена в стор, чтобы контекстное меню трека (и любой глубоко
 * вложенный компонент) могло переключать view без prop-drilling через App.
 */
export const useNavStore = create<NavState>()((set) => ({
  view: { name: 'home' },
  setView: (view) => set({ view }),
}))
