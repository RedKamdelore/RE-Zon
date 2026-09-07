import { describe, it, expect } from 'vitest'
import { connectionStatus, isVkTokenExpired, migrateImportSources } from './connections'

describe('connectionStatus', () => {
  it('disconnected when no entry or empty token', () => {
    expect(connectionStatus({}, 'vk')).toEqual({ connected: false })
    expect(connectionStatus({ vk: { token: '', connectedAt: 1 } }, 'vk')).toEqual({ connected: false })
    expect(connectionStatus({ lastfm: { token: 'k' } as never }, 'vk')).toEqual({ connected: false })
  })

  it('connected with metadata, token not exposed', () => {
    const s = connectionStatus(
      { vk: { token: 'secret', connectedAt: 42, userId: '123' } },
      'vk',
    )
    expect(s.connected).toBe(true)
    expect(s.connectedAt).toBe(42)
    expect(s.userId).toBe('123')
    expect(s).not.toHaveProperty('token')
  })

  it('passes playlistName through', () => {
    const s = connectionStatus(
      { spotify: { token: 't', connectedAt: 1, playlistName: 'Spotify: Mix' } },
      'spotify',
    )
    expect(s.playlistName).toBe('Spotify: Mix')
  })
})

describe('isVkTokenExpired', () => {
  it('fresh token is not expired', () => {
    const now = Date.now()
    expect(isVkTokenExpired({ token: 't', connectedAt: now - 1000 }, now)).toBe(false)
  })

  it('token older than 24h is expired', () => {
    const now = Date.now()
    expect(isVkTokenExpired({ token: 't', connectedAt: now - 25 * 3600 * 1000 }, now)).toBe(true)
  })

  it('exactly 24h is not yet expired, a millisecond later is (border)', () => {
    const now = Date.now()
    expect(isVkTokenExpired({ token: 't', connectedAt: now - 24 * 3600 * 1000 }, now)).toBe(false)
    expect(isVkTokenExpired({ token: 't', connectedAt: now - 24 * 3600 * 1000 - 1 }, now)).toBe(true)
  })
})

describe('migrateImportSources', () => {
  it('empty/absent vkToken gives no connections', () => {
    expect(migrateImportSources({})).toEqual({})
    expect(migrateImportSources({ vkToken: '' })).toEqual({})
  })

  it('vkToken migrates to vk connection with connectedAt 0', () => {
    expect(migrateImportSources({ vkToken: 'abc' })).toEqual({
      vk: { token: 'abc', connectedAt: 0 },
    })
  })
})
