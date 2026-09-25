export type UpdateChannel = 'stable' | 'beta'
export type UpdatePhase = 'unconfigured' | 'idle' | 'checking' | 'available' | 'current' | 'downloading' | 'downloaded' | 'installing' | 'error' | 'development'
export interface UpdatePreferences { channel: UpdateChannel; autoCheck: boolean; feedUrl: string }
export interface UpdateState extends UpdatePreferences {
  currentVersion: string
  phase: UpdatePhase
  nextVersion?: string
  releaseNotes?: string
  progress?: number
  lastChecked?: number
  error?: string
}
export function validateFeedUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Укажите адрес сервера обновлений.')
  if (!value.trim()) return ''
  const url = new URL(value.trim())
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('Нужен HTTPS-адрес без пароля, параметров и фрагмента.')
  }
  return url.href.replace(/\/+$/, '') + '/'
}
