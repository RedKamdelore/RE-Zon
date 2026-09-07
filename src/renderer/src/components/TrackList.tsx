import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Track } from '@shared/types'
import { sortTracks, nextSortDir, type SortKey, type SortDir } from '@shared/sorting'
import { usePlayerStore } from '../stores/playerStore'
import { usePlaylistStore } from '../stores/playlistStore'
import { useLibraryStore } from '../stores/libraryStore'
import { useFavoritesStore } from '../stores/favoritesStore'
import { useNavStore } from '../stores/navStore'
import { fmt } from '../utils/format'
import { PlayIcon, ClockIcon, MusicNoteIcon, HeartIcon } from './icons'

interface TrackListProps {
  tracks: Track[]
  onPlay?: (tracks: Track[], index: number) => void // default: playerStore.playTracks
  onRemoveTrack?: (trackId: string) => void // если задан — в меню появляется «Удалить из плейлиста»
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
  onPlayTrack,
  onRemove,
  onClose,
}: {
  menu: MenuState
  hasRemove: boolean
  onPlayTrack: (index: number) => void
  onRemove: (trackId: string) => void
  onClose: () => void
}) {
  const playlists = usePlaylistStore((s) => s.playlists)
  const favoriteIds = useFavoritesStore((s) => s.ids)
  const toggleFavorite = useFavoritesStore((s) => s.toggle)
  const isFav = favoriteIds.includes(menu.track.id)
  const [pickerOpen, setPickerOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  // Кламп к вьюпорту: начальная позиция — точка клика, после монтирования
  // измеряем меню и отражаем вверх/влево, если оно вылезает за край
  const [pos, setPos] = useState({ left: menu.x, top: menu.y })

  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const margin = 8
    setPos({
      left: menu.x + width + margin > window.innerWidth ? Math.max(margin, menu.x - width) : menu.x,
      top: menu.y + height + margin > window.innerHeight ? Math.max(margin, menu.y - height) : menu.y,
    })
  }, [menu])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const t = menu.track
  const submenuLeft = pos.left + (menuRef.current?.offsetWidth ?? 188)

  return (
    <>
      <div className="ctx-overlay" onClick={onClose} onContextMenu={onClose} />
      <div ref={menuRef} className="ctx-menu" style={{ left: pos.left, top: pos.top }}>
        <button
          className="ctx-item"
          onClick={() => {
            onPlayTrack(menu.index)
            onClose()
          }}
        >
          Воспроизвести
        </button>
        <button
          className="ctx-item"
          onClick={() => {
            usePlayerStore.getState().playNext(t)
            onClose()
          }}
        >
          Играть следующим
        </button>
        <button
          className="ctx-item"
          onClick={() => {
            usePlayerStore.getState().enqueue(t)
            onClose()
          }}
        >
          Добавить в очередь
        </button>
        <button
          className="ctx-item"
          onClick={() => {
            toggleFavorite(t.id)
            onClose()
          }}
        >
          {isFav ? '♥ Убрать из любимого' : '♡ В любимое'}
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
              onRemove(menu.track.id)
              onClose()
            }}
          >
            Удалить из плейлиста
          </button>
        )}
        {(t.album !== 'Неизвестный альбом' || t.artist !== 'Неизвестный исполнитель') && (
          <div className="ctx-sep" />
        )}
        {t.album !== 'Неизвестный альбом' && (
          <button
            className="ctx-item"
            onClick={() => {
              useNavStore.getState().setView({ name: 'album', album: t.album, artist: t.artist })
              onClose()
            }}
          >
            Перейти к альбому
          </button>
        )}
        {t.artist !== 'Неизвестный исполнитель' && (
          <button
            className="ctx-item"
            onClick={() => {
              useNavStore.getState().setView({ name: 'artist', artist: t.artist })
              onClose()
            }}
          >
            Перейти к исполнителю
          </button>
        )}
        <div className="ctx-sep" />
        <button
          className="ctx-item"
          onClick={() => {
            useNavStore.getState().setView({ name: 'radio', trackId: t.id })
            onClose()
          }}
        >
          Рекомендации по треку
        </button>
        <button
          className="ctx-item"
          onClick={() => {
            void navigator.clipboard.writeText(`${t.artist} — ${t.title}`)
            onClose()
          }}
        >
          Копировать название
        </button>
        {t.sourceId === 'local' && (
          <button
            className="ctx-item"
            onClick={() => {
              window.api?.showItemInFolder(t.filePath)
              onClose()
            }}
          >
            Показать в папке
          </button>
        )}
        <div className="ctx-sep" />
        <button
          className="ctx-item"
          onClick={() => {
            useLibraryStore.getState().hideTrack(t.id)
            onClose()
          }}
        >
          Скрыть из библиотеки
        </button>
      </div>
      {pickerOpen && (
        <div className="ctx-menu ctx-submenu" style={{ left: submenuLeft, top: pos.top }}>
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
  // Сортировка по столбцам (V3-4d): null — исходный порядок
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null)
  const sorted = useMemo(() => (sort ? sortTracks(tracks, sort.key, sort.dir) : tracks), [tracks, sort])

  const play = onPlay ?? ((list: Track[], index: number) => usePlayerStore.getState().playTracks(list, index))

  if (tracks.length === 0) {
    return <p className="muted">Здесь пока ничего нет</p>
  }

  const headerCell = (key: SortKey, label: string): React.ReactNode => (
    <button
      className={`tl-sort${sort?.key === key ? ` sorted ${sort.dir}` : ''}`}
      onClick={() => setSort((prev) => nextSortDir(prev, key))}
    >
      {label}
      {sort?.key === key && <span className="tl-sort-arrow">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
    </button>
  )

  return (
    <div className="tl">
      <div className="tl-header">
        <span className="tl-num">#</span>
        {headerCell('title', 'Название')}
        {headerCell('album', 'Альбом')}
        <span className="tl-duration">
          <button
            className={`tl-sort${sort?.key === 'durationSec' ? ` sorted ${sort.dir}` : ''}`}
            onClick={() => setSort((prev) => nextSortDir(prev, 'durationSec'))}
          >
            <ClockIcon size={16} />
            {sort?.key === 'durationSec' && (
              <span className="tl-sort-arrow">{sort.dir === 'asc' ? '▲' : '▼'}</span>
            )}
          </button>
        </span>
      </div>
      {sorted.map((t, i) => (
        <div
          key={t.id}
          className="tl-row"
          onClick={() => play(sorted, i)}
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
          onPlayTrack={(index) => play(sorted, index)}
          onRemove={(index) => onRemoveTrack?.(index)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
