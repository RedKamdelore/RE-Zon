import { useEffect, useState } from 'react'
import type { Track } from '@shared/types'
import { usePlayerStore } from '../stores/playerStore'
import { usePlaylistStore } from '../stores/playlistStore'
import { fmt } from '../utils/format'
import { PlayIcon, ClockIcon, MusicNoteIcon } from './icons'

interface TrackListProps {
  tracks: Track[]
  onPlay?: (tracks: Track[], index: number) => void // default: playerStore.playTracks
  onRemoveTrack?: (index: number) => void // если задан — в меню появляется «Удалить из плейлиста»
}

interface MenuState {
  x: number
  y: number
  track: Track
  index: number
}

/** Кастомное контекстное меню (не нативное) — локально для TrackList */
function ContextMenu({
  menu,
  hasRemove,
  onEnqueue,
  onRemove,
  onClose,
}: {
  menu: MenuState
  hasRemove: boolean
  onEnqueue: (track: Track) => void
  onRemove: (index: number) => void
  onClose: () => void
}) {
  const playlists = usePlaylistStore((s) => s.playlists)
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div className="ctx-overlay" onClick={onClose} onContextMenu={onClose} />
      <div className="ctx-menu" style={{ left: menu.x, top: menu.y }}>
        <button
          className="ctx-item"
          onClick={() => {
            onEnqueue(menu.track)
            onClose()
          }}
        >
          Добавить в очередь
        </button>
        {playlists.length > 0 && (
          <button className="ctx-item" onClick={() => setPickerOpen((v) => !v)}>
            Добавить в плейлист
          </button>
        )}
        {hasRemove && (
          <button
            className="ctx-item"
            onClick={() => {
              onRemove(menu.index)
              onClose()
            }}
          >
            Удалить из плейлиста
          </button>
        )}
      </div>
      {pickerOpen && (
        <div className="ctx-menu ctx-submenu" style={{ left: menu.x + 188, top: menu.y }}>
          {playlists.map((pl) => (
            <button
              key={pl.id}
              className="ctx-item"
              onClick={() => {
                usePlaylistStore.getState().addTrack(pl.id, menu.track.id)
                onClose()
              }}
            >
              {pl.name}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

export default function TrackList({ tracks, onPlay, onRemoveTrack }: TrackListProps) {
  const currentTrackId = usePlayerStore((s) =>
    s.order.length > 0 ? s.queue[s.order[s.pos]]?.id : undefined,
  )
  const [menu, setMenu] = useState<MenuState | null>(null)

  const play = onPlay ?? ((list: Track[], index: number) => usePlayerStore.getState().playTracks(list, index))

  if (tracks.length === 0) {
    return <p className="muted">Здесь пока ничего нет</p>
  }

  return (
    <div className="tl">
      <div className="tl-header">
        <span className="tl-num">#</span>
        <span>Название</span>
        <span>Альбом</span>
        <span className="tl-duration">
          <ClockIcon size={16} />
        </span>
      </div>
      {tracks.map((t, i) => (
        <div
          key={t.id}
          className="tl-row"
          onClick={() => play(tracks, i)}
          onContextMenu={(e) => {
            e.preventDefault()
            setMenu({ x: e.clientX, y: e.clientY, track: t, index: i })
          }}
        >
          <span className="tl-num-wrap">
            <span className="tl-num">{i + 1}</span>
            <span className="tl-play">
              <PlayIcon size={14} />
            </span>
          </span>
          <span className="tl-title-cell">
            <span className="tl-cover">
              {t.coverDataUrl ? <img src={t.coverDataUrl} alt="" /> : <MusicNoteIcon size={20} />}
            </span>
            <span className="tl-title-text">
              <span className={`tl-title${t.id === currentTrackId ? ' playing' : ''}`}>
                {t.title}
              </span>
              <span className="tl-artist">{t.artist}</span>
            </span>
          </span>
          <span className="tl-album">{t.album}</span>
          <span className="tl-duration">{fmt(t.durationSec)}</span>
        </div>
      ))}
      {menu && (
        <ContextMenu
          menu={menu}
          hasRemove={onRemoveTrack !== undefined}
          onEnqueue={(track) => usePlayerStore.getState().enqueue(track)}
          onRemove={(index) => onRemoveTrack?.(index)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
