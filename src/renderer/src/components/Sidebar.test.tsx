// @vitest-environment jsdom
import {act} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {beforeEach,afterEach,it,expect} from 'vitest'
import Sidebar from './Sidebar'
import LibraryView from './LibraryView'
import {useNavStore} from '../stores/navStore'
import {usePlaylistStore} from '../stores/playlistStore'
import {useLibraryStore} from '../stores/libraryStore'
import {useAccountsStore} from '../stores/accountsStore'
import {useWorkspaceStore} from '../stores/workspaceStore'
let host:HTMLDivElement,root:Root
function App(){const {view,setView}=useNavStore();return <><Sidebar view={view} onNavigate={setView}/>{view.name==='library'&&<LibraryView section={view.section}/>}</>}
beforeEach(()=>{
 ;(globalThis as Record<string,unknown>).IS_REACT_ACT_ENVIRONMENT=true
 host=document.createElement('div');document.body.append(host);root=createRoot(host)
 useNavStore.setState({view:{name:'home'},past:[],future:[]})
 useWorkspaceStore.setState({fullPlayerOpen:false,collections:{}})
 usePlaylistStore.setState({playlists:Array.from({length:12},(_,i)=>({id:'p'+i,name:'Подборка '+i,trackIds:[],createdAt:1}))})
 useLibraryStore.setState({tracks:[{id:'a',title:'Song',artist:'Artist',album:'Album',durationSec:5,sourceId:'local',filePath:'a.mp3'}],hiddenIds:[]})
 useAccountsStore.setState({accounts:[],libraries:{}})
 act(()=>root.render(<App/>))
})
afterEach(()=>{act(()=>root.unmount());host.remove()})
function click(selector:string){act(()=>host.querySelector<HTMLButtonElement>(selector)!.click())}
it('opens the collection and exposes the current route to assistive technology',()=>{
 click('[aria-label="Коллекция"]')
 expect(useNavStore.getState().view).toEqual({name:'library',section:'songs'})
 expect(host.querySelector('[aria-label="Коллекция"]')?.getAttribute('aria-current')).toBe('page')
 expect(host.querySelectorAll('.catalog-row')).toHaveLength(1)
})
it('keeps access to all playlists without a navigation preview limit',()=>{
 act(()=>useNavStore.getState().setView({name:'library',section:'playlists'}))
 expect(host.querySelectorAll('.album-card')).toHaveLength(12)
})
it('marks sources active while viewing an account collection',()=>{
 act(()=>useNavStore.getState().setView({name:'service',accountId:'vk:1',section:'liked'}))
 expect(host.querySelector('[aria-label="Источники"]')?.getAttribute('aria-current')).toBe('page')
})
it('opens the full player without replacing the current route',()=>{
 click('[aria-label="Плеер"]')
 expect(useWorkspaceStore.getState().fullPlayerOpen).toBe(true)
 expect(useNavStore.getState().view).toEqual({name:'home'})
})
it('keeps library filters when visiting an album and going back',()=>{
 act(()=>{useNavStore.getState().setView({name:'library',section:'songs'});useWorkspaceStore.getState().setCollection('songs',{query:'Song'});useNavStore.getState().setView({name:'album',album:'Album'});useNavStore.getState().back()})
 expect(host.querySelector<HTMLInputElement>('[aria-label="Поиск в разделе"]')?.value).toBe('Song')
 expect(host.querySelectorAll('.catalog-row')).toHaveLength(1)
})
