import { useNavStore } from '../stores/navStore'
import { SERVICE_NAMES, SECTION_NAMES, accountTrackId, type AccountSection } from '@shared/accounts'
import { useAccountsStore } from '../stores/accountsStore'
import { useLibraryStore, visibleTracks } from '../stores/libraryStore'
import TrackList from './TrackList'
import type { Track } from '@shared/types'
import type { ImportedTrack } from '@shared/matching'
import { normalizeRecording } from '@shared/catalog'
import { plural } from '../utils/plural'

export default function ServiceCollection({accountId,section}:{accountId:string;section:AccountSection}) {
  const {accounts,libraries,busy,errors,refresh}=useAccountsStore()
  const setView=useNavStore(s=>s.setView)
  const library=useLibraryStore(visibleTracks)
  const account=accounts.find(a=>a.id===accountId)
  const snapshot=libraries[accountId]
  if(!account) return <section><h1>Аккаунт отключён</h1><button className="btn-outline" onClick={()=>setView({name:'sources'})}>Открыть источники</button></section>
  const items=section==='albums'||section==='playlists'?[]:snapshot?.[section==='liked'?'liked':'all'] ?? []
  const byId=new Map(library.map(t=>[t.id,t]))
  const byRecording=new Map<string,Track>()
  for(const track of library){const key=`${normalizeRecording(track.artist)}\0${normalizeRecording(track.title)}`;if(!byRecording.has(key)||track.sourceId==='local')byRecording.set(key,track)}
  const playable=(item:ImportedTrack)=>byId.get(accountTrackId(account.service,accountId,item.extId ?? `${item.artist}:${item.title}`)) ??
    (account.service==='vk' ? undefined : byRecording.get(`${normalizeRecording(item.artist)}\0${normalizeRecording(item.title)}`))
  const resolved=items.map(playable)
    .filter((t):t is Track=>!!t)
  const tracks=[...new Map(resolved.map(t=>[t.id,t])).values()]
  const groups=section==='albums'?(snapshot?.albums??[]).map(album=>({id:album.id,title:album.title,subtitle:album.artist,items:album.tracks??[]})):
    section==='playlists'?(snapshot?.playlists??[]).map(playlist=>({id:playlist.id,title:playlist.title,subtitle:playlist.owner??'Плейлист сервиса',items:playlist.tracks})):[]
  return <section>
    <header className="page-heading"><div><p className="eyebrow">{SERVICE_NAMES[account.service]}</p><h1>{account.label}</h1></div><div className="heading-actions">
      <button className="btn-outline" disabled={busy[accountId]} onClick={()=>void refresh(accountId)}>{busy[accountId]?'Обновление…':'Обновить аккаунт'}</button>
      <button className="btn-outline" onClick={()=>setView({name:'sources'})}>Управление источником</button>
    </div></header>
    <nav className="collection-tabs" aria-label="Коллекция аккаунта">{(['all','liked','albums','playlists'] as AccountSection[]).map(tab=><button key={tab} className={tab===section?'active':''} aria-current={tab===section?'page':undefined} onClick={()=>setView({name:'service',accountId,section:tab})}>{account.service==='lastfm'&&tab==='all'?'Часто слушаю':SECTION_NAMES[tab]}</button>)}</nav>
    {errors[accountId] && <p role="alert" className="import-error">{errors[accountId]}</p>}
    {snapshot?.unavailable[section] ? <p className="muted">{snapshot.unavailable[section]}</p> : !snapshot ?
      <p className="muted">{busy[accountId]?'Загружаем коллекцию…':'Коллекция ещё не загружена. Нажмите «Обновить аккаунт».'}</p> : section==='albums'||section==='playlists' ?
      <div>{groups.length===0 && <p className="muted">{section==='albums'?'Сохранённых альбомов нет':'Плейлистов пока нет. Обновите аккаунт, чтобы проверить новые подборки.'}</p>}{groups.map(group=>{
        const matches=group.items.map(item=>({item,track:playable(item)}))
        const playableTracks=matches.flatMap(({track})=>track??[])
        return <details key={group.id} className="import-card">
          <summary>{section==='albums'?`${group.subtitle} — `:''}{group.title} · {group.items.length} {plural(group.items.length,'запись','записи','записей')}{section==='playlists'&&group.subtitle?` · ${group.subtitle}`:''}</summary>
          {playableTracks.length>0&&<TrackList tracks={playableTracks}/>}
          {matches.filter(({track})=>!track).map(({item},i)=><p className="muted" key={item.extId??i}>{item.artist} — {item.title} · нет доступного аудио</p>)}
        </details>
      })}</div> : <>
        <p className="muted">В аккаунте: {items.length}. Доступно в библиотеке: {tracks.length}.
          {account.service!=='vk' && ' Воспроизведение доступно для совпадений с библиотекой ReZon.'}</p>
        {tracks.length>0 && <TrackList tracks={tracks} />}
        {items.length===0 && <p className="muted">В этом разделе пока нет песен</p>}
        {items.length>tracks.length && <details><summary>Записи без доступного воспроизведения</summary>
          {items.filter(item=>!tracks.some(t=>t.title===item.title && t.artist===item.artist)).map((t,i)=><p key={`${t.extId}:${i}`}>{t.artist} — {t.title}</p>)}
        </details>}
      </>}
  </section>
}
