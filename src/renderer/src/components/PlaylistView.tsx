import type { Playlist, Track } from '@shared/types'
import { usePlayerStore } from '../stores/playerStore'
import { plural } from '../utils/plural'
import TrackList from './TrackList'
import { PlayIcon, MusicNoteIcon } from './icons'

interface PlaylistViewProps {
  playlist: Playlist
  tracks: Track[] // вся библиотека — для резолва trackIds
}

export default function PlaylistView({ playlist, tracks }: PlaylistViewProps) {
  const byId = new Map(tracks.map((t) => [t.id, t]))
  // Порядок trackIds сохраняется; id, отсутствующие в библиотеке, пропускаются
  const resolved = playlist.trackIds
    .map((id) => byId.get(id))
    .filter((t): t is Track => t !== undefined)

  return (
    <>
      <div className="pl-header">
        <div className="pl-cover">
          {playlist.coverDataUrl ? (
            <img src={playlist.coverDataUrl} alt="" />
          ) : (
            <MusicNoteIcon size={64} />
          )}
        </div>
        <div className="pl-header-text">
          <div className="pl-label">ПЛЕЙЛИСТ</div>
          <div className="pl-name">{playlist.name}</div>
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
        <p className="muted">В этом плейлисте пока нет треков</p>
      ) : (
        <TrackList tracks={resolved} />
      )}
    </>
  )
}
