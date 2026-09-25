// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useSettingsStore } from './settingsStore'
import { setPersistedBase } from './playlistStore'
import { DEFAULT_APPEARANCE } from '../theme'
import { BUILTIN_PRESETS, defaultTheme, themeToCss } from '@shared/themeModel'
import type { PersistedData } from '@shared/types'

function makeBase(overrides: Partial<PersistedData> = {}): PersistedData {
  return {
    version: 4,
    musicFolders: [],
    playlists: [],
    lyricsOverrides: {},
    volume: 0.8,
    eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    appearance: { ...DEFAULT_APPEARANCE, theme: defaultTheme() },
    playback: { crossfadeSec: 0 },
    playStats: {},
    lastfmApiKey: '',
    lastfmApiSecret: '',
    connections: {},
    lastfmProxy: '',
    importSources: {},
    importedTracks: [],
    hiddenTracks: [],
    favoriteIds: [],
    ...overrides,
  }
}

function injectedCss(): string {
  return (document.getElementById('rezon-theme') as HTMLStyleElement | null)?.textContent ?? ''
}

describe('settingsStore', () => {
  let saveData: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    saveData = vi.fn().mockResolvedValue(undefined)
    ;(window as unknown as Record<string, unknown>).api = { saveData }
    document.head.innerHTML = ''
    document.body.innerHTML = '<div id="root"></div>'
    document.documentElement.removeAttribute('data-skin')
    useSettingsStore.setState({
      appearance: { ...DEFAULT_APPEARANCE, theme: defaultTheme() },
      playback: { crossfadeSec: 0 },
      lastfmApiKey: '',
      lastfmProxy: '',
    })
    setPersistedBase(makeBase())
  })

  afterEach(() => {
    vi.useRealTimers()
    setPersistedBase(null)
    delete (window as unknown as Record<string, unknown>).api
  })

  it('init loads settings from persisted data and applies theme', () => {
    const theme = { ...BUILTIN_PRESETS['midnight'], accent: '#8B5CF6', radius: 12 }
    useSettingsStore.getState().init(
      makeBase({
        appearance: { skin: 'midnight', theme, customThemes: {}, scale: 1.05 },
        playback: { crossfadeSec: 4 },
        lastfmApiKey: 'abc',
      }),
    )
    const s = useSettingsStore.getState()
    expect(s.appearance.skin).toBe('midnight')
    expect(s.appearance.theme.accent).toBe('#8B5CF6')
    expect(s.playback.crossfadeSec).toBe(4)
    expect(s.lastfmApiKey).toBe('abc')
    expect(injectedCss()).toBe(themeToCss(theme))
    expect((document.getElementById('root') as HTMLElement).style.zoom).toBe('1.05')
  })

  it('setSkin loads builtin preset into the editor and persists', () => {
    useSettingsStore.getState().setSkin('light')
    const s = useSettingsStore.getState()
    expect(s.appearance.skin).toBe('light')
    expect(s.appearance.theme).toEqual(BUILTIN_PRESETS['light'])
    expect(injectedCss()).toContain('--bg-app: #f6f6f6')
    vi.advanceTimersByTime(600)
    expect(saveData).toHaveBeenCalledTimes(1)
    const saved = saveData.mock.calls[0][0] as PersistedData
    expect(saved.appearance.skin).toBe('light')
    expect(saved.appearance.theme.bgApp).toBe('#f6f6f6')
  })

  it('setSkin with unknown id is a no-op', () => {
    useSettingsStore.getState().setSkin('no-such')
    expect(useSettingsStore.getState().appearance.skin).toBe('atlas')
  })

  it('patchTheme mutates active theme, applies CSS live and persists', () => {
    useSettingsStore.getState().patchTheme({ panelMaterial: 'glass', glassBlur: 24 })
    const s = useSettingsStore.getState()
    expect(s.appearance.theme.panelMaterial).toBe('glass')
    expect(injectedCss()).toContain('backdrop-filter: blur(24px)')
    vi.advanceTimersByTime(600)
    const saved = saveData.mock.calls[0][0] as PersistedData
    expect(saved.appearance.theme.panelMaterial).toBe('glass')
  })

  it('setAccent and setRadius patch the theme and persist', () => {
    const s = useSettingsStore.getState()
    s.setAccent('#8B5CF6')
    s.setRadius(16)
    expect(useSettingsStore.getState().appearance.theme.accent).toBe('#8B5CF6')
    expect(injectedCss()).toContain('--radius-card: 16px')
    vi.advanceTimersByTime(600)
    const saved = saveData.mock.calls[0][0] as PersistedData
    expect(saved.appearance.theme.accent).toBe('#8B5CF6')
    expect(saved.appearance.theme.radius).toBe(16)
  })

  it('setScale zooms #root and persists', () => {
    useSettingsStore.getState().setScale(1.15)
    expect((document.getElementById('root') as HTMLElement).style.zoom).toBe('1.15')
    vi.advanceTimersByTime(600)
    expect((saveData.mock.calls[0][0] as PersistedData).appearance.scale).toBe(1.15)
  })

  it('saveCustomTheme stores current config under name and selects it', () => {
    const s = useSettingsStore.getState()
    s.patchTheme({ accent: '#FF8800' })
    s.saveCustomTheme('  Моя тема  ')
    const a = useSettingsStore.getState().appearance
    expect(a.skin).toBe('Моя тема')
    expect(a.customThemes['Моя тема'].accent).toBe('#FF8800')
    vi.advanceTimersByTime(600)
    const saved = (saveData.mock.calls[0][0] as PersistedData).appearance
    expect(saved.customThemes['Моя тема'].accent).toBe('#FF8800')
    expect(saved.skin).toBe('Моя тема')
  })

  it('saveCustomTheme ignores empty names', () => {
    useSettingsStore.getState().saveCustomTheme('   ')
    expect(useSettingsStore.getState().appearance.customThemes).toEqual({})
  })

  it('setSkin can select a custom theme', () => {
    const s = useSettingsStore.getState()
    s.patchTheme({ accent: '#00FF00' })
    s.saveCustomTheme('Зелёная')
    s.setSkin('light')
    s.setSkin('Зелёная')
    expect(useSettingsStore.getState().appearance.theme.accent).toBe('#00FF00')
  })

  it('deleteCustomTheme removes theme; deleting active falls back to default', () => {
    const s = useSettingsStore.getState()
    s.saveCustomTheme('Временная')
    expect(useSettingsStore.getState().appearance.skin).toBe('Временная')
    s.deleteCustomTheme('Временная')
    const a = useSettingsStore.getState().appearance
    expect(a.customThemes['Временная']).toBeUndefined()
    expect(a.skin).toBe('atlas')
    expect(a.theme).toEqual(defaultTheme())
  })

  it('deleteCustomTheme of inactive theme keeps current theme', () => {
    const s = useSettingsStore.getState()
    s.saveCustomTheme('Запасная')
    s.setSkin('midnight')
    s.deleteCustomTheme('Запасная')
    const a = useSettingsStore.getState().appearance
    expect(a.skin).toBe('midnight')
    expect(a.customThemes['Запасная']).toBeUndefined()
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

  it('init loads lastfmProxy from persisted data', () => {
    useSettingsStore.getState().init(makeBase({ lastfmProxy: 'http://127.0.0.1:8080' }))
    expect(useSettingsStore.getState().lastfmProxy).toBe('http://127.0.0.1:8080')
  })

  it('setLastfmProxy persists proxy', () => {
    useSettingsStore.getState().setLastfmProxy('http://127.0.0.1:8080')
    expect(useSettingsStore.getState().lastfmProxy).toBe('http://127.0.0.1:8080')
    vi.advanceTimersByTime(600)
    expect((saveData.mock.calls[0][0] as PersistedData).lastfmProxy).toBe('http://127.0.0.1:8080')
  })
})
