import Artwork from './Artwork'
import { useRef, type CSSProperties } from 'react'
import { usePlayerStore } from '../stores/playerStore'
import { useFavoritesStore } from '../stores/favoritesStore'
import { persistPatch } from '../stores/playlistStore'
import { fmt } from '../utils/format'
import { OfflineStatusIcon, useOfflineStatus } from './OfflineStatus'
import { playbackTimeline } from '../utils/playbackTimeline'
import { useVolumeWheel } from '../hooks/useVolumeWheel'
import {
  PlayIcon,
  PauseIcon,
  StopIcon,
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
  ExpandIcon,
  SOURCE_BADGES,
} from './icons'

export type Panel = 'queue' | 'lyrics' | 'eq' | 'mini'

interface PlayerBarProps {
  onTogglePanel: (panel: Panel) => void
  onExpand?: () => void
  expanded?: boolean
  activePanel?: 'queue' | 'lyrics' | 'eq' | 'cover'
}

/** Процент заполнения слайдера → CSS-переменная для градиента трека */
const progressStyle = (value: number, max: number): CSSProperties =>
  ({ '--progress': `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%` }) as CSSProperties

export default function PlayerBar({ onTogglePanel, onExpand, expanded = false, activePanel }: PlayerBarProps) {
  const queue = usePlayerStore((s) => s.queue)
  const order = usePlayerStore((s) => s.order)
  const pos = usePlayerStore((s) => s.pos)
  const playing = usePlayerStore((s) => s.playing)
  const playbackError = usePlayerStore((s) => s.playbackError)
  const shuffle = usePlayerStore((s) => s.shuffle)
  const repeat = usePlayerStore((s) => s.repeat)
  const currentSec = usePlayerStore((s) => s.currentSec)
  const mediaTrackId = usePlayerStore((s) => s.mediaTrackId)
  const mediaDuration = usePlayerStore((s) => s.mediaDurationSec)
  const bufferedRanges = usePlayerStore((s) => s.bufferedRanges)
  const volume = usePlayerStore((s) => s.volume)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const stop = usePlayerStore((s) => s.stop)
  const next = usePlayerStore((s) => s.next)
  const prev = usePlayerStore((s) => s.prev)
  const seek = usePlayerStore((s) => s.seek)
  const setVolume = usePlayerStore((s) => s.setVolume)
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle)
  const cycleRepeat = usePlayerStore((s) => s.cycleRepeat)

  const track = order.length > 0 ? queue[order[pos]] : undefined
  const offlineItem = useOfflineStatus(track?.id)
  const duration = mediaTrackId === track?.id && mediaDuration > 0 ? mediaDuration : track?.durationSec ?? 0
  const timeline = playbackTimeline(currentSec, duration, mediaTrackId === track?.id ? bufferedRanges : [], offlineItem, track?.sourceId === 'local')
  const disabled = !track
  const previousVolume = useRef(volume || .7)
  const expandLabel = expanded ? 'Свернуть большой плеер' : 'Открыть большой плеер'
  const favoriteIds = useFavoritesStore((s) => s.ids)
  const toggleFavorite = useFavoritesStore((s) => s.toggle)
  const isFav = track ? favoriteIds.includes(track.id) : false

  // Дебаунсированный persist громкости — паттерн как у Equalizer (eqGains)
  const changeVolume = (v: number): void => {
    setVolume(v)
    if (v > 0) previousVolume.current = v
    persistPatch({ volume: usePlayerStore.getState().volume })
  }
  const volumeWheelRef = useVolumeWheel(volume, changeVolume)

  return (
    <section className="playerbar" aria-label="Управление воспроизведением">
      <div className="pb-left">
        <button className="pb-cover" onClick={onExpand} disabled={!onExpand} aria-label={expandLabel} title={expandLabel}>
          {track ? <Artwork src={track.coverDataUrl} artist={track.artist} album={track.album}/> : <MusicNoteIcon size={24}/> }
          <span className="pb-cover-action"><ExpandIcon size={18}/></span>
        </button>
        {!track && <div className="pb-track-info"><div className="pb-title">Здесь начинается музыка</div><div className="pb-artist">Выберите запись в коллекции</div></div>}
        {track && (
          <div className="pb-track-info">
            <button className="pb-title pb-title-button" title={`${track.title} — ${track.artist}`} aria-label={`${expandLabel}: ${track.title}`} onClick={onExpand}>{track.title}</button>
            <div className="pb-artist">
              <span className="pb-artist-name">{track.artist}</span>
              {SOURCE_BADGES[track.sourceId] && (
                <span
                  className={`src-badge src-${track.sourceId}`}
                  title={SOURCE_BADGES[track.sourceId].title}
                >
                  {SOURCE_BADGES[track.sourceId].render(12)}
                </span>
              )}
              <OfflineStatusIcon track={track} item={offlineItem}/>
            </div>
          </div>
        )}
        {track && (
          <button
            className={`icon-btn pb-heart${isFav ? ' active' : ''}`}
            title={isFav ? 'Убрать из любимого' : 'В любимое'}
            aria-label={isFav ? 'Убрать из любимого' : 'В любимое'}
            aria-pressed={isFav}
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
          <button className="icon-btn pb-stop-control" title="Стоп — остановить и вернуться к началу" aria-label="Стоп" disabled={disabled} onClick={stop}>
            <StopIcon size={18} />
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
            className="slider playback-timeline"
            title={timeline.title}
            aria-label="Позиция воспроизведения"
            aria-valuetext={`${fmt(currentSec)} из ${fmt(duration)}`}
            disabled={!duration}
            type="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={Math.min(currentSec, duration)}
            style={timeline.style}
            onChange={(e) => seek(Number(e.target.value))}
          />
          <span>{fmt(duration)}</span>
          <button className="icon-btn pb-stop-inline" title="Стоп — остановить и вернуться к началу" aria-label="Стоп" disabled={disabled} onClick={stop}>
            <StopIcon size={17} />
          </button>
        </div>
        {playbackError && <p className="pb-error" role="alert">{playbackError}</p>}
      </div>

      <div className="pb-right">
        <button className="icon-btn" title="Очередь" aria-label="Очередь" aria-pressed={activePanel === 'queue'} onClick={() => onTogglePanel('queue')}>
          <QueueIcon size={18} />
        </button>
        <button className="icon-btn" title="Текст песни" aria-label="Текст песни" aria-pressed={activePanel === 'lyrics'} onClick={() => onTogglePanel('lyrics')}>
          <LyricsIcon size={18} />
        </button>
        <button className="icon-btn" title="Звук" aria-label="Звук" aria-pressed={activePanel === 'eq'} onClick={() => onTogglePanel('eq')}>
          <EqIcon size={18} />
        </button>
        {onExpand && <button className="icon-btn pb-expand" title={expandLabel} aria-label={expandLabel} aria-expanded={expanded} onClick={onExpand}><ExpandIcon size={18}/></button>}
        <button className="icon-btn pb-mini" title="Мини-плеер" aria-label="Мини-плеер" onClick={() => onTogglePanel('mini')}>
          <MiniIcon size={18} />
        </button>
        <div className="pb-volume" ref={volumeWheelRef}>
        <button className="icon-btn pb-mute" title={`${volume > 0 ? 'Выключить звук' : 'Включить звук'} · Колесо — громкость`} aria-label={volume > 0 ? 'Выключить звук' : 'Включить звук'} aria-pressed={volume === 0} onClick={() => { if (volume > 0) previousVolume.current = volume; changeVolume(volume > 0 ? 0 : previousVolume.current) }}><VolumeIcon size={18}/></button>
        <input
          className="slider"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          style={progressStyle(volume, 1)}
          onChange={(e) => changeVolume(Number(e.target.value))}
          title={`Громкость: ${Math.round(volume * 100)}% · Колесо — ±5%`}
          aria-label="Громкость"
          aria-valuetext={`${Math.round(volume * 100)}%`}
        />
        </div>
      </div>
    </section>
  )
}
