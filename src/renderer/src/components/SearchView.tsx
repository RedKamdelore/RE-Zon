import { useEffect, useRef, useState } from 'react'
import { buildCatalog, normalizeRecording } from '@shared/catalog'
import type { ImportedTrack } from '@shared/matching'
import type { Track } from '@shared/types'
import { useCatalog } from '../stores/catalog'
import { useNavStore } from '../stores/navStore'
import { useLibraryStore } from '../stores/libraryStore'
import CatalogList from './CatalogList'
import { SearchIcon } from './icons'

export default function SearchView() {
  const view=useNavStore(s=>s.view)
  const initial=view.name==='search'?view.query ?? '':''
  const [query,setQuery]=useState(initial)
  const [remote,setRemote]=useState<ImportedTrack[]>([])
  const [cursor,setCursor]=useState<string>()
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const [searched,setSearched]=useState('')
  const generation=useRef(0)
  const catalog=useCatalog()
  const hiddenIds=useLibraryStore(s=>s.hiddenIds)
  useEffect(()=>{setQuery(initial)},[initial])
  useEffect(()=>{generation.current++;setRemote([]);setCursor(undefined);setError('');setBusy(false);setSearched('')},[query])
  useEffect(()=>()=>{generation.current++},[])
  const search=async(more=false)=>{
    const q=query.trim();if(!q || !window.api || busy)return
    const version=++generation.current
    setBusy(true);setError('')
    try {
      const result=await window.api.scSearch(q,more?cursor:undefined)
      if(version!==generation.current)return
      if(!result.ok)throw new Error(result.error)
      setRemote(previous=>more?[...previous,...result.tracks]:result.tracks)
      setCursor(result.nextCursor);setSearched(q)
    }catch(e){if(version===generation.current)setError(e instanceof Error?e.message:String(e))}
    finally{if(version===generation.current)setBusy(false)}
  }
  const words=normalizeRecording(query).split(' ').filter(Boolean)
  const local=catalog.filter(e=>words.every(w=>normalizeRecording(`${e.title} ${e.artist} ${e.album}`).includes(w)))
  const remoteTracks:Track[]=remote.map(t=>({id:`soundcloud:${t.extId ?? `${t.artist}:${t.title}`}`,sourceId:'soundcloud',title:t.title,artist:t.artist,album:t.album ?? '',durationSec:t.durationSec ?? 0,filePath:t.streamUrl ?? '',coverDataUrl:t.coverUrl}))
  // Rebuild with matching catalogue sources so each recording keeps every available option.
  const combined=buildCatalog([...local.flatMap(e=>e.sources.map(s=>s.track ?? {id:s.id,sourceId:s.service,title:e.title,artist:e.artist,album:e.album,durationSec:e.durationSec,filePath:'',coverDataUrl:e.coverDataUrl})),...remoteTracks],[],{},hiddenIds)
  const localIds=new Set(local.flatMap(e=>e.sources.map(s=>s.id)))
  const inCollection=combined.filter(e=>e.sources.some(s=>localIds.has(s.id)))
  const outside=combined.filter(e=>!e.sources.some(s=>localIds.has(s.id)))
  return <div className="search-view">
    <header className="page-heading"><div><span className="eyebrow">СЛЕДУЙТЕ ЗА ИНТЕРЕСОМ</span><h1>Найдите своё звучание</h1><p>Ваша коллекция под рукой. Новые открытия — чуть дальше.</p></div></header>
    <form className="tl-bulk" onSubmit={e=>{e.preventDefault();void search()}}>
      <div className="search-input-wrap"><SearchIcon size={20}/><input aria-label="Поиск музыки" autoFocus className="search-input" value={query} placeholder="Трек, исполнитель или альбом" onChange={e=>setQuery(e.target.value)}/>{query&&<button type="button" className="icon-btn" aria-label="Очистить поиск" onClick={()=>setQuery('')}>×</button>}</div>
      <button className="btn-primary" disabled={busy || !query.trim()}>{busy?'Ищем…':'Искать в SoundCloud ↗'}</button>
    </form>
    {error && <p className="import-error" role="alert">{error}</p>}
    {!query.trim()?<div className="search-intro"><SearchIcon size={36}/><h2>Что хотите услышать?</h2><p>Начните вводить название — совпадения в коллекции появятся сразу.<br/>Для поиска новой музыки нажмите «Искать в SoundCloud».</p></div>:<><div className="section-heading"><h2>В вашей коллекции</h2><span className="muted">{inCollection.length} записей</span></div><CatalogList key={'local:'+query} entries={inCollection}/>{searched&&<><div className="section-heading"><h2>Открытия в SoundCloud</h2><span className="muted">{outside.length} новых совпадений</span></div><p className="muted">Совпадения с вашей коллекцией объединены выше. Источник можно выбрать у записи.</p><CatalogList key={'remote:'+query} entries={outside}/></>}</>}
    {cursor && <button className="btn-outline" disabled={busy} onClick={()=>void search(true)}>Ещё из SoundCloud</button>}
  </div>
}
