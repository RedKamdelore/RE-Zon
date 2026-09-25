import { useEffect, useRef, useState } from 'react'
import type { Playlist, Track } from '@shared/types'
import { usePlayerStore } from '../stores/playerStore'
import { usePlaylistStore } from '../stores/playlistStore'
import { plural } from '../utils/plural'
import TrackList from './TrackList'
import Artwork from './Artwork'
import { useNavStore } from '../stores/navStore'
import { fmt } from '../utils/format'
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
          <Artwork src={playlist.coverDataUrl} artist="Плейлист" album={playlist.name}/>
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
            <h1 className="pl-name">
              {playlist.name}
            </h1>
          )}
          <div className="pl-meta">
            {resolved.length} {plural(resolved.length, 'трек', 'трека', 'треков')} · {fmt(resolved.reduce((sum,t)=>sum+t.durationSec,0))}
            {playlist.trackIds.length>resolved.length && <p>{playlist.trackIds.length-resolved.length} записей сейчас недоступны</p>}
          </div>
          <div className="entity-actions"><button className="btn-primary" disabled={!resolved.length} onClick={()=>usePlayerStore.getState().playTracks(resolved,0)}><PlayIcon size={17}/>Слушать</button><button className="btn-outline" onClick={()=>setRenaming(true)}>Переименовать</button><button className="btn-outline" onClick={()=>void window.api?.pickCoverImage().then(cover=>{if(cover)usePlaylistStore.getState().setCover(playlist.id,cover)})}>Обложка</button><button className="text-button" onClick={()=>useNavStore.getState().setView({name:'library',section:'songs'})}>Добавить записи ↗</button><button className="text-button danger" onClick={()=>{if(window.confirm('Удалить плейлист «'+playlist.name+'»?')){usePlaylistStore.getState().remove(playlist.id);useNavStore.getState().setView({name:'library',section:'playlists'})}}}>Удалить</button></div>
        </div>
      </div>
      {resolved.length === 0 ? (
        <p className="muted">В этом плейлисте пока нет треков</p>
      ) : (
        <TrackList tracks={resolved} onRemoveTrack={removeAt} onMoveTrack={(id,offset)=>usePlaylistStore.getState().moveTrack(playlist.id,id,offset)}
          onRemoveTracks={(ids) => usePlaylistStore.getState().removeTracks(playlist.id, ids)} />
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
