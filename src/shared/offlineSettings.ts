export interface OfflineSettings { autoSaveDirect: boolean; maxCacheBytes: number }
export const CACHE_LIMITS = [1024 ** 3, 5 * 1024 ** 3, 20 * 1024 ** 3, 0] as const
export const DEFAULT_OFFLINE_SETTINGS: OfflineSettings = { autoSaveDirect: true, maxCacheBytes: 5 * 1024 ** 3 }
