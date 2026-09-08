import { describe, it, expect } from 'vitest'
import {
  defaultTheme,
  BUILTIN_PRESETS,
  themeToCss,
  hexToRgba,
  lightenHex,
  darkenHex,
  mixHex,
  blendOver,
  contrastRatio,
  ensureContrast,
} from './themeModel'

describe('hexToRgba', () => {
  it('converts 6-digit hex with alpha', () => {
    expect(hexToRgba('#1DB954', 0.5)).toBe('rgba(29, 185, 84, 0.5)')
  })
  it('supports 3-digit hex', () => {
    expect(hexToRgba('#fff', 0.25)).toBe('rgba(255, 255, 255, 0.25)')
  })
  it('clamps alpha to 0..1', () => {
    expect(hexToRgba('#000000', 2)).toBe('rgba(0, 0, 0, 1)')
    expect(hexToRgba('#000000', -1)).toBe('rgba(0, 0, 0, 0)')
  })
  it('handles mixed case and missing #', () => {
    expect(hexToRgba('FF00AA', 1)).toBe('rgba(255, 0, 170, 1)')
  })
})

describe('lightenHex / darkenHex', () => {
  it('lightens black towards white', () => {
    expect(lightenHex('#000000', 0.5)).toBe('#808080')
  })
  it('darkens white towards black', () => {
    expect(darkenHex('#ffffff', 0.5)).toBe('#808080')
  })
  it('amount 0 keeps color (lowercased)', () => {
    expect(darkenHex('#1DB954', 0)).toBe('#1db954')
  })
})

describe('mixHex', () => {
  it('amt=0 keeps source, amt=1 gives target', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff')
  })
  it('midpoint mixes rgb channels', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mixHex('#ff0000', '#0000ff', 0.5)).toBe('#800080')
  })
})

describe('blendOver', () => {
  it('translucent white over black is grey', () => {
    expect(blendOver('#ffffff', '#000000', 0.5)).toBe('#808080')
  })
  it('alpha 0 returns bg', () => {
    expect(blendOver('#ffffff', '#123456', 0)).toBe('#123456')
  })
})

describe('contrastRatio / ensureContrast', () => {
  it('black on white is 21, same color is 1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 0)
  })
  it('already-readable fg is kept (normalized)', () => {
    expect(ensureContrast('#111111', '#ffffff')).toBe('#111111')
    expect(ensureContrast('#FFFFFF', '#000000')).toBe('#ffffff')
  })
  it('white text on light bg is fixed to readable dark', () => {
    const fixed = ensureContrast('#ffffff', '#f6f6f6')
    expect(contrastRatio(fixed, '#f6f6f6')).toBeGreaterThanOrEqual(4.4)
    expect(fixed).not.toBe('#ffffff')
  })
  it('black text on dark bg is fixed to readable light', () => {
    const fixed = ensureContrast('#000000', '#121212')
    expect(contrastRatio(fixed, '#121212')).toBeGreaterThanOrEqual(4.4)
    expect(fixed).not.toBe('#000000')
  })
  it('never returns something worse than pure target', () => {
    // жёсткая комбинация: серый на сером — лучший исход это ~3.7:1 (белый),
    // требуем хотя бы AA-large (3.0) и строго лучше исходных ~1.04:1
    const fixed = ensureContrast('#777777', '#888888')
    expect(contrastRatio(fixed, '#888888')).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(fixed, '#888888')).toBeGreaterThan(contrastRatio('#777777', '#888888'))
  })
})

describe('defaultTheme', () => {
  it('is sane spotify-dark equivalent', () => {
    const t = defaultTheme()
    expect(t.bgApp).toBe('#121212')
    expect(t.bgPanel).toBe('#000000')
    expect(t.textPrimary).toBe('#ffffff')
    expect(t.accent).toBe('#1DB954')
    expect(t.panelMaterial).toBe('flat')
    expect(t.background).toBe('color')
    expect(t.radius).toBe(8)
    expect(t.bgImageDataUrl).toBeUndefined()
  })
  it('returns a fresh copy each call', () => {
    expect(defaultTheme()).not.toBe(defaultTheme())
    expect(defaultTheme()).toEqual(defaultTheme())
  })
})

describe('BUILTIN_PRESETS', () => {
  it('contains the 5 former skins', () => {
    expect(Object.keys(BUILTIN_PRESETS).sort()).toEqual(
      ['frutiger-aero', 'light', 'liquid-glass', 'midnight', 'spotify-dark'].sort(),
    )
  })
  it('presets differ from each other', () => {
    const css = Object.values(BUILTIN_PRESETS).map(themeToCss)
    expect(new Set(css).size).toBe(5)
  })
  it('spotify-dark preset equals defaultTheme', () => {
    expect(BUILTIN_PRESETS['spotify-dark']).toEqual(defaultTheme())
  })
  it('frutiger-aero is gloss on a gradient, liquid-glass is glass', () => {
    expect(BUILTIN_PRESETS['frutiger-aero'].panelMaterial).toBe('gloss')
    expect(BUILTIN_PRESETS['frutiger-aero'].background).toBe('gradient')
    expect(BUILTIN_PRESETS['liquid-glass'].panelMaterial).toBe('glass')
  })
})

describe('themeToCss', () => {
  it('emits all core tokens in a :root block', () => {
    const css = themeToCss(defaultTheme())
    expect(css).toContain(':root')
    for (const token of [
      '--bg-app: #121212',
      '--bg-panel: #000000',
      '--bg-tile',
      '--bg-tile-hover',
      '--text-primary: #ffffff',
      '--text-secondary: #b3b3b3',
      '--accent: #1DB954',
      '--accent-hover',
      '--radius-card: 8px',
      '--slider-track',
      '--slider-thumb',
      '--border-subtle',
      '--bg-popup',
      '--hover-overlay',
      '--popup-shadow',
      '--on-accent',
      '--play-btn-fg',
      '--badge-bg',
      '--badge-text',
      '--cover-placeholder',
    ]) {
      expect(css).toContain(token)
    }
  })
  it('reproduces spotify-dark derived tiles exactly', () => {
    const css = themeToCss(BUILTIN_PRESETS['spotify-dark'])
    expect(css).toContain('--bg-tile: #181818')
    expect(css).toContain('--bg-tile-hover: #282828')
    expect(css).toContain('--slider-track: #4d4d4d')
    expect(css).toContain('--popup-shadow: 0 8px 24px rgba(0, 0, 0, 0.5)')
  })
  it('light theme darkens panel-derived tiles', () => {
    const css = themeToCss(BUILTIN_PRESETS['light'])
    expect(css).toContain('--bg-tile: #f0f0f0')
    expect(css).toContain('--hover-overlay: rgba(0, 0, 0, 0.07)')
  })
  it('glass material emits backdrop-filter blur+saturate and translucent panel', () => {
    const css = themeToCss({ ...defaultTheme(), panelMaterial: 'glass', glassBlur: 24, panelOpacity: 0.3 })
    expect(css).toContain('backdrop-filter: blur(24px) saturate(170%)')
    expect(css).toContain('--bg-panel: rgba(0, 0, 0, 0.3)')
    expect(css).toContain('border: 1px solid rgba(255, 255, 255')
  })
  it('glass playerbar is materialized (fixed: playerbar was always flat)', () => {
    const css = themeToCss({ ...defaultTheme(), panelMaterial: 'glass' })
    expect(css).toMatch(/\.sidebar-card, [^{]*\.playerbar \{/)
  })
  it('flat material has no backdrop-filter but has hairline border + ambient shadow', () => {
    const css = themeToCss(defaultTheme())
    expect(css).not.toContain('backdrop-filter')
    expect(css).toContain('border: 1px solid var(--border-subtle)')
    expect(css).toMatch(/box-shadow: 0 1px 2px rgba\(0, 0, 0, [\d.]+\), 0 8px 24px rgba\(0, 0, 0, [\d.]+\)/)
  })
  it('gloss material emits specular ::before glint scaled by intensity', () => {
    const css = themeToCss({ ...defaultTheme(), panelMaterial: 'gloss', glossIntensity: 0.5, panelOpacity: 0.4 })
    expect(css).toContain('::before')
    expect(css).toContain('linear-gradient(')
    expect(css).toContain('rgba(255, 255, 255, 0.275)') // 0.5 * 0.55
    expect(css).toMatch(/\.pl-play, \.tile-play, \.play-btn \{/) // хромированные кнопки
  })
  it('neumorphic material emits double shadow scaled by strength (no pure white)', () => {
    const css = themeToCss({ ...defaultTheme(), panelMaterial: 'neumorphic', shadowStrength: 0.5 })
    expect(css).toMatch(/box-shadow: \d+px \d+px \d+px rgba\(\d+, \d+, \d+, [\d.]+\), -\d+px -\d+px \d+px rgba\(\d+, \d+, \d+, [\d.]+\)/)
    // Главный фикс: никаких чисто-белых теней (255, 255, 255) в неоморфизме
    const neuBlocks = css.split('\n\n').filter((b) => b.includes('box-shadow') && b.includes('inset') === false)
    for (const b of neuBlocks) {
      expect(b).not.toContain('rgba(255, 255, 255')
    }
  })
  it('neumorphic panel merges with bg (Soft UI classic)', () => {
    const css = themeToCss({ ...defaultTheme(), bgApp: '#e0e0e0', panelMaterial: 'neumorphic' })
    // панель = фон: --bg-panel это сам фон, не пользовательский bgPanel
    expect(css).toContain('--bg-panel: #e0e0e0')
  })
  it('neumorphic interactive elements get inset pressed shadows', () => {
    const css = themeToCss({ ...defaultTheme(), panelMaterial: 'neumorphic' })
    expect(css).toContain('inset 3px 3px 6px')
    expect(css).toMatch(/\.settings-input/)
  })
  it('autocontrast fixes white text on light background', () => {
    // пользователь выбрал светлый фон, но текст остался белым из тёмной темы
    const css = themeToCss({
      ...defaultTheme(),
      bgApp: '#f0f0f0',
      bgPanel: '#ffffff',
      textPrimary: '#ffffff', // плохо читается
      textSecondary: '#eeeeee',
    })
    const fg = /--text-primary: (#[0-9a-f]+)/.exec(css)![1]
    expect(contrastRatio(fg, '#f0f0f0')).toBeGreaterThanOrEqual(4.4)
    expect(fg).not.toBe('#ffffff')
  })
  it('on-accent picks readable side automatically', () => {
    // светло-жёлтый акцент → чёрный текст; тёмно-синий → белый
    const light = themeToCss({ ...defaultTheme(), accent: '#FFEB3B' })
    expect(light).toContain('--on-accent: #000000')
    const dark = themeToCss({ ...defaultTheme(), accent: '#0d1b3e' })
    expect(dark).toContain('--on-accent: #ffffff')
  })
  it('gradient background emits body rule with angle and stops', () => {
    const css = themeToCss({
      ...defaultTheme(),
      background: 'gradient',
      bgGradientFrom: '#112233',
      bgGradientTo: '#445566',
      bgGradientAngle: 160,
    })
    expect(css).toContain('body')
    expect(css).toContain('linear-gradient(160deg, #112233, #445566)')
  })
  it('color background emits no body rule', () => {
    expect(themeToCss(defaultTheme())).not.toContain('body {')
  })
  it('image background emits pseudo-element with data URL, blur and dim', () => {
    const css = themeToCss({
      ...defaultTheme(),
      background: 'image',
      bgImageDataUrl: 'data:image/png;base64,AAAA',
      bgImageBlur: 10,
      bgImageDim: 0.4,
    })
    expect(css).toContain('#root::before')
    expect(css).toContain('data:image/png;base64,AAAA')
    expect(css).toContain('blur(10px)')
    expect(css).toContain('rgba(0, 0, 0, 0.4)')
  })
  it('image background without data URL falls back to color', () => {
    const css = themeToCss({ ...defaultTheme(), background: 'image', bgImageDataUrl: undefined })
    expect(css).not.toContain('#root::before')
  })
  it('does not interpolate raw data URL into :root vars', () => {
    const css = themeToCss({
      ...defaultTheme(),
      background: 'image',
      bgImageDataUrl: 'data:image/png;base64,AAAA',
    })
    const rootBlock = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')))
    expect(rootBlock).not.toContain('data:image')
  })
})

