import { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import PlayerBar, { type Panel } from './components/PlayerBar'
import RightPanel from './components/RightPanel'
import HomeView from './components/HomeView'
import SearchView from './components/SearchView'
import PlaylistView from './components/PlaylistView'
import SettingsView from './components/SettingsView'
import CollectionView from './components/CollectionView'
import RadioView from './components/RadioView'
import MiniPlayer from './components/MiniPlayer'
import { usePlayerStore, initPlayerSubscriptions } from './stores/playerStore'
import { useLibraryStore } from './stores/libraryStore'
import { usePlaylistStore, setPersistedBase } from './stores/playlistStore'
import { useSettingsStore } from './stores/settingsStore'
import { useLyricsStore } from './stores/lyricsStore'
import { useStatsStore } from './stores/statsStore'
import { useNavStore, type View } from './stores/navStore'

export type { View }

export default function App() {
  const view = useNavStore((s) => s.view)
  const setView = useNavStore((s) => s.setView)
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
          useStatsStore.getState().init(data.playStats)
          useSettingsStore.getState().init(data) // применяет appearance к DOM
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
  // повторный клик по активной кнопке закрывает панель, 'mini' — мини-плеер
  const [panel, setPanel] = useState<null | 'queue' | 'lyrics' | 'eq'>(null)
  const [mini, setMini] = useState(false)

  const setMiniMode = async (value: boolean): Promise<void> => {
    if (!window.api) return
    await window.api.setMiniMode(value)
    setMini(value)
  }

  const onTogglePanel = (p: Panel): void => {
    if (p === 'mini') {
      void setMiniMode(true)
      return
    }
    setPanel((prev) => (prev === p ? null : p))
  }

  // Команды из трея (player:cmd): toggle / next / prev
  useEffect(() => {
    if (!window.api) return
    return window.api.onPlayerCommand((cmd) => {
      const p = usePlayerStore.getState()
      if (cmd === 'toggle') p.togglePlay()
      if (cmd === 'next') p.next({ manual: true })
      if (cmd === 'prev') p.prev()
    })
  }, [])

  const playlist = view.name === 'playlist' ? playlists.find((p) => p.id === view.id) : undefined

  if (mini) {
    return (
      <div className="app mini">
        <MiniPlayer onExpand={() => void setMiniMode(false)} />
      </div>
    )
  }

  return (
    <div className={`app${panel ? ' panel-open' : ''}`}>
      <Sidebar view={view} onNavigate={setView} />
      <main className="main">
        {view.name === 'home' && <HomeView />}
        {view.name === 'search' && <SearchView />}
        {view.name === 'settings' && <SettingsView />}
        {view.name === 'playlist' &&
          (playlist ? (
            <PlaylistView playlist={playlist} tracks={tracks} />
          ) : (
            <HomeView />
          ))}
        {view.name === 'artist' && <CollectionView kind="artist" name={view.artist} />}
        {view.name === 'album' && <CollectionView kind="album" name={view.album} />}
        {view.name === 'radio' && <RadioView trackId={view.trackId} />}
      </main>
      {panel && <RightPanel panel={panel} onClose={() => setPanel(null)} />}
      <PlayerBar onTogglePanel={onTogglePanel} />
    </div>
  )
}
