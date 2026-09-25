export interface TimedLyricLine { timeSec: number; text: string }

/** Parses standard line-synchronised LRC. Untimed metadata is ignored. */
export function parseLrc(value: string): TimedLyricLine[] {
  const lines: TimedLyricLine[] = []
  const offsetMatch = value.match(/^\[offset:\s*([+-]?\d+)\s*\]/im)
  const offsetSec = offsetMatch ? Number(offsetMatch[1]) / 1000 : 0
  for (const raw of value.split(/\r?\n/)) {
    const tag = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g
    const times: number[] = []
    let match: RegExpExecArray | null
    while ((match = tag.exec(raw)) !== null) {
      const minutes = Number(match[1]), seconds = Number(match[2])
      if (seconds >= 60) continue
      const fraction = match[3] ? Number(match[3]) / (10 ** match[3].length) : 0
      times.push(Math.max(0, minutes * 60 + seconds + fraction + offsetSec))
    }
    if (!times.length) continue
    const text = raw.replace(tag, '').trim()
    for (const timeSec of times) lines.push({ timeSec, text })
  }
  return lines.sort((a, b) => a.timeSec - b.timeSec)
}

export function activeLyricIndex(lines: TimedLyricLine[], currentSec: number): number {
  let lo = 0, hi = lines.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (lines[mid].timeSec <= currentSec) lo = mid + 1
    else hi = mid
  }
  return lo - 1
}
