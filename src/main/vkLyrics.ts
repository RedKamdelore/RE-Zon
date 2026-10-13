import type { ServiceAccount } from '../shared/accounts'
import type { LyricsLookupRequest, LyricsLookupResult, LyricsSourceStatus } from '../shared/lyricsLookup'
import { parseLrc } from '../shared/lyrics'

export type VkAudioMethod = 'audio.get' | 'audio.search' | 'audio.getById' | 'audio.getLyrics'
export type VkAudioApi = (method: VkAudioMethod, params: Record<string, string>) => Promise<unknown>
export type VkLyricsRunner = (account: ServiceAccount, work: (api: VkAudioApi) => Promise<LyricsLookupResult | null>) => Promise<LyricsLookupResult | null>
const MAX_TEXT = 50_000

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function text(value: unknown): string | undefined {
  const result = typeof value === 'string' ? value : Array.isArray(value) ? value.filter(line => typeof line === 'string').slice(0, 1000).join('\n') : ''
  return result.trim().slice(0, MAX_TEXT) || undefined
}

/** VK's current format uses begin/end in milliseconds and line text; older records use text/LRC. */
export function parseVkLyrics(value: unknown, durationSec?: number): LyricsLookupResult | null {
  const response = object(value)
  if (!response) return null
  const lyrics = object(response.lyrics) ?? response
  const plain = text(lyrics.text)
  const plainIsTimed = !!plain && parseLrc(plain).some(line => !!line.text)
  let synced = plainIsTimed ? plain : undefined
  if (Array.isArray(lyrics.timestamps)) {
    const lines = lyrics.timestamps.slice(0, 1000).flatMap(value => {
      const line = object(value)
      if (!line || typeof line.begin !== 'number' || !Number.isFinite(line.begin) || line.begin < 0 || line.begin > 59_999_999 || typeof line.line !== 'string') return []
      const ms = Math.round(line.begin)
      return [{ ms, text: line.line.replace(/[\r\n]+/g, ' ').trim() }]
    }).sort((a, b) => a.ms - b.ms)
    if (lines.some(line => !!line.text)) synced = lines.map(line =>
      `[${String(Math.floor(line.ms / 60_000)).padStart(2, '0')}:${String(Math.floor(line.ms % 60_000 / 1000)).padStart(2, '0')}.${String(line.ms % 1000).padStart(3, '0')}]${line.text}`,
    ).join('\n').slice(0, MAX_TEXT)
  }
  if (synced && durationSec && parseLrc(synced).some(line => line.timeSec > durationSec + 8)) synced = undefined
  if (synced) return { source: 'vk', text: synced, synced: true, ...(plain && !plainIsTimed ? { plainText: plain } : {}) }
  return plain && !plainIsTimed ? { source: 'vk', text: plain, synced: false } : null
}

class VkLyricsError extends Error {
  constructor(readonly code?: number) { super('VK lyrics request failed') }
}

async function call(api: VkAudioApi, method: VkAudioMethod, params: Record<string, string>): Promise<unknown> {
  const envelope = object(await api(method, params))
  if (!envelope) throw new VkLyricsError()
  const error = object(envelope.error)
  if (error) throw new VkLyricsError(typeof error.error_code === 'number' ? error.error_code : undefined)
  if (!Object.prototype.hasOwnProperty.call(envelope, 'response')) throw new VkLyricsError()
  return envelope.response
}

function audioItems(value: unknown): Array<Record<string, unknown>> {
  const values = Array.isArray(value) ? value : object(value)?.items
  return Array.isArray(values) ? values.map(object).filter((item): item is Record<string, unknown> => !!item) : []
}

async function forAudio(api: VkAudioApi, audioId: string, durationSec?: number): Promise<LyricsLookupResult | null> {
  try {
    const found = parseVkLyrics(await call(api, 'audio.getLyrics', { audio_id: audioId }), durationSec)
    if (found) return found
  } catch (error) {
    // Old API versions need lyrics_id instead of audio_id.
    if (!(error instanceof VkLyricsError) || ![3, 100].includes(error.code ?? 0)) throw error
  }
  const audio = audioItems(await call(api, 'audio.getById', { audios: audioId }))
    .find(item => `${item.owner_id}_${item.id}` === audioId)
  const lyricsId = audio?.lyrics_id
  if ((typeof lyricsId !== 'number' && typeof lyricsId !== 'string') || !/^[1-9]\d*$/.test(String(lyricsId))) return null
  return parseVkLyrics(await call(api, 'audio.getLyrics', { lyrics_id: String(lyricsId) }), durationSec)
}

const normalize = (value: unknown): string => typeof value === 'string'
  ? value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() : ''

export async function lookupVkLyricsWith(request: LyricsLookupRequest, accounts: ServiceAccount[], run: VkLyricsRunner): Promise<LyricsSourceStatus> {
  const eligible = accounts.filter(account => account.service === 'vk' && account.token)
  const account = request.vk?.accountId ? eligible.find(account => account.id === request.vk!.accountId)
    : eligible.find(account => account.id === 'vk:default') ?? eligible[0]
  if (!account) return { source: 'vk', status: 'unavailable', message: request.vk?.accountId ? 'Аккаунт VK отключён' : 'Подключите VK в разделе «Источники»' }
  try {
    const result = await run(account, async api => {
      if (request.vk && /^-?[1-9]\d{0,19}_[1-9]\d{0,19}$/.test(request.vk.audioId)) return forAudio(api, request.vk.audioId, request.durationSec)
      const records = audioItems(await call(api, 'audio.search', { q: `${request.artist} ${request.title}`.slice(0, 360), count: '20', auto_complete: '0' }))
        .filter(item => normalize(item.artist) === normalize(request.artist) && normalize(item.title) === normalize(request.title)
          && (!request.durationSec || (typeof item.duration === 'number' && Math.abs(item.duration - request.durationSec) <= 4)))
        .sort((a, b) => Number(!!b.lyrics_id || !!b.is_lyrics) - Number(!!a.lyrics_id || !!a.is_lyrics))
      let plain: LyricsLookupResult | null = null
      for (const item of records.slice(0, 2)) {
        const audioId = `${item.owner_id}_${item.id}`
        if (!/^-?[1-9]\d{0,19}_[1-9]\d{0,19}$/.test(audioId)) continue
        const found = await forAudio(api, audioId, request.durationSec)
        if (found?.synced) return found
        plain ??= found
      }
      return plain
    })
    return result ? { source: 'vk', status: result.synced ? result.plainText ? 'both' : 'synced' : 'plain', result } : { source: 'vk', status: 'missing' }
  } catch (error) {
    if (error instanceof VkLyricsError && error.code === 5) return { source: 'vk', status: 'unavailable', message: 'Повторите вход в VK' }
    return { source: 'vk', status: 'error', message: 'VK не ответил. Попробуйте проверить ещё раз' }
  }
}
