import { expect, it } from 'vitest'
import { normalizeBufferedRanges } from '@shared/playbackBuffer'
import { playbackTimeline } from './playbackTimeline'
import type { OfflineItem } from '@shared/offline'

const item: OfflineItem = { trackId: 'vk:1', title: 'Song', artist: 'Artist', phase: 'downloading', bytes: 60, total: 100 }

it('keeps seek gaps and counts only real buffered intervals', () => {
  const view = playbackTimeline(50, 100, [{ start: 0, end: 20 }, { start: 50, end: 75 }])
  expect(view.title).toContain('В буфере: 45%')
  expect(view.style).toMatchObject({ '--progress': '50%' })
  const fill = (view.style as Record<string, string>)['--timeline-fill']
  expect(fill).toContain('transparent 50%,var(--slider-buffer) 50%,var(--slider-buffer) 75%')
  expect(view.title).not.toContain('Сохранено на компьютере')
})

it('shows completed offline copies even when the audio buffer is empty', () => {
  const view = playbackTimeline(25, 100, [], { ...item, phase: 'saved' })
  expect(view.title).toContain('Сохранено на компьютере')
  expect((view.style as Record<string, string>)['--timeline-fill']).toContain('var(--slider-buffer) 100%')
})

it('merges download coverage with streaming buffer without counting gaps twice', () => {
  const view = playbackTimeline(20, 100, [{ start: 40, end: 80 }], item)
  expect(view.title).toContain('В буфере: 40% · Сохранение на компьютер: 60%')
  expect((view.style as Record<string, string>)['--timeline-fill']).toContain('var(--slider-buffer) 80%')
})

it('does not invent a percentage for unknown download size or duration', () => {
  const view = playbackTimeline(0, 0, [], { ...item, total: undefined })
  expect(view.title).toContain('размер неизвестен')
  expect((view.style as Record<string, string>)['--timeline-fill']).not.toMatch(/NaN|Infinity|slider-buffer/)
})

it('clamps and merges intervals while rejecting invalid values', () => {
  expect(normalizeBufferedRanges([{ start: 10, end: 40 }, { start: -5, end: 20 }, { start: 80, end: 140 }, { start: NaN, end: 20 }, { start: 70, end: 50 }], 100)).toEqual([{ start: 0, end: 40 }, { start: 80, end: 100 }])
})
