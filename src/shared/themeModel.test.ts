import { describe, it, expect } from 'vitest'
import {
  defaultTheme,
  BUILTIN_PRESETS,
  themeToCss,
  hexToRgba,
  lightenHex,
  darkenHex,
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
  it('glass material emits backdrop-filter blur and translucent panel', () => {
    const css = themeToCss({ ...defaultTheme(), panelMaterial: 'glass', glassBlur: 24, panelOpacity: 0.3 })
    expect(css).toContain('backdrop-filter: blur(24px)')
    expect(css).toContain('--bg-panel: rgba(0, 0, 0, 0.3)')
  })
  it('flat material has no backdrop-filter', () => {
    expect(themeToCss(defaultTheme())).not.toContain('backdrop-filter')
  })
  it('gloss material emits inset glint shadow scaled by intensity', () => {
    const css = themeToCss({ ...defaultTheme(), panelMaterial: 'gloss', glossIntensity: 0.5, panelOpacity: 0.4 })
    expect(css).toContain('inset 0 1px 0 rgba(255, 255, 255, 0.5)')
  })
  it('neumorphic material emits double shadow scaled by strength', () => {
    const css = themeToCss({ ...defaultTheme(), panelMaterial: 'neumorphic', shadowStrength: 0.5 })
    expect(css).toMatch(/box-shadow:[^;]*rgba\(0, 0, 0, 0\.5\)[^;]*rgba\(255, 255, 255/)
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
