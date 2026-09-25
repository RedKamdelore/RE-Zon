import { create } from 'zustand'
export type SessionTab = 'queue' | 'lyrics' | 'eq'
export type FullPlayerMode = 'cover' | 'lyrics' | 'queue'
export type CollectionPreferences = { query: string; source: string; sort: string; layout: 'grid' | 'list'; density: 'comfortable' | 'compact' }
export const collectionDefaults: CollectionPreferences = { query: '', source: '', sort: 'recent', layout: 'grid', density: 'comfortable' }
function readPreference(key: string): boolean { try { return localStorage.getItem(key) === 'true' } catch { return false } }
function readCollections(): Record<string, CollectionPreferences> {
  try {
    const value=JSON.parse(localStorage.getItem('rezon-collection-preferences')??'{}')
    if(!value || typeof value!=='object' || Array.isArray(value))return {}
    return Object.fromEntries(Object.entries(value).filter(([key])=>['songs','albums','artists','playlists','favorites'].includes(key)).map(([key,raw])=>{
      const p=(raw && typeof raw==='object'?raw:{}) as Partial<CollectionPreferences>
      return [key,{query:typeof p.query==='string'?p.query:'',source:typeof p.source==='string'?p.source:'',sort:['recent','title','artist'].includes(p.sort??'')?(p.sort??'recent'):'recent',layout:p.layout==='list'?'list':'grid',density:p.density==='compact'?'compact':'comfortable'}]
    }))
  } catch { return {} }
}
export const useWorkspaceStore = create<{
  sessionOpen: boolean; pinned: boolean; sessionTab: SessionTab; searchOpen: boolean
  fullPlayerOpen: boolean; fullPlayerMode: FullPlayerMode
  collections: Record<string, CollectionPreferences>
  lyricDrafts: Record<string,string>
  setLyricDraft: (id:string, value:string|undefined)=>void
  toggleSession: () => void; closeSession: () => void; pinSession: () => void
  setSessionTab: (tab: SessionTab) => void; setSearchOpen: (open: boolean) => void
  openFullPlayer: (mode?: FullPlayerMode) => void; closeFullPlayer: () => void; setFullPlayerMode: (mode: FullPlayerMode) => void
  setCollection: (section: string, patch: Partial<CollectionPreferences>) => void
}>()((set) => ({
  sessionOpen: readPreference('rezon-session-pinned'), pinned: readPreference('rezon-session-pinned'), sessionTab: 'queue', searchOpen: false, collections: readCollections(), lyricDrafts: {},
  fullPlayerOpen: false, fullPlayerMode: (() => { try { const saved = localStorage.getItem('rezon-full-player-mode'); return saved === 'lyrics' || saved === 'queue' ? saved : 'cover' } catch { return 'cover' } })(),
  setLyricDraft: (id,value)=>set(s=>{const lyricDrafts={...s.lyricDrafts};if(value===undefined)delete lyricDrafts[id];else lyricDrafts[id]=value;return{lyricDrafts}}),
  toggleSession: () => set(s => ({ sessionOpen: !s.sessionOpen })),
  closeSession: () => set({ sessionOpen: false }),
  pinSession: () => set(s => { const pinned = !s.pinned; try { localStorage.setItem('rezon-session-pinned', String(pinned)) } catch {} return { pinned, sessionOpen: true } }),
  setSessionTab: sessionTab => set({ sessionTab, sessionOpen: true }),
  setSearchOpen: searchOpen => set({ searchOpen }),
  openFullPlayer: mode => set(s => ({ fullPlayerOpen: true, fullPlayerMode: mode ?? s.fullPlayerMode })),
  closeFullPlayer: () => set({ fullPlayerOpen: false }),
  setFullPlayerMode: fullPlayerMode => set(() => { try { localStorage.setItem('rezon-full-player-mode', fullPlayerMode) } catch {} return { fullPlayerMode } }),
  setCollection: (section, patch) => set(s => { const collections={ ...s.collections, [section]: { ...collectionDefaults, ...s.collections[section], ...patch } }; try { localStorage.setItem('rezon-collection-preferences',JSON.stringify(collections)) } catch {} return {collections} }),
}))
