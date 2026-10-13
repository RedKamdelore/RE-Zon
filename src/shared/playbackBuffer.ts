/** Buffered intervals in seconds; gaps after seeking must remain visible. */
export interface BufferedRange { start: number; end: number }

export function normalizeBufferedRanges(ranges: BufferedRange[], duration: number): BufferedRange[] {
  if (!Number.isFinite(duration) || duration <= 0) return []
  const valid = ranges.filter(range => Number.isFinite(range.start) && Number.isFinite(range.end))
    .map(range => ({ start: Math.max(0, range.start), end: Math.min(duration, range.end) }))
    .filter(range => range.end > range.start).sort((a, b) => a.start - b.start)
  const result: BufferedRange[] = []
  for (const range of valid) {
    const previous = result[result.length - 1]
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end)
    else result.push({ ...range })
  }
  return result
}
