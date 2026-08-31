import type { Playlist } from '@shared/types'
import type { View } from '../App'
import { HomeIcon, SearchIcon, PlusIcon, MusicNoteIcon } from './icons'

interface SidebarProps {
  playlists: Playlist[]
  view: View
  onNavigate: (view: View) => void
}

export default function Sidebar({ playlists, view, onNavigate }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-card">
        <div className="brand">
          <span className="brand-dot" />
          Player_DXD
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
      </div>

      <div className="sidebar-card library">
        <div className="library-header">
          <span>Моя медиатека</span>
          <button
            className="icon-btn"
            title="Создать плейлист"
            onClick={() => console.log('create playlist — Task 11')}
          >
            <PlusIcon size={20} />
          </button>
        </div>
        <div className="playlist-list">
          {playlists.length === 0 ? (
            <div className="empty-state">Создайте свой первый плейлист</div>
          ) : (
            playlists.map((pl) => (
              <button
                key={pl.id}
                className={`playlist-row${
                  view.name === 'playlist' && view.id === pl.id ? ' active' : ''
                }`}
                onClick={() => onNavigate({ name: 'playlist', id: pl.id })}
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
            ))
          )}
        </div>
      </div>
    </aside>
  )
}
