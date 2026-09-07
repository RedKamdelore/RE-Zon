import type { AppearanceSettings } from '@shared/types'
import { defaultTheme, themeToCss, type ThemeConfig } from '@shared/themeModel'

export { lightenHex } from '@shared/themeModel'

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  skin: 'spotify-dark',
  theme: defaultTheme(),
  customThemes: {},
  scale: 1,
}

const STYLE_ID = 'rezon-theme'

/**
 * Применяет тему к DOM: генерирует CSS из конфига и вставляет/заменяет
 * <style id="rezon-theme"> в <head>. Старого data-skin механизма больше нет —
 * встроенные скины стали пресетами движка.
 */
export function applyTheme(cfg: ThemeConfig): void {
  if (typeof document === 'undefined') return
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = STYLE_ID
    document.head.appendChild(el)
  }
  el.textContent = themeToCss(cfg)
}

/** Zoom корня приложения для масштаба UI (Chromium поддерживает zoom) */
export function applyScale(scale: number): void {
  if (typeof document === 'undefined') return
  const appRoot = document.getElementById('root')
  if (appRoot) appRoot.style.zoom = String(scale)
}
