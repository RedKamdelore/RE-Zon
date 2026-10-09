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

/** Смешивает два hex-цвета: amt=0 → hex, amt=1 → target (пезультат — hex) */
export function mixHex(hex: string, target: string, amt: number): string {
  const t = Math.max(0, Math.min(1, amt))
  const [r1, g1, b1] = parseHex(hex)
  const [r2, g2, b2] = parseHex(target)
  const mix = (a: number, b: number): number => Math.round(a + (b - a) * t)
  return `#${((mix(r1, r2) << 16) | (mix(g1, g2) << 8) | mix(b1, b2)).toString(16).padStart(6, '0')}`
}

/** Полупрозрачный fg поверх bg → ближайший непрозрачный hex (для расчётов) */
export function blendOver(fgHex: string, bgHex: string, alpha: number): string {
  return mixHex(bgHex, fgHex, Math.max(0, Math.min(1, alpha)))
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

/** Контраст WCAG двух цветов: 1..21 (4.5 — «AA», 3.0 — «AA для крупного») */
export function contrastRatio(fg: string, bg: string): number {
  const lf = luminance(fg)
  const lb = luminance(bg)
  const hi = Math.max(lf, lb)
  const lo = Math.min(lf, lb)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Автоконтраст (V3 «Материалы 2.0»): если fg на фоне bg даёт контраст ниже
 * minRatio, цвет плавно уводится к чёрному/белому (противоположному яркости
 * фона), пока читаемость не будет достигнута. Уже читаемые цвета не трогаются.
 */
export function ensureContrast(fg: string, bg: string, minRatio = 4.5): string {
  const norm = (h: string): string => (h.startsWith('#') ? h.toLowerCase() : `#${h.toLowerCase()}`)
  if (contrastRatio(fg, bg) >= minRatio) return norm(fg)
  const target = contrastRatio('#000000', bg) >= contrastRatio('#ffffff', bg) ? '#000000' : '#ffffff'
  for (let i = 1; i <= 20; i++) {
    const mixed = mixHex(fg, target, i / 20)
    if (contrastRatio(mixed, bg) >= minRatio) return mixed
  }
  return target
}

// --- Дефолт и пресеты --------------------------------------------------------

/** Дефолтная тема — эквивалент бывшего скина spotify-dark */
function legacyTheme(): ThemeConfig {
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
export function defaultTheme(): ThemeConfig {
  return { ...legacyTheme(), bgApp: '#171A1E', bgPanel: '#20242A', textPrimary: '#F3F0E9',
    textSecondary: '#B8B7B2', accent: '#D9996F', bgGradientFrom: '#171A1E', bgGradientTo: '#20242A', radius: 14, shadowStrength: 0.12 }
}
export const BUILTIN_PRESETS: Record<string, ThemeConfig> = {
  atlas: defaultTheme(),
  north: { ...defaultTheme(), accent: '#82B7C7' },
  paper: { ...defaultTheme(), bgApp: '#F5F3EF', bgPanel: '#FFFFFF', textPrimary: '#22262B', textSecondary: '#5F646A', accent: '#A65338' },
  'night-record': { ...defaultTheme(), bgApp: '#101318', bgPanel: '#181D24', accent: '#A9A4D6' },
  'spotify-dark': legacyTheme(),
  light: {
    ...legacyTheme(),
    bgApp: '#f6f6f6',
    bgPanel: '#ffffff',
    textPrimary: '#111111',
    textSecondary: '#555555',
    accent: '#A65338',
    bgGradientFrom: '#f6f6f6',
    bgGradientTo: '#e0e0e0',
    shadowStrength: 0.18,
  },
  midnight: {
    ...legacyTheme(),
    bgApp: '#000000',
    bgPanel: '#0a0a0a',
    textSecondary: '#a8a8a8',
    accent: '#A9A4D6',
    bgGradientFrom: '#000000',
    bgGradientTo: '#0b1026',
    shadowStrength: 0.8,
  },
  'frutiger-aero': {
    ...legacyTheme(),
    bgApp: '#7ec8e3',
    bgPanel: '#ffffff',
    textPrimary: '#10241c',
    textSecondary: '#3f5c50',
    accent: '#0D5266',
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
    ...legacyTheme(),
    bgApp: '#1a1d29',
    bgPanel: '#ffffff',
    textSecondary: '#d5d5dd',
    accent: '#82B7C7',
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

/** Селекторы «панелей» — блоков интерфейса, несущих материал */
const PANELS = '.material-surface, .ctx-menu, .app.mini'
/** Интерактивные элементы (кнопки/пресеты) — для материала-специфичных эффектов */
const CHIPS = '.btn-outline, .eq-preset, .skin-card, .accent-swatch, .import-card, .tile'
/** Поля ввода */
const INPUTS = '.settings-input, .search-input, .rp-lyrics-textarea, .pl-name-input, .rename-input, .theme-name-input'

/**
 * Генерирует CSS темы: токены в :root (включая производные — тайлы, hover,
 * popup), автоконтраст текста (WCAG), фон приложения (цвет/градиент/картинка
 * с blur+dim через #root::before) и правила материалов панелей (2.0 —
 * flat/glass/gloss/neumorphic, каждый со своим характером на всём UI).
 */
export function themeToCss(t: ThemeConfig): string {
  const mat = t.panelMaterial
  const translucent = mat === 'glass' || mat === 'gloss'
  const lightUi = luminance(t.bgApp) > 0.45
  const shadow = Math.max(0, Math.min(1, t.shadowStrength))

  // Neumorphic — классика Soft UI: панель сливается с фоном, рельеф из теней.
  // Для остальных материалов панель красится своим цветом.
  const panelBase = mat === 'neumorphic' ? t.bgApp : t.bgPanel

  // Эффективная (визуальная) непрозрачная панель — для расчёта контраста
  const effPanel = translucent ? blendOver(t.bgPanel, t.bgApp, t.panelOpacity) : panelBase

  // Производные токены: у тёмных панелей тайлы светлее, у светлых — темнее
  let bgPanel: string, bgTile: string, bgTileHover: string, sliderTrack: string, borderSubtle: string, bgPopup: string
  if (translucent) {
    bgPanel = hexToRgba(t.bgPanel, t.panelOpacity)
    bgTile = hexToRgba(t.bgPanel, t.panelOpacity * 0.75)
    bgTileHover = hexToRgba(t.bgPanel, Math.min(1, t.panelOpacity + 0.06))
    sliderTrack = hexToRgba(t.bgPanel, Math.min(1, t.panelOpacity + 0.1))
    borderSubtle = hexToRgba(lightUi ? '#ffffff' : t.bgPanel, Math.min(1, t.panelOpacity + 0.06))
    bgPopup = hexToRgba(lightUi ? t.bgPanel : t.bgApp, 0.85)
  } else {
    const lightPanel = luminance(panelBase) > 0.5
    bgPanel = panelBase
    bgTile = lightPanel ? darkenHex(panelBase, 0.06) : lightenHex(panelBase, 0.095)
    bgTileHover = lightPanel ? darkenHex(panelBase, 0.11) : lightenHex(panelBase, 0.157)
    sliderTrack = lightPanel ? darkenHex(panelBase, 0.22) : lightenHex(panelBase, 0.3)
    borderSubtle = bgTileHover
    bgPopup = lightPanel ? panelBase : bgTileHover
  }

  // Автоконтраст: текст обязан читаться на реальном фоне (WCAG AA/близко).
  // Первичный — на фоне приложения, вторичный — на тайле.
  const effTile = translucent ? blendOver(t.bgPanel, t.bgApp, t.panelOpacity * 0.75) : bgTile
  const textPrimary = ensureContrast(t.textPrimary, t.bgApp, 4.5)
  const textSecondary = ensureContrast(
    ensureContrast(t.textSecondary, effTile, 4.5),
    t.bgApp,
    4.5,
  )

  const hoverOverlay = lightUi ? 'rgba(0, 0, 0, 0.07)' : 'rgba(255, 255, 255, 0.1)'
  const sliderThumb = !translucent && lightUi ? ensureContrast('#111111', bgTile, 3) : '#ffffff'
  // Текст на акценте: выбираем чёрный или белый — кто читаемее
  const onAccent =
    contrastRatio('#000000', t.accent) >= contrastRatio('#ffffff', t.accent)
      ? '#000000'
      : '#ffffff'
  const playBtnFg = onAccent
  const badgeBg = translucent ? hexToRgba(t.bgPanel, Math.min(1, t.panelOpacity + 0.3)) : lightUi ? '#111111' : '#000000'

  const blocks: string[] = []

  blocks.push(`:root {
  --bg-app: ${t.bgApp};
  --bg-panel: ${bgPanel};
  --bg-tile: ${bgTile};
  --bg-tile-hover: ${bgTileHover};
  --text-primary: ${textPrimary};
  --text-secondary: ${textSecondary};
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
  --badge-text: ${ensureContrast('#ffffff', translucent ? blendOver(t.bgPanel, t.bgApp, Math.min(1, t.panelOpacity + 0.3)) : badgeBg)};
  --cover-placeholder: linear-gradient(135deg, ${bgTileHover}, ${bgTile});
  --radius-card: ${t.radius}px;
  --surface: var(--bg-panel);
  --canvas: var(--bg-app);
  --surface-raised: var(--bg-tile);
  --surface-hover: var(--bg-tile-hover);
  --border: var(--border-subtle);
  --accent-soft: color-mix(in srgb, var(--accent) 14%, var(--bg-panel));
  --info: var(--text-secondary);
  --danger: ${ensureContrast(lightUi ? '#A63E36' : '#E18F87', effPanel)};
  --warning: ${ensureContrast(lightUi ? '#915E16' : '#E7BC71', effPanel)};
  --panel-material: ${mat};
}`)

  // Цвет текста вычисляется на поверхности, где он используется, а не
  // только на фоне приложения: пользователь может выбрать светлую панель
  // при тёмном фоне (и наоборот).
  const surfaceText = (selectors: string, background: string): string => `${selectors} {
  --text-primary: ${ensureContrast(t.textPrimary, background)};
  --text-secondary: ${ensureContrast(t.textSecondary, background)};
  color: var(--text-primary);
}`
  blocks.push(surfaceText(PANELS, effPanel))
  blocks.push(surfaceText('.tile, .import-card, .skin-card, .eq-preset', effTile))
  const effHover = translucent ? blendOver(t.bgPanel, t.bgApp, Math.min(1, t.panelOpacity + 0.06)) : bgTileHover
  blocks.push(surfaceText('.tl-row:hover, .tl-row.tl-selected', effHover))
  blocks.push(surfaceText('.ctx-menu', translucent ? blendOver(lightUi ? t.bgPanel : t.bgApp, t.bgApp, 0.85) : bgPopup))

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

  // --- Материалы 2.0 -----------------------------------------------------------

  if (mat === 'flat') {
    // Премиальный минимализм: волосная рамка + двухслойная ambient-тень
    blocks.push(`${PANELS} {
  border: 1px solid var(--border-subtle);
  box-shadow: 0 1px 2px rgba(0, 0, 0, ${shadow * 0.25}), 0 8px 24px rgba(0, 0, 0, ${shadow * 0.20});
}`)
  }

  if (mat === 'glass') {
    // Vibrancy как в macOS: blur + насыщение цветов под стеклом, светлая
    // внутренняя рамка, глинт сверху и тень-подъём
    const rim = lightUi ? 0.5 : 0.14
    const glint = lightUi ? 0.65 : 0.18
    blocks.push(`${PANELS} {
  backdrop-filter: blur(${t.glassBlur}px) saturate(170%);
  -webkit-backdrop-filter: blur(${t.glassBlur}px) saturate(170%);
  border: 1px solid rgba(255, 255, 255, ${rim});
  box-shadow: 0 8px 32px rgba(0, 0, 0, ${shadow * 0.28}), inset 0 1px 0 rgba(255, 255, 255, ${glint});
}`)
    // Sticky-заголовок таблицы — матовое стекло, чтобы скролл читался
    blocks.push(`.tl-header {
  background: ${hexToRgba(lightUi ? '#ffffff' : t.bgApp, 0.55)};
  backdrop-filter: blur(${t.glassBlur}px) saturate(170%);
  -webkit-backdrop-filter: blur(${t.glassBlur}px) saturate(170%);
}`)
    // Стеклянные интерактивы: молочные заливки и светлые рамки
    blocks.push(`${CHIPS}, ${INPUTS} {
  border: 1px solid rgba(255, 255, 255, ${lightUi ? 0.35 : 0.12});
}`)
  }

  if (mat === 'gloss') {
    // Блик — часть фона: не перекрывает содержимое и не меняет
    // позиционирование панелей, в том числе fixed-контекстного меню.
    const g = Math.max(0, Math.min(1, t.glossIntensity))
    blocks.push(`${PANELS} {
  backdrop-filter: blur(${t.glassBlur}px) saturate(160%);
  -webkit-backdrop-filter: blur(${t.glassBlur}px) saturate(160%);
  box-shadow: 0 4px 16px rgba(0, 0, 0, ${shadow * 0.5});
  background-image: linear-gradient(
    180deg,
    rgba(255, 255, 255, ${(g * (luminance(effPanel) > 0.18 ? 0.28 : 0.08)).toFixed(3)}),
    rgba(255, 255, 255, ${(g * (luminance(effPanel) > 0.18 ? 0.08 : 0.02)).toFixed(3)}) 45%,
    rgba(255, 255, 255, 0) 60%
  );
}`)
    blocks.push(`.tl-header {
  background: ${hexToRgba(lightUi ? '#ffffff' : t.bgApp, 0.55)};
  backdrop-filter: blur(${t.glassBlur}px) saturate(160%);
  -webkit-backdrop-filter: blur(${t.glassBlur}px) saturate(160%);
}`)
    // Лакированные кнопки: трёхстоповый градиент + верхний хайлайт
    blocks.push(`.pl-play, .tile-play, .play-btn {
  background: linear-gradient(180deg, ${lightenHex(t.accent, 0.28)}, ${t.accent} 45%, ${darkenHex(t.accent, 0.18)});
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, ${(g * 0.6).toFixed(3)}), 0 2px 8px rgba(0, 0, 0, ${shadow * 0.4});
}`)
  }

  if (mat === 'neumorphic') {
    // Классический Soft UI: панель = фон, объём из парных теней, цвета теней
    // выведены из фона — никаких чисто-белых засветов
    const s = Math.round(3 + 5 * shadow) // 6..14 px
    const soft = Math.round(2 * s)
    const neuDark = hexToRgba(darkenHex(t.bgApp, 0.4), Math.min(1, 0.35 + 0.6 * shadow))
    const neuLight = hexToRgba(lightenHex(t.bgApp, 0.22), Math.min(1, 0.5 + 0.4 * shadow))
    blocks.push(`${PANELS} {
  box-shadow: ${s}px ${s}px ${soft}px ${neuDark}, -${s}px -${s}px ${soft}px ${neuLight};
}`)
    // Нажатые (inset) интерактивы и инпуты — фирменный приём Soft UI
    blocks.push(`${CHIPS} {
  background: ${bgTile};
  border: none;
  box-shadow: inset 3px 3px 6px ${neuDark}, inset -3px -3px 6px ${neuLight};
}`)
    blocks.push(`${INPUTS} {
  background: ${bgTile};
  border: none;
  box-shadow: inset 3px 3px 6px ${neuDark}, inset -3px -3px 6px ${neuLight};
}`)
    blocks.push(`.tile, .import-card {
  box-shadow: 4px 4px 10px ${neuDark}, -4px -4px 10px ${neuLight};
}`)
  }

  return blocks.join('\n\n')
}
