import Artwork from './Artwork'
import type { CSSProperties } from 'react'
import { usePlayerStore } from '../stores/playerStore'
import { useFavoritesStore } from '../stores/favoritesStore'
import { persistPatch } from '../stores/playlistStore'
import { fmt } from '../utils/format'
import {
  PlayIcon,
  PauseIcon,
  PrevIcon,
  NextIcon,
  ShuffleIcon,
  RepeatIcon,
  QueueIcon,
  LyricsIcon,
  EqIcon,
  MiniIcon,
  VolumeIcon,
  MusicNoteIcon,
  HeartIcon,
  SOURCE_BADGES,
} from './icons'

export type Panel = 'queue' | 'lyrics' | 'eq' | 'mini'

interface PlayerBarProps {
  onTogglePanel: (panel: Panel) => void
  onExpand?: () => void
}

/** Процент заполнения слайдера → CSS-переменная для градиента трека */
const progressStyle = (value: number, max: number): CSSProperties =>
  ({ '--progress': `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%` }) as CSSProperties

export default function PlayerBar({ onTogglePanel, onExpand }: PlayerBarProps) {
  const queue = usePlayerStore((s) => s.queue)
  const order = usePlayerStore((s) => s.order)
  const pos = usePlayerStore((s) => s.pos)
  const playing = usePlayerStore((s) => s.playing)
  const shuffle = usePlayerStore((s) => s.shuffle)
  const repeat = usePlayerStore((s) => s.repeat)
  const currentSec = usePlayerStore((s) => s.currentSec)
  const volume = usePlayerStore((s) => s.volume)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const next = usePlayerStore((s) => s.next)
  const prev = usePlayerStore((s) => s.prev)
  const seek = usePlayerStore((s) => s.seek)
  const setVolume = usePlayerStore((s) => s.setVolume)
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle)
  const cycleRepeat = usePlayerStore((s) => s.cycleRepeat)

  const track = order.length > 0 ? queue[order[pos]] : undefined
  const disabled = queue.length === 0
  const favoriteIds = useFavoritesStore((s) => s.ids)
  const toggleFavorite = useFavoritesStore((s) => s.toggle)
  const isFav = track ? favoriteIds.includes(track.id) : false

  // Дебаунсированный persist громкости — паттерн как у Equalizer (eqGains)
  const changeVolume = (v: number): void => {
    setVolume(v)
    persistPatch({ volume: usePlayerStore.getState().volume })
  }

  return (
    <section className="playerbar" aria-label="Управление воспроизведением">
      <div className="pb-left">
        <div className="pb-cover" onClick={onExpand} role={onExpand ? 'button' : undefined} tabIndex={onExpand ? 0 : undefined} aria-label={onExpand ? 'Открыть большой плеер' : undefined} onKeyDown={onExpand ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onExpand() } } : undefined}>
          {track ? <Artwork src={track.coverDataUrl} artist={track.artist} album={track.album}/> : <MusicNoteIcon size={24}/> }
        </div>
        {!track && <div className="pb-track-info"><div className="pb-title">Здесь начинается музыка</div><div className="pb-artist">Выберите запись в коллекции</div></div>}
        {track && (
          <div className="pb-track-info" onClick={onExpand}>
            <div className="pb-title">{track.title}</div>
            <div className="pb-artist">
              {track.artist}
              {SOURCE_BADGES[track.sourceId] && (
                <span
                  className={`src-badge src-${track.sourceId}`}
                  title={SOURCE_BADGES[track.sourceId].title}
                >
                  {SOURCE_BADGES[track.sourceId].render(12)}
                </span>
              )}
            </div>
          </div>
        )}
        {track && (
          <button
            className={`icon-btn pb-heart${isFav ? ' active' : ''}`}
            title={isFav ? 'Убрать из любимого' : 'В любимое'}
            onClick={() => toggleFavorite(track.id)}
          >
            <HeartIcon size={18} filled={isFav} />
          </button>
        )}
      </div>

      <div className={`pb-center${disabled ? ' controls-disabled' : ''}`}>
        <div className="pb-controls">
          <button
            className={`icon-btn${shuffle ? ' active' : ''}`}
            title="Перемешать"
            aria-label="Перемешать"
            aria-pressed={shuffle}
            disabled={disabled}
            onClick={toggleShuffle}
          >
            <ShuffleIcon size={18} />
          </button>
          <button className="icon-btn" title="Предыдущий трек" aria-label="Предыдущий трек" disabled={disabled} onClick={prev}>
            <PrevIcon size={20} />
          </button>
          <button
            className="play-btn"
            title={playing ? 'Пауза' : 'Слушать'}
            aria-label={playing ? 'Пауза' : 'Слушать'}
            disabled={disabled}
            onClick={togglePlay}
          >
            {playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
          </button>
          <button className="icon-btn" title="Следующий трек" aria-label="Следующий трек" disabled={disabled} onClick={() => next({ manual: true })}>
            <NextIcon size={20} />
          </button>
          <span className="repeat-wrap">
            <button
              className={`icon-btn${repeat !== 'off' ? ' active' : ''}`}
              title={repeat === 'one' ? 'Повтор одного' : repeat === 'all' ? 'Повтор всего' : 'Без повтора'}
              aria-label={repeat === 'one' ? 'Повтор одного' : repeat === 'all' ? 'Повтор всего' : 'Без повтора'}
              disabled={disabled}
              onClick={cycleRepeat}
            >
              <RepeatIcon size={18} />
            </button>
            {repeat === 'one' && <span className="repeat-badge">1</span>}
          </span>
        </div>
        <div className="pb-seek">
          <span>{fmt(currentSec)}</span>
          <input
            className="slider"
            aria-label="Позиция воспроизведения"
            aria-valuetext={`${fmt(currentSec)} из ${fmt(track?.durationSec ?? 0)}`}
            disabled={!track?.durationSec}
            type="range"
            min={0}
            max={track?.durationSec ?? 0}
            step={0.1}
            value={Math.min(currentSec, track?.durationSec ?? 0)}
            style={progressStyle(currentSec, track?.durationSec ?? 0)}
            onChange={(e) => seek(Number(e.target.value))}
          />
          <span>{fmt(track?.durationSec ?? 0)}</span>
        </div>
      </div>

      <div className="pb-right">
        <button className="icon-btn" title="Очередь" onClick={() => onTogglePanel('queue')}>
          <QueueIcon size={18} />
        </button>
        <button className="icon-btn" title="Текст песни" onClick={() => onTogglePanel('lyrics')}>
          <LyricsIcon size={18} />
        </button>
        <button className="icon-btn" title="Эквалайзер" onClick={() => onTogglePanel('eq')}>
          <EqIcon size={18} />
        </button>
        <button className="icon-btn" title="Мини-плеер" onClick={() => onTogglePanel('mini')}>
          <MiniIcon size={18} />
        </button>
        <VolumeIcon size={18} />
        <input
          className="slider"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          style={progressStyle(volume, 1)}
          onChange={(e) => changeVolume(Number(e.target.value))}
          title="Громкость"
          aria-label="Громкость"
        />
      </div>
    </section>
  )
}
