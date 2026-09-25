import { create } from 'zustand'
import { persistPatch } from './playlistStore'
import type { Track } from '@shared/types'
import type { LyricsLookupResult } from '@shared/lyricsLookup'

interface LyricsState {
  overrides: Record<string, string> // trackId → текст из редактора
  automatic: Record<string, LyricsLookupResult | null>
  searching: Record<string, boolean>
  errors: Record<string, string>
  init: (overrides: Record<string, string>) => void // вызывается из App после loadData
}

function schedulePersist(overrides: Record<string, string>): void { persistPatch({lyricsOverrides:overrides}) }

export const useLyricsStore = create<LyricsState>()((set) => ({
  overrides: {},
  automatic: readAutomaticCache(), searching: {}, errors: {},

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

const inFlight = new Map<string, Promise<void>>()
function readAutomaticCache(): Record<string, LyricsLookupResult | null> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('rezon-automatic-lyrics') ?? '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => {
      const lyric = entry as Partial<LyricsLookupResult> | null
      return lyric?.source === 'lrclib' && typeof lyric.text === 'string' && lyric.text.length <= 50_000
    })) as Record<string, LyricsLookupResult | null>
  } catch { return {} }
}
function saveAutomaticCache(values: Record<string, LyricsLookupResult | null>): void {
  try {
    const successful = Object.entries(values).filter(([, value]) => !!value && value.text.length <= 50_000).slice(-80)
    localStorage.setItem('rezon-automatic-lyrics', JSON.stringify(Object.fromEntries(successful)))
  } catch { /* Lyrics still work for this session when storage is full. */ }
}
export function searchLyrics(track: Track, force = false): Promise<void> {
  const pending = inFlight.get(track.id)
  if (pending) return pending
  const state = useLyricsStore.getState()
  if (!force && (Object.prototype.hasOwnProperty.call(state.automatic, track.id) || Object.prototype.hasOwnProperty.call(state.overrides, track.id))) return Promise.resolve()
  if (!window.api?.lookupLyrics) return Promise.resolve()
  useLyricsStore.setState({ searching: { ...state.searching, [track.id]: true }, errors: { ...state.errors, [track.id]: '' } })
  const lookup = window.api.lookupLyrics({ title: track.title, artist: track.artist, album: track.album, durationSec: track.durationSec })
    .then(result => useLyricsStore.setState(s => { const automatic = { ...s.automatic, [track.id]: result }; saveAutomaticCache(automatic); return { automatic } }))
    .catch(() => useLyricsStore.setState(s => ({ errors: { ...s.errors, [track.id]: 'Не удалось получить текст. Повторите поиск позже.' } })))
    .finally(() => {
      inFlight.delete(track.id)
      useLyricsStore.setState(s => ({ searching: { ...s.searching, [track.id]: false } }))
    })
  inFlight.set(track.id, lookup)
  return lookup
}
