import { useEffect, useRef, useState } from 'react'
import Sidebar from './components/Sidebar'
import CommandBar from './components/CommandBar'
import SearchPalette from './components/SearchPalette'
import SourcesView from './components/SourcesView'
import UpdateNotice from './components/UpdateNotice'
import { useWorkspaceStore } from './stores/workspaceStore'
import HomeView from './components/HomeView'
import LibraryView from './components/LibraryView'
import SearchView from './components/SearchView'
import PlaylistView from './components/PlaylistView'
import SettingsView from './components/SettingsView'
import CollectionView from './components/CollectionView'
import RadioView from './components/RadioView'
import FavoritesView from './components/FavoritesView'
import MiniPlayer from './components/MiniPlayer'
import FullPlayer from './components/FullPlayer'
import { useHotkeys } from './hotkeys'
import { usePlayerStore, initPlayerSubscriptions, getPlayerEngine } from './stores/playerStore'
import { useLibraryStore, visibleTracks } from './stores/libraryStore'
import { usePlaylistStore, setPersistedBase } from './stores/playlistStore'
import { useSettingsStore } from './stores/settingsStore'
import { useLyricsStore, searchLyrics } from './stores/lyricsStore'
import { useStatsStore } from './stores/statsStore'
import { useFavoritesStore } from './stores/favoritesStore'
import { useConnectionsStore } from './stores/connectionsStore'
import { useAccountsStore } from './stores/accountsStore'
import { parseLrc } from '@shared/lyrics'

import ServiceCollection from './components/ServiceCollection'
import { useNavStore, type View } from './stores/navStore'

export type { View }

export default function App() {
  const view = useNavStore((s) => s.view)
  const mainRef=useRef<HTMLElement>(null)
  const savedScroll=useRef(0)
  const wasFullPlayer=useRef(false)
  const lastView=useRef(view)
  useEffect(()=>{if(mainRef.current)mainRef.current.scrollTop=0},[view])
  useEffect(()=>{
    if(lastView.current!==view){
      lastView.current=view
      if(useWorkspaceStore.getState().fullPlayerOpen){
        savedScroll.current=0
        useWorkspaceStore.getState().closeFullPlayer()
      }
    }
  },[view])
  const setView = useNavStore((s) => s.setView)
  const playlists = usePlaylistStore((s) => s.playlists)
  const tracks = useLibraryStore(visibleTracks)
  const currentTrack = usePlayerStore(s => s.queue[s.order[s.pos]])
  const lastHiddenIds = useLibraryStore((s) => s.lastHiddenIds)

  useHotkeys() // глобальные горячие клавиши (V3-4)

  useEffect(() => { if (currentTrack && !parseLrc(currentTrack.lyrics ?? '').length) void searchLyrics(currentTrack) }, [currentTrack?.id])

  useEffect(() => {
    const unsubscribe = initPlayerSubscriptions()
    if (window.api) {
      // Единственный loadData на старте: результат раздаётся всем сторам,
      // полный снимок сохраняется как база для дебаунсированных saveData
      window.api
        .loadData()
        .then(async (data) => {
          setPersistedBase(data)
          usePlaylistStore.getState().init(data.playlists)
          useLyricsStore.getState().init(data.lyricsOverrides, data.lyricOffsets)
          useStatsStore.getState().init(data.playStats)
          useSettingsStore.getState().init(data) // применяет appearance к DOM
          usePlayerStore.getState().setVolume(data.volume)
          usePlayerStore.getState().applyEqPreset(data.eqGains)
          useFavoritesStore.getState().init(data.favoriteIds ?? [])
          await useLibraryStore.getState().init(data)
          await useConnectionsStore.getState().init()
          await useAccountsStore.getState().init(data.accountLibraries)
          void useAccountsStore.getState().refreshAll()
        })
        .catch((e) => console.error('loadData failed:', e))
    } else {
      void useLibraryStore.getState().init()
    }
    return unsubscribe
  }, [])

  useEffect(() => {
    let lastAttempt=Date.now()
    const refresh=()=>{
      if(document.visibilityState==='hidden'||Date.now()-lastAttempt<60_000) return
      lastAttempt=Date.now()
      void useAccountsStore.getState().refreshAll()
    }
    const timer=window.setInterval(refresh,120_000)
    window.addEventListener('focus',refresh)
    document.addEventListener('visibilitychange',refresh)
    return()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh)}
  }, [])

  const fullPlayerOpen = useWorkspaceStore(s => s.fullPlayerOpen)
  const searchOpen = useWorkspaceStore(s => s.searchOpen)
  const [mini, setMini] = useState(false)

  useEffect(() => {
    if (fullPlayerOpen && !wasFullPlayer.current) savedScroll.current = mainRef.current?.scrollTop ?? 0
    if (!fullPlayerOpen && wasFullPlayer.current) requestAnimationFrame(() => { if (mainRef.current) mainRef.current.scrollTop = savedScroll.current })
    wasFullPlayer.current = fullPlayerOpen
  }, [fullPlayerOpen])


  const setMiniMode = async (value: boolean): Promise<void> => {
    if (!window.api) return
    await window.api.setMiniMode(value)
    setMini(value)
  }


  // Команды из трея (player:cmd): toggle / next / prev
  useEffect(() => {
    if (!window.api) return
    return window.api.onPlayerCommand((cmd) => {
      const p = usePlayerStore.getState()
      if (cmd === 'toggle') p.togglePlay()
      if (cmd === 'next') p.next({ manual: true })
      if (cmd === 'prev') p.prev()
      if (cmd === 'expand') useWorkspaceStore.getState().openFullPlayer()
      if (cmd.startsWith('seek:')) { const sec = Number(cmd.slice(5)); if (Number.isFinite(sec)) p.seek(sec) }
    })
  }, [])

  useEffect(() => {
    if (!window.api?.publishTrayState) return
    const publish = () => {
      const state = usePlayerStore.getState()
      const track = state.queue[state.order[state.pos]]
      const audioDuration = getPlayerEngine().element.duration
      window.api.publishTrayState({
        title: track?.title ?? 'Ничего не играет', artist: track?.artist ?? 'Re:Zon', cover: track?.coverDataUrl,
        playing: state.playing, currentSec: state.currentSec,
        durationSec: Number.isFinite(audioDuration) && audioDuration > 0 ? audioDuration : track?.durationSec ?? 0, hasTrack: !!track,
      })
    }
    publish()
    return usePlayerStore.subscribe(publish)
  }, [])

  const playlist = view.name === 'playlist' ? playlists.find((p) => p.id === view.id) : undefined

  if (mini) {
    return (
      <div className="app mini">
        <MiniPlayer onExpand={() => { void setMiniMode(false); useWorkspaceStore.getState().openFullPlayer() }} />
      </div>
    )
  }

  return (
    <div className="app">
      <Sidebar view={view} onNavigate={setView} />
      <CommandBar />
      <UpdateNotice />
      <main className={'main' + (fullPlayerOpen ? ' main-full-player' : '')} ref={mainRef}>
        {fullPlayerOpen ? <FullPlayer onMini={() => void setMiniMode(true)} /> : <>
        {lastHiddenIds.length > 0 && <div className="tl-bulk-notice" role="status">
          Убрано из библиотеки: {lastHiddenIds.length}. Файлы сохранены.
          <button className="btn-outline" onClick={() => useLibraryStore.getState().unhideTracks(lastHiddenIds)}>Отменить удаление</button>
          <button className="btn-outline" aria-label="Закрыть уведомление" onClick={() => useLibraryStore.setState({lastHiddenIds:[]})}>×</button>
        </div>}
        {view.name === 'home' && <HomeView />}
        {view.name === 'library' && <LibraryView key={view.section} section={view.section}/>}
        {view.name === 'search' && <SearchView />}
        {view.name === 'settings' && <SettingsView />}
        {view.name === 'sources' && <SourcesView />}
        {view.name === 'service' && <ServiceCollection key={`${view.accountId}:${view.section}`} accountId={view.accountId} section={view.section} />}
        {view.name === 'favorites' && <LibraryView section="favorites" />}
        {view.name === 'playlist' &&
          (playlist ? (
            <PlaylistView key={playlist.id} playlist={playlist} tracks={tracks} />
          ) : (
            <HomeView />
          ))}
        {view.name === 'artist' && <CollectionView kind="artist" name={view.artist} />}
        {view.name === 'album' && <CollectionView key={view.albumKey ?? `${view.album}:${view.artist ?? ""}`} kind="album" name={view.album} artist={view.artist} albumKey={view.albumKey} />}
        {view.name === 'radio' && <RadioView trackId={view.trackId} />}
        </>}
      </main>
      {searchOpen && <SearchPalette />}
    </div>
  )
}
