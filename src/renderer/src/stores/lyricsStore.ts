import { create } from 'zustand'
import { persistPatch } from './playlistStore'
import type { Track } from '@shared/types'
import { LYRIC_SOURCE_IDS } from '@shared/lyricsLookup'
import type { LyricsLookupReport, LyricsLookupResult } from '@shared/lyricsLookup'
import { parseLrc } from '@shared/lyrics'

interface LyricsState {
  overrides: Record<string, string> // trackId → текст из редактора
  selections: Record<string, LyricsLookupResult> // trackId → выбранный результат каталога
  offsets: Record<string, number> // trackId → сдвиг строк LRC в секундах
  automatic: Record<string, LyricsLookupResult | null>
  reports: Record<string, LyricsLookupReport>
  searching: Record<string, boolean>
  errors: Record<string, string>
  init: (overrides: Record<string, string>, offsets?: Record<string, number>, selections?: Record<string, LyricsLookupResult>) => void // вызывается из App после loadData
}

export const useLyricsStore = create<LyricsState>()((set) => ({
  overrides: {},
  selections: {},
  offsets: {},
  automatic: readAutomaticCache(), reports: {}, searching: {}, errors: {},

  init: (overrides, offsets = {}, selections = {}) => {
    set({ overrides, offsets: Object.fromEntries(Object.entries(offsets).filter(([, value]) => Number.isFinite(value) && Math.abs(value) <= 10)), selections: Object.fromEntries(Object.entries(selections).filter(([, value]) => validSelection(value))) })
  },
}))

export function getLyricsOverride(trackId: string): string | undefined {
  return useLyricsStore.getState().overrides[trackId]
}

export function setLyricsOverride(trackId: string, text: string): void {
  const state = useLyricsStore.getState()
  const overrides = { ...state.overrides, [trackId]: text }
  const selections = { ...state.selections }
  delete selections[trackId]
  useLyricsStore.setState({ overrides, selections })
  persistPatch({ lyricsOverrides: overrides, lyricSelections: selections })
}

function validSelection(value: LyricsLookupResult | undefined): value is LyricsLookupResult {
  return !!value && typeof value.text === 'string' && value.text.length > 0 && value.text.length <= 50_000 && typeof value.synced === 'boolean' && LYRIC_SOURCE_IDS.includes(value.source)
}

export function setLyricsSelection(trackId: string, result: LyricsLookupResult | null): void {
  if (result && !validSelection(result)) return
  const state = useLyricsStore.getState()
  const overrides = { ...state.overrides }
  const selections = { ...state.selections }
  delete overrides[trackId]
  if (result) selections[trackId] = result
  else delete selections[trackId]
  useLyricsStore.setState({ overrides, selections })
  persistPatch({ lyricsOverrides: overrides, lyricSelections: selections })
}

export function setLyricOffset(trackId: string, seconds: number): void {
  if (!Number.isFinite(seconds)) return
  const value = Math.max(-10, Math.min(10, Math.round(seconds * 2) / 2))
  const offsets = { ...useLyricsStore.getState().offsets }
  if (value === 0) delete offsets[trackId]
  else offsets[trackId] = value
  useLyricsStore.setState({ offsets })
  persistPatch({ lyricOffsets: offsets })
}

const inFlight = new Map<string, Promise<void>>()
function readAutomaticCache(): Record<string, LyricsLookupResult | null> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('rezon-automatic-lyrics') ?? '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => {
      const lyric = entry as Partial<LyricsLookupResult> | null
      // Old plain-only cache entries must be retried after new synchronized sources are added.
      return (lyric?.source === 'lrclib' || lyric?.source === 'lrcapi' || lyric?.source === 'lrcmux' || lyric?.source === 'synclrc') && lyric.synced === true && typeof lyric.text === 'string' && lyric.text.length <= 50_000 && parseLrc(lyric.text).some(line => !!line.text)
    })) as Record<string, LyricsLookupResult | null>
  } catch { return {} }
}
function saveAutomaticCache(values: Record<string, LyricsLookupResult | null>): void {
  try {
    const successful = Object.entries(values).filter(([, value]) => !!value?.synced && value.text.length <= 50_000).slice(-80)
    localStorage.setItem('rezon-automatic-lyrics', JSON.stringify(Object.fromEntries(successful)))
  } catch { /* Lyrics still work for this session when storage is full. */ }
}
export function searchLyrics(track: Track, force = false): Promise<void> {
  const pending = inFlight.get(track.id)
  if (pending) return pending
  const state = useLyricsStore.getState()
  if (!force && (Object.prototype.hasOwnProperty.call(state.automatic, track.id) || Object.prototype.hasOwnProperty.call(state.overrides, track.id))) return Promise.resolve()
  if (!window.api?.lookupLyricsReport) return Promise.resolve()
  useLyricsStore.setState({ searching: { ...state.searching, [track.id]: true }, errors: { ...state.errors, [track.id]: '' } })
  const lookup = window.api.lookupLyricsReport({ title: track.title, artist: track.artist, album: track.album, durationSec: track.durationSec, checkAll: force })
    .then(report => useLyricsStore.setState(s => {
      // A manual refresh can fail when the catalog or connection is unavailable.
      // Keep a known synchronized result rather than replacing it with plain text.
      const previous = s.automatic[track.id]
      const best = previous?.synced && !report.best?.synced ? previous : report.best ?? previous ?? null
      const automatic = { ...s.automatic, [track.id]: best }
      saveAutomaticCache(automatic)
      return { automatic, reports: { ...s.reports, [track.id]: report } }
    }))
    .catch(() => useLyricsStore.setState(s => ({ errors: { ...s.errors, [track.id]: 'Не удалось получить текст. Повторите поиск позже.' } })))
    .finally(() => {
      inFlight.delete(track.id)
      useLyricsStore.setState(s => ({ searching: { ...s.searching, [track.id]: false } }))
    })
  inFlight.set(track.id, lookup)
  return lookup
}
