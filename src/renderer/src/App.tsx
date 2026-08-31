import { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import PlayerBar, { type Panel } from './components/PlayerBar'
import RightPanel from './components/RightPanel'
import HomeView from './components/HomeView'
import SearchView from './components/SearchView'
import PlaylistView from './components/PlaylistView'
import { usePlayerStore, initPlayerSubscriptions } from './stores/playerStore'
import { useLibraryStore } from './stores/libraryStore'
import { usePlaylistStore, setPersistedBase } from './stores/playlistStore'
import { useLyricsStore } from './stores/lyricsStore'

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
          useLyricsStore.getState().init(data.lyricsOverrides)
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

  // Правая панель: очередь / текст / эквалайзер (Task 12–13);
  // повторный клик по активной кнопке закрывает панель, 'mini' — Task 14
  const [panel, setPanel] = useState<null | 'queue' | 'lyrics' | 'eq'>(null)
  const onTogglePanel = (p: Panel): void => {
    if (p === 'mini') {
      console.log('mini player — Task 14')
      return
    }
    setPanel((prev) => (prev === p ? null : p))
  }

  const playlist = view.name === 'playlist' ? playlists.find((p) => p.id === view.id) : undefined

  return (
    <div className={`app${panel ? ' panel-open' : ''}`}>
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
      {panel && <RightPanel panel={panel} onClose={() => setPanel(null)} />}
      <PlayerBar onTogglePanel={onTogglePanel} />
    </div>
  )
}
