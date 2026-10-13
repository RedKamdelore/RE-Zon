import type { CSSProperties } from 'react'
import type { OfflineItem } from '@shared/offline'
import { normalizeBufferedRanges, type BufferedRange } from '@shared/playbackBuffer'

export function playbackTimeline(current: number, duration: number, buffered: BufferedRange[] = [], offline?: OfflineItem, local = false): { style: CSSProperties; title: string } {
  const length = Number.isFinite(duration) && duration > 0 ? duration : 0
  const progress = length && Number.isFinite(current) ? Math.max(0, Math.min(100, current / length * 100)) : 0
  const ranges = normalizeBufferedRanges(buffered, length)
  const bufferedPercent = length ? Math.floor(ranges.reduce((sum, range) => sum + range.end - range.start, 0) / length * 100) : 0
  const saved = local || offline?.phase === 'saved'
  const download = saved ? 100 : offline?.phase === 'downloading' && offline.total && Number.isFinite(offline.total) && Number.isFinite(offline.bytes)
    ? Math.max(0, Math.min(100, offline.bytes / offline.total * 100)) : undefined
  const loaded = normalizeBufferedRanges([...ranges, ...(download === undefined ? [] : [{ start: 0, end: length * download / 100 }])], length)
  const layers = ['linear-gradient(to right,var(--accent) var(--progress),transparent var(--progress))', ...loaded.map(range =>
    `linear-gradient(to right,transparent ${range.start / length * 100}%,var(--slider-buffer) ${range.start / length * 100}%,var(--slider-buffer) ${range.end / length * 100}%,transparent ${range.end / length * 100}%)`)]
  const status = saved ? 'Сохранено на компьютере' : offline?.phase === 'downloading'
    ? `Сохранение на компьютер: ${download === undefined ? 'размер неизвестен' : `${Math.floor(download)}%`}`
    : offline?.phase === 'queued' ? 'В очереди на сохранение'
      : offline?.phase === 'error' ? 'Не удалось сохранить на компьютер'
        : 'Буфер потока не означает сохранение для офлайна'
  return {
    style: { '--progress': `${progress}%`, '--timeline-fill': layers.join(',') } as CSSProperties,
    title: `${saved ? status : `В буфере: ${bufferedPercent}% · ${status}`}\nЦветная полоса — прослушано, светлая — загружено.`,
  }
}
