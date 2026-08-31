import { describe, it, expect } from 'vitest'
import { fmt } from './format'

describe('fmt', () => {
  it('форматирует секунды в m:ss', () => {
    expect(fmt(0)).toBe('0:00')
    expect(fmt(5)).toBe('0:05')
    expect(fmt(65)).toBe('1:05')
    expect(fmt(600)).toBe('10:00')
  })

  it('отбрасывает дробную часть', () => {
    expect(fmt(61.9)).toBe('1:01')
  })

  it('защита от NaN/Infinity/отрицательных', () => {
    expect(fmt(NaN)).toBe('0:00')
    expect(fmt(Infinity)).toBe('0:00')
    expect(fmt(-3)).toBe('0:00')
  })
})
