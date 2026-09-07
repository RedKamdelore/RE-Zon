import { useEffect, useRef, useState } from 'react'
import type { Playlist, Track } from '@shared/types'
import { usePlayerStore } from '../stores/playerStore'
import { usePlaylistStore } from '../stores/playlistStore'
import { plural } from '../utils/plural'
import TrackList from './TrackList'
import { PlayIcon, MusicNoteIcon } from './icons'

interface PlaylistViewProps {
  playlist: Playlist
  tracks: Track[] // вся библиотека — для резолва trackIds
}

export default function PlaylistView({ playlist, tracks }: PlaylistViewProps) {
  const [renaming, setRenaming] = useState(false)

  const byId = new Map(tracks.map((t) => [t.id, t]))
  // Порядок trackIds сохраняется; id, отсутствующие в библиотеке, пропускаются
  const resolved = playlist.trackIds
    .map((id) => byId.get(id))
    .filter((t): t is Track => t !== undefined)

  // удаление по id трека (не по индексу — TrackList может быть отсортирован)
  const removeAt = (trackId: string): void => {
    const idx = playlist.trackIds.indexOf(trackId)
    if (idx >= 0) usePlaylistStore.getState().removeTrack(playlist.id, idx)
  }

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
          {renaming ? (
            <RenameInput
              initial={playlist.name}
              onCommit={(name) => {
                if (name) usePlaylistStore.getState().rename(playlist.id, name)
                setRenaming(false)
              }}
              onCancel={() => setRenaming(false)}
            />
          ) : (
            <div
              className="pl-name editable"
              title="Нажмите, чтобы переименовать"
              onClick={() => setRenaming(true)}
            >
              {playlist.name}
            </div>
          )}
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
        <TrackList tracks={resolved} onRemoveTrack={removeAt} />
      )}    </>
  )
}

/** Enter/blur — commit (пустое имя не коммитится), Escape — отмена */
function RenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string
  onCommit: (name: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  return (
    <input
      ref={ref}
      className="pl-name-input"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(value.trim())
        if (e.key === 'Escape') onCancel()
      }}
    />
  )
}
