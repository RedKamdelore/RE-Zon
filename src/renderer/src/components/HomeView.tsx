import { plural } from '../utils/plural'
import { deriveAlbums } from '../stores/albums'
import Artwork from './Artwork'
import { AtlasIcon } from './AtlasIcon'
import { useNavStore } from '../stores/navStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useAccountsStore } from '../stores/accountsStore'
import { useLibraryStore, visibleTracks } from '../stores/libraryStore'
import { usePlayerStore } from '../stores/playerStore'
import { usePlaylistStore } from '../stores/playlistStore'
import { useFavoritesStore } from '../stores/favoritesStore'
import { useStatsStore } from '../stores/statsStore'
import { useCatalog } from '../stores/catalog'
import { PlayIcon, PauseIcon, HeartIcon } from './icons'
import { SERVICE_NAMES } from '@shared/accounts'
import CatalogList from './CatalogList'
import PersonalRecommendations from './PersonalRecommendations'
export default function HomeView() {
  const catalog=useCatalog(), albums=deriveAlbums(catalog)
  const tracks=useLibraryStore(visibleTracks), loading=useLibraryStore(s=>s.loading), demo=useLibraryStore(s=>s.usingDemo)
  const playlists=usePlaylistStore(s=>s.playlists), favorites=useFavoritesStore(s=>s.ids)
  const accounts=useAccountsStore(s=>s.accounts), busy=useAccountsStore(s=>s.busy), errors=useAccountsStore(s=>s.errors)
  const stats=useStatsStore(s=>s.stats), current=usePlayerStore(s=>s.queue[s.order[s.pos]]), playing=usePlayerStore(s=>s.playing)
  const recent=[...tracks].sort((a,b)=>(stats[b.id]?.lastPlayed??0)-(stats[a.id]?.lastPlayed??0))[0]
  const featured=current??recent
  const navigate=useNavStore(s=>s.setView)
  const listen=()=>{if(current)usePlayerStore.getState().togglePlay();else if(featured)usePlayerStore.getState().playTracks(tracks,tracks.findIndex(t=>t.id===featured.id));else navigate({name:'sources'})}
  return <section className="overview-page">
    <header className="page-heading"><div><span className="eyebrow">RE:ZON / ВАША МУЗЫКА</span><h1>Всё, что звучит <span className="text-accent">по-вашему.</span></h1><p>Собирайте музыку. Находите связи. Возвращайтесь к любимому.</p></div><span className="edition-label">ЛИЧНЫЙ<br/>МУЗЫКАЛЬНЫЙ АТЛАС</span></header>
    <div className="overview-top">
      <article className="resume-card material-surface">
        <div className="resume-copy"><span className="eyebrow"><span className={'status-dot'+(playing?' live':'')}/>{current?'ВАШ СЕАНС':featured?'НАЧНИТЕ С ЭТОГО':'ПЕРВАЯ ЗАПИСЬ'}</span><h2>{featured?.title??'Музыке нужно своё место'}</h2><p>{featured?featured.artist:'Добавьте папку на компьютере или подключите любимый сервис.'}</p><div className="resume-actions"><button className="btn-primary" onClick={listen}>{current&&playing?<PauseIcon size={17}/>:<PlayIcon size={17}/>} {current?(playing?'Пауза':'Продолжить'):featured?'Слушать':'Добавить музыку'}</button>{featured&&<button className="text-button" onClick={()=>useWorkspaceStore.getState().toggleSession()}>Открыть сеанс <AtlasIcon name="arrow" size={16}/></button>}</div>{demo&&<small className="demo-label">Демо-коллекция · добавьте свою музыку в «Источниках»</small>}</div>
        <div className="resume-art"><Artwork src={featured?.coverDataUrl} artist={featured?.artist??'ReZon'} album={featured?.album??'Atlas'}/><span className="art-caption">RE:ZON — LISTEN CLOSELY</span></div>
      </article>
      <div className="collection-summary"><span className="eyebrow">ВАША КОЛЛЕКЦИЯ</span><strong>{catalog.length.toLocaleString('ru-RU')}<span>{plural(catalog.length,'запись','записи','записей')}</span></strong><div className="summary-numbers"><span><b>{albums.length}</b> {plural(albums.length,'альбом','альбома','альбомов')}</span><span><b>{playlists.length}</b> {plural(playlists.length,'плейлист','плейлиста','плейлистов')}</span></div><button className="text-button" onClick={()=>navigate({name:'library',section:'songs'})}>Открыть коллекцию <AtlasIcon name="arrow" size={17}/></button></div>
    </div>
    <div className="section-heading"><div><span className="eyebrow">БЫСТРЫЙ ДОСТУП</span><h2>Ваши маршруты</h2></div><button className="text-button" onClick={()=>navigate({name:'library',section:'albums'})}>Все альбомы <AtlasIcon name="arrow" size={16}/></button></div>
    <div className="route-grid">
      <button className="route-card favorites-route" onClick={()=>navigate({name:'library',section:'favorites'})}><span className="route-emblem"><HeartIcon size={28}/></span><span className="route-copy"><small>ЛИЧНОЕ</small><strong>Избранное</strong><span>{favorites.length} {plural(favorites.length,'любимая запись','любимые записи','любимых записей')}</span></span><AtlasIcon name="arrow" size={18}/></button>
      {albums.slice(0,2).map(a=><button className="route-card" key={a.id} onClick={()=>navigate({name:'album',album:a.name,artist:a.artist,albumKey:a.id})}><Artwork src={a.cover} artist={a.artist} album={a.name}/><span className="route-copy"><small>АЛЬБОМ</small><strong>{a.name}</strong><span>{a.artist} · {a.entries.length} {plural(a.entries.length,'запись','записи','записей')}</span></span><AtlasIcon name="arrow" size={18}/></button>)}
      {!albums.length&&<button className="route-card" onClick={()=>navigate({name:'sources'})}><span className="route-emblem"><AtlasIcon name="folder" size={28}/></span><span className="route-copy"><small>НАЧАЛО КОЛЛЕКЦИИ</small><strong>Ваша музыка здесь</strong><span>Файлы и сервисы в одном месте</span></span><AtlasIcon name="arrow" size={18}/></button>}
    </div>
    {playlists.length>0&&<div className="playlist-shortcuts">{playlists.slice(0,4).map(p=><button key={p.id} onClick={()=>navigate({name:'playlist',id:p.id})}><AtlasIcon name="collection" size={17}/>{p.name}<span>{p.trackIds.length}</span></button>)}</div>}
    <div className="overview-bottom"><section className="recent-section"><div className="section-heading"><div><span className="eyebrow">В КОЛЛЕКЦИИ</span><h2>На расстоянии одного клика</h2></div><button className="text-button" onClick={()=>navigate({name:'library',section:'songs'})}>Все записи ↗</button></div>{loading?<p role="status" className="empty-state">Собираем вашу коллекцию…</p>:<CatalogList entries={catalog.slice(0,5)} compact/>}</section>
      <aside className="source-overview"><div className="section-heading"><h2>Откуда музыка</h2><AtlasIcon name="sources" size={19}/></div><p>Все источники связаны с вашей коллекцией.</p><button className="source-mini" onClick={()=>navigate({name:'sources'})}><span className="source-monogram"><AtlasIcon name="folder" size={19}/></span><span><strong>{demo?'Демо-записи':'На компьютере'}</strong><small>{tracks.filter(t=>t.sourceId==='local'||t.sourceId==='demo').length} записей</small></span><span className="status-dot"/></button>{accounts.map(a=><button className="source-mini" key={a.id} onClick={()=>navigate({name:'service',accountId:a.id,section:'all'})}><span className="source-monogram">{SERVICE_NAMES[a.service].slice(0,2)}</span><span><strong>{SERVICE_NAMES[a.service]}</strong><small>{errors[a.id]?'Требует внимания':busy[a.id]?'Обновление…':a.label}</small></span><span className={'status-dot'+(errors[a.id]?' warning':'')}/></button>)}<button className="text-button" onClick={()=>navigate({name:'sources'})}>Управлять источниками <AtlasIcon name="arrow" size={16}/></button></aside>
    </div>
    <PersonalRecommendations/>
    <footer className="workspace-footer"><span>RE:ZON</span><span>Ваша музыка. Ваш порядок.</span></footer>
  </section>
}
