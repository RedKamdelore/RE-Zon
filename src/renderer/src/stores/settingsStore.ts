import { create } from 'zustand'
import type { AppearanceSettings, PersistedData, PlaybackSettings } from '@shared/types'
import { applyAppearance, DEFAULT_APPEARANCE } from '../theme'
import { persistPatch } from './playlistStore'

interface SettingsState {
  appearance: AppearanceSettings
  playback: PlaybackSettings
  lastfmApiKey: string
  lastfmProxy: string
  init: (data: PersistedData) => void // вызывается из App после единственного loadData
  setSkin: (skin: string) => void
  setAccent: (hex: string) => void
  setRadius: (px: number) => void
  setScale: (v: number) => void
  setCrossfadeSec: (sec: number) => void
  setLastfmKey: (key: string) => void
  setLastfmProxy: (proxy: string) => void
}

export const useSettingsStore = create<SettingsState>()((set, get) => {
  /** Обновляет appearance, применяет к DOM и планирует persist (debounced) */
  const patchAppearance = (patch: Partial<AppearanceSettings>): void => {
    const appearance = { ...get().appearance, ...patch }
    set({ appearance })
    applyAppearance(appearance)
    persistPatch({ appearance })
  }

  return {
    appearance: { ...DEFAULT_APPEARANCE },
    playback: { crossfadeSec: 0 },
    lastfmApiKey: '',
    lastfmProxy: '',

    init: (data) => {
      set({
        appearance: data.appearance,
        playback: data.playback,
        lastfmApiKey: data.lastfmApiKey,
        lastfmProxy: data.lastfmProxy,
      })
      applyAppearance(data.appearance)
    },

    setSkin: (skin) => patchAppearance({ skin }),
    setAccent: (hex) => patchAppearance({ accent: hex }),
    setRadius: (px) => patchAppearance({ radius: px }),
    setScale: (v) => patchAppearance({ scale: v }),

    setCrossfadeSec: (sec) => {
      const playback = { crossfadeSec: sec }
      set({ playback })
      persistPatch({ playback })
    },

    setLastfmKey: (key) => {
      set({ lastfmApiKey: key })
      persistPatch({ lastfmApiKey: key })
    },

    setLastfmProxy: (proxy) => {
      set({ lastfmProxy: proxy })
      persistPatch({ lastfmProxy: proxy })
    },
  }
})
