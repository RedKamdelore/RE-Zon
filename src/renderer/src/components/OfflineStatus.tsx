import { useEffect, useState } from 'react'
import type { Track } from '@shared/types'
import type { OfflineItem } from '@shared/offline'
import { canSaveOffline } from '@shared/offline'

export function useOfflineStatus(trackId?: string): OfflineItem | undefined {
  const [item, setItem] = useState<OfflineItem>()
  useEffect(() => {
    if (!trackId || typeof window === 'undefined' || !window.api?.offlineList || !window.api?.onOfflineState) return
    let active = true
    let eventReceived = false
    const update = (items: OfflineItem[]) => {
      if (!active) return
      eventReceived = true
      setItem(items.find(entry => entry.trackId === trackId))
    }
    const unsubscribe = window.api.onOfflineState(update)
    void window.api.offlineList().then(items => {
      if (active && !eventReceived) setItem(items.find(entry => entry.trackId === trackId))
    }).catch(() => {})
    return () => { active = false; unsubscribe() }
  }, [trackId])
  return item?.trackId === trackId ? item : undefined
}

export function offlinePercent(item?: OfflineItem): number | undefined {
  if (item?.phase === 'saved') return 100
  if (item?.phase !== 'downloading' || !item.total) return undefined
  return Math.max(0, Math.min(100, item.bytes / item.total * 100))
}

export function OfflineStatusIcon({ track, item }: { track?: Track; item?: OfflineItem }) {
  if (!track || !['local', 'direct', 'vk'].includes(track.sourceId)) return null
  const local = track.sourceId === 'local'
  const saved = local || item?.phase === 'saved'
  const eligible = local || canSaveOffline(track)
  const percent = offlinePercent(item)
  const label = saved ? 'Сохранено на компьютере'
    : !eligible ? 'Только онлайн: нет прямого файла для сохранения'
      : item?.phase === 'downloading' ? `Сохраняется: ${percent === undefined ? 'размер неизвестен' : `${Math.floor(percent)}%`}`
        : item?.phase === 'queued' ? 'Ожидает сохранения'
          : item?.phase === 'error' ? `Не удалось сохранить: ${item.error ?? 'ошибка загрузки'}`
            : 'Доступно онлайн; локальная копия ещё не сохранена'
  return <span className={`offline-indicator${saved ? ' is-saved' : ''}${item?.phase === 'downloading' ? ' is-downloading' : ''}${!eligible ? ' is-unavailable' : ''}${item?.phase === 'error' ? ' is-error' : ''}`} role="status" aria-label={label} title={label}>
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 18H6a4 4 0 0 1-.5-7.97 6.5 6.5 0 0 1 12.62-1.3A4.7 4.7 0 0 1 18 18h-1" />
      {saved ? <path d="m9 16 2.5 2.5L16 14" /> : eligible ? <path d="M12 12v7m-2.5-2.5L12 19l2.5-2.5" /> : <path d="m9 14 6 6" />}
    </svg>
    {item?.phase === 'downloading' && <small>{percent === undefined ? '…' : `${Math.floor(percent)}%`}</small>}
    {item?.phase === 'error' && <small>!</small>}
  </span>
}
