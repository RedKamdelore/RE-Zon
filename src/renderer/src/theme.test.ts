// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { lightenHex, applyAppearance, DEFAULT_APPEARANCE } from './theme'

describe('lightenHex', () => {
  it('lightens black towards white', () => {
    expect(lightenHex('#000000', 0.5)).toBe('#808080')
  })
  it('amount 0 returns the same color', () => {
    expect(lightenHex('#1DB954', 0)).toBe('#1db954')
  })
  it('amount 1 returns white', () => {
    expect(lightenHex('#123456', 1)).toBe('#ffffff')
  })
  it('lightens Spotify green ~8%', () => {
    // 0x1D=29→47 (0x2F); 0xB9=185→191 (0xBF); 0x54=84→98 (0x62)
    expect(lightenHex('#1DB954', 0.08)).toBe('#2fbf62')
  })
  it('clamps and accepts mixed case', () => {
    expect(lightenHex('#FF00AA', 2)).toBe('#ffffff')
  })
  it('supports 3-digit hex', () => {
    expect(lightenHex('#000', 0.5)).toBe('#808080')
  })
})

describe('applyAppearance', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-skin')
    document.documentElement.removeAttribute('style')
    document.body.innerHTML = '<div id="root"></div>'
  })

  it('sets data-skin attribute on documentElement', () => {
    applyAppearance({ ...DEFAULT_APPEARANCE, skin: 'midnight' })
    expect(document.documentElement.getAttribute('data-skin')).toBe('midnight')
  })

  it('sets accent and lightened accent-hover vars on :root', () => {
    applyAppearance({ ...DEFAULT_APPEARANCE, accent: '#8B5CF6' })
    const style = document.documentElement.style
    expect(style.getPropertyValue('--accent')).toBe('#8B5CF6')
    expect(style.getPropertyValue('--accent-hover')).toBe(lightenHex('#8B5CF6', 0.08))
  })

  it('sets radius var in px', () => {
    applyAppearance({ ...DEFAULT_APPEARANCE, radius: 14 })
    expect(document.documentElement.style.getPropertyValue('--radius-card')).toBe('14px')
  })

  it('zooms #root by scale', () => {
    applyAppearance({ ...DEFAULT_APPEARANCE, scale: 1.1 })
    const root = document.getElementById('root') as HTMLElement
    expect(root.style.zoom).toBe('1.1')
  })

  it('does not throw without #root', () => {
    document.body.innerHTML = ''
    expect(() => applyAppearance(DEFAULT_APPEARANCE)).not.toThrow()
  })
})
