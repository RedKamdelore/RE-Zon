// @vitest-environment jsdom
import {beforeEach,afterEach,expect,it,vi} from 'vitest'
import {useAccountsStore} from './accountsStore'
import {useLibraryStore} from './libraryStore'
import type {AccountLibrary,AccountView} from '@shared/accounts'
const account=(id:string):AccountView=>({id,service:'vk',label:id,autoRefresh:true,connectedAt:1})
const snapshot:AccountLibrary={all:[{extId:'1_2',title:'T',artist:'A',streamUrl:'https://example.com/track.mp3'}],liked:[],albums:[],unavailable:{},updatedAt:1}
beforeEach(()=>{
  useAccountsStore.setState({accounts:[account('vk:first'),account('vk:second')],libraries:{},busy:{},errors:{}})
  useLibraryStore.setState({tracks:[],hiddenIds:[]})
})
afterEach(()=>vi.unstubAllGlobals())
it('imports each account with separate IDs and preserves hidden tracks',async()=>{
  vi.stubGlobal('window',{api:{accountsImport:vi.fn(async()=>({ok:true,library:snapshot}))}})
  await useAccountsStore.getState().refresh('vk:first')
  const first=useLibraryStore.getState().tracks[0].id
  useLibraryStore.getState().hideTracks([first])
  await useAccountsStore.getState().refresh('vk:second')
  expect(useLibraryStore.getState().tracks).toHaveLength(2)
  expect(useLibraryStore.getState().tracks.map(t=>t.accountId)).toEqual(['vk:second','vk:first'])
  expect(useLibraryStore.getState().hiddenIds).toEqual([first])
})
it('keeps the last snapshot if an account refresh fails',async()=>{
  useAccountsStore.setState({libraries:{'vk:first':snapshot}})
  vi.stubGlobal('window',{api:{accountsImport:vi.fn(async()=>({ok:false,error:'Network failure'}))}})
  await useAccountsStore.getState().refresh('vk:first')
  expect(useAccountsStore.getState().libraries['vk:first']).toEqual(snapshot)
  expect(useAccountsStore.getState().errors['vk:first']).toBe('Network failure')
  expect(useAccountsStore.getState().busy['vk:first']).toBe(false)
})
it('does not reinsert tracks after the account is disconnected during refresh',async()=>{
  let resolve!:(value:unknown)=>void
  vi.stubGlobal('window',{api:{accountsImport:()=>new Promise(r=>{resolve=r})}})
  const pending=useAccountsStore.getState().refresh('vk:first')
  useAccountsStore.setState({accounts:[account('vk:second')]})
  resolve({ok:true,library:snapshot})
  await pending
  expect(useLibraryStore.getState().tracks).toHaveLength(0)
})

it('puts newly imported VK music first without duplicating old songs',async()=>{
 const importAccount=vi.fn().mockResolvedValueOnce({ok:true,library:snapshot}).mockResolvedValueOnce({ok:true,library:{...snapshot,all:[{extId:'1_3',title:'New song',artist:'A',streamUrl:'https://example.com/new.mp3'},...snapshot.all]}})
 vi.stubGlobal('window',{api:{accountsImport:importAccount}})
 await useAccountsStore.getState().refresh('vk:first')
 const oldId=useLibraryStore.getState().tracks[0].id
 useLibraryStore.getState().hideTracks([oldId])
 await useAccountsStore.getState().refresh('vk:first')
 expect(useLibraryStore.getState().tracks.map(t=>t.title)).toEqual(['New song','T'])
 expect(useLibraryStore.getState().hiddenIds).toEqual([oldId])
})
it('automatic refresh respects disabled accounts',async()=>{
 useAccountsStore.setState({accounts:[account('vk:first'),{...account('vk:second'),autoRefresh:false}]})
 const importAccount=vi.fn().mockResolvedValue({ok:true,library:snapshot})
 vi.stubGlobal('window',{api:{accountsImport:importAccount}})
 await useAccountsStore.getState().refreshAll()
 expect(importAccount).toHaveBeenCalledTimes(1)
 expect(importAccount).toHaveBeenCalledWith('vk:first')
})
