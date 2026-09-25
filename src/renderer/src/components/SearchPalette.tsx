import { useEffect, useRef, useState } from 'react'
import { useCatalog } from '../stores/catalog'
import { usePlaylistStore } from '../stores/playlistStore'
import { useNavStore, type View } from '../stores/navStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { deriveAlbums } from '../stores/albums'
import { AtlasIcon } from './AtlasIcon'
import Artwork from './Artwork'
export default function SearchPalette() {
  const dialog = useRef<HTMLDialogElement>(null)
  const [query,setQuery] = useState('')
  const catalog = useCatalog()
  const playlists = usePlaylistStore(s=>s.playlists)
  const needle = query.trim().toLocaleLowerCase()
  const match = (text:string) => needle && text.toLocaleLowerCase().includes(needle)
  const tracks = catalog.filter(t=>match(t.title+' '+t.artist)).slice(0,4)
  const albums = deriveAlbums(catalog).filter(a=>match(a.name+' '+a.artist)).slice(0,2)
  const artists = [...new Set(catalog.map(t=>t.artist))].filter(a=>match(a)).slice(0,2)
  const lists = playlists.filter(p=>match(p.name)).slice(0,2)
  const close = () => useWorkspaceStore.getState().setSearchOpen(false)
  const open = (view:View) => { close(); useNavStore.getState().setView(view) }
  useEffect(()=>{ const previous=document.activeElement as HTMLElement|null; dialog.current?.showModal(); return()=>previous?.focus() },[])
  return <dialog ref={dialog} className="search-palette" onCancel={e=>{e.preventDefault();close()}} onClick={e=>{if(e.target===dialog.current)close()}}>
    <form onSubmit={e=>{e.preventDefault();if(needle)open({name:'search',query})}}><AtlasIcon name="search"/><input aria-label="Найти в коллекции" placeholder="Трек, исполнитель, альбом или плейлист" autoFocus value={query} onChange={e=>setQuery(e.target.value)}/><button type="button" className="key-close" onClick={close}>Esc</button></form>
    <div className="palette-results">
      {!needle?<div className="palette-empty"><AtlasIcon name="compass" size={34}/><h3>Найдите свою музыку</h3><p>Быстрый поиск по всей коллекции. Enter — все результаты.</p></div>:<>
        {tracks.length>0&&<p className="eyebrow">ЗАПИСИ</p>}{tracks.map(t=><button className="palette-result" key={t.id} onClick={()=>open({name:'search',query:t.artist+' '+t.title})}><Artwork src={t.coverDataUrl} artist={t.artist} album={t.album}/><span><strong>{t.title}</strong><small>{t.artist}</small></span><AtlasIcon name="arrow" size={16}/></button>)}
        {albums.length>0&&<p className="eyebrow">АЛЬБОМЫ</p>}{albums.map(a=><button className="palette-result" key={a.id} onClick={()=>open({name:'album',album:a.name,artist:a.artist,albumKey:a.id})}><Artwork src={a.cover} artist={a.artist} album={a.name}/><span><strong>{a.name}</strong><small>{a.artist}</small></span></button>)}
        {artists.map(a=><button className="palette-result" key={a} onClick={()=>open({name:'artist',artist:a})}><AtlasIcon name="wave"/><span><strong>{a}</strong><small>Исполнитель</small></span></button>)}
        {lists.map(p=><button className="palette-result" key={p.id} onClick={()=>open({name:'playlist',id:p.id})}><AtlasIcon name="collection"/><span><strong>{p.name}</strong><small>Плейлист · {p.trackIds.length} записей</small></span></button>)}
        {!tracks.length&&!albums.length&&!lists.length&&!artists.length&&<p className="empty-state">В коллекции совпадений нет. Откройте все результаты для поиска в SoundCloud.</p>}
      </>}
    </div>
    <button className="palette-footer" disabled={!needle} onClick={()=>open({name:'search',query})}>Все результаты и поиск вне коллекции <span>↵</span></button>
  </dialog>
}
