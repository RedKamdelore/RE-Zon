import { useEffect, useRef, useState } from 'react'
import { useNavStore } from '../stores/navStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { usePlaylistStore } from '../stores/playlistStore'
import { useLibraryStore } from '../stores/libraryStore'
import { usePlayerStore } from '../stores/playerStore'
import { PlayIcon, PauseIcon, StopIcon } from './icons'
import { AtlasIcon } from './AtlasIcon'
import Artwork from './Artwork'
export default function CommandBar() {
  const { view, past, future, back, forward, setView } = useNavStore()
  const [adding, setAdding] = useState(false)
  const addRef = useRef<HTMLDivElement>(null)
  const track = usePlayerStore(s => s.queue[s.order[s.pos]])
  const playing = usePlayerStore(s => s.playing)
  const fullPlayerOpen = useWorkspaceStore(s => s.fullPlayerOpen)
  const playlists = usePlaylistStore(s => s.playlists)
  const title = view.name === 'home' ? 'Личное пространство' : view.name === 'library' || view.name === 'favorites' ? 'Коллекция' : view.name === 'search' ? 'Поиск музыки' : view.name === 'sources' || view.name === 'service' ? 'Источники' : view.name === 'settings' ? 'Настройки' : 'Коллекция'
  const detail = view.name === 'album' ? view.album : view.name === 'artist' ? view.artist : view.name === 'playlist' ? playlists.find(p => p.id === view.id)?.name : view.name === 'radio' ? 'Радио по треку' : undefined
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') { e.preventDefault(); useWorkspaceStore.getState().setSearchOpen(true) }
      if (e.key === 'Escape') setAdding(false)
    }
    const outside = (e: PointerEvent) => { if (!addRef.current?.contains(e.target as Node)) setAdding(false) }
    window.addEventListener('keydown', key); window.addEventListener('pointerdown', outside)
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('pointerdown', outside) }
  }, [])
  return <header className="command-bar">
    <div className="history-controls"><button className="icon-btn" aria-label="Назад по истории" disabled={!past.length} onClick={back}>‹</button><button className="icon-btn" aria-label="Вперёд по истории" disabled={!future.length} onClick={forward}>›</button></div>
    <div className="breadcrumbs">{fullPlayerOpen ? <span>Большой плеер</span> : <><button onClick={() => setView(view.name === 'home' ? { name: 'home' } : title === 'Источники' ? { name: 'sources' } : title === 'Коллекция' ? { name: 'library', section: 'songs' } : view)}>{title}</button>{detail && <><span>/</span><span title={detail}>{detail}</span></>}</>}</div>
    <button className="global-search" aria-label="Быстрый поиск" onClick={() => useWorkspaceStore.getState().setSearchOpen(true)}><AtlasIcon name="search" size={17}/><span>Найти музыку</span><kbd>Ctrl K</kbd></button>
    <div className="add-menu-wrap" ref={addRef}><button className="icon-btn add-trigger" aria-label="Добавить" aria-expanded={adding} onClick={() => setAdding(!adding)}><AtlasIcon name="plus"/></button>{adding && <div className="command-menu"><button onClick={() => { setAdding(false); void useLibraryStore.getState().addFolder() }}>Добавить папку</button><button onClick={() => { setAdding(false); setView({ name: 'playlist', id: usePlaylistStore.getState().create() }) }}>Создать плейлист</button><button onClick={() => { setAdding(false); setView({ name: 'sources' }) }}>Подключить сервис</button></div>}</div>
    {!fullPlayerOpen && <div className="compact-transport">
      <button className="compact-track" aria-label="Открыть большой плеер" onClick={() => useWorkspaceStore.getState().openFullPlayer()}><Artwork src={track?.coverDataUrl} artist={track?.artist ?? 'ReZon'} album={track?.album ?? 'Сеанс'}/><span><strong>{track?.title ?? 'Ваш музыкальный атлас'}</strong><small>{track?.artist ?? 'Выберите, что послушать'}</small></span></button>
      <button className="transport-toggle icon-btn" disabled={!track} aria-label={playing ? 'Пауза' : 'Слушать'} onClick={() => usePlayerStore.getState().togglePlay()}>{playing ? <PauseIcon size={19}/> : <PlayIcon size={19}/>}</button>
      <button className="transport-stop icon-btn" disabled={!track} aria-label="Стоп" title="Стоп" onClick={() => usePlayerStore.getState().stop()}><StopIcon size={15}/></button>
    </div>}
  </header>
}
