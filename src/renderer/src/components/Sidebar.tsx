import { useEffect, useRef, useState } from 'react'
import type { View } from '../stores/navStore'
import { usePlaylistStore } from '../stores/playlistStore'
import { useFavoritesStore } from '../stores/favoritesStore'
import { HomeIcon, SearchIcon, GearIcon, PlusIcon, MusicNoteIcon, HeartIcon } from './icons'

interface SidebarProps {
  view: View
  onNavigate: (view: View) => void
}

interface MenuState {
  x: number
  y: number
  playlistId: string
}

export default function Sidebar({ view, onNavigate }: SidebarProps) {
  const playlists = usePlaylistStore((s) => s.playlists)
  const favoriteCount = useFavoritesStore((s) => s.ids.length)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)

  const createPlaylist = (): void => {
    const id = usePlaylistStore.getState().create()
    onNavigate({ name: 'playlist', id })
  }

  const removePlaylist = (id: string): void => {
    const pl = playlists.find((p) => p.id === id)
    if (!pl) return
    if (!window.confirm(`Удалить плейлист «${pl.name}»?`)) return
    usePlaylistStore.getState().remove(id)
    if (view.name === 'playlist' && view.id === id) onNavigate({ name: 'home' })
  }

  const pickCover = async (id: string): Promise<void> => {
    if (typeof window === 'undefined' || !window.api) return
    const dataUrl = await window.api.pickCoverImage()
    if (dataUrl) usePlaylistStore.getState().setCover(id, dataUrl)
  }

  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu])

  return (
    <aside className="sidebar">
      <div className="sidebar-card">
        <div className="brand">
          <span className="brand-dot" />
          Re:Zon
        </div>
        <button
          className={`nav-row${view.name === 'home' ? ' active' : ''}`}
          onClick={() => onNavigate({ name: 'home' })}
        >
          <HomeIcon />
          Главная
        </button>
        <button
          className={`nav-row${view.name === 'search' ? ' active' : ''}`}
          onClick={() => onNavigate({ name: 'search' })}
        >
          <SearchIcon />
          Поиск
        </button>
        <button
          className={`nav-row nav-favorites${view.name === 'favorites' ? ' active' : ''}`}
          onClick={() => onNavigate({ name: 'favorites' })}
        >
          <HeartIcon size={20} />
          Любимое{favoriteCount > 0 && <span className="nav-badge">{favoriteCount}</span>}
        </button>
        <button
          className={`nav-row${view.name === 'settings' ? ' active' : ''}`}
          onClick={() => onNavigate({ name: 'settings' })}
        >
          <GearIcon />
          Настройки
        </button>
      </div>

      <div className="sidebar-card library">
        <div className="library-header">
          <span>Моя медиатека</span>
          <button className="icon-btn" title="Создать плейлист" onClick={createPlaylist}>
            <PlusIcon size={20} />
          </button>
        </div>
        <div className="playlist-list">
          {playlists.length === 0 ? (
            <div className="empty-state">Создайте свой первый плейлист</div>
          ) : (
            playlists.map((pl) =>
              renamingId === pl.id ? (
                <RenameRow
                  key={pl.id}
                  initial={pl.name}
                  onCommit={(name) => {
                    if (name) usePlaylistStore.getState().rename(pl.id, name)
                    setRenamingId(null)
                  }}
                  onCancel={() => setRenamingId(null)}
                />
              ) : (
                <button
                  key={pl.id}
                  className={`playlist-row${
                    view.name === 'playlist' && view.id === pl.id ? ' active' : ''
                  }`}
                  onClick={() => onNavigate({ name: 'playlist', id: pl.id })}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setMenu({ x: e.clientX, y: e.clientY, playlistId: pl.id })
                  }}
                >
                  <span className="playlist-cover">
                    {pl.coverDataUrl ? (
                      <img src={pl.coverDataUrl} alt="" />
                    ) : (
                      <MusicNoteIcon size={20} />
                    )}
                  </span>
                  {pl.name}
                </button>
              ),
            )
          )}
        </div>
      </div>

      {menu && (
        <>
          <div className="ctx-overlay" onClick={() => setMenu(null)} onContextMenu={() => setMenu(null)} />
          <div className="ctx-menu" style={{ left: menu.x, top: menu.y }}>
            <button
              className="ctx-item"
              onClick={() => {
                setRenamingId(menu.playlistId)
                setMenu(null)
              }}
            >
              Переименовать
            </button>
            <button
              className="ctx-item"
              onClick={() => {
                const id = menu.playlistId
                setMenu(null)
                void pickCover(id)
              }}
            >
              Выбрать обложку
            </button>
            <button
              className="ctx-item"
              onClick={() => {
                const id = menu.playlistId
                setMenu(null)
                removePlaylist(id)
              }}
            >
              Удалить
            </button>
          </div>
        </>
      )}
    </aside>
  )
}

/** Строка инлайн-переименования: Enter/blur — commit (пустое имя не коммитится), Escape — отмена */
function RenameRow({
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
    <div className="playlist-row renaming">
      <input
        ref={ref}
        className="rename-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => onCommit(value.trim())}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommit(value.trim())
          if (e.key === 'Escape') onCancel()
        }}
      />
    </div>
  )
}
