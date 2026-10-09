import { app } from 'electron'
import { readFileSync, writeFileSync, renameSync, existsSync, copyFileSync } from 'fs'
import { join } from 'path'
import type { PersistedData } from '../shared/types'
import { BUILTIN_PRESETS, defaultTheme } from '../shared/themeModel'
import { migrateImportSources, type Connections } from '../shared/connections'

export const DEFAULT_DATA: PersistedData = {
  version: 4,
  musicFolders: [],
  playlists: [],
  lyricsOverrides: {},
  lyricSelections: {},
  lyricOffsets: {},
  volume: 0.8,
  eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  appearance: { skin: 'atlas', theme: defaultTheme(), customThemes: {}, scale: 1 },
  playback: { crossfadeSec: 0 },
  playStats: {},
  lastfmApiKey: '',
  lastfmApiSecret: '',
  lastfmProxy: '',
  importSources: {},
  connections: {},
  importedTracks: [],
  hiddenTracks: [],
  favoriteIds: [],
}

/** Формат appearance до V3-1: плоские skin/accent/radius */
interface AppearanceSettingsV2 {
  skin: string;
  accent: string;
  radius: number;
  scale: number;
}

/** Формат файла player-data.json v2/v3 (до V3-3) — без connections/lastfmApiSecret */
export interface PersistedDataV3 {
  version: 2 | 3;
  musicFolders?: string[];
  playlists?: PersistedData['playlists'];
  lyricsOverrides?: Record<string, string>;
  volume?: number;
  eqGains?: number[];
  appearance?: AppearanceSettingsV2 | PersistedData['appearance'];
  playback?: PersistedData['playback'];
  playStats?: PersistedData['playStats'];
  lastfmApiKey?: string;
  lastfmApiSecret?: string;
  lastfmProxy?: string;
  importSources?: Record<string, unknown>;
  connections?: PersistedData['connections'];
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
export function migrateV1toV2(data: Partial<PersistedDataV1>): Omit<PersistedDataV3, 'version'> & { version: 2 } {
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
export function migrateV2toV3(data: Partial<PersistedDataV3>): Omit<PersistedData, 'version' | 'connections' | 'lastfmApiSecret'> & { version: 3 } {
  if (data.appearance && 'theme' in data.appearance) {
    return {...DEFAULT_DATA,...data,version:3,appearance:data.appearance} as Omit<PersistedData, 'version' | 'connections' | 'lastfmApiSecret'> & {version:3}
  }
  const old = data.appearance as AppearanceSettingsV2 | undefined
  const skin = old?.skin ?? 'atlas'
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
  } as Omit<PersistedData, 'version' | 'connections' | 'lastfmApiSecret'> & { version: 3 }
}

/**
 * Миграция v3 → v4: connections из кнопок «Подключить» + lastfmApiSecret.
 * importSources.vkToken (ручной ввод) переносится в connections.vk,
 * чтобы старый ручной токен продолжил работать через новую карточку.
 */
export function migrateV3toV4(
  data: Partial<PersistedDataV3> | (Omit<PersistedData, 'version'> & { version: 3 }),
): PersistedData {
  const v3 = migrateV2toV3(data as Partial<PersistedDataV3>)
  const migrated = migrateImportSources(v3.importSources ?? {})
  // Ручные connections уже есть (мог быть частичный v4 с version 3) — не затираем
  const existing = (data as Partial<PersistedData>).connections ?? {}
  const connections: Connections = { ...migrated, ...existing }
  return {
    ...v3,
    version: 4,
    lastfmApiSecret: data.lastfmApiSecret ?? '',
    connections,
    favoriteIds: (data as Partial<PersistedData>).favoriteIds ?? v3.favoriteIds ?? [],
  }
}

/** Чистая функция — тестируется без Electron. Принимает v1/v2/v3/v4 (мигрирует) */
export function mergeWithDefaults(
  raw: Partial<PersistedData> | Partial<PersistedDataV3> | Partial<PersistedDataV1> | null,
): PersistedData {
  if (raw && raw.version === 1) return migrateV3toV4(migrateV2toV3(migrateV1toV2(raw)))
  if (raw && (raw.version === 2 || raw.version === 3)) return migrateV3toV4(raw as Partial<PersistedDataV3>)
  return { ...DEFAULT_DATA, ...(raw ?? {}), version: 4 } as PersistedData
}

let cache: PersistedData | null = null
let recoveredFromBackup = false

function dataPath(): string {
  return join(app.getPath('userData'), 'player-data.json')
}

function parseProfile(path: string): PersistedData {
  const raw: unknown = JSON.parse(readFileSync(path, 'utf-8'))
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid profile object')
  const data = raw as Record<string, unknown>
  if (!Number.isInteger(data.version) || (data.version as number) < 1 || (data.version as number) > 4) throw new Error('Unsupported profile version')
  if (data.musicFolders !== undefined && !Array.isArray(data.musicFolders)) throw new Error('Invalid music folders')
  if (data.playlists !== undefined && !Array.isArray(data.playlists)) throw new Error('Invalid playlists')
  if (data.importedTracks !== undefined && !Array.isArray(data.importedTracks)) throw new Error('Invalid imported tracks')
  return mergeWithDefaults(data as Partial<PersistedData>)
}

export function profileRecoveryStatus(): { recovered: boolean } {
  return { recovered: recoveredFromBackup }
}

export function loadData(): PersistedData {
  if (cache) return cache
  const path = dataPath()
  if (!existsSync(path)) {
    const backup = path + '.bak'
    if (existsSync(backup)) {
      let restored: PersistedData
      try { restored = parseProfile(backup) }
      catch { throw new Error('Основной профиль отсутствует, а резервная копия повреждена. Восстановите player-data.json вручную.') }
      copyFileSync(backup, path + '.tmp')
      renameSync(path + '.tmp', path)
      cache = restored
      recoveredFromBackup = true
      return cache
    }
    cache = mergeWithDefaults(null)
    return cache
  }
  try { cache = parseProfile(path) }
  catch (primaryError) {
    const backup = path + '.bak'
    let restored: PersistedData
    try { restored = parseProfile(backup) }
    catch { throw new Error('Не удалось прочитать профиль и резервную копию. Откройте папку профиля и восстановите player-data.json вручную.', { cause: primaryError }) }
    // Keep the damaged original for diagnosis. Never replace it with defaults.
    copyFileSync(path, `${path}.corrupt-${Date.now()}-${process.pid}`)
    copyFileSync(backup, path + '.tmp')
    renameSync(path + '.tmp', path)
    cache = restored
    recoveredFromBackup = true
  }
  return cache
}

export function saveData(data: PersistedData): void {
  const path = dataPath()
  if (!cache && (existsSync(path) || existsSync(path + '.bak'))) loadData() // refuse to overwrite an unreadable profile
  if (data.version !== 4 || !Array.isArray(data.playlists) || !Array.isArray(data.musicFolders) || !Array.isArray(data.importedTracks)) throw new Error('Invalid profile data')
  if (existsSync(path)) {
    parseProfile(path)
    const backup = path + '.bak'
    copyFileSync(path, backup + '.tmp')
    renameSync(backup + '.tmp', backup)
  }
  const tmp = path + '.tmp'
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  renameSync(tmp, path) // атомарная запись
  cache = data
}
