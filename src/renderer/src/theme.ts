import type { AppearanceSettings } from '@shared/types'

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  skin: 'spotify-dark',
  accent: '#1DB954',
  radius: 8,
  scale: 1,
}

/**
 * Осветляет hex-цвет в сторону белого на долю amt (0..1).
 * '#000000' + 0.5 → '#808080'; результат — строчный hex.
 */
export function lightenHex(hex: string, amt: number): string {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const num = parseInt(h, 16)
  const t = Math.max(0, Math.min(1, amt))
  const mix = (c: number): number => Math.round(c + (255 - c) * t)
  const r = mix((num >> 16) & 0xff)
  const g = mix((num >> 8) & 0xff)
  const b = mix(num & 0xff)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/**
 * Применяет настройки внешнего вида к DOM: data-skin на <html>,
 * CSS-переменные --accent/--accent-hover/--radius-card на :root,
 * zoom корня приложения для масштаба UI (Chromium поддерживает zoom).
 */
export function applyAppearance(a: AppearanceSettings): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.setAttribute('data-skin', a.skin)
  root.style.setProperty('--accent', a.accent)
  root.style.setProperty('--accent-hover', lightenHex(a.accent, 0.08))
  root.style.setProperty('--radius-card', `${a.radius}px`)
  const appRoot = document.getElementById('root')
  if (appRoot) appRoot.style.zoom = String(a.scale)
}
