import { useEffect, useState } from 'react'
import type { Track } from '@shared/types'
import { usePlayerStore } from '../stores/playerStore'
import { fmt } from '../utils/format'
import { PlayIcon, ClockIcon, MusicNoteIcon } from './icons'

interface TrackListProps {
  tracks: Track[]
  onPlay?: (tracks: Track[], index: number) => void // default: playerStore.playTracks
  onAddToPlaylist?: (track: Track) => void // Task 11 подключает реальное поведение
}

interface MenuState {
  x: number
  y: number
  track: Track
}

/** Кастомное контекстное меню (не нативное) — локально для TrackList */
function ContextMenu({
  menu,
  hasAddToPlaylist,
  onEnqueue,
  onAddToPlaylist,
  onClose,
}: {
  menu: MenuState
  hasAddToPlaylist: boolean
  onEnqueue: (track: Track) => void
  onAddToPlaylist: (track: Track) => void
  onClose: () => void
}) {
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
        {hasAddToPlaylist && (
          <button
            className="ctx-item"
            onClick={() => {
              onAddToPlaylist(menu.track)
              onClose()
            }}
          >
            Добавить в плейлист
          </button>
        )}
      </div>
    </>
  )
}

export default function TrackList({ tracks, onPlay, onAddToPlaylist }: TrackListProps) {
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
            setMenu({ x: e.clientX, y: e.clientY, track: t })
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
          hasAddToPlaylist={onAddToPlaylist !== undefined}
          onEnqueue={(track) => usePlayerStore.getState().enqueue(track)}
          onAddToPlaylist={(track) => onAddToPlaylist?.(track)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
