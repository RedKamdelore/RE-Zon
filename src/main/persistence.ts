import { app } from 'electron'
import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs'
import { join } from 'path'
import type { PersistedData } from '../shared/types'

export const DEFAULT_DATA: PersistedData = {
  version: 1,
  musicFolders: [],
  playlists: [],
  lyricsOverrides: {},
  volume: 0.8,
  eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
}

/** Чистая функция — тестируется без Electron */
export function mergeWithDefaults(raw: Partial<PersistedData> | null): PersistedData {
  return { ...DEFAULT_DATA, ...(raw ?? {}), version: 1 }
}

let cache: PersistedData | null = null

function dataPath(): string {
  return join(app.getPath('userData'), 'player-data.json')
}

export function loadData(): PersistedData {
  if (cache) return cache
  try {
    cache = mergeWithDefaults(
      existsSync(dataPath()) ? JSON.parse(readFileSync(dataPath(), 'utf-8')) : null,
    )
  } catch {
    cache = mergeWithDefaults(null)
  }
  return cache
}

export function saveData(data: PersistedData): void {
  cache = data
  const tmp = dataPath() + '.tmp'
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  renameSync(tmp, dataPath()) // атомарная запись
}
