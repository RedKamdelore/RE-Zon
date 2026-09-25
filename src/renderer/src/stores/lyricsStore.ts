import { create } from 'zustand'
import { persistPatch } from './playlistStore'

interface LyricsState {
  overrides: Record<string, string> // trackId → текст из редактора
  init: (overrides: Record<string, string>) => void // вызывается из App после loadData
}

function schedulePersist(overrides: Record<string, string>): void { persistPatch({lyricsOverrides:overrides}) }

export const useLyricsStore = create<LyricsState>()((set) => ({
  overrides: {},

  init: (overrides) => {
    set({ overrides })
  },
}))

export function getLyricsOverride(trackId: string): string | undefined {
  return useLyricsStore.getState().overrides[trackId]
}

export function setLyricsOverride(trackId: string, text: string): void {
  const overrides = { ...useLyricsStore.getState().overrides, [trackId]: text }
  useLyricsStore.setState({ overrides })
  schedulePersist(overrides)
}
