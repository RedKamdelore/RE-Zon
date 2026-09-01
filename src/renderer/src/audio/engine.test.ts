import { describe, it, expect } from 'vitest'
import { EQ_FREQS, EQ_PRESETS, clampVolume, equalPowerCurves, mediaUrl, resolveTrackUrl } from './engine'
import type { Track } from '@shared/types'

function trackWith(filePath: string): Track {
  return { id: 't', sourceId: 'x', title: 'T', artist: 'A', album: 'Al', durationSec: 1, filePath }
}

describe('engine EQ constants', () => {
  it('has 10 bands and standard frequencies', () => {
    expect(EQ_FREQS).toEqual([31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000])
  })

  it('presets have 10 gains each, Flat is all zero', () => {
    for (const gains of Object.values(EQ_PRESETS)) {
      expect(gains).toHaveLength(10)
    }
    expect(EQ_PRESETS.Flat).toEqual(new Array(10).fill(0))
  })

  it('clampVolume clamps to [0,1]', () => {
    expect(clampVolume(0.5)).toBe(0.5)
    expect(clampVolume(1.5)).toBe(1)
    expect(clampVolume(-0.2)).toBe(0)
  })
})

describe('equalPowerCurves', () => {
  it('endpoints are 0→1 (fadeIn) and 1→0 (fadeOut)', () => {
    const { fadeIn, fadeOut } = equalPowerCurves(32)
    expect(fadeIn).toHaveLength(32)
    expect(fadeIn[0]).toBe(0)
    expect(fadeOut[0]).toBeCloseTo(1, 6)
    expect(fadeIn[31]).toBeCloseTo(1, 6)
    expect(fadeOut[31]).toBeCloseTo(0, 6) // cos(π/2) ≈ 6e-17, не ровно 0
  })

  it('midpoint is √½ for both curves and power stays constant', () => {
    // 31 точка → t = i/30, i=15 — ровно середина (sin(π/4) = cos(π/4) = √½)
    const { fadeIn, fadeOut } = equalPowerCurves(31)
    expect(fadeIn[15]).toBeCloseTo(Math.SQRT1_2, 5)
    expect(fadeOut[15]).toBeCloseTo(Math.SQRT1_2, 5)
    for (let i = 0; i < 31; i++) {
      expect(fadeIn[i] ** 2 + fadeOut[i] ** 2).toBeCloseTo(1, 5)
    }
  })
})

describe('resolveTrackUrl', () => {
  it('returns http(s) stream URLs untouched (no media:// encoding)', () => {
    const url = 'https://cs9-5v4.vkuseraudio.net/p1/abc/audio.mp3?extra=1'
    expect(resolveTrackUrl(trackWith(url))).toBe(url)
    expect(resolveTrackUrl(trackWith('http://example.com/a.mp3'))).toBe('http://example.com/a.mp3')
  })

  it('encodes local paths as media://', () => {
    const p = 'C:\\Music\\song.mp3'
    expect(resolveTrackUrl(trackWith(p))).toBe(mediaUrl(p))
    expect(resolveTrackUrl(trackWith(p))).toMatch(/^media:\/\//)
  })
})
