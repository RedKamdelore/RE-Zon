import { useEffect, useState } from 'react'
import type { Playlist } from '@shared/types'
import Sidebar from './components/Sidebar'
import PlayerBar, { type Panel } from './components/PlayerBar'
import { usePlayerStore, initPlayerSubscriptions } from './stores/playerStore'
import { useLibraryStore } from './stores/libraryStore'

export type View = { name: 'home' } | { name: 'search' } | { name: 'playlist'; id: string }

const fmt = (sec: number): string => {
  const s = Math.floor(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function App() {
  const [view, setView] = useState<View>({ name: 'home' })
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const tracks = useLibraryStore((s) => s.tracks)
  const loading = useLibraryStore((s) => s.loading)
  const usingDemo = useLibraryStore((s) => s.usingDemo)

  useEffect(() => {
    const unsubscribe = initPlayerSubscriptions()
    void useLibraryStore.getState().init()
    if (window.api) {
      window.api
        .loadData()
        .then((data) => {
          usePlayerStore.getState().setVolume(data.volume)
          usePlayerStore.getState().applyEqPreset(data.eqGains)
          setPlaylists(data.playlists)
        })
        .catch((e) => console.error('loadData failed:', e))
    }
    return unsubscribe
  }, [])

  // Панели (очередь / текст / эквалайзер / мини) — поведение подключается в Task 12–14
  const onTogglePanel = (panel: Panel): void => console.log('toggle panel:', panel)

  return (
    <div className="app">
      <Sidebar playlists={playlists} view={view} onNavigate={setView} />
      <main className="main">
        {view.name === 'home' && (
          <>
            <h1>Добрый день</h1>
            {usingDemo && <p className="muted">Демо-библиотека — добавьте папку с музыкой</p>}
            <h2>Все треки</h2>
            {loading ? (
              <p className="muted">Загрузка…</p>
            ) : tracks.length === 0 ? (
              <p className="muted">Треки не найдены</p>
            ) : (
              <div className="track-list">
                {tracks.map((t, i) => (
                  <button
                    key={t.id}
                    className="track-row"
                    onClick={() => usePlayerStore.getState().playTracks(tracks, i)}
                  >
                    <span className="track-index">{i + 1}</span>
                    <span>
                      <span className="track-title">{t.title}</span>
                      <span className="track-artist">{t.artist}</span>
                    </span>
                    <span className="track-duration">{fmt(t.durationSec)}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {view.name === 'search' && (
          <>
            <h1>Поиск</h1>
            <p className="muted">Поиск появится в следующем обновлении</p>
          </>
        )}
        {view.name === 'playlist' && (
          <>
            <h1>{playlists.find((p) => p.id === view.id)?.name ?? 'Плейлист'}</h1>
            <p className="muted">Плейлисты появятся в следующем обновлении</p>
          </>
        )}
      </main>
      <PlayerBar onTogglePanel={onTogglePanel} />
    </div>
  )
}
