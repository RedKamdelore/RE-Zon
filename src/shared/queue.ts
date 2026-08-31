import type { RepeatMode } from './types'

/** Позиция внутри order → следующая позиция, либо null (конец при repeat=off) */
export function nextIndex(
  order: number[],
  pos: number,
  _current: number,
  repeat: RepeatMode,
): number | null {
  if (repeat === 'one') return pos
  if (pos + 1 < order.length) return pos + 1
  return repeat === 'all' ? 0 : null
}

export function prevIndex(order: number[], pos: number): number {
  return Math.max(0, pos - 1)
}

/** Позиции внутри order после текущей (секция «Далее в очереди») */
export function upcomingPositions(order: number[], pos: number): number[] {
  return order.map((_, i) => i).slice(pos + 1)
}

/** Перемешанный порядок: текущий трек первым, остальные — Fisher–Yates */
export function buildShuffleOrder(length: number, current: number): number[] {
  const rest: number[] = []
  for (let i = 0; i < length; i++) if (i !== current) rest.push(i)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  return [current, ...rest]
}
