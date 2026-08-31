import { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import PlayerBar, { type Panel } from './components/PlayerBar'
import HomeView from './components/HomeView'
import SearchView from './components/SearchView'
import PlaylistView from './components/PlaylistView'
import { usePlayerStore, initPlayerSubscriptions } from './stores/playerStore'
import { useLibraryStore } from './stores/libraryStore'
import { usePlaylistStore, setPersistedBase } from './stores/playlistStore'

export type View = { name: 'home' } | { name: 'search' } | { name: 'playlist'; id: string }

export default function App() {
  const [view, setView] = useState<View>({ name: 'home' })
  const playlists = usePlaylistStore((s) => s.playlists)
  const tracks = useLibraryStore((s) => s.tracks)

  useEffect(() => {
    const unsubscribe = initPlayerSubscriptions()
    if (window.api) {
      // Единственный loadData на старте: результат раздаётся всем сторам,
      // полный снимок сохраняется как база для дебаунсированных saveData
      window.api
        .loadData()
        .then((data) => {
          setPersistedBase(data)
          usePlaylistStore.getState().init(data.playlists)
          usePlayerStore.getState().setVolume(data.volume)
          usePlayerStore.getState().applyEqPreset(data.eqGains)
          void useLibraryStore.getState().init(data)
        })
        .catch((e) => console.error('loadData failed:', e))
    } else {
      void useLibraryStore.getState().init()
    }
    return unsubscribe
  }, [])

  // Панели (очередь / текст / эквалайзер / мини) — поведение подключается в Task 12–14
  const onTogglePanel = (panel: Panel): void => console.log('toggle panel:', panel)

  const playlist = view.name === 'playlist' ? playlists.find((p) => p.id === view.id) : undefined

  return (
    <div className="app">
      <Sidebar view={view} onNavigate={setView} />
      <main className="main">
        {view.name === 'home' && <HomeView />}
        {view.name === 'search' && <SearchView />}
        {view.name === 'playlist' &&
          (playlist ? (
            <PlaylistView playlist={playlist} tracks={tracks} />
          ) : (
            <HomeView />
          ))}
      </main>
      <PlayerBar onTogglePanel={onTogglePanel} />
    </div>
  )
}
