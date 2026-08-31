import { describe, it, expect } from 'vitest'
import { EQ_FREQS, EQ_PRESETS } from './engine'

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
})
