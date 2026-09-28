import { create } from 'zustand'
export type FullPlayerMode = 'cover' | 'lyrics' | 'queue' | 'eq'
export type PlayerEffect = 'still' | 'calm' | 'orbit' | 'prism'
export type CollectionPreferences = { query: string; source: string; sort: string; layout: 'grid' | 'list'; density: 'comfortable' | 'compact' }
export const collectionDefaults: CollectionPreferences = { query: '', source: '', sort: 'recent', layout: 'grid', density: 'comfortable' }
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
  searchOpen: boolean
  fullPlayerOpen: boolean; fullPlayerMode: FullPlayerMode; playerEffect: PlayerEffect
  collections: Record<string, CollectionPreferences>
  lyricDrafts: Record<string,string>
  setLyricDraft: (id:string, value:string|undefined)=>void
  setSearchOpen: (open: boolean) => void
  openFullPlayer: (mode?: FullPlayerMode) => void; closeFullPlayer: () => void; setFullPlayerMode: (mode: FullPlayerMode) => void
  setPlayerEffect: (effect: PlayerEffect) => void
  setCollection: (section: string, patch: Partial<CollectionPreferences>) => void
}>()((set) => ({
  searchOpen: false, collections: readCollections(), lyricDrafts: {},
  fullPlayerOpen: false, fullPlayerMode: (() => { try { const saved = localStorage.getItem('rezon-full-player-mode'); return saved === 'lyrics' || saved === 'queue' || saved === 'eq' ? saved : 'cover' } catch { return 'cover' } })(),
  playerEffect: (() => { try { const saved = localStorage.getItem('rezon-player-effect'); return saved === 'still' || saved === 'orbit' || saved === 'prism' ? saved : 'calm' } catch { return 'calm' } })(),
  setLyricDraft: (id,value)=>set(s=>{const lyricDrafts={...s.lyricDrafts};if(value===undefined)delete lyricDrafts[id];else lyricDrafts[id]=value;return{lyricDrafts}}),
  setSearchOpen: searchOpen => set({ searchOpen }),
  openFullPlayer: mode => set(s => ({ fullPlayerOpen: true, fullPlayerMode: mode ?? s.fullPlayerMode })),
  closeFullPlayer: () => set({ fullPlayerOpen: false }),
  setFullPlayerMode: fullPlayerMode => set(() => { try { localStorage.setItem('rezon-full-player-mode', fullPlayerMode) } catch {} return { fullPlayerMode } }),
  setPlayerEffect: playerEffect => set(() => { try { localStorage.setItem('rezon-player-effect', playerEffect) } catch {} return { playerEffect } }),
  setCollection: (section, patch) => set(s => { const collections={ ...s.collections, [section]: { ...collectionDefaults, ...s.collections[section], ...patch } }; try { localStorage.setItem('rezon-collection-preferences',JSON.stringify(collections)) } catch {} return {collections} }),
}))
