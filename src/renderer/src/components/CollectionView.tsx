import {albumEntries} from '../stores/albums'
import {preferredSource} from '@shared/catalog'
import { useCatalog } from '../stores/catalog'
import CatalogList from './CatalogList'
import { useLibraryStore, visibleTracks } from '../stores/libraryStore'
import { usePlayerStore } from '../stores/playerStore'
import { plural } from '../utils/plural'
import TrackList from './TrackList'
import Artwork from './Artwork'
import { normalizeRecording } from '@shared/catalog'
import { deriveAlbums } from '../stores/albums'
import { useNavStore } from '../stores/navStore'
import { fmt } from '../utils/format'
import { PlayIcon, MusicNoteIcon } from './icons'

interface CollectionViewProps {
  kind: 'artist' | 'album'
  albumKey?: string
  artist?: string
  name: string
}

/** Экран исполнителя/альбома: шапка как у PlaylistView + TrackList по фильтру */
export default function CollectionView({ kind, name, artist, albumKey }: CollectionViewProps) {
  const catalog=useCatalog()
  const entries=kind==='artist'?catalog.filter(e=>normalizeRecording(e.artist)===normalizeRecording(name)):albumEntries(catalog,name,artist,albumKey)
  const allTracks = useLibraryStore(visibleTracks)

  const tracks =
    kind === 'artist'
      ? allTracks.filter((t) => normalizeRecording(t.artist) === normalizeRecording(name))
      : entries.flatMap(entry=>{
          const source=preferredSource(entry)
          return source?.track?[{...source.track,alternateSources:entry.sources.filter(s=>s.track&&s.id!==source.id).map(s=>s.track!)}]:[]
        })
  const coverDataUrl = entries.find(t=>t.coverDataUrl)?.coverDataUrl || tracks.find((t) => t.coverDataUrl)?.coverDataUrl

  return (
    <>
      <div className="pl-header">
        <div className="pl-cover">
          <Artwork src={coverDataUrl} artist={artist??name} album={kind==='album'?name:''}/>
        </div>
        <div className="pl-header-text">
          <div className="pl-label">{kind === 'artist' ? 'ИСПОЛНИТЕЛЬ' : 'АЛЬБОМ'}</div>
          <h1 className="pl-name">{name}</h1>
          <div className="pl-meta">
            {kind==='album'&&artist&&<p>{artist}</p>}
            {entries.length} {plural(entries.length, 'трек', 'трека', 'треков')} · {fmt(tracks.reduce((sum,t)=>sum+t.durationSec,0))}
          </div>
          <div className="entity-actions"><button className="btn-primary" disabled={!tracks.length} onClick={()=>usePlayerStore.getState().playTracks(tracks,0)}><PlayIcon size={17}/>Слушать</button><button className="btn-outline" disabled={!tracks.length} onClick={()=>tracks.forEach(t=>usePlayerStore.getState().enqueue(t))}>Добавить в очередь</button>{kind==='album'&&artist&&<button className="text-button" onClick={()=>useNavStore.getState().setView({name:'artist',artist})}>К исполнителю ↗</button>}</div>
        </div>
      </div>
      {kind==='artist'&&deriveAlbums(entries).length>0&&<><div className="section-heading"><h2>Альбомы</h2></div><div className="artist-albums">{deriveAlbums(entries).map(a=><button className="route-card" key={a.id} onClick={()=>useNavStore.getState().setView({name:'album',album:a.name,artist:a.artist,albumKey:a.id})}><Artwork src={a.cover} artist={a.artist} album={a.name}/><span className="route-copy"><strong>{a.name}</strong><span>{a.entries.length} записей</span></span></button>)}</div></>}
      <div className="section-heading"><h2>Записи</h2><span className="muted">{[...new Set(entries.flatMap(e=>e.sources.map(s=>s.label)))].join(' · ')}</span></div><CatalogList entries={entries}/>
    </>
  )
}
