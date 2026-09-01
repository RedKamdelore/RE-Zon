import { create } from 'zustand'
import { persistPatch, getPersistedBase } from './playlistStore'

export type PlayStats = Record<string, { count: number; lastPlayed: number }>

interface StatsState {
  stats: PlayStats
  init: (stats: PlayStats) => void // вызывается из App после единственного loadData
}

/**
 * Статистика прослушиваний (playStats из PersistedData). В памяти — полный
 * объект; persist идёт через общий дебаунсированный persistPatch, поэтому
 * серия recordPlay внутри окна дебаунса складывается в один saveData.
 */
export const useStatsStore = create<StatsState>()((set) => ({
  stats: {},
  init: (stats) => set({ stats }),
}))

export function getStats(): PlayStats {
  return useStatsStore.getState().stats
}

export function recordPlay(trackId: string): void {
  const prev = useStatsStore.getState().stats
  const entry = prev[trackId]
  const stats: PlayStats = {
    ...prev,
    [trackId]: { count: (entry?.count ?? 0) + 1, lastPlayed: Date.now() },
  }
  useStatsStore.setState({ stats })
  // Мерж поверх базы на случай, если init ещё не отработал (или статистика
  // появилась на диске извне) — свежие in-memory записи побеждают.
  const base = getPersistedBase()
  persistPatch({ playStats: { ...(base?.playStats ?? {}), ...stats } })
}
