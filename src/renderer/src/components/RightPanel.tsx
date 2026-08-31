import { useEffect, useRef, useState } from 'react'
import type { Track } from '@shared/types'
import { upcomingPositions } from '@shared/queue'
import { usePlayerStore } from '../stores/playerStore'
import { useLyricsStore, setLyricsOverride } from '../stores/lyricsStore'
import { fmt } from '../utils/format'
import { CloseIcon, MusicNoteIcon } from './icons'

interface RightPanelProps {
  panel: 'queue' | 'lyrics' | 'eq'
  onClose: () => void
}

const TITLES = { queue: 'Очередь', lyrics: 'Текст песни', eq: 'Эквалайзер' } as const

/** Обложка 40×40 или плейсхолдер с нотой */
function Cover({ track }: { track: Track }) {
  return (
    <span className="rp-cover">
      {track.coverDataUrl ? <img src={track.coverDataUrl} alt="" /> : <MusicNoteIcon size={20} />}
    </span>
  )
}

// --- Очередь ---------------------------------------------------------------

function QueuePanel() {
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
      <h3 className="rp-section">Сейчас играет</h3>
      <div className="rp-row">
        <Cover track={current} />
        <span className="rp-row-text">
          <span className="rp-row-title playing">{current.title}</span>
          <span className="rp-row-artist">{current.artist}</span>
        </span>
        <span className="rp-row-duration">{fmt(current.durationSec)}</span>
      </div>

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

function LyricsPanel() {
  const queue = usePlayerStore((s) => s.queue)
  const order = usePlayerStore((s) => s.order)
  const pos = usePlayerStore((s) => s.pos)
  const overrides = useLyricsStore((s) => s.overrides)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const track = order.length > 0 ? queue[order[pos]] : undefined
  const trackId = track?.id

  // Смена трека выходит из режима редактирования
  useEffect(() => setEditing(false), [trackId])

  if (!track) return <p className="empty-state">Ничего не играет</p>

  const lyrics = overrides[track.id] ?? track.lyrics

  const startEdit = (): void => {
    setDraft(lyrics ?? '')
    setEditing(true)
  }

  if (editing) {
    return (
      <div className="rp-lyrics-edit">
        <textarea
          className="rp-lyrics-textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          spellCheck={false}
        />
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
        <p className="empty-state">Текст для этого трека не найден</p>
        <button className="btn-outline" onClick={startEdit}>
          Добавить текст
        </button>
      </div>
    )
  }

  return (
    <>
      <pre className="rp-lyrics-text">{lyrics}</pre>
      <button className="btn-outline" onClick={startEdit}>
        Изменить текст
      </button>
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
        {panel === 'eq' && <p className="empty-state">Эквалайзер скоро появится</p>}
      </div>
    </aside>
  )
}
