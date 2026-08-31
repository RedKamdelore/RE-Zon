import { create } from 'zustand'
import { getPersistedBase, setPersistedBase } from './playlistStore'

interface LyricsState {
  overrides: Record<string, string> // trackId → текст из редактора
  init: (overrides: Record<string, string>) => void // вызывается из App после loadData
}

// --- Debounced persist ----------------------------------------------------
// Тот же паттерн, что и в playlistStore: мержим lyricsOverrides в базу
// (persistedBase), чтобы не читать диск и не затирать чужие поля.
const PERSIST_DELAY = 500
let persistTimer: ReturnType<typeof setTimeout> | null = null

function schedulePersist(overrides: Record<string, string>): void {
  if (persistTimer !== null) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    const base = getPersistedBase()
    if (typeof window === 'undefined' || !window.api || !base) return
    // Обновляем базу в памяти, чтобы следующие сохранения мержились с ней
    const next = { ...base, lyricsOverrides: overrides }
    setPersistedBase(next)
    window.api.saveData(next).catch((e) => console.error('saveData failed:', e))
  }, PERSIST_DELAY)
}

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
