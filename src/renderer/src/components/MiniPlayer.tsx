import { usePlayerStore } from '../stores/playerStore'
import Artwork from './Artwork'
import { fmt } from '../utils/format'
import { PlayIcon, PauseIcon, StopIcon, PrevIcon, NextIcon, ExpandIcon, MusicNoteIcon } from './icons'
import { OfflineStatusIcon, useOfflineStatus } from './OfflineStatus'
import { playbackTimeline } from '../utils/playbackTimeline'

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
  const mediaTrackId = usePlayerStore((s) => s.mediaTrackId)
  const mediaDuration = usePlayerStore((s) => s.mediaDurationSec)
  const bufferedRanges = usePlayerStore((s) => s.bufferedRanges)
  const seek = usePlayerStore((s) => s.seek)

  const track = order.length > 0 ? queue[order[pos]] : undefined
  const offlineItem = useOfflineStatus(track?.id)
  const duration = mediaTrackId === track?.id && mediaDuration > 0 ? mediaDuration : track?.durationSec ?? 0
  const timeline = playbackTimeline(currentSec, duration, mediaTrackId === track?.id ? bufferedRanges : [], offlineItem, track?.sourceId === 'local')
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
      <div className="mp-progress"><span>{fmt(currentSec)}</span><input className="slider playback-timeline" title={timeline.title} type="range" aria-label="Позиция воспроизведения" aria-valuetext={`${fmt(currentSec)} из ${fmt(duration)}`} min={0} max={duration || 1} step={0.1} value={Math.min(currentSec,duration)} disabled={!duration} style={timeline.style} onChange={e=>seek(Number(e.target.value))}/><span>{fmt(duration)}</span></div>
      {playbackError && <p className="mp-error" role="alert">{playbackError}</p>}
    </div>
  )
}
