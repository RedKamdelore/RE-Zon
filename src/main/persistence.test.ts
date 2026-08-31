import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '' } }))

import { mergeWithDefaults, DEFAULT_DATA } from './persistence'

describe('mergeWithDefaults', () => {
  it('null returns defaults', () => {
    expect(mergeWithDefaults(null)).toEqual(DEFAULT_DATA)
  })
  it('partial data merges with defaults', () => {
    const r = mergeWithDefaults({ volume: 0.5, musicFolders: ['D:\\Music'] })
    expect(r.volume).toBe(0.5)
    expect(r.musicFolders).toEqual(['D:\\Music'])
    expect(r.playlists).toEqual([])
    expect(r.version).toBe(1)
  })
  it('eqGains default has 10 zeros', () => {
    expect(mergeWithDefaults(null).eqGains).toHaveLength(10)
  })
})
