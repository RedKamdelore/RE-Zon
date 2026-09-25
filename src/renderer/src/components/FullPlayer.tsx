import { usePlayerStore } from '../stores/playerStore'
import { useWorkspaceStore, type FullPlayerMode } from '../stores/workspaceStore'
import Artwork from './Artwork'
import PlayerBar from './PlayerBar'
import { LyricsPanel, QueuePanel } from './RightPanel'

const modes: { id: FullPlayerMode; label: string }[] = [
  { id: 'cover', label: 'Обложка' },
  { id: 'lyrics', label: 'Текст' },
  { id: 'queue', label: 'Очередь' },
]

export default function FullPlayer({ onMini }: { onMini: () => void }) {
  const mode = useWorkspaceStore(s => s.fullPlayerMode)
  const setMode = useWorkspaceStore(s => s.setFullPlayerMode)
  const close = useWorkspaceStore(s => s.closeFullPlayer)
  const track = usePlayerStore(s => s.queue[s.order[s.pos]])

  return <section className={'full-player full-player-mode-' + mode} aria-label="Большой плеер">
    <div className="full-player-ambient" style={track?.coverDataUrl ? { backgroundImage: `url(${JSON.stringify(track.coverDataUrl)})` } : undefined} aria-hidden="true" />
    <div className="full-player-header">
      <button className="full-player-back" onClick={close}>← Вернуться в библиотеку</button>
      <div className="full-player-modes" role="tablist" aria-label="Режим большого плеера">
        {modes.map(item => <button key={item.id} role="tab" aria-selected={mode === item.id} className={mode === item.id ? 'active' : ''} onClick={() => setMode(item.id)}>{item.label}</button>)}
      </div>
      <span className="full-player-source">{track?.sourceId === 'local' ? 'На компьютере' : track?.sourceId === 'demo' ? 'Демо' : track?.sourceId === 'vk' ? 'VK' : track?.sourceId === 'soundcloud' ? 'SoundCloud' : track?.sourceId === 'direct' ? 'Прямая ссылка' : track?.sourceId ?? ''}</span>
    </div>
    <div className="full-player-content" role="tabpanel">
      {mode === 'cover' && <div className="full-player-art-stage"><div className="full-player-art"><Artwork src={track?.coverDataUrl} artist={track?.artist ?? 'Re:Zon'} album={track?.album ?? ''}/></div><div className="full-player-caption"><span>СЕЙЧАС ИГРАЕТ</span><h1>{track?.title ?? 'Выберите музыку'}</h1><p>{track?.artist ?? 'Re:Zon'}{track?.album ? ` · ${track.album}` : ''}</p></div></div>}
      {mode === 'lyrics' && <div className="full-player-lyrics"><div className="full-player-side-track"><div className="full-player-side-cover"><Artwork src={track?.coverDataUrl} artist={track?.artist ?? 'Re:Zon'} album={track?.album ?? ''}/></div><div><strong>{track?.title ?? 'Ничего не играет'}</strong><span>{track?.artist ?? 'Выберите музыку'}</span></div></div><div className="full-player-lyrics-body"><LyricsPanel /></div></div>}
      {mode === 'queue' && <div className="full-player-queue"><h2>Очередь воспроизведения</h2><QueuePanel /></div>}
    </div>
    <div className="full-player-transport"><PlayerBar onTogglePanel={panel => {
      if (panel === 'mini') onMini()
      else if (panel === 'lyrics' || panel === 'queue') setMode(panel)
      else { close(); useWorkspaceStore.getState().setSessionTab('eq') }
    }} /></div>
  </section>
}
