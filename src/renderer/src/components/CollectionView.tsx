import { useLibraryStore, visibleTracks } from '../stores/libraryStore'
import { usePlayerStore } from '../stores/playerStore'
import { plural } from '../utils/plural'
import TrackList from './TrackList'
import { PlayIcon, MusicNoteIcon } from './icons'

interface CollectionViewProps {
  kind: 'artist' | 'album'
  name: string
}

/** Экран исполнителя/альбома: шапка как у PlaylistView + TrackList по фильтру */
export default function CollectionView({ kind, name }: CollectionViewProps) {
  const allTracks = useLibraryStore(visibleTracks)

  const tracks =
    kind === 'artist'
      ? allTracks.filter((t) => t.artist === name)
      : allTracks.filter((t) => t.album === name)
  const coverDataUrl = tracks.find((t) => t.coverDataUrl)?.coverDataUrl

  return (
    <>
      <div className="pl-header">
        <div className="pl-cover">
          {coverDataUrl ? <img src={coverDataUrl} alt="" /> : <MusicNoteIcon size={64} />}
        </div>
        <div className="pl-header-text">
          <div className="pl-label">{kind === 'artist' ? 'ИСПОЛНИТЕЛЬ' : 'АЛЬБОМ'}</div>
          <div className="pl-name">{name}</div>
          <div className="pl-meta">
            {tracks.length} {plural(tracks.length, 'трек', 'трека', 'треков')}
          </div>
        </div>
      </div>
      <button
        className="pl-play"
        title="Слушать"
        disabled={tracks.length === 0}
        onClick={() => usePlayerStore.getState().playTracks(tracks, 0)}
      >
        <PlayIcon size={24} />
      </button>
      {tracks.length === 0 ? (
        <p className="muted">Здесь пока ничего нет</p>
      ) : (
        <TrackList tracks={tracks} />
      )}
    </>
  )
}
