import { ProxyAgent, request } from 'undici'

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
