import { usePlayerStore } from '../stores/playerStore'
import { PlayIcon, PauseIcon, PrevIcon, NextIcon, ExpandIcon, MusicNoteIcon } from './icons'

interface MiniPlayerProps {
  onExpand: () => void
}

export default function MiniPlayer({ onExpand }: MiniPlayerProps) {
  const queue = usePlayerStore((s) => s.queue)
  const order = usePlayerStore((s) => s.order)
  const pos = usePlayerStore((s) => s.pos)
  const playing = usePlayerStore((s) => s.playing)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const next = usePlayerStore((s) => s.next)
  const prev = usePlayerStore((s) => s.prev)

  const track = order.length > 0 ? queue[order[pos]] : undefined
  const disabled = queue.length === 0

  return (
    <div className="mini-player">
      <div className="mp-cover">
        {track?.coverDataUrl ? (
          <img src={track.coverDataUrl} alt="" />
        ) : (
          <MusicNoteIcon size={24} />
        )}
      </div>
      <div className="mp-info">
        <div className="mp-title">{track?.title ?? 'Player_DXD'}</div>
        <div className="mp-artist">{track?.artist ?? 'Ничего не играет'}</div>
      </div>
      <div className={`mp-controls${disabled ? ' controls-disabled' : ''}`}>
        <button className="icon-btn" title="Назад" onClick={prev}>
          <PrevIcon size={18} />
        </button>
        <button
          className="play-btn mp-play"
          title={playing ? 'Пауза' : 'Слушать'}
          onClick={togglePlay}
        >
          {playing ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
        </button>
        <button className="icon-btn" title="Вперёд" onClick={() => next({ manual: true })}>
          <NextIcon size={18} />
        </button>
      </div>
      <button className="icon-btn" title="Развернуть" onClick={onExpand}>
        <ExpandIcon size={18} />
      </button>
    </div>
  )
}
