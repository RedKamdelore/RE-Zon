import { app } from 'electron'
import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs'
import { join } from 'path'
import type { PersistedData } from '../shared/types'

export const DEFAULT_DATA: PersistedData = {
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
  lastfmProxy: '',
  importSources: {},
  importedTracks: [],
}

/** Старый формат файла player-data.json (до V2-1) */
interface PersistedDataV1 {
  version: 1;
  musicFolders?: string[];
  playlists?: PersistedData['playlists'];
  lyricsOverrides?: Record<string, string>;
  volume?: number;
  eqGains?: number[];
}

/** Миграция v1 → v2: старые поля сохраняются, новые заполняются дефолтами */
export function migrateV1toV2(data: Partial<PersistedDataV1>): PersistedData {
  return {
    ...DEFAULT_DATA,
    musicFolders: data.musicFolders ?? DEFAULT_DATA.musicFolders,
    playlists: data.playlists ?? DEFAULT_DATA.playlists,
    lyricsOverrides: data.lyricsOverrides ?? DEFAULT_DATA.lyricsOverrides,
    volume: data.volume ?? DEFAULT_DATA.volume,
    eqGains: data.eqGains ?? DEFAULT_DATA.eqGains,
  }
}

/** Чистая функция — тестируется без Electron. Принимает v1 (мигрирует) и v2 */
export function mergeWithDefaults(raw: Partial<PersistedData> | Partial<PersistedDataV1> | null): PersistedData {
  if (raw && raw.version === 1) return migrateV1toV2(raw)
  return { ...DEFAULT_DATA, ...(raw ?? {}), version: 2 }
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
