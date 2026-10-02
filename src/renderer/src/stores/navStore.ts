import { create } from 'zustand'

export type View =
  | { name: 'home' }
  | { name: 'library'; section: 'songs' | 'albums' | 'playlists' | 'artists' | 'favorites' }
  | { name: 'sources' }
  | { name: 'search'; query?: string; scope?: 'all' | 'library' | 'soundcloud' }
  | { name: 'playlist'; id: string }
  | { name: 'favorites' }
  | { name: 'settings'; page?: 'integrations' | 'updates' | 'data' | 'downloads' }
  | { name: 'artist'; artist: string }
  | { name: 'album'; album: string; artist?: string; albumKey?: string }
  | { name: 'radio'; trackId: string }
  | { name: 'service'; accountId: string; section: import('@shared/accounts').AccountSection }

interface NavState {
  view: View
  setView: (view: View) => void
  past: View[]
  future: View[]
  back: () => void
  forward: () => void
}

/**
 * Навигация вынесена в стор, чтобы контекстное меню трека (и любой глубоко
 * вложенный компонент) могло переключать view без prop-drilling через App.
 */
export const useNavStore = create<NavState>()((set) => ({
  view: { name: 'home' },
  past: [], future: [],
  setView: (view) => set(s => JSON.stringify(s.view) === JSON.stringify(view) ? {} : { view, past: [...s.past, s.view].slice(-60), future: [] }),
  back: () => set(s => s.past.length ? { view: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.view, ...s.future] } : {}),
  forward: () => set(s => s.future.length ? { view: s.future[0], past: [...s.past, s.view], future: s.future.slice(1) } : {}),
}))
