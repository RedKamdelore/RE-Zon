// @vitest-environment jsdom
import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {it,expect,vi} from 'vitest'
import CatalogList from './CatalogList'
import {buildCatalog} from '@shared/catalog'
import {usePlayerStore} from '../stores/playerStore'
import {useLibraryStore} from '../stores/libraryStore'
it('starts at the selected recording and queues the rest of the displayed catalogue',()=>{
 ;(globalThis as Record<string,unknown>).IS_REACT_ACT_ENVIRONMENT=true
 const tracks=['a','b','c'].map(id=>({id,title:id,artist:'Artist',album:'Album',durationSec:10,sourceId:'local',filePath:id+'.mp3'}))
 useLibraryStore.setState({tracks})
 const play=vi.fn();const original=usePlayerStore.getState().playTracks;usePlayerStore.setState({playTracks:play})
 const host=document.createElement('div');const root=createRoot(host)
 try {act(()=>root.render(<CatalogList entries={buildCatalog(tracks,[],{})}/>));act(()=>host.querySelector<HTMLButtonElement>('[aria-label="Слушать b"]')!.click());expect(play.mock.calls[0][0].map((t:{id:string})=>t.id)).toEqual(['a','b','c']);expect(play.mock.calls[0][1]).toBe(1)}
 finally{act(()=>root.unmount());usePlayerStore.setState({playTracks:original})}
})

it('plays a search result without saving the search results, then saves only the chosen recording with +',()=>{
 ;(globalThis as Record<string,unknown>).IS_REACT_ACT_ENVIRONMENT=true
 const tracks=['a','b','c'].map(id=>({id:`soundcloud:${id}`,title:id,artist:'Artist',album:'Album',durationSec:10,sourceId:'soundcloud',filePath:`https://example.com/${id}.mp3`}))
 useLibraryStore.setState({tracks:[]})
 const play=vi.fn();const original=usePlayerStore.getState().playTracks;usePlayerStore.setState({playTracks:play})
 const host=document.createElement('div');const root=createRoot(host)
 try {
   act(()=>root.render(<CatalogList entries={buildCatalog(tracks,[],{})} allowSave/>))
   act(()=>host.querySelector<HTMLElement>('.catalog-title strong')!.click())
   expect(play).toHaveBeenCalledOnce()
   expect(useLibraryStore.getState().tracks).toHaveLength(0)
   act(()=>host.querySelector<HTMLButtonElement>('[aria-label="В коллекцию: b"]')!.click())
   expect(useLibraryStore.getState().tracks.map(track=>track.id)).toEqual(['soundcloud:b'])
   expect(play).toHaveBeenCalledOnce()
 }
 finally{act(()=>root.unmount());usePlayerStore.setState({playTracks:original})}
})
