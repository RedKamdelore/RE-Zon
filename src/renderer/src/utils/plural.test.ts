import { describe, it, expect } from 'vitest'
import { plural } from './plural'

describe('plural (русские склонения)', () => {
  const t = (n: number): string => plural(n, 'трек', 'трека', 'треков')

  it('1 → one', () => {
    expect(t(1)).toBe('трек')
  })

  it('2–4 → few', () => {
    expect(t(2)).toBe('трека')
    expect(t(3)).toBe('трека')
    expect(t(4)).toBe('трека')
  })

  it('5+ → many', () => {
    expect(t(5)).toBe('треков')
    expect(t(10)).toBe('треков')
  })

  it('11–14 → many (исключение)', () => {
    expect(t(11)).toBe('треков')
    expect(t(12)).toBe('треков')
    expect(t(14)).toBe('треков')
  })

  it('21, 101 → one', () => {
    expect(t(21)).toBe('трек')
    expect(t(101)).toBe('трек')
  })

  it('22 → few', () => {
    expect(t(22)).toBe('трека')
  })

  it('25, 111 → many', () => {
    expect(t(25)).toBe('треков')
    expect(t(111)).toBe('треков')
  })

  it('0 → many', () => {
    expect(t(0)).toBe('треков')
  })
})
