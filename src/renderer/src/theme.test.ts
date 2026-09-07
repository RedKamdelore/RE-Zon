// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { lightenHex, applyTheme, applyScale, DEFAULT_APPEARANCE } from './theme'
import { defaultTheme, themeToCss } from '@shared/themeModel'

describe('lightenHex (re-export)', () => {
  it('lightens black towards white', () => {
    expect(lightenHex('#000000', 0.5)).toBe('#808080')
  })
})

describe('applyTheme', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.documentElement.removeAttribute('data-skin')
    document.documentElement.removeAttribute('style')
    document.body.innerHTML = '<div id="root"></div>'
  })

  it('injects style#rezon-theme with generated CSS', () => {
    applyTheme(defaultTheme())
    const el = document.getElementById('rezon-theme') as HTMLStyleElement
    expect(el).not.toBeNull()
    expect(el.tagName).toBe('STYLE')
    expect(el.textContent).toBe(themeToCss(defaultTheme()))
    expect(el.textContent).toContain('--bg-app: #121212')
  })

  it('replaces previous style on re-apply (no duplicates)', () => {
    applyTheme(defaultTheme())
    applyTheme({ ...defaultTheme(), accent: '#8B5CF6' })
    const els = document.querySelectorAll('#rezon-theme')
    expect(els).toHaveLength(1)
    expect((els[0] as HTMLStyleElement).textContent).toContain('--accent: #8B5CF6')
  })

  it('does not set legacy data-skin attribute', () => {
    applyTheme(defaultTheme())
    expect(document.documentElement.getAttribute('data-skin')).toBeNull()
  })
})

describe('applyScale', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>'
  })

  it('zooms #root by scale', () => {
    applyScale(1.1)
    expect((document.getElementById('root') as HTMLElement).style.zoom).toBe('1.1')
  })

  it('does not throw without #root', () => {
    document.body.innerHTML = ''
    expect(() => applyScale(1)).not.toThrow()
  })
})

describe('DEFAULT_APPEARANCE', () => {
  it('is spotify-dark preset with default theme', () => {
    expect(DEFAULT_APPEARANCE.skin).toBe('spotify-dark')
    expect(DEFAULT_APPEARANCE.theme).toEqual(defaultTheme())
    expect(DEFAULT_APPEARANCE.customThemes).toEqual({})
    expect(DEFAULT_APPEARANCE.scale).toBe(1)
  })
})
