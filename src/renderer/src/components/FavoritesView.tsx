import type { Track } from '@shared/types'
import { useLibraryStore, visibleTracks } from '../stores/libraryStore'
import { useFavoritesStore } from '../stores/favoritesStore'
import { usePlayerStore } from '../stores/playerStore'
import { plural } from '../utils/plural'
import TrackList from './TrackList'
import { PlayIcon, MusicNoteIcon, HeartIcon } from './icons'

/** Виртуальный плейлист «Любимое»: треки библиотеки с id в favoritesStore */
export default function FavoritesView() {
  const tracks = useLibraryStore(visibleTracks)
  const favoriteIds = useFavoritesStore((s) => s.ids)
  const idSet = new Set(favoriteIds)
  const resolved = tracks.filter((t) => idSet.has(t.id))

  return (
    <>
      <div className="pl-header">
        <div className="pl-cover favorites-cover">
          <HeartIcon size={64} filled />
        </div>
        <div className="pl-header-text">
          <div className="pl-label">ПЛЕЙЛИСТ</div>
          <div className="pl-name">Любимое</div>
          <div className="pl-meta">
            {resolved.length} {plural(resolved.length, 'трек', 'трека', 'треков')}
          </div>
        </div>
      </div>
      <button
        className="pl-play"
        title="Слушать"
        disabled={resolved.length === 0}
        onClick={() => usePlayerStore.getState().playTracks(resolved, 0)}
      >
        <PlayIcon size={24} />
      </button>
      {resolved.length === 0 ? (
        <p className="muted">Нажимайте ♥ на играющем треке или в контекстном меню</p>
      ) : (
        <TrackList tracks={resolved} />
      )}
    </>
  )
}
