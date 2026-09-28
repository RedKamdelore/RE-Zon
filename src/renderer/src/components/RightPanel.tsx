import { useEffect, useMemo, useRef, useState } from 'react'
import type { Track } from '@shared/types'
import { upcomingPositions } from '@shared/queue'
import { usePlayerStore } from '../stores/playerStore'
import { useLyricsStore, setLyricsOverride, searchLyrics } from '../stores/lyricsStore'
import { fmt } from '../utils/format'
import { CloseIcon, MusicNoteIcon } from './icons'
import Equalizer from './Equalizer'
import { useWorkspaceStore } from '../stores/workspaceStore'
import Artwork from './Artwork'
import { activeLyricIndex, parseLrc } from '@shared/lyrics'

interface RightPanelProps {
  panel: 'queue' | 'lyrics' | 'eq'
  onClose: () => void
}

const TITLES = { queue: 'Очередь', lyrics: 'Текст песни', eq: 'Эквалайзер' } as const
const LYRIC_SOURCE_NAMES: Record<string, string> = { lrclib: 'LRCLIB', lrcapi: 'LrcAPI' }

/** Обложка 40×40 или плейсхолдер с нотой */
function Cover({ track }: { track: Track }) {
  return (
    <span className="rp-cover">
      <Artwork src={track.coverDataUrl} artist={track.artist} album={track.album}/>
    </span>
  )
}

// --- Очередь ---------------------------------------------------------------

export function QueuePanel({ showCurrent = true }: { showCurrent?: boolean } = {}) {
  const queue = usePlayerStore((s) => s.queue)
  const order = usePlayerStore((s) => s.order)
  const pos = usePlayerStore((s) => s.pos)
  const removeFromQueue = usePlayerStore((s) => s.removeFromQueue)
  const moveInQueue = usePlayerStore((s) => s.moveInQueue)
  // Позиция (в order-space) перетаскиваемой строки; ref, т.к. ререндер не нужен
  const dragPos = useRef<number | null>(null)

  const current = order.length > 0 ? queue[order[pos]] : undefined
  const upcoming = upcomingPositions(order, pos)

  if (!current) return <p className="empty-state">Очередь пуста</p>

  return (
    <>
      {showCurrent && <><h3 className="rp-section">Сейчас играет</h3>
        <div className="rp-row">
          <Cover track={current} />
          <span className="rp-row-text">
            <span className="rp-row-title playing">{current.title}</span>
            <span className="rp-row-artist">{current.artist}</span>
          </span>
          <span className="rp-row-duration">{fmt(current.durationSec)}</span>
        </div></>}

      <h3 className="rp-section">Далее в очереди</h3>
      {upcoming.length === 0 ? (
        <p className="empty-state">Очередь пуста</p>
      ) : (
        upcoming.map((position) => {
          const track = queue[order[position]]
          return (
            <div
              key={`${track.id}:${position}`}
              className="rp-row"
              draggable
              onDragStart={(e) => {
                dragPos.current = position
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', String(position))
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
              }}
              onDrop={(e) => {
                e.preventDefault()
                const from = dragPos.current ?? Number(e.dataTransfer.getData('text/plain'))
                if (Number.isInteger(from) && from !== position) moveInQueue(from, position)
                dragPos.current = null
              }}
            >
              <Cover track={track} />
              <span className="rp-row-text">
                <span className="rp-row-title">{track.title}</span>
                <span className="rp-row-artist">{track.artist}</span>
              </span>
              <span className="rp-row-duration">{fmt(track.durationSec)}</span>
              <button className="icon-btn queue-move" aria-label={`Выше: ${track.title}`} disabled={position === upcoming[0]} onClick={() => moveInQueue(position, position - 1)}>↑</button>
              <button className="icon-btn queue-move" aria-label={`Ниже: ${track.title}`} disabled={position === upcoming[upcoming.length - 1]} onClick={() => moveInQueue(position, position + 1)}>↓</button>
              <button
                className="icon-btn rp-row-remove"
                title="Удалить из очереди"
                onClick={() => removeFromQueue(position)}
              >
                <CloseIcon size={14} />
              </button>
            </div>
          )
        })
      )}
    </>
  )
}

// --- Текст песни -----------------------------------------------------------

export function LyricsPanel() {
  const queue = usePlayerStore((s) => s.queue)
  const order = usePlayerStore((s) => s.order)
  const pos = usePlayerStore((s) => s.pos)
  const currentSec = usePlayerStore((s) => s.currentSec)
  const seek = usePlayerStore((s) => s.seek)
  const overrides = useLyricsStore((s) => s.overrides)
  const automatic = useLyricsStore((s) => s.automatic)
  const searching = useLyricsStore((s) => s.searching)
  const lookupErrors = useLyricsStore((s) => s.errors)
  const drafts = useWorkspaceStore(s=>s.lyricDrafts)
  const [follow, setFollow] = useState(true)
  const [importError, setImportError] = useState('')
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const followRef = useRef(follow)

  const track = order.length > 0 ? queue[order[pos]] : undefined
  const trackId = track?.id

  const editing = !!trackId && Object.prototype.hasOwnProperty.call(drafts,trackId)
  const draft = trackId ? drafts[trackId] ?? '' : ''
  const setDraft = (value:string) => { if(trackId)useWorkspaceStore.getState().setLyricDraft(trackId,value) }
  const setEditing = (value:boolean) => { if(trackId&&!value)useWorkspaceStore.getState().setLyricDraft(trackId,undefined) }

  const hasOverride = !!trackId && Object.prototype.hasOwnProperty.call(overrides, trackId)
  const found = trackId ? automatic[trackId] : undefined
  const lyrics = track ? hasOverride ? overrides[track.id] : found?.synced ? found.text : track.lyrics || found?.text : undefined
  const timed = useMemo(() => parseLrc(lyrics ?? ''), [lyrics])
  const active = activeLyricIndex(timed, currentSec)
  followRef.current = follow
  useEffect(() => {
    if (track && !hasOverride && !parseLrc(track.lyrics ?? '').length) void searchLyrics(track)
  }, [trackId, hasOverride])
  useEffect(() => { setFollow(true) }, [trackId])
  useEffect(() => {
    if (!follow || active < 0) return
    const container = scrollRef.current, line = lineRefs.current[active]
    if (container && line) {
      const top = line.offsetTop - container.clientHeight / 2 + line.clientHeight / 2
      if (typeof container.scrollTo === 'function') container.scrollTo({top, behavior: 'smooth'})
      else container.scrollTop = top
    }
  }, [active, follow, trackId])
  useEffect(() => {
    const container = scrollRef.current
    if (!container?.closest('.full-player-lyrics-body') || !timed.length) return

    // The first and last lines need enough room to reach the pane's center.
    // Viewport units cannot account for the toolbar, transport, or window size.
    const measure = (): void => {
      const first = lineRefs.current[0]
      const last = lineRefs.current[timed.length - 1]
      if (!first || !last || !container.clientHeight) return
      const leading = `${Math.max(0, Math.round((container.clientHeight - first.clientHeight) / 2))}px`
      const trailing = `${Math.max(0, Math.round((container.clientHeight - last.clientHeight) / 2))}px`
      if (container.style.getPropertyValue('--lyrics-leading-space') !== leading) container.style.setProperty('--lyrics-leading-space', leading)
      if (container.style.getPropertyValue('--lyrics-trailing-space') !== trailing) container.style.setProperty('--lyrics-trailing-space', trailing)
      if (followRef.current && typeof container.scrollTo === 'function') {
        const current = lineRefs.current.find((line) => line?.getAttribute('aria-current') === 'true')
        if (current) container.scrollTo({top: current.offsetTop - container.clientHeight / 2 + current.clientHeight / 2})
      }
    }

    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    if (lineRefs.current[0]) observer.observe(lineRefs.current[0]!)
    if (lineRefs.current[timed.length - 1]) observer.observe(lineRefs.current[timed.length - 1]!)
    return () => observer.disconnect()
  }, [trackId, lyrics, timed.length, editing])

  if (!track) return <p className="empty-state">Ничего не играет</p>

  const startEdit = (): void => {
    setDraft(lyrics ?? '')
  }
  const importLrc = async (): Promise<void> => {
    setImportError('')
    try {
      const value = await window.api.pickLrc()
      if (value !== null && trackId) {
        if (!parseLrc(value).length) { setImportError('В файле нет строк с временными метками LRC.'); return }
        setLyricsOverride(trackId, value)
      }
    } catch { setImportError('Не удалось прочитать LRC. Проверьте файл и повторите попытку.') }
  }

  if (editing) {
    return (
      <div className="rp-lyrics-edit">
        <textarea
          className="rp-lyrics-textarea"
          aria-label="Текст песни"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          spellCheck={false}
        />
        <p className="muted">Для подсветки добавьте метки времени, например [01:23.45] перед строкой. Черновик сохранится при смене трека и закрытии плеера, пока приложение открыто.</p>
        <div className="rp-lyrics-actions">
          <button
            className="btn-outline"
            onClick={() => {
              setLyricsOverride(track.id, draft)
              setEditing(false)
            }}
          >
            Сохранить
          </button>
          <button className="btn-outline" onClick={() => setEditing(false)}>
            Отмена
          </button>
        </div>
      </div>
    )
  }

  if (!lyrics) {
    return (
      <div className="rp-lyrics-empty">
        <p className="empty-state">{trackId && searching[trackId] ? 'Ищем текст песни…' : 'Текст для этого трека не найден'}</p>
        <div className="rp-lyrics-actions"><button className="btn-outline" onClick={() => void searchLyrics(track, true)} disabled={!!(trackId && searching[trackId])}>Искать снова</button><button className="btn-outline" onClick={startEdit}>Добавить текст</button><button className="btn-outline" onClick={() => void importLrc()}>Загрузить LRC…</button></div>
        {trackId && lookupErrors[trackId] && <p role="alert">{lookupErrors[trackId]}</p>}
        {importError && <p role="alert">{importError}</p>}
      </div>
    )
  }

  return (
    <>
      {timed.length ? <>
        <div className="rp-lyrics-toolbar"><span className="muted">Текст синхронизирован с треком{!hasOverride && found?.synced ? ` · ${LYRIC_SOURCE_NAMES[found.source] ?? found.source}` : ''}</span>{!follow && <button className="text-button" onClick={() => setFollow(true)}>К текущей строке</button>}</div>
        <div ref={scrollRef} className="rp-lyrics-timed" onWheel={() => setFollow(false)} onTouchMove={() => setFollow(false)} aria-label="Синхронный текст песни">
          {timed.map((line, index) => <button
            key={`${line.timeSec}:${index}`}
            ref={node => { lineRefs.current[index] = node }}
            type="button"
            className={'rp-lyrics-line' + (index === active ? ' active' : index < active ? ' passed' : '')}
            aria-current={index === active ? 'true' : undefined}
            onClick={() => seek(line.timeSec)}
            title={`Перейти к ${Math.floor(line.timeSec / 60)}:${String(Math.floor(line.timeSec % 60)).padStart(2, '0')}`}
          >{line.text || '♪'}</button>)}
        </div>
      </> : <pre className="rp-lyrics-text">{lyrics}</pre>}
      <details className="rp-lyrics-options"><summary>Действия с текстом</summary><div>
        {!hasOverride && !found?.synced && <button className="btn-outline" onClick={() => void searchLyrics(track, true)} disabled={!!(trackId && searching[trackId])}>{trackId && searching[trackId] ? 'Поиск…' : 'Найти синхронный текст'}</button>}
        <button className="btn-outline" onClick={startEdit}>Изменить текст</button>
        <button className="btn-outline" onClick={() => void importLrc()}>Заменить из LRC…</button>
      </div></details>
      {importError && <p role="alert">{importError}</p>}
    </>
  )
}

// --- Панель ----------------------------------------------------------------

export default function RightPanel({ panel, onClose }: RightPanelProps) {
  return (
    <aside className="right-panel">
      <div className="rp-header">
        <span className="rp-title">{TITLES[panel]}</span>
        <button className="icon-btn" title="Закрыть" onClick={onClose}>
          <CloseIcon size={16} />
        </button>
      </div>
      <div className="rp-body">
        {panel === 'queue' && <QueuePanel />}
        {panel === 'lyrics' && <LyricsPanel />}
        {panel === 'eq' && <Equalizer />}
      </div>
    </aside>
  )
}
