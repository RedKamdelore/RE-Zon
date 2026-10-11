import { usePlayerStore } from '../stores/playerStore'
import Artwork from './Artwork'
import { fmt } from '../utils/format'
import { PlayIcon, PauseIcon, StopIcon, PrevIcon, NextIcon, ExpandIcon, MusicNoteIcon } from './icons'
import { OfflineStatusIcon, offlinePercent, useOfflineStatus } from './OfflineStatus'
import type { CSSProperties } from 'react'

interface MiniPlayerProps {
  onExpand: () => void
}

export default function MiniPlayer({ onExpand }: MiniPlayerProps) {
  const queue = usePlayerStore((s) => s.queue)
  const order = usePlayerStore((s) => s.order)
  const pos = usePlayerStore((s) => s.pos)
  const playing = usePlayerStore((s) => s.playing)
  const playbackError = usePlayerStore((s) => s.playbackError)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const stop = usePlayerStore((s) => s.stop)
  const next = usePlayerStore((s) => s.next)
  const prev = usePlayerStore((s) => s.prev)
  const currentSec = usePlayerStore((s) => s.currentSec)
  const seek = usePlayerStore((s) => s.seek)

  const track = order.length > 0 ? queue[order[pos]] : undefined
  const offlineItem = useOfflineStatus(track?.id)
  const downloadPercent = offlinePercent(offlineItem)
  const disabled = queue.length === 0

  return (
    <div className="mini-player">
      <div className="mp-cover">
        {track ? (
          <Artwork src={track.coverDataUrl} artist={track.artist} album={track.album} />
        ) : (
          <MusicNoteIcon size={24} />
        )}
      </div>
      <div className="mp-info">
        <div className="mp-title">{track?.title ?? 'Re:Zon'}</div>
        <div className="mp-artist"><span className="mp-artist-name">{track?.artist ?? 'Ничего не играет'}</span><OfflineStatusIcon track={track} item={offlineItem}/></div>
      </div>
      <div className={`mp-controls${disabled ? ' controls-disabled' : ''}`}>
        <button className="icon-btn" disabled={disabled} aria-label="Предыдущая запись" title="Назад" onClick={prev}>
          <PrevIcon size={18} />
        </button>
        <button
          className="play-btn mp-play"
          title={playing ? 'Пауза' : 'Слушать'}
          aria-label={playing ? 'Пауза' : 'Слушать'}
          disabled={disabled}
          onClick={togglePlay}
        >
          {playing ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
        </button>
        <button className="icon-btn" disabled={disabled} aria-label="Стоп" title="Остановить и вернуться к началу" onClick={stop}>
          <StopIcon size={18} />
        </button>
        <button className="icon-btn" disabled={disabled} aria-label="Следующая запись" title="Вперёд" onClick={() => next({ manual: true })}>
          <NextIcon size={18} />
        </button>
      </div>
      <button className="icon-btn" aria-label="Развернуть плеер" title="Развернуть" onClick={onExpand}>
        <ExpandIcon size={18} />
      </button>
      <div className="mp-progress"><span>{fmt(currentSec)}</span><input className={`slider${downloadPercent !== undefined ? ' has-download-progress' : ''}${offlineItem?.phase === 'downloading' && downloadPercent === undefined ? ' download-unknown' : ''}`} type="range" aria-label="Позиция воспроизведения" min={0} max={track?.durationSec || 1} step={0.1} value={Math.min(currentSec,track?.durationSec || 1)} disabled={!track?.durationSec} style={{ '--progress': `${track?.durationSec ? Math.min(100,currentSec/track.durationSec*100) : 0}%`, '--download-progress': `${downloadPercent ?? 0}%` } as CSSProperties} onChange={e=>seek(Number(e.target.value))}/><span>{fmt(track?.durationSec || 0)}</span></div>
      {playbackError && <p className="mp-error" role="alert">{playbackError}</p>}
    </div>
  )
}
