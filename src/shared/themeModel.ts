/**
 * Движок тем Re:Zon. Тема — чистый объект настроек (ThemeConfig);
 * themeToCss генерирует из него CSS (токены :root + фон + материал панелей).
 * Встроенные скины — просто пресеты этого объекта (BUILTIN_PRESETS).
 * Модуль чистый (без DOM/Electron) — используется и рендерером, и миграциями.
 */

export type PanelMaterial = 'flat' | 'glass' | 'gloss' | 'neumorphic'
export type BackgroundKind = 'color' | 'gradient' | 'image'

export interface ThemeConfig {
  bgApp: string // hex
  bgPanel: string // hex (базовый цвет панелей; материал может добавить прозрачность)
  textPrimary: string
  textSecondary: string
  accent: string
  panelMaterial: PanelMaterial
  glassBlur: number // px, 0..40 (для glass)
  panelOpacity: number // 0..1 (степень прозрачности панели для glass/gloss)
  glossIntensity: number // 0..1 (сила блика для gloss)
  background: BackgroundKind
  bgGradientFrom: string
  bgGradientTo: string
  bgGradientAngle: number // deg
  bgImageDataUrl?: string // своя картинка (data URL, до ~2 МБ)
  bgImageBlur: number // px
  bgImageDim: number // 0..1 затемнение
  radius: number // px
  shadowStrength: number // 0..1
}

// --- Цветовые утилиты --------------------------------------------------------

function parseHex(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const num = parseInt(h, 16)
  return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff]
}

/** hex + alpha → 'rgba(r, g, b, a)'; alpha клампится в 0..1 */
export function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex)
  const a = Math.max(0, Math.min(1, alpha))
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

/** Осветляет hex в сторону белого на долю amt (0..1); результат — строчный hex */
export function lightenHex(hex: string, amt: number): string {
  const t = Math.max(0, Math.min(1, amt))
  const [r, g, b] = parseHex(hex)
  const mix = (c: number): number => Math.round(c + (255 - c) * t)
  return `#${((mix(r) << 16) | (mix(g) << 8) | mix(b)).toString(16).padStart(6, '0')}`
}

/** Затемняет hex в сторону чёрного на долю amt (0..1); результат — строчный hex */
export function darkenHex(hex: string, amt: number): string {
  const t = Math.max(0, Math.min(1, amt))
  const [r, g, b] = parseHex(hex)
  const mix = (c: number): number => Math.round(c * (1 - t))
  return `#${((mix(r) << 16) | (mix(g) << 8) | mix(b)).toString(16).padStart(6, '0')}`
}

/** Относительная яркость 0..1 (для выбора направления производных токенов) */
function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex)
  const lin = (c: number): number => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

// --- Дефолт и пресеты --------------------------------------------------------

/** Дефолтная тема — эквивалент бывшего скина spotify-dark */
export function defaultTheme(): ThemeConfig {
  return {
    bgApp: '#121212',
    bgPanel: '#000000',
    textPrimary: '#ffffff',
    textSecondary: '#b3b3b3',
    accent: '#1DB954',
    panelMaterial: 'flat',
    glassBlur: 12,
    panelOpacity: 1,
    glossIntensity: 0.6,
    background: 'color',
    bgGradientFrom: '#121212',
    bgGradientTo: '#000000',
    bgGradientAngle: 160,
    bgImageBlur: 8,
    bgImageDim: 0.4,
    radius: 8,
    shadowStrength: 0.5,
  }
}

/** Встроенные пресеты, воспроизводящие бывшие скины из skins.css */
export const BUILTIN_PRESETS: Record<string, ThemeConfig> = {
  'spotify-dark': defaultTheme(),
  light: {
    ...defaultTheme(),
    bgApp: '#f6f6f6',
    bgPanel: '#ffffff',
    textPrimary: '#111111',
    textSecondary: '#555555',
    bgGradientFrom: '#f6f6f6',
    bgGradientTo: '#e0e0e0',
    shadowStrength: 0.18,
  },
  midnight: {
    ...defaultTheme(),
    bgApp: '#000000',
    bgPanel: '#0a0a0a',
    textSecondary: '#a8a8a8',
    bgGradientFrom: '#000000',
    bgGradientTo: '#0b1026',
    shadowStrength: 0.8,
  },
  'frutiger-aero': {
    ...defaultTheme(),
    bgApp: '#7ec8e3',
    bgPanel: '#ffffff',
    textPrimary: '#10241c',
    textSecondary: '#3f5c50',
    panelMaterial: 'gloss',
    glassBlur: 12,
    panelOpacity: 0.45,
    glossIntensity: 0.6,
    background: 'gradient',
    bgGradientFrom: '#7ec8e3',
    bgGradientTo: '#b8e6b0',
    bgGradientAngle: 180,
    radius: 16,
    shadowStrength: 0.35,
  },
  'liquid-glass': {
    ...defaultTheme(),
    bgApp: '#1a1d29',
    bgPanel: '#ffffff',
    textSecondary: '#d5d5dd',
    panelMaterial: 'glass',
    glassBlur: 24,
    panelOpacity: 0.08,
    background: 'gradient',
    bgGradientFrom: '#1a1d29',
    bgGradientTo: '#2d1b3d',
    bgGradientAngle: 160,
    radius: 18,
    shadowStrength: 0.5,
  },
}

// --- Генератор CSS ------------------------------------------------------------

/**
 * Генерирует CSS темы: токены в :root (включая производные — тайлы, hover,
 * popup и т.д.), фон приложения (цвет/градиент/картинка с blur+dim через
 * #root::before) и правила материала панелей (glass/gloss/neumorphic).
 */
export function themeToCss(t: ThemeConfig): string {
  const translucent = t.panelMaterial === 'glass' || t.panelMaterial === 'gloss'
  const lightUi = luminance(t.bgApp) > 0.45
  const lightPanel = luminance(t.bgPanel) > 0.5

  // Производные токены: у тёмных панелей тайлы светлее, у светлых — темнее
  let bgPanel: string, bgTile: string, bgTileHover: string, sliderTrack: string, borderSubtle: string, bgPopup: string
  if (translucent) {
    bgPanel = hexToRgba(t.bgPanel, t.panelOpacity)
    bgTile = hexToRgba(t.bgPanel, t.panelOpacity * 0.75)
    bgTileHover = hexToRgba(t.bgPanel, Math.min(1, t.panelOpacity + 0.06))
    sliderTrack = hexToRgba(t.bgPanel, Math.min(1, t.panelOpacity + 0.1))
    borderSubtle = hexToRgba(t.bgPanel, Math.min(1, t.panelOpacity + 0.06))
    bgPopup = hexToRgba(lightUi ? t.bgPanel : t.bgApp, 0.85)
  } else {
    bgPanel = t.bgPanel
    bgTile = lightPanel ? darkenHex(t.bgPanel, 0.06) : lightenHex(t.bgPanel, 0.095)
    bgTileHover = lightPanel ? darkenHex(t.bgPanel, 0.11) : lightenHex(t.bgPanel, 0.157)
    sliderTrack = lightPanel ? darkenHex(t.bgPanel, 0.22) : lightenHex(t.bgPanel, 0.3)
    borderSubtle = bgTileHover
    bgPopup = lightPanel ? t.bgPanel : bgTileHover
  }

  const hoverOverlay = t.panelMaterial === 'gloss'
    ? 'rgba(255, 255, 255, 0.4)'
    : lightUi
      ? 'rgba(0, 0, 0, 0.07)'
      : 'rgba(255, 255, 255, 0.1)'
  const sliderThumb = !translucent && lightUi ? '#111111' : '#ffffff'
  const onAccent = translucent ? '#ffffff' : '#000000'
  const playBtnFg = luminance(t.textPrimary) > 0.5 ? '#000000' : '#ffffff'
  const badgeBg = translucent ? bgTileHover : lightUi ? '#111111' : '#000000'
  const shadow = Math.max(0, Math.min(1, t.shadowStrength))

  const blocks: string[] = []

  blocks.push(`:root {
  --bg-app: ${t.bgApp};
  --bg-panel: ${bgPanel};
  --bg-tile: ${bgTile};
  --bg-tile-hover: ${bgTileHover};
  --text-primary: ${t.textPrimary};
  --text-secondary: ${t.textSecondary};
  --accent: ${t.accent};
  --accent-hover: ${lightenHex(t.accent, 0.08)};
  --slider-track: ${sliderTrack};
  --slider-thumb: ${sliderThumb};
  --border-subtle: ${borderSubtle};
  --bg-popup: ${bgPopup};
  --hover-overlay: ${hoverOverlay};
  --popup-shadow: 0 8px 24px rgba(0, 0, 0, ${shadow});
  --on-accent: ${onAccent};
  --play-btn-fg: ${playBtnFg};
  --badge-bg: ${badgeBg};
  --badge-text: #ffffff;
  --cover-placeholder: linear-gradient(135deg, ${bgTileHover}, ${bgTile});
  --radius-card: ${t.radius}px;
}`)

  // --- Фон приложения ---
  if (t.background === 'gradient') {
    blocks.push(`body {
  background: linear-gradient(${t.bgGradientAngle}deg, ${t.bgGradientFrom}, ${t.bgGradientTo});
}`)
  } else if (t.background === 'image' && t.bgImageDataUrl) {
    const dim = Math.max(0, Math.min(1, t.bgImageDim))
    // Отрицательный inset компенсирует размытие краёв blur'ом
    blocks.push(`#root::before {
  content: '';
  position: fixed;
  inset: -48px;
  z-index: -1;
  background: linear-gradient(rgba(0, 0, 0, ${dim}), rgba(0, 0, 0, ${dim})), url("${t.bgImageDataUrl}") center / cover no-repeat;
  filter: blur(${t.bgImageBlur}px);
}`)
  }

  // --- Материал панелей ---
  if (t.panelMaterial === 'glass' || t.panelMaterial === 'gloss') {
    const glossShadow =
      t.panelMaterial === 'gloss'
        ? `\n  box-shadow: inset 0 1px 0 rgba(255, 255, 255, ${t.glossIntensity}), 0 4px 16px rgba(0, 0, 0, ${shadow * 0.5});`
        : ''
    blocks.push(`.sidebar-card, .right-panel, .ctx-menu, .app.mini {
  backdrop-filter: blur(${t.glassBlur}px);
  -webkit-backdrop-filter: blur(${t.glassBlur}px);${glossShadow}
}`)
    // Sticky-заголовок таблицы — матовое стекло, чтобы скролл читался
    blocks.push(`.tl-header {
  background: ${hexToRgba(t.bgApp, 0.55)};
  backdrop-filter: blur(${t.glassBlur}px);
  -webkit-backdrop-filter: blur(${t.glassBlur}px);
}`)
  }
  if (t.panelMaterial === 'gloss') {
    blocks.push(`.pl-play, .tile-play {
  background: linear-gradient(180deg, var(--accent-hover), var(--accent));
}`)
  }
  if (t.panelMaterial === 'neumorphic') {
    blocks.push(`.sidebar-card, .right-panel, .app.mini {
  box-shadow: 8px 8px 16px rgba(0, 0, 0, ${shadow}), -8px -8px 16px rgba(255, 255, 255, ${lightUi ? shadow * 0.9 : shadow * 0.1});
}`)
  }

  return blocks.join('\n\n')
}
