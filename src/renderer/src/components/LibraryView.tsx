import { useState } from 'react'
import { useCatalog } from '../stores/catalog'
import { deriveAlbums } from '../stores/albums'
import { usePlaylistStore } from '../stores/playlistStore'
import { useFavoritesStore } from '../stores/favoritesStore'
import { useNavStore } from '../stores/navStore'
import { useWorkspaceStore, collectionDefaults } from '../stores/workspaceStore'
import { normalizeRecording } from '@shared/catalog'
import Artwork from './Artwork'
import CatalogList from './CatalogList'
import { AtlasIcon } from './AtlasIcon'
export const LIBRARY_SECTIONS={songs:'Записи',albums:'Альбомы',artists:'Исполнители',playlists:'Плейлисты',favorites:'Избранное'} as const
export default function LibraryView({section}:{section:keyof typeof LIBRARY_SECTIONS}) {
  const catalog=useCatalog(),playlists=usePlaylistStore(s=>s.playlists),favorites=useFavoritesStore(s=>s.ids)
  const navigate=useNavStore(s=>s.setView),prefs=useWorkspaceStore(s=>s.collections[section]??collectionDefaults)
  const setPrefs=(patch:Partial<typeof prefs>)=>useWorkspaceStore.getState().setCollection(section,patch)
  const [limit,setLimit]=useState(60)
  const match=(text:string)=>normalizeRecording(text).includes(normalizeRecording(prefs.query))
  let entries=catalog.filter(e=>match(e.title+' '+e.artist+' '+e.album)&&(!prefs.source||e.sources.some(s=>s.service===prefs.source))&&(section!=='favorites'||e.sources.some(s=>favorites.includes(s.id))))
  if(prefs.sort==='title')entries=[...entries].sort((a,b)=>a.title.localeCompare(b.title,'ru'))
  if(prefs.sort==='artist')entries=[...entries].sort((a,b)=>a.artist.localeCompare(b.artist,'ru'))
  const sourceLabels:Record<string,string>={local:'Локально',demo:'Демо',vk:'VK',soundcloud:'SoundCloud',spotify:'Spotify',yandex:'Яндекс Музыка',lastfm:'Last.fm'}
  const sources=[...new Set(catalog.flatMap(e=>e.sources.map(s=>s.service)))]
  const albums=deriveAlbums(catalog.filter(e=>!prefs.source||e.sources.some(s=>s.service===prefs.source)))
  let cards=section==='albums'?albums.map(a=>({id:a.id,title:a.name,artist:a.artist,cover:a.cover,count:a.entries.length,open:()=>navigate({name:'album',album:a.name,artist:a.artist,albumKey:a.id})})):section==='artists'?[...new Set(catalog.map(e=>normalizeRecording(e.artist)))].map(key=>{const group=catalog.filter(e=>normalizeRecording(e.artist)===key&&(!prefs.source||e.sources.some(s=>s.service===prefs.source)));const artist=group[0]?.artist??'';return{id:key,title:artist,artist:'Исполнитель',cover:group.find(e=>e.coverDataUrl)?.coverDataUrl,count:group.length,open:()=>navigate({name:'artist',artist})}}).filter(c=>c.count>0):playlists.map(p=>({id:p.id,title:p.name,artist:'Плейлист',cover:p.coverDataUrl,count:p.trackIds.length,open:()=>navigate({name:'playlist',id:p.id})}))
  cards=cards.filter(c=>match(c.title+' '+c.artist))
  if(prefs.sort==='title')cards=[...cards].sort((a,b)=>a.title.localeCompare(b.title,'ru'))
  if(prefs.sort==='artist')cards=[...cards].sort((a,b)=>a.artist.localeCompare(b.artist,'ru'))
  const records=section==='songs'||section==='favorites'
  return <section className={'library-view density-'+prefs.density}>
    <header className="page-heading"><div><span className="eyebrow">СОБРАНО ВАМИ</span><h1>Коллекция</h1><p>Каждая запись на своём месте.</p></div><button className="btn-primary" onClick={()=>navigate({name:'playlist',id:usePlaylistStore.getState().create()})}><AtlasIcon name="plus" size={17}/>Создать плейлист</button></header>
    <nav className="collection-tabs" aria-label="Разделы коллекции">{Object.entries(LIBRARY_SECTIONS).map(([id,label])=><button key={id} className={section===id?'active':''} aria-current={section===id?'page':undefined} onClick={()=>navigate({name:'library',section:id as keyof typeof LIBRARY_SECTIONS})}>{label}<span>{id==='songs'?catalog.length:id==='albums'?deriveAlbums(catalog).length:id==='playlists'?playlists.length:id==='favorites'?catalog.filter(e=>e.sources.some(s=>favorites.includes(s.id))).length:new Set(catalog.map(e=>normalizeRecording(e.artist))).size}</span></button>)}</nav>
    <div className="collection-toolbar"><label className="collection-search"><AtlasIcon name="search" size={18}/><input aria-label="Поиск в разделе" placeholder="Найти в этом разделе" value={prefs.query} onChange={e=>{setPrefs({query:e.target.value});setLimit(60)}}/></label>{section!=='playlists'&&<select aria-label="Фильтр по источнику" value={prefs.source} onChange={e=>setPrefs({source:e.target.value})}><option value="">Все источники</option>{sources.map(s=><option key={s} value={s}>{sourceLabels[s]??s}</option>)}</select>}<select aria-label="Сортировка коллекции" value={prefs.sort} onChange={e=>setPrefs({sort:e.target.value})}><option value="recent">Исходный порядок</option><option value="title">По названию</option><option value="artist">По исполнителю</option></select><div className="view-switch">{records?<button className="icon-btn" aria-label="Компактные строки" aria-pressed={prefs.density==='compact'} onClick={()=>setPrefs({density:prefs.density==='compact'?'comfortable':'compact'})}><AtlasIcon name="list" size={18}/></button>:<><button className="icon-btn" aria-label="Сетка" aria-pressed={prefs.layout==='grid'} onClick={()=>setPrefs({layout:'grid'})}><AtlasIcon name="grid" size={17}/></button><button className="icon-btn" aria-label="Список" aria-pressed={prefs.layout==='list'} onClick={()=>setPrefs({layout:'list'})}><AtlasIcon name="list" size={18}/></button></>}</div></div>
    {(prefs.query||prefs.source)&&<div className="filter-summary"><span>{prefs.query&&'«'+prefs.query+'»'} {prefs.source&&'· '+(sourceLabels[prefs.source]??prefs.source)}</span><button className="text-button" onClick={()=>setPrefs({query:'',source:''})}>Сбросить фильтры ×</button></div>}
    {records?<CatalogList entries={entries}/>:<><div className="section-heading"><h2>{LIBRARY_SECTIONS[section]}</h2><span className="muted">{cards.length} в коллекции</span></div><div className={'album-grid '+(prefs.layout==='list'?'collection-list':'')}>{cards.slice(0,limit).map(c=><button className={'album-card '+(section==='artists'?'artist-card':'')} key={c.id} onClick={c.open}><Artwork src={c.cover} artist={c.artist} album={c.title}/><span className="album-card-copy"><small>{section==='playlists'?'ПЛЕЙЛИСТ':section==='artists'?'ИСПОЛНИТЕЛЬ':'АЛЬБОМ'}</small><strong>{c.title}</strong><span>{c.artist}</span><small>{c.count} записей</small></span><span className="album-open">↗</span></button>)}</div>{!cards.length&&<div className="empty-state"><h3>{prefs.query?'Ничего не найдено':'Начните свою коллекцию'}</h3><p>{section==='albums'?'Альбомы появятся у записей с указанным названием альбома.':section==='playlists'?'Создайте плейлист и добавьте в него любимые записи.':'Добавьте музыку или измените фильтры.'}</p></div>}{cards.length>limit&&<button className="btn-outline load-more" onClick={()=>setLimit(limit+60)}>Показать ещё</button>}</>}
  </section>
}
