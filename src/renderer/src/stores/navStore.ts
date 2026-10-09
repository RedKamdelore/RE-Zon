import { create } from 'zustand'
import { animateViewChange } from '../motion'

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
export const useNavStore = create<NavState>()((set, get) => ({
  view: { name: 'home' },
  past: [], future: [],
  setView: (view) => { if (JSON.stringify(get().view) === JSON.stringify(view)) return; animateViewChange(() => set(s => ({ view, past: [...s.past, s.view].slice(-60), future: [] })), 'route') },
  back: () => { if (!get().past.length) return; animateViewChange(() => set(s => ({ view: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.view, ...s.future] })), 'route') },
  forward: () => { if (!get().future.length) return; animateViewChange(() => set(s => ({ view: s.future[0], past: [...s.past, s.view], future: s.future.slice(1) })), 'route') },
}))
