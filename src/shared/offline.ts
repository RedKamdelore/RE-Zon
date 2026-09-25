export type OfflinePhase = 'queued' | 'downloading' | 'saved' | 'error' | 'cancelled'
export interface OfflineItem { trackId: string; title: string; artist: string; phase: OfflinePhase; bytes: number; total?: number; error?: string }

const AUDIO_EXT = new Set(['mp3', 'flac', 'wav', 'ogg', 'opus', 'm4a'])

/** Only an explicitly supplied HTTPS audio file can enter the offline queue. */
export function publicHttpsUrl(raw: string): URL {
  const url = new URL(raw)
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) throw new Error('Нужна публичная HTTPS-ссылка на аудиофайл.')
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (/^[0-9a-f:.\[\]]+$/.test(host) || !host.includes('.') || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('Локальные и служебные адреса не поддерживаются.')
  return url
}

export function directAudioUrl(raw: string): {url: string; extension: string} {
  const url = publicHttpsUrl(raw)
  const extension = url.pathname.split('/').pop()?.split('.').pop()?.toLowerCase() ?? ''
  if (!AUDIO_EXT.has(extension)) throw new Error('Поддерживаются прямые ссылки на MP3, FLAC, WAV, OGG, OPUS и M4A.')
  return {url:url.toString(),extension}
}
