import { useEffect, useRef } from 'react'
import type { Track } from '@shared/types'
import { getPlayerEngine, usePlayerStore } from '../stores/playerStore'
import { useWorkspaceStore, type FullPlayerMode } from '../stores/workspaceStore'
import Artwork from './Artwork'
import PlayerBar from './PlayerBar'
import { LyricsPanel, QueuePanel } from './RightPanel'
import Equalizer from './Equalizer'
import ThemePrismCanvas from './ThemePrismCanvas'
import { useSettingsStore } from '../stores/settingsStore'

const modes: { id: FullPlayerMode; label: string }[] = [
  { id: 'cover', label: 'Обложка' },
  { id: 'lyrics', label: 'Текст' },
  { id: 'queue', label: 'Очередь' },
  { id: 'eq', label: 'Звук' },
]

function NowPlayingSide({ track }: { track?: Track }) {
  const source = track?.sourceId === 'local' ? 'На компьютере' : track?.sourceId === 'demo' ? 'Демо' : track?.sourceId === 'vk' ? 'VK' : track?.sourceId === 'soundcloud' ? 'SoundCloud' : track?.sourceId === 'direct' ? 'Прямая ссылка' : track?.sourceId
  return <div className="full-player-side-track">
    <div className="full-player-side-cover"><Artwork src={track?.coverDataUrl} artist={track?.artist ?? 'Re:Zon'} album={track?.album ?? ''}/></div>
    <div className="full-player-side-info"><span className="full-player-side-eyebrow">СЕЙЧАС ИГРАЕТ</span><strong>{track?.title ?? 'Ничего не играет'}</strong><span>{track?.artist ?? 'Выберите музыку'}</span>{(track?.album || source) && <small>{[track?.album, source].filter(Boolean).join(' · ')}</small>}</div>
  </div>
}

export default function FullPlayer({ onMini }: { onMini: () => void }) {
  const mode = useWorkspaceStore(s => s.fullPlayerMode)
  const setMode = useWorkspaceStore(s => s.setFullPlayerMode)
  const effect = useWorkspaceStore(s => s.playerEffect)
  const setEffect = useWorkspaceStore(s => s.setPlayerEffect)
  const close = useWorkspaceStore(s => s.closeFullPlayer)
  const track = usePlayerStore(s => s.queue[s.order[s.pos]])
  const playing = usePlayerStore(s => s.playing)
  const theme = useSettingsStore(s => s.appearance.theme)
  const rootRef = useRef<HTMLElement>(null)
  const ambient = track?.coverDataUrl ? { backgroundImage: `url(${JSON.stringify(track.coverDataUrl)})` } : undefined

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (!playing || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.style.setProperty('--audio-energy', '0')
      return
    }
    const engine = getPlayerEngine()
    let level = 0
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      const sample = engine.getLevel?.() ?? 0
      level += (sample - level) * (sample > level ? .35 : .12)
      root.style.setProperty('--audio-energy', level.toFixed(3))
    }, 50)
    return () => { window.clearInterval(timer); root.style.setProperty('--audio-energy', '0') }
  }, [playing])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || useWorkspaceStore.getState().searchOpen || document.querySelector('.ctx-menu')) return
      const expanded = document.querySelector<HTMLDetailsElement>('.full-player details[open]')
      if (expanded) { expanded.open = false; return }
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return
      close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close])

  return <section ref={rootRef} className={`full-player full-player-mode-${mode} full-player-effect-${effect}${playing ? ' is-playing' : ''}`} aria-label="Большой плеер">
    <div className="full-player-ambient" style={ambient} aria-hidden="true" />
    <div className="full-player-ambient-secondary" style={ambient} aria-hidden="true" />
    {effect === 'prism' && <div className="full-player-refracted" aria-hidden="true"><ThemePrismCanvas theme={theme}/></div>}
    <div className="full-player-pulse" aria-hidden="true" />
    <div className="full-player-header">
      <button className="full-player-back" onClick={close} title="Свернуть большой плеер"><span aria-hidden="true">←</span> <span>Назад</span></button>
      <div className="full-player-modes" style={{ ['--mode-index' as string]: modes.findIndex(item => item.id === mode) }} role="tablist" aria-label="Режим большого плеера" onKeyDown={event => {
        const index = modes.findIndex(item => item.id === mode)
        const nextIndex = event.key === 'ArrowRight' ? (index + 1) % modes.length : event.key === 'ArrowLeft' ? (index - 1 + modes.length) % modes.length : event.key === 'Home' ? 0 : event.key === 'End' ? modes.length - 1 : -1
        if (nextIndex < 0) return
        event.preventDefault()
        setMode(modes[nextIndex].id)
        event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus()
      }}>
        {modes.map(item => <button key={item.id} id={`full-player-tab-${item.id}`} role="tab" aria-controls="full-player-panel" aria-selected={mode === item.id} tabIndex={mode === item.id ? 0 : -1} className={mode === item.id ? 'active' : ''} onClick={() => setMode(item.id)}>{item.label}</button>)}
      </div>
      <div className="full-player-meta"><label>Фон <select aria-label="Эффект фона" value={effect} onChange={e => setEffect(e.target.value as typeof effect)}><option value="still">Статичный</option><option value="calm">Дыхание</option><option value="orbit">Орбита</option><option value="prism">Призма</option></select></label></div>
    </div>
    <div id="full-player-panel" className="full-player-content" role="tabpanel" aria-labelledby={`full-player-tab-${mode}`}>
      {mode === 'cover' && <div className="full-player-art-stage"><div className="full-player-art"><Artwork src={track?.coverDataUrl} artist={track?.artist ?? 'Re:Zon'} album={track?.album ?? ''}/></div><div className="full-player-caption"><span>СЕЙЧАС ИГРАЕТ</span><h1>{track?.title ?? 'Выберите музыку'}</h1><p>{track?.artist ?? 'Re:Zon'}{track?.album ? ` · ${track.album}` : ''}</p></div></div>}
      {mode === 'lyrics' && <div className="full-player-split"><NowPlayingSide track={track}/><div className="full-player-lyrics-body"><LyricsPanel /></div></div>}
      {mode === 'queue' && <div className="full-player-split"><NowPlayingSide track={track}/><div className="full-player-queue"><h2>Очередь воспроизведения</h2><QueuePanel showCurrent={false}/></div></div>}
      {mode === 'eq' && <div className="full-player-split"><NowPlayingSide track={track}/><div className="full-player-eq"><h2>Звук</h2><Equalizer /></div></div>}
    </div>
    <div className="full-player-transport"><PlayerBar onTogglePanel={panel => {
      if (panel === 'mini') onMini()
      else setMode(panel)
    }} hideModeShortcuts /></div>
  </section>
}
