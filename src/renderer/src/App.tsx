import { useEffect, useState } from 'react'
import type { Playlist } from '@shared/types'
import Sidebar from './components/Sidebar'
import PlayerBar, { type Panel } from './components/PlayerBar'
import HomeView from './components/HomeView'
import PlaylistView from './components/PlaylistView'
import { usePlayerStore, initPlayerSubscriptions } from './stores/playerStore'
import { useLibraryStore } from './stores/libraryStore'

export type View = { name: 'home' } | { name: 'search' } | { name: 'playlist'; id: string }

export default function App() {
  const [view, setView] = useState<View>({ name: 'home' })
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const tracks = useLibraryStore((s) => s.tracks)

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

  const playlist = view.name === 'playlist' ? playlists.find((p) => p.id === view.id) : undefined

  return (
    <div className="app">
      <Sidebar playlists={playlists} view={view} onNavigate={setView} />
      <main className="main">
        {view.name === 'home' && <HomeView playlists={playlists} />}
        {view.name === 'search' && (
          <>
            <h1>Поиск</h1>
            <p className="muted">Поиск появится в следующем обновлении</p>
          </>
        )}
        {view.name === 'playlist' &&
          (playlist ? (
            <PlaylistView playlist={playlist} tracks={tracks} />
          ) : (
            <HomeView playlists={playlists} />
          ))}
      </main>
      <PlayerBar onTogglePanel={onTogglePanel} />
    </div>
  )
}
