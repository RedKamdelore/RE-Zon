import { ProxyAgent, request } from 'undici'
import { createHash } from 'crypto'

/**
 * Вызов Last.fm API из главного процесса.
 * Запросы идут из main (не из renderer), потому что Last.fm блокирует API
 * по региону/IP (HTTP 403, error 11) — через main можно пустить трафик
 * по HTTP-прокси (undici ProxyAgent), в отличие от renderer-fetch.
 *
 * lastfmApiWith принимает requester (DI для тестов), lastfmApi — обёртка
 * над реальным транспортом (fetch без прокси / undici через прокси).
 */

export interface LfmRequesterResponse {
  status: number
  json: () => Promise<unknown>
}

/** proxyUrl передаётся, только если он задан (непустой) */
export type LfmRequester = (url: string, proxyUrl?: string) => Promise<LfmRequesterResponse>

const API_BASE = 'https://ws.audioscrobbler.com/2.0/'

const REGION_BLOCK_MESSAGE =
  'Last.fm недоступен из вашего региона. Укажите прокси (http://host:port) в Настройки → Интеграции'

interface LfmErrorBody {
  error?: number
  message?: string
}

function isRegionBlock(status: number, body: LfmErrorBody): boolean {
  return status === 403 && body.error === 11
}

export async function lastfmApiWith(
  deps: { requester: LfmRequester },
  method: string,
  params: Record<string, string | number>,
  apiKey: string,
  proxyUrl?: string,
): Promise<unknown> {
  if (!apiKey) throw new Error('Last.fm: не задан API-ключ (Настройки → Интеграции)')
  const qs = new URLSearchParams({ method, api_key: apiKey, format: 'json' })
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v))
  // encodeURIComponent вручную: URLSearchParams кодирует пробел как '+',
  // а Last.fm historically получал от нас %20 (старое поведение renderer-fetch)
  const query = [...qs.entries()]
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
  const url = `${API_BASE}?${query}`
  let res: LfmRequesterResponse
  try {
    res = await deps.requester(url, proxyUrl || undefined)
  } catch (e) {
    throw new Error(`Last.fm: ошибка сети (${e instanceof Error ? e.message : String(e)})`)
  }
  const body = (await res.json().catch(() => ({}))) as LfmErrorBody
  if (isRegionBlock(res.status, body)) throw new Error(REGION_BLOCK_MESSAGE)
  if (res.status < 200 || res.status >= 300) throw new Error(`Last.fm: HTTP ${res.status}`)
  // Last.fm отвечает 200 даже на ошибки API — смотрим поле error
  if (typeof body.error === 'number') {
    throw new Error(body.message ? `Last.fm: ${body.message}` : `Last.fm: ошибка ${body.error}`)
  }
  return body
}

/** Реальный транспорт: без прокси — глобальный fetch, с прокси — undici ProxyAgent */
async function defaultRequester(url: string, proxyUrl?: string): Promise<LfmRequesterResponse> {
  if (proxyUrl) {
    const res = await request(url, { dispatcher: new ProxyAgent(proxyUrl) })
    return { status: res.statusCode, json: () => res.body.json() }
  }
  const res = await fetch(url)
  return { status: res.status, json: () => res.json() as Promise<unknown> }
}

export function lastfmApi(
  method: string,
  params: Record<string, string | number>,
  apiKey: string,
  proxyUrl?: string,
): Promise<unknown> {
  return lastfmApiWith({ requester: defaultRequester }, method, params, apiKey, proxyUrl)
}

// --- Скробблинг и сессия (V3-3/V3-4) -----------------------------------------

/**
 * Подпись Last.fm (auth.getSession, track.scrobble и др.): md5 от
 * отсортированных по ключу params + shared secret. param signature
 * в саму подпись не входит.
 */
export function lfmSignature(
  params: Record<string, string | number>,
  secret: string,
): string {
  const keys = Object.keys(params).filter((k) => k !== 'format' && k !== 'signature').sort()
  const raw = keys.map((k) => `${k}${params[k]}`).join('') + secret
  return createHash('md5').update(raw, 'utf8').digest('hex')
}

export interface LfmScrobblerRequester {
  /** POST application/x-www-form-urlencoded; body — уже подписанные поля */
  post: (url: string, body: string, proxyUrl?: string) => Promise<{ status: number; json: () => Promise<unknown> }>
}

export interface ScrobblePayload {
  artist: string
  track: string
  album?: string
  /** unix-когда трек ЗАКОНЧИЛ играть (Last.fm требует timestamp) */
  timestamp: number
}

/** Скроббл-ответ Last.fm: игнорируем scrobbles-объект, ловим error */
interface LfmScrobbleResponse {
  scrobbles?: { scrobble?: { ignoredMessage?: { code?: number; '#text'?: string } } }
  error?: number
  message?: string
}

function lfmPostBody(params: Record<string, string | number>, apiKey: string, secret: string, sk: string): string {
  const signed: Record<string, string | number> = { ...params, api_key: apiKey, sk, format: 'json' }
  signed.signature = lfmSignature(signed, secret)
  return [...Object.entries(signed)].map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')
}

/**
 * track.scrobble (обёртка над POST). DI-вариант lfmScrobbleWith — для тестов.
 * Возвращает количество успешно зачисленных скробблов или бросает ошибку.
 */
export async function lfmScrobbleWith(
  deps: { requester: LfmScrobblerRequester },
  apiKey: string,
  secret: string,
  sessionKey: string,
  proxyUrl: string,
  scrobbles: ScrobblePayload[],
): Promise<number> {
  if (!apiKey || !secret) throw new Error('Last.fm: задайте API key и shared secret в настройках')
  if (!sessionKey) throw new Error('Last.fm: не подключено (нет сессии)')
  if (scrobbles.length === 0) return 0
  // множественный скроббл: track/artist/album/timestamp получают индекс-суффикс
  const params: Record<string, string | number> = { method: 'track.scrobble' }
  scrobbles.slice(0, 50).forEach((s, i) => {
    params[`artist[${i}]`] = s.artist
    params[`track[${i}]`] = s.track
    if (s.album) params[`album[${i}]`] = s.album
    params[`timestamp[${i}]`] = s.timestamp
  })
  const res = await deps.requester.post(
    'https://ws.audioscrobbler.com/2.0/',
    lfmPostBody(params, apiKey, secret, sessionKey),
    proxyUrl || undefined,
  )
  const body = (await res.json().catch(() => ({}))) as LfmScrobbleResponse
  if (isRegionBlock(res.status, body)) throw new Error(REGION_BLOCK_MESSAGE)
  if (typeof body.error === 'number') {
    throw new Error(body.message ? `Last.fm: ${body.message}` : `Last.fm: ошибка ${body.error}`)
  }
  return scrobbles.length
}

/** auth.getSession: token (из окна авторизации) → бессрочная сессия sk+username */
export async function lfmGetSessionWith(
  deps: { requester: LfmRequester },
  apiKey: string,
  secret: string,
  token: string,
  proxyUrl?: string,
): Promise<{ key: string; username: string }> {
  if (!apiKey || !secret) throw new Error('Last.fm: задайте API key и shared secret в настройках')
  const params: Record<string, string | number> = { method: 'auth.getSession', token }
  const signature = lfmSignature({ ...params, api_key: apiKey }, secret)
  const qs =
    `?method=auth.getSession&token=${encodeURIComponent(token)}` +
    `&api_key=${encodeURIComponent(apiKey)}&format=json&signature=${signature}`
  const res = await deps.requester(`https://ws.audioscrobbler.com/2.0/${qs}`, proxyUrl)
  const body = (await res.json().catch(() => ({}))) as {
    session?: { key?: string; name?: string }
    error?: number
    message?: string
  }
  if (isRegionBlock(res.status, body)) throw new Error(REGION_BLOCK_MESSAGE)
  if (typeof body.error === 'number') {
    throw new Error(body.message ? `Last.fm: ${body.message}` : `Last.fm: ошибка ${body.error}`)
  }
  const key = body.session?.key
  if (!key) throw new Error('Last.fm: сессия не выдана (проверьте shared secret)')
  return { key, username: body.session?.name ?? '' }
}

/** URL окна авторизации Last.fm: пользователь логинится → отдаёт token в URL */
export function lfmAuthUrl(apiKey: string): string {
  return `https://www.last.fm/api/auth?api_key=${encodeURIComponent(apiKey)}`
}

/**
 * Матчит redirect после входа: last.fm возвращает http://www.last.fm/api/auth/?token=…
 * (callback не задан — падаем на дефолтную страницу с токеном в query).
 */
export function matchLfmAuthUrl(url: string): string | null {
  if (!url.startsWith('http://www.last.fm/api/auth/') && !url.startsWith('https://www.last.fm/api/auth/')) {
    return null
  }
  const token = new URLSearchParams(url.split('?')[1] ?? '').get('token')
  return token ?? null
}

// --- Реальные транспорты для скробблинга/сессии ------------------------------

const realScrobbler: LfmScrobblerRequester = {
  post: async (url, body, proxyUrl) => {
    if (proxyUrl) {
      const res = await request(url, {
        method: 'POST',
        dispatcher: new ProxyAgent(proxyUrl),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      })
      return { status: res.statusCode, json: () => res.body.json() }
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    })
    return { status: res.status, json: () => res.json() as Promise<unknown> }
  },
}

export function lfmScrobble(
  apiKey: string,
  secret: string,
  sessionKey: string,
  proxyUrl: string,
  scrobbles: ScrobblePayload[],
): Promise<number> {
  return lfmScrobbleWith({ requester: realScrobbler }, apiKey, secret, sessionKey, proxyUrl, scrobbles)
}

export async function lfmGetSession(
  apiKey: string,
  secret: string,
  token: string,
  proxyUrl?: string,
): Promise<{ key: string; username: string }> {
  return lfmGetSessionWith({ requester: defaultRequester }, apiKey, secret, token, proxyUrl)
}
