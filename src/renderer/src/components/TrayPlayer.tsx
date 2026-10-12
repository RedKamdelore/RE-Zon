import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { TrayPlayerApi, TrayPlayerState } from '@shared/trayPlayer'
import { CloseIcon, ExpandIcon, LyricsIcon, MusicNoteIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, QueueIcon, StopIcon, VolumeIcon } from './icons'
import { fmt } from '../utils/format'

const empty: TrayPlayerState = { title: 'Выберите музыку', artist: 'Ваша коллекция ждёт', playing: false, currentSec: 0, durationSec: 0, hasTrack: false, volume: 1 }

export default function TrayPlayer({ api }: { api?: TrayPlayerApi }) {
  const [state, setState] = useState(empty)
  const [seekDraft, setSeekDraft] = useState<number | null>(null)
  const [volumeDraft, setVolumeDraft] = useState<number | null>(null)
  const seeking = useRef(false)
  const adjustingVolume = useRef(false)
  const previousVolume = useRef(.7)
  const trackIdentity = useRef('')

  useEffect(() => {
    if (!api) return
    let active = true, eventReceived = false
    const render = (next: TrayPlayerState) => {
      if (!active) return
      const identity = `${next.title}\n${next.artist}`
      if (identity !== trackIdentity.current) { trackIdentity.current = identity; seeking.current = false; setSeekDraft(null) }
      setState(next)
      if (!seeking.current) setSeekDraft(null)
      if (!adjustingVolume.current) setVolumeDraft(null)
      if (next.volume && next.volume > 0) previousVolume.current = next.volume
    }
    const unsubscribe = api.onState(next => { eventReceived = true; render(next) })
    void api.state().then(next => { if (active && !eventReceived && next) render(next) }).catch(() => {})
    const dismiss = (event: KeyboardEvent) => { if (event.key === 'Escape') api.hide() }
    window.addEventListener('keydown', dismiss)
    return () => { active = false; unsubscribe(); window.removeEventListener('keydown', dismiss) }
  }, [api])

  const duration = Number.isFinite(state.durationSec) ? Math.max(0, state.durationSec) : 0
  const current = Math.min(duration, Math.max(0, seekDraft ?? state.currentSec))
  const volume = Math.max(0, Math.min(1, volumeDraft ?? state.volume ?? 1))
  const cover = state.cover && /^(data:image\/(png|jpeg|webp|avif);base64,|https:\/\/)/i.test(state.cover) ? state.cover : undefined
  const style = { ...state.theme, '--progress': `${duration ? current / duration * 100 : 0}%` } as CSSProperties
  const command = (value: string) => api?.command(value)
  const changeVolume = (value: number) => { setVolumeDraft(value); if (value > 0) previousVolume.current = value; command(`volume:${value}`) }

  return <main className={`tray-player${state.playing ? ' is-playing' : ''}`} style={style} aria-label="Плеер в трее">
    <header className="tray-header"><span className="tray-brand">RE:ZON <span>/</span> Сейчас играет</span><button className="icon-btn" aria-label="Закрыть плеер" title="Закрыть · Escape" onClick={() => api?.hide()}><CloseIcon size={16}/></button></header>
    <div className="tray-track">
      <button className="tray-art" aria-label="Открыть большой плеер" title="Открыть большой плеер" onClick={() => api?.showMain()}>
        {cover ? <img key={cover} src={cover} alt="" onError={event => { event.currentTarget.hidden = true }} /> : <MusicNoteIcon size={30}/>}
        <span className="tray-art-action"><ExpandIcon size={22}/></span>
      </button>
      <div className="tray-identity"><strong title={state.title}>{state.hasTrack ? state.title : empty.title}</strong><span title={state.artist}>{state.hasTrack ? state.artist : empty.artist}</span><small className={state.playbackError ? 'tray-error' : ''} role={state.playbackError ? 'alert' : undefined} title={state.playbackError ?? undefined}>{state.playbackError ? 'Воспроизведение остановлено' : !state.hasTrack ? 'Начните в приложении' : state.playing ? 'Воспроизводится' : 'На паузе'}</small></div>
    </div>
    <div className="tray-timeline">
      <input className="slider" type="range" min="0" max={duration || 1} step="0.1" value={current} disabled={!state.hasTrack || !duration} aria-label="Позиция воспроизведения" aria-valuetext={`${fmt(current)} из ${fmt(duration)}`}
        onPointerDown={() => { seeking.current = true }} onPointerUp={() => { seeking.current = false }} onPointerCancel={() => { seeking.current = false; setSeekDraft(null) }} onBlur={() => { seeking.current = false; setSeekDraft(null) }}
        onChange={event => { const value = Number(event.target.value); setSeekDraft(value); command(`seek:${value}`) }} />
      <div className="tray-times"><span>{fmt(current)}</span><span>{fmt(duration)}</span></div>
    </div>
    <div className="tray-controls">
      <button className="icon-btn tray-stop" disabled={!state.hasTrack} aria-label="Стоп" title="Остановить и вернуться к началу" onClick={() => command('stop')}><StopIcon size={17}/></button>
      <button className="icon-btn" disabled={!state.hasTrack} aria-label="Предыдущий трек" title="Предыдущий трек" onClick={() => command('prev')}><PrevIcon size={22}/></button>
      <button className="tray-play" disabled={!state.hasTrack} aria-label={state.playing ? 'Пауза' : 'Слушать'} title={state.playing ? 'Пауза' : 'Слушать'} onClick={() => command('toggle')}>{state.playing ? <PauseIcon size={23}/> : <PlayIcon size={23}/>}</button>
      <button className="icon-btn" disabled={!state.hasTrack} aria-label="Следующий трек" title="Следующий трек" onClick={() => command('next')}><NextIcon size={22}/></button>
      <button className="icon-btn" aria-label="Открыть большой плеер" title="Открыть большой плеер" onClick={() => api?.showMain()}><ExpandIcon size={18}/></button>
    </div>
    <div className="tray-volume"><button className="icon-btn" aria-label={volume > 0 ? 'Выключить звук' : 'Включить звук'} aria-pressed={volume === 0} title={volume > 0 ? 'Выключить звук' : 'Включить звук'} onClick={() => { if (volume > 0) previousVolume.current = volume; changeVolume(volume > 0 ? 0 : previousVolume.current) }}><VolumeIcon size={17}/></button>
      <input className="slider" type="range" min="0" max="1" step="0.01" value={volume} aria-label="Громкость" aria-valuetext={`${Math.round(volume * 100)}%`} style={{ '--progress': `${volume * 100}%` } as CSSProperties}
        onPointerDown={() => { adjustingVolume.current = true }} onPointerUp={() => { adjustingVolume.current = false }} onPointerCancel={() => { adjustingVolume.current = false; setVolumeDraft(null) }} onBlur={() => { adjustingVolume.current = false; setVolumeDraft(null) }} onChange={event => changeVolume(Number(event.target.value))}/><span>{Math.round(volume * 100)}%</span>
    </div>
    <footer className="tray-shortcuts"><button disabled={!state.hasTrack} onClick={() => command('lyrics')}><LyricsIcon size={15}/>Текст</button><button disabled={!state.hasTrack} onClick={() => command('queue')}><QueueIcon size={15}/>Очередь</button><button className="tray-open" onClick={() => api?.showMain()}>Открыть<ExpandIcon size={14}/></button></footer>
  </main>
}
