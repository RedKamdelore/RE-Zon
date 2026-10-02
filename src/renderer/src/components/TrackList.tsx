import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Track } from '@shared/types'
import Artwork from './Artwork'
import { sortTracks, nextSortDir, type SortKey, type SortDir } from '@shared/sorting'
import { usePlayerStore } from '../stores/playerStore'
import { usePlaylistStore } from '../stores/playlistStore'
import { useLibraryStore } from '../stores/libraryStore'
import { useFavoritesStore } from '../stores/favoritesStore'
import { useNavStore } from '../stores/navStore'
import { fmt } from '../utils/format'
import { PlayIcon, ClockIcon, MusicNoteIcon, HeartIcon, SOURCE_BADGES } from './icons'

interface TrackListProps {
  tracks: Track[]
  onPlay?: (tracks: Track[], index: number) => void // default: playerStore.playTracks
  onRemoveTrack?: (trackId: string) => void // если задан — в меню появляется «Удалить из плейлиста»
  onRemoveTracks?: (trackIds: string[]) => void
  onMoveTrack?: (trackId: string, offset: number) => void
}

interface MenuState {
  x: number
  y: number
  track: Track
  index: number
}

/** Кастомное контекстное меню (не нативное) — локально для TrackList */
export function ContextMenu({
  menu,
  hasRemove,
  onPlayTrack,
  onRemove,
  onClose,
  onSaveToLibrary,
  temporary = false,
}: {
  menu: MenuState
  hasRemove: boolean
  onPlayTrack: (index: number) => void
  onRemove: (trackId: string) => void
  onClose: () => void
  onSaveToLibrary?: () => void
  temporary?: boolean
}) {
  const playlists = usePlaylistStore((s) => s.playlists)
  const favoriteIds = useFavoritesStore((s) => s.ids)
  const toggleFavorite = useFavoritesStore((s) => s.toggle)
  const isFav = favoriteIds.includes(menu.track.id)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [offlineError, setOfflineError] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  // Кламп к вьюпорту: начальная позиция — точка клика, после монтирования
  // измеряем меню и отражаем вверх/влево, если оно вылезает за край
  const [pos, setPos] = useState({ left: menu.x, top: menu.y })

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    menuRef.current?.querySelector('button')?.focus()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [])

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
        {temporary && onSaveToLibrary && <button className="ctx-item" onClick={() => { onSaveToLibrary(); onClose() }}>+ В коллекцию</button>}
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
            if (!favoriteIds.includes(t.id)) onSaveToLibrary?.()
            toggleFavorite(t.id)
            onClose()
          }}
        >
          {isFav ? '♥ Убрать из любимого' : '♡ В любимое'}
        </button>
        {t.sourceId === 'direct' && <button className="ctx-item" onClick={() => {
          setOfflineError('')
          onSaveToLibrary?.()
          void window.api.offlineQueue(t).then(() => { useNavStore.getState().setView({name:'settings',page:'downloads'}); onClose() }).catch(error => setOfflineError(error instanceof Error ? error.message : 'Не удалось начать загрузку.'))
        }}>Сохранить офлайн</button>}
        {offlineError && <p role="alert" className="import-error">{offlineError}</p>}
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
        {!temporary && (t.album !== 'Неизвестный альбом' || t.artist !== 'Неизвестный исполнитель') && (
          <div className="ctx-sep" />
        )}
        {!temporary && t.album !== 'Неизвестный альбом' && (
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
        {!temporary && t.artist !== 'Неизвестный исполнитель' && (
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
        {!temporary && <div className="ctx-sep" />}
        {!temporary && <button
          className="ctx-item"
          onClick={() => {
            useNavStore.getState().setView({ name: 'radio', trackId: t.id })
            onClose()
          }}
        >
          Рекомендации по треку
        </button>}
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
          {temporary ? 'Скрыть результат' : 'Скрыть из библиотеки'}
        </button>
      </div>
      {pickerOpen && (
        <div className="ctx-menu ctx-submenu" style={{ left: submenuLeft, top: pos.top }}>
          {playlists.map((pl) => (
            <button
              key={pl.id}
              className="ctx-item"
              onClick={() => {
                onSaveToLibrary?.()
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

export default function TrackList({ tracks, onPlay, onRemoveTrack, onRemoveTracks, onMoveTrack }: TrackListProps) {
  const currentTrackId = usePlayerStore((s) =>
    s.order.length > 0 ? s.queue[s.order[s.pos]]?.id : undefined,
  )
  const [menu, setMenu] = useState<MenuState | null>(null)
  // Сортировка по столбцам (V3-4d): null — исходный порядок
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null)
  const sorted = useMemo(() => (sort ? sortTracks(tracks, sort.key, sort.dir) : tracks), [tracks, sort])
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const anchor = useRef<string | null>(null)
  const [notice, setNotice] = useState('')
  const playlists = usePlaylistStore((s) => s.playlists)
  const selectedTracks = sorted.filter((t) => selected.has(t.id))
  const selectedIds = selectedTracks.map((t) => t.id)
  const selectRow = (id: string, range: boolean): void => {
    setSelecting(true)
    setSelected((previous) => {
      const next = new Set(previous)
      const from = sorted.findIndex((t) => t.id === anchor.current)
      const to = sorted.findIndex((t) => t.id === id)
      if (range && from >= 0) {
        for (const track of sorted.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(track.id)
      } else {
        if (next.has(id)) next.delete(id)
        else next.add(id)
        anchor.current = id
      }
      return next
    })
  }
  const finishAction = (message: string): void => {
    setNotice(message)
    setSelected(new Set())
  }

  const play = onPlay ?? ((list: Track[], index: number) => usePlayerStore.getState().playTracks(list, index))

  if (tracks.length === 0 && !notice) {
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
    <div className="tl" tabIndex={0} aria-label="Список треков"
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).matches('input, select, textarea')) return
        if ((e.ctrlKey || e.metaKey) && e.code === 'KeyA') {
          e.preventDefault()
          setSelecting(true)
          setSelected(new Set(sorted.map((t) => t.id)))
        }
        if (e.key === 'Escape') { setSelecting(false); setSelected(new Set()); setMenu(null) }
      }}>
      <div className="tl-bulk" aria-label="Действия с треками">
        <button className="btn-outline" onClick={() => { setSelecting(!selecting); setSelected(new Set()) }}>
          {selecting ? 'Завершить выделение' : 'Выбрать треки'}
        </button>
        {sort && <button className="text-button" onClick={()=>setSort(null)}>Вернуть исходный порядок</button>}
        {selecting && <>
          <span aria-live="polite">Выбрано: {selectedIds.length}</span>
          <button className="btn-outline" onClick={() => setSelected(new Set(sorted.map((t) => t.id)))}>Выбрать все ({sorted.length})</button>
          <button className="btn-outline" onClick={() => setSelected(new Set())}>Снять выделение</button>
          <button className="btn-outline" disabled={!selectedIds.length} onClick={() => { play(selectedTracks, 0); setNotice(`Воспроизведение: ${selectedIds.length} треков`) }}>Воспроизвести</button>
          <button className="btn-outline" disabled={!selectedIds.length} onClick={() => {
            for (const t of selectedTracks) usePlayerStore.getState().enqueue(t)
            finishAction(`Добавлено в очередь: ${selectedIds.length}`)
          }}>В очередь</button>
          <button className="btn-outline" disabled={!selectedIds.length} onClick={() => {
            useFavoritesStore.getState().setMany(selectedIds, true); finishAction(`Добавлено в любимое: ${selectedIds.length}`)
          }}>В любимое</button>
          <button className="btn-outline" disabled={!selectedIds.length} onClick={() => {
            useFavoritesStore.getState().setMany(selectedIds, false); finishAction(`Убрано из любимого: ${selectedIds.length}`)
          }}>Убрать из любимого</button>
          <select aria-label="Добавить выбранные треки в плейлист" value="" disabled={!selectedIds.length || !playlists.length}
            onChange={(e) => { usePlaylistStore.getState().addTracks(e.target.value, selectedIds); finishAction(`Добавлено в плейлист: ${selectedIds.length}`) }}>
            <option value="" disabled>В плейлист…</option>
            {playlists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {onRemoveTracks && <button className="btn-outline" disabled={!selectedIds.length} onClick={() => {
            onRemoveTracks(selectedIds); finishAction(`Убрано из плейлиста: ${selectedIds.length}`)
          }}>Убрать из плейлиста</button>}
          <button className="btn-outline" disabled={!selectedIds.length} title="Скрыть в программе, сохранив файлы на диске" onClick={() => {
            useLibraryStore.getState().hideTracks(selectedIds)
            finishAction(`Убрано из библиотеки: ${selectedIds.length}. Файлы сохранены.`)
          }}>Убрать из библиотеки</button>
        </>}
      </div>
      {notice && <div className="tl-bulk-notice" role="status">{notice}
      </div>}
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
        <span/>
      </div>
      {sorted.map((t, i) => (
        <div
          key={`${t.id}:${i}`}
          className={`tl-row${selected.has(t.id) ? ' tl-selected' : ''}`}
          tabIndex={0}
          aria-label={`${t.artist} — ${t.title}`}
          onKeyDown={e=>{if(e.target===e.currentTarget&&e.key==='Enter'){e.preventDefault();if(selecting)selectRow(t.id,e.shiftKey);else play(sorted,i)}if(e.target===e.currentTarget&&e.code==='Space'){e.preventDefault();e.stopPropagation();selectRow(t.id,e.shiftKey)}}}
          onClick={(e) => {
            if (e.detail > 1) return
            if (selecting || e.shiftKey || e.ctrlKey || e.metaKey) selectRow(t.id, e.shiftKey)
            else play(sorted,i)
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            setMenu({ x: e.clientX, y: e.clientY, track: t, index: i })
          }}
        >
          <span className="tl-num-wrap">
            {selecting ? <input type="checkbox" aria-label={`Выбрать ${t.artist} — ${t.title}`}
              checked={selected.has(t.id)} onChange={() => {}}
              onClick={(e) => { e.stopPropagation(); selectRow(t.id, e.shiftKey) }} /> : <>
            <button className="icon-btn row-play" aria-label={`Слушать ${t.title}`} onClick={e=>{e.stopPropagation();play(sorted,i)}}>
              <PlayIcon size={14} />
            </button>
            </>}
          </span>
          <span className="tl-title-cell">
            <Artwork src={t.coverDataUrl} artist={t.artist} album={t.album}/>
            <span className="tl-title-text">
              <span className={`tl-title${t.id === currentTrackId ? ' playing' : ''}`}>
                {t.title}
              </span>
              <span className="tl-artist">
                {t.artist}
                {SOURCE_BADGES[t.sourceId] && (
                  <span
                    className={`src-badge src-${t.sourceId}`}
                    title={SOURCE_BADGES[t.sourceId].title}
                  >
                    {SOURCE_BADGES[t.sourceId].render(11)}
                  </span>
                )}
              </span>
            </span>
          </span>
          <span className="tl-album">{t.album}</span>
          <span className="tl-duration">{fmt(t.durationSec)}</span>
          <span className="track-row-actions">{onMoveTrack&&!sort&&<><button className="icon-btn" aria-label={`Выше: ${t.title}`} disabled={i===0} onClick={e=>{e.stopPropagation();onMoveTrack(t.id,-1)}}>↑</button><button className="icon-btn" aria-label={`Ниже: ${t.title}`} disabled={i===sorted.length-1} onClick={e=>{e.stopPropagation();onMoveTrack(t.id,1)}}>↓</button></>}<button className="icon-btn" aria-label={`Действия: ${t.title}`} onClick={e=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setMenu({x:r.right,y:r.bottom,track:t,index:i})}}>⋯</button></span>
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
