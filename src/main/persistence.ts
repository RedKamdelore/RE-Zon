import { app } from 'electron'
import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs'
import { join } from 'path'
import type { PersistedData } from '../shared/types'
import { BUILTIN_PRESETS, defaultTheme } from '../shared/themeModel'

export const DEFAULT_DATA: PersistedData = {
  version: 3,
  musicFolders: [],
  playlists: [],
  lyricsOverrides: {},
  volume: 0.8,
  eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  appearance: { skin: 'spotify-dark', theme: defaultTheme(), customThemes: {}, scale: 1 },
  playback: { crossfadeSec: 0 },
  playStats: {},
  lastfmApiKey: '',
  lastfmProxy: '',
  importSources: {},
  importedTracks: [],
  hiddenTracks: [],
}

/** Формат appearance до V3-1: плоские skin/accent/radius */
interface AppearanceSettingsV2 {
  skin: string;
  accent: string;
  radius: number;
  scale: number;
}

/** Формат файла player-data.json v2 (до V3-1) */
export interface PersistedDataV2 {
  version: 2;
  musicFolders?: string[];
  playlists?: PersistedData['playlists'];
  lyricsOverrides?: Record<string, string>;
  volume?: number;
  eqGains?: number[];
  appearance?: AppearanceSettingsV2;
  playback?: PersistedData['playback'];
  playStats?: PersistedData['playStats'];
  lastfmApiKey?: string;
  lastfmProxy?: string;
  importSources?: Record<string, unknown>;
  importedTracks?: PersistedData['importedTracks'];
  hiddenTracks?: PersistedData['hiddenTracks'];
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
export function migrateV1toV2(data: Partial<PersistedDataV1>): PersistedDataV2 {
  return {
    version: 2,
    musicFolders: data.musicFolders ?? [],
    playlists: data.playlists ?? [],
    lyricsOverrides: data.lyricsOverrides ?? {},
    volume: data.volume ?? DEFAULT_DATA.volume,
    eqGains: data.eqGains ?? DEFAULT_DATA.eqGains,
  }
}

/**
 * Миграция v2 → v3: плоский appearance {skin, accent, radius, scale}
 * превращается в движок тем — theme = пресет скина с применёнными
 * accent/radius пользователя. Неизвестный skin → дефолтная тема.
 */
export function migrateV2toV3(data: Partial<PersistedDataV2>): PersistedData {
  const old = data.appearance
  const skin = old?.skin ?? 'spotify-dark'
  const base = BUILTIN_PRESETS[skin] ?? defaultTheme()
  return {
    ...DEFAULT_DATA,
    ...data,
    version: 3,
    appearance: {
      skin,
      theme: { ...base, accent: old?.accent ?? base.accent, radius: old?.radius ?? base.radius },
      customThemes: {},
      scale: old?.scale ?? 1,
    },
  }
}

/** Чистая функция — тестируется без Electron. Принимает v1/v2 (мигрирует) и v3 */
export function mergeWithDefaults(
  raw: Partial<PersistedData> | Partial<PersistedDataV2> | Partial<PersistedDataV1> | null,
): PersistedData {
  if (raw && raw.version === 1) return migrateV2toV3(migrateV1toV2(raw))
  if (raw && raw.version === 2) return migrateV2toV3(raw as Partial<PersistedDataV2>)
  return { ...DEFAULT_DATA, ...(raw ?? {}), version: 3 } as PersistedData
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
