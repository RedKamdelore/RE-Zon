import { useNavStore } from '../stores/navStore'
import { SERVICE_NAMES, SECTION_NAMES, accountTrackId, type AccountSection } from '@shared/accounts'
import { useAccountsStore } from '../stores/accountsStore'
import { useLibraryStore, visibleTracks } from '../stores/libraryStore'
import TrackList from './TrackList'
import type { Track } from '@shared/types'

export default function ServiceCollection({accountId,section}:{accountId:string;section:AccountSection}) {
  const {accounts,libraries,busy,errors,refresh}=useAccountsStore()
  const setView=useNavStore(s=>s.setView)
  const library=useLibraryStore(visibleTracks)
  const account=accounts.find(a=>a.id===accountId)
  const snapshot=libraries[accountId]
  if(!account) return <section><h1>Аккаунт отключён</h1><button className="btn-outline" onClick={()=>setView({name:'sources'})}>Открыть источники</button></section>
  const items=snapshot?.[section==='liked'?'liked':'all'] ?? []
  const byId=new Map(library.map(t=>[t.id,t]))
  const resolved=items.map(item=>byId.get(accountTrackId(account.service,accountId,item.extId ?? `${item.artist}:${item.title}`)) ??
    (account.service==='vk' ? undefined : library.find(t=>t.title.toLocaleLowerCase()===item.title.toLocaleLowerCase() && t.artist.toLocaleLowerCase()===item.artist.toLocaleLowerCase())))
    .filter((t):t is Track=>!!t)
  const tracks=[...new Map(resolved.map(t=>[t.id,t])).values()]
  return <section>
    <header className="page-heading"><div><p className="eyebrow">{SERVICE_NAMES[account.service]}</p><h1>{account.label}</h1></div><div className="heading-actions">
      <button className="btn-outline" disabled={busy[accountId]} onClick={()=>void refresh(accountId)}>{busy[accountId]?'Обновление…':'Обновить аккаунт'}</button>
      <button className="btn-outline" onClick={()=>setView({name:'sources'})}>Управление источником</button>
    </div></header>
    <nav className="collection-tabs" aria-label="Коллекция аккаунта">{(['all','liked','albums'] as AccountSection[]).map(tab=><button key={tab} className={tab===section?'active':''} aria-current={tab===section?'page':undefined} onClick={()=>setView({name:'service',accountId,section:tab})}>{account.service==='lastfm'&&tab==='all'?'Часто слушаю':SECTION_NAMES[tab]}</button>)}</nav>
    {errors[accountId] && <p role="alert" className="import-error">{errors[accountId]}</p>}
    {snapshot?.unavailable[section] ? <p className="muted">{snapshot.unavailable[section]}</p> : !snapshot ?
      <p className="muted">{busy[accountId]?'Загружаем коллекцию…':'Коллекция ещё не загружена. Нажмите «Обновить аккаунт».'}</p> : section==='albums' ?
      <div>{snapshot.albums.length===0 && <p className="muted">Сохранённых альбомов нет</p>}{snapshot.albums.map(album=><details key={album.id} className="import-card">
        <summary>{album.artist} — {album.title}</summary>
        {album.tracks?.map((t,i)=><p key={t.extId ?? i}>{t.artist} — {t.title}</p>)}
      </details>)}</div> : <>
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
