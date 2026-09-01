// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useSettingsStore } from './settingsStore'
import { setPersistedBase } from './playlistStore'
import { DEFAULT_APPEARANCE } from '../theme'
import type { PersistedData } from '@shared/types'

function makeBase(overrides: Partial<PersistedData> = {}): PersistedData {
  return {
    version: 2,
    musicFolders: [],
    playlists: [],
    lyricsOverrides: {},
    volume: 0.8,
    eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    appearance: { skin: 'spotify-dark', accent: '#1DB954', radius: 8, scale: 1 },
    playback: { crossfadeSec: 0 },
    playStats: {},
    lastfmApiKey: '',
    importSources: {},
    importedTracks: [],
    ...overrides,
  }
}

describe('settingsStore', () => {
  let saveData: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    saveData = vi.fn().mockResolvedValue(undefined)
    ;(window as unknown as Record<string, unknown>).api = { saveData }
    document.body.innerHTML = '<div id="root"></div>'
    document.documentElement.removeAttribute('data-skin')
    useSettingsStore.setState({
      appearance: { ...DEFAULT_APPEARANCE },
      playback: { crossfadeSec: 0 },
      lastfmApiKey: '',
    })
    setPersistedBase(makeBase())
  })

  afterEach(() => {
    vi.useRealTimers()
    setPersistedBase(null)
    delete (window as unknown as Record<string, unknown>).api
  })

  it('init loads settings from persisted data', () => {
    useSettingsStore.getState().init(
      makeBase({
        appearance: { skin: 'midnight', accent: '#8B5CF6', radius: 12, scale: 1.05 },
        playback: { crossfadeSec: 4 },
        lastfmApiKey: 'abc',
      }),
    )
    const s = useSettingsStore.getState()
    expect(s.appearance.skin).toBe('midnight')
    expect(s.appearance.accent).toBe('#8B5CF6')
    expect(s.playback.crossfadeSec).toBe(4)
    expect(s.lastfmApiKey).toBe('abc')
  })

  it('setSkin updates state, applies data-skin and persists', () => {
    useSettingsStore.getState().setSkin('light')
    expect(useSettingsStore.getState().appearance.skin).toBe('light')
    expect(document.documentElement.getAttribute('data-skin')).toBe('light')
    vi.advanceTimersByTime(600)
    expect(saveData).toHaveBeenCalledTimes(1)
    expect((saveData.mock.calls[0][0] as PersistedData).appearance.skin).toBe('light')
  })

  it('setAccent updates css vars and persists', () => {
    useSettingsStore.getState().setAccent('#8B5CF6')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#8B5CF6')
    vi.advanceTimersByTime(600)
    expect((saveData.mock.calls[0][0] as PersistedData).appearance.accent).toBe('#8B5CF6')
  })

  it('setRadius and setScale update appearance and persist', () => {
    const s = useSettingsStore.getState()
    s.setRadius(16)
    s.setScale(1.15)
    expect(document.documentElement.style.getPropertyValue('--radius-card')).toBe('16px')
    expect((document.getElementById('root') as HTMLElement).style.zoom).toBe('1.15')
    vi.advanceTimersByTime(600)
    const saved = saveData.mock.calls[0][0] as PersistedData
    expect(saved.appearance.radius).toBe(16)
    expect(saved.appearance.scale).toBe(1.15)
  })

  it('setCrossfadeSec persists playback section', () => {
    useSettingsStore.getState().setCrossfadeSec(5)
    expect(useSettingsStore.getState().playback.crossfadeSec).toBe(5)
    vi.advanceTimersByTime(600)
    expect((saveData.mock.calls[0][0] as PersistedData).playback.crossfadeSec).toBe(5)
  })

  it('setLastfmKey persists key', () => {
    useSettingsStore.getState().setLastfmKey('my-key')
    expect(useSettingsStore.getState().lastfmApiKey).toBe('my-key')
    vi.advanceTimersByTime(600)
    expect((saveData.mock.calls[0][0] as PersistedData).lastfmApiKey).toBe('my-key')
  })

})
