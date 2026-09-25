import { create } from 'zustand'
import { accountTrackId, type AccountView, type AccountLibrary } from '@shared/accounts'
import type { ServiceId } from '@shared/connections'
import type { Track } from '@shared/types'
import { useLibraryStore } from './libraryStore'
import { usePlaylistStore, persistPatch, flushPersist } from './playlistStore'
import { useConnectionsStore } from './connectionsStore'

interface AccountsState {
  accounts: AccountView[]
  libraries: Record<string, AccountLibrary>
  busy: Record<string, boolean>
  errors: Record<string,string>
  init: (libraries?:Record<string,AccountLibrary>)=>Promise<void>
  connect:(service:ServiceId,label:string,reconnectId?:string)=>Promise<string|null>
  refresh:(id:string)=>Promise<void>
  refreshAll:()=>Promise<void>
  update:(id:string,patch:{label?:string;autoRefresh?:boolean})=>Promise<void>
  disconnect:(id:string)=>Promise<void>
}
export const useAccountsStore=create<AccountsState>()((set,get)=>({
  accounts:[],libraries:{},busy:{},errors:{},
  init:async(libraries={})=>{
    set({libraries})
    if(window.api) set({accounts:await window.api.accountsList()})
  },
  connect:async(service,label,reconnectId)=>{
    const key=reconnectId ?? service
    if(!window.api || get().busy[key]) return null
    set({busy:{...get().busy,[key]:true},errors:{...get().errors,[key]:''}})
    try {
      await flushPersist()
      const result=await window.api.accountsConnect(service,label,reconnectId)
      if(!result.ok) throw new Error(result.error)
      set({accounts:await window.api.accountsList()})
      set({busy:{...get().busy,[key]:false}})
      await get().refresh(result.account.id)
      return result.account.id
    } catch(error) {set({errors:{...get().errors,[key]:error instanceof Error?error.message:String(error)}});return null}
    finally {set({busy:{...get().busy,[key]:false}})}
  },
  refresh:async(id)=>{
    if(!window.api || get().busy[id]) return
    set({busy:{...get().busy,[id]:true},errors:{...get().errors,[id]:''}})
    try {
      const account=get().accounts.find(a=>a.id===id)
      if(!account) return
      const result=await window.api.accountsImport(id)
      if(!result.ok) throw new Error(result.error)
      if(!get().accounts.some(a=>a.id===id)) return
      const playable:Track[]=[...result.library.all,...result.library.liked].filter(t=>t.streamUrl).map(t=>({
        id:accountTrackId(account.service,id,t.extId ?? `${t.artist}:${t.title}`),accountId:id,sourceId:account.service,
        albumId:t.albumId,albumArtist:t.albumArtist,coverDataUrl:t.coverUrl,title:t.title,artist:t.artist,album:t.album ?? account.service,durationSec:t.durationSec ?? 0,filePath:t.streamUrl!,
      }))
      const tracks=[...new Map(playable.map(t=>[t.id,t])).values()]
      useLibraryStore.getState().upsertTracks(tracks)
      if(id===`${account.service}:default` && tracks.length && !result.library.unavailable.all) {
        const name=useConnectionsStore.getState().statuses[account.service]?.playlistName
        const playlists=usePlaylistStore.getState().playlists.map(p=>p.name===name?{...p,trackIds:tracks.map(t=>t.id)}:p)
        usePlaylistStore.setState({playlists});persistPatch({playlists})
      }
      set({libraries:{...get().libraries,[id]:result.library}})
    } catch(error) {set({errors:{...get().errors,[id]:error instanceof Error?error.message:String(error)}})}
    finally {set({busy:{...get().busy,[id]:false}})}
  },
  refreshAll:async()=>{
    for(const account of get().accounts) if(account.autoRefresh) await get().refresh(account.id)
  },
  update:async(id,patch)=>{
    if(!window.api)return
    const account=await window.api.accountsUpdate(id,patch)
    set({accounts:get().accounts.map(a=>a.id===id?account:a)})
  },
  disconnect:async(id)=>{
    if(!window.api)return
    await window.api.accountsDisconnect(id)
    set({accounts:get().accounts.filter(a=>a.id!==id)})
    await useConnectionsStore.getState().refresh()
  },
}))
