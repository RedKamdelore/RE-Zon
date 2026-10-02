import { useState } from 'react'
import type { CatalogEntry } from '@shared/catalog'
import { preferredSource } from '@shared/catalog'
import { usePlayerStore } from '../stores/playerStore'
import { useLibraryStore } from '../stores/libraryStore'
import { useNavStore } from '../stores/navStore'
import { useFavoritesStore } from '../stores/favoritesStore'
import { usePlaylistStore } from '../stores/playlistStore'
import { ContextMenu } from './TrackList'
import { fmt } from '../utils/format'
import Artwork from './Artwork'
import { PlayIcon, HeartIcon } from './icons'
export default function CatalogList({entries,compact=false,allowSave=false}:{entries:CatalogEntry[];compact?:boolean;allowSave?:boolean}) {
  const [limit,setLimit]=useState(100)
  const [sources,setSources]=useState<Record<string,string>>({})
  const [selected,setSelected]=useState<Set<string>>(new Set())
  const [menu,setMenu]=useState<{x:number;y:number;entry:CatalogEntry}|null>(null)
  const [notice,setNotice]=useState('')
  const favorites=useFavoritesStore(s=>s.ids),playlists=usePlaylistStore(s=>s.playlists)
  const libraryTracks=useLibraryStore(s=>s.tracks)
  const savedIds=new Set(libraryTracks.map(track=>track.id))
  const current=usePlayerStore(s=>s.queue[s.order[s.pos]]?.id)
  const sourceFor=(entry:CatalogEntry)=>entry.sources.find(s=>s.id===sources[entry.id]&&s.track)??preferredSource(entry)
  const trackFor=(entry:CatalogEntry)=>{const source=sourceFor(entry);return source?.track?{...source.track,coverDataUrl:source.track.coverDataUrl??entry.coverDataUrl,alternateSources:entry.sources.filter(s=>s.track&&s.id!==source.id).map(s=>s.track!)}:undefined}
  const play=(entry:CatalogEntry)=>{const track=trackFor(entry);if(!track)return;const queue=entries.flatMap(e=>trackFor(e)??[]);usePlayerStore.getState().playTracks(queue,queue.findIndex(t=>t.id===track.id))}
  const isSaved=(entry:CatalogEntry)=>entry.sources.some(source=>savedIds.has(source.id))
  const save=(entry:CatalogEntry)=>{const track=trackFor(entry);if(!track)return;useLibraryStore.getState().upsertTracks([track]);setNotice(`Добавлено в коллекцию: ${entry.title}`)}
  const selectedEntries=entries.filter(e=>selected.has(e.id))
  const selectedTracks=selectedEntries.flatMap(e=>trackFor(e)??[])
  const chosenIds=selectedTracks.map(t=>t.id)
  const toggle=(id:string)=>setSelected(prev=>{const next=new Set(prev);if(next.has(id))next.delete(id);else next.add(id);return next})
  const done=(message:string)=>{setNotice(message);setSelected(new Set())}
  const menuTrack=menu?trackFor(menu.entry):undefined
  return <div className={'catalog-list'+(compact?' compact':'')+(allowSave?' saveable':'')} onKeyDown={e=>{if(e.key==='Escape'){setSelected(new Set());setMenu(null)}if((e.ctrlKey||e.metaKey)&&e.code==='KeyA'&&!(e.target as HTMLElement).matches('input,select,textarea')){e.preventDefault();setSelected(new Set(entries.map(t=>t.id)))}}} tabIndex={-1}>
    {!compact&&<div className="catalog-tools">{selectedEntries.length?<><span className="selection-count">{selectedEntries.length} выбрано</span><button className="btn-outline" disabled={!chosenIds.length} onClick={()=>usePlayerStore.getState().playTracks(selectedTracks,0)}>Слушать</button><button className="btn-outline" disabled={!chosenIds.length} onClick={()=>{selectedTracks.forEach(t=>usePlayerStore.getState().enqueue(t));done('Добавлено в очередь')}}>В очередь</button><button className="btn-outline" disabled={!chosenIds.length} onClick={()=>{useLibraryStore.getState().upsertTracks(selectedTracks);useFavoritesStore.getState().setMany(chosenIds,true);done('Добавлено в избранное')}}>В избранное</button><select aria-label="Добавить выбранные записи в плейлист" value="" disabled={!chosenIds.length||!playlists.length} onChange={e=>{useLibraryStore.getState().upsertTracks(selectedTracks);usePlaylistStore.getState().addTracks(e.target.value,chosenIds);done('Добавлено в плейлист')}}><option value="">В плейлист…</option>{playlists.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="text-button" onClick={()=>{useLibraryStore.getState().hideTracks(selectedEntries.flatMap(e=>e.sources.map(s=>s.id)));done('Записи скрыты. Файлы сохранены.')}}>Скрыть</button><button className="text-button" onClick={()=>setSelected(new Set())}>Отменить выбор</button></>:<><span>{entries.length} записей</span><button className="text-button" disabled={!entries.length} onClick={()=>setSelected(new Set(entries.map(e=>e.id)))}>Выбрать все</button></>}</div>}
    {notice&&<div className="tl-bulk-notice" role="status">{notice}<button className="icon-btn" aria-label="Закрыть сообщение" onClick={()=>setNotice('')}>×</button></div>}
    {!compact&&<div className="catalog-header"><span/><span>Запись</span><span className="catalog-album">Альбом</span><span className="catalog-source">Доступно через</span><span>Время</span><span/></div>}
    {entries.slice(0,limit).map(entry=>{
      const source=sourceFor(entry),isPlaying=entry.sources.some(s=>s.id===current),isFav=entry.sources.some(s=>favorites.includes(s.id))
      return <div className={'catalog-row'+(selected.has(entry.id)?' selected':'')+(isPlaying?' is-playing':'')} key={entry.id} tabIndex={0} aria-label={entry.artist+' — '+entry.title+(isPlaying?' · Сейчас звучит':'')} onClick={e=>{if(e.detail>1||(e.target as HTMLElement).closest('button,input,select,a'))return;if(selected.size)toggle(entry.id);else play(entry)}} onKeyDown={e=>{if(e.target===e.currentTarget&&e.key==='Enter'){e.preventDefault();if(selected.size)toggle(entry.id);else play(entry)}if(e.target===e.currentTarget&&e.code==='Space'){e.preventDefault();e.stopPropagation();toggle(entry.id)}}} onContextMenu={e=>{e.preventDefault();if(!trackFor(entry))return;setMenu({x:e.clientX,y:e.clientY,entry})}}>
        <div className="record-leading">{!compact&&<input className="record-check" type="checkbox" aria-label={'Выбрать '+entry.title} checked={selected.has(entry.id)} onChange={()=>toggle(entry.id)}/>}<button className="record-art" disabled={!source} aria-label={'Слушать '+entry.title} onClick={()=>play(entry)}><Artwork src={entry.coverDataUrl} artist={entry.artist} album={entry.album}/><span className="art-play"><PlayIcon size={17}/></span></button></div>
        <div className="catalog-title"><strong title={entry.title}>{entry.title}{isPlaying&&<span className="playing-bars" aria-hidden="true">▂▆▃</span>}</strong><button className="artist-link" onClick={e=>{e.stopPropagation();useNavStore.getState().setView({name:'artist',artist:entry.artist})}}>{entry.artist}</button></div>
        <button className="catalog-album text-button" title={entry.album} onClick={()=>useNavStore.getState().setView({name:'album',album:entry.album,artist:entry.artist,albumKey:entry.albumId})}>{entry.album||'Без альбома'}</button>
        <div className="catalog-source">{source?<select aria-label={'Источник: '+entry.title} value={source.id} onChange={e=>setSources({...sources,[entry.id]:e.target.value})}>{entry.sources.filter(s=>s.track).map(s=><option key={s.id} value={s.id}>{s.label==='Файл'?'Локально':s.label}</option>)}</select>:<button className="text-button" onClick={()=>useNavStore.getState().setView({name:'search',query:entry.artist+' '+entry.title})}>Найти аудио ↗</button>}</div>
        <span className="catalog-duration">{fmt(entry.durationSec)}</span>
        <div className="record-actions">{allowSave&&!isSaved(entry)&&<button className="icon-btn record-save" disabled={!source} aria-label={'В коллекцию: '+entry.title} title="Добавить в коллекцию" onClick={()=>save(entry)}>+</button>}<button className={'icon-btn favorite-action'+(isFav?' active':'')} disabled={!source} aria-label={(isFav?'Убрать из избранного: ':'В избранное: ')+entry.title} onClick={()=>{const track=trackFor(entry);if(track){if(!isFav)useLibraryStore.getState().upsertTracks([track]);if(isFav)useFavoritesStore.getState().setMany(entry.sources.map(s=>s.id),false);else useFavoritesStore.getState().toggle(track.id)}}}><HeartIcon size={16} filled={isFav}/></button><button className="icon-btn" disabled={!source} aria-label={'Действия: '+entry.title} onClick={e=>{const r=e.currentTarget.getBoundingClientRect();setMenu({x:r.right,y:r.bottom,entry})}}>⋯</button></div>
      </div>
    })}
    {!entries.length&&<div className="empty-state"><h3>Здесь пока тихо</h3><p>Добавьте музыку или измените фильтры коллекции.</p></div>}
    {entries.length>limit&&<button className="btn-outline load-more" onClick={()=>setLimit(limit+100)}>Показать ещё ({entries.length-limit})</button>}
    {menu&&menuTrack&&<ContextMenu menu={{x:menu.x,y:menu.y,track:menuTrack,index:entries.indexOf(menu.entry)}} hasRemove={false} onPlayTrack={()=>play(menu.entry)} onRemove={()=>{}} onClose={()=>setMenu(null)} onSaveToLibrary={()=>save(menu.entry)} temporary={allowSave&&!isSaved(menu.entry)}/>}
  </div>
}
