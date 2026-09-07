import { create } from 'zustand'
import type { AppearanceSettings, PersistedData, PlaybackSettings } from '@shared/types'
import { BUILTIN_PRESETS, defaultTheme, type ThemeConfig } from '@shared/themeModel'
import { applyScale, applyTheme, DEFAULT_APPEARANCE } from '../theme'
import { persistPatch } from './playlistStore'

interface SettingsState {
  appearance: AppearanceSettings
  playback: PlaybackSettings
  lastfmApiKey: string
  lastfmApiSecret: string
  lastfmProxy: string
  init: (data: PersistedData) => void // вызывается из App после единственного loadData
  /** Выбор пресета (встроенного или пользовательского): загружает его в редактор */
  setSkin: (skin: string) => void
  /** Живая правка активной темы (материал, фон, цвета, радиус) */
  patchTheme: (patch: Partial<ThemeConfig>) => void
  setAccent: (hex: string) => void
  setRadius: (px: number) => void
  setScale: (v: number) => void
  /** Сохраняет текущий конфиг темы под именем и делает его активным */
  saveCustomTheme: (name: string) => void
  deleteCustomTheme: (name: string) => void
  setCrossfadeSec: (sec: number) => void
  setLastfmKey: (key: string) => void
  setLastfmSecret: (secret: string) => void
  setLastfmProxy: (proxy: string) => void
}

export const useSettingsStore = create<SettingsState>()((set, get) => {
  /** Применяет appearance к DOM (тема + масштаб) и планирует persist (debounced) */
  const commitAppearance = (appearance: AppearanceSettings): void => {
    set({ appearance })
    applyTheme(appearance.theme)
    applyScale(appearance.scale)
    persistPatch({ appearance })
  }

  return {
    appearance: { ...DEFAULT_APPEARANCE },
    playback: { crossfadeSec: 0 },
    lastfmApiKey: '',
    lastfmApiSecret: '',
    lastfmProxy: '',

    init: (data) => {
      set({
        appearance: data.appearance,
        playback: data.playback,
        lastfmApiKey: data.lastfmApiKey,
        lastfmApiSecret: data.lastfmApiSecret,
        lastfmProxy: data.lastfmProxy,
      })
      applyTheme(data.appearance.theme)
      applyScale(data.appearance.scale)
    },

    setSkin: (skin) => {
      const { appearance } = get()
      const preset = BUILTIN_PRESETS[skin] ?? appearance.customThemes[skin]
      if (!preset) return
      commitAppearance({ ...appearance, skin, theme: { ...preset } })
    },

    patchTheme: (patch) => {
      const { appearance } = get()
      commitAppearance({ ...appearance, theme: { ...appearance.theme, ...patch } })
    },

    setAccent: (hex) => get().patchTheme({ accent: hex }),
    setRadius: (px) => get().patchTheme({ radius: px }),
    setScale: (v) => commitAppearance({ ...get().appearance, scale: v }),

    saveCustomTheme: (name) => {
      const trimmed = name.trim()
      if (!trimmed) return
      const { appearance } = get()
      commitAppearance({
        ...appearance,
        skin: trimmed,
        customThemes: { ...appearance.customThemes, [trimmed]: { ...appearance.theme } },
      })
    },

    deleteCustomTheme: (name) => {
      const { appearance } = get()
      const customThemes = { ...appearance.customThemes }
      delete customThemes[name]
      // Удалили активную тему — откат на дефолтный пресет
      if (appearance.skin === name) {
        commitAppearance({ ...appearance, skin: 'spotify-dark', theme: defaultTheme(), customThemes })
      } else {
        commitAppearance({ ...appearance, customThemes })
      }
    },

    setCrossfadeSec: (sec) => {
      const playback = { crossfadeSec: sec }
      set({ playback })
      persistPatch({ playback })
    },

    setLastfmKey: (key) => {
      set({ lastfmApiKey: key })
      persistPatch({ lastfmApiKey: key })
    },

    setLastfmSecret: (secret) => {
      set({ lastfmApiSecret: secret })
      persistPatch({ lastfmApiSecret: secret })
    },

    setLastfmProxy: (proxy) => {
      set({ lastfmProxy: proxy })
      persistPatch({ lastfmProxy: proxy })
    },
  }
})
