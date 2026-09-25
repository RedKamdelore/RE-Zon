/**
 * Яндекс Музыка (V3-3e): вход через OAuth Яндекса (модель музыкального
 * устройства — как в open-source клиентах), обмен кода на OAuth-токен,
 * импорт «Мне нравится» через api.music.yandex.net. Стриминг не трогаем:
 * треки матчатся с локальной библиотекой по названию (metadata-only).
 *
 * yaExchangeWith/yaLikesWith принимают requester (DI для тестов),
 * обёртки yaExchange/yaLikes — fetch.
 */

export const YANDEX_CLIENT_ID = '23beb041b31c4b32b5bcd12fb585764e'
export const YANDEX_DEVICE_NAME = 'Re:Zon'

export function yaAuthUrl(): string {
  // Встроенный клиент больше не принимается Яндексом (HTTP 400 unknown client_id).
  // Не отправляем пользователя вводить телефон в заведомо неработающий OAuth flow.
  throw new Error('Подключение Яндекс Музыки пока недоступно: Яндекс отклонил встроенный Client ID ReZon. Нужен действующий OAuth-клиент с доступом к музыке. Это ошибка интеграции, а не вашего аккаунта.')
}

/**
 * Матчит redirect после входа: oauth.yandex.ru/verification_code?code=…
 * (Яндекс показывает код на странице подтверждения — но для device-флоу
 * redirect приходит на /verification_code с code в query).
 */
export function matchYaAuthUrl(url: string): string | null {
  let parsed: URL
  try { parsed = new URL(url) } catch { return null }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'oauth.yandex.ru' || !['/verification_code', '/auth'].includes(parsed.pathname)) return null
  const code = parsed.searchParams.get('code')
  return code ?? null
}

// --- Транспорт ------------------------------------------------------------------

export interface YaRequesterResponse {
  status: number
  json: () => Promise<unknown>
}

export type YaRequester = (url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) => Promise<YaRequesterResponse>

/** Обмен authorization code на OAuth-токен (POST oauth.yandex.ru/token) */
export async function yaExchangeWith(
  requester: YaRequester,
  code: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: YANDEX_CLIENT_ID,
    device_id: 'rezon',
    device_name: YANDEX_DEVICE_NAME,
  })
  const res = await requester('https://oauth.yandex.ru/token', {
    method: 'POST',
    body: body.toString(),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  })
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string
    refresh_token?: string
    error?: string
    error_description?: string
  }
  if (!data.access_token) {
    throw new Error(`Яндекс: ${data.error_description ?? data.error ?? `HTTP ${res.status}`}`)
  }
  return { accessToken: data.access_token, refreshToken: data.refresh_token ?? '' }
}

/** Обновление протухшего access-токена по refresh-токену */
export async function yaRefreshWith(
  requester: YaRequester,
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: YANDEX_CLIENT_ID,
    device_id: 'rezon',
    device_name: YANDEX_DEVICE_NAME,
  })
  const res = await requester('https://oauth.yandex.ru/token', {
    method: 'POST',
    body: body.toString(),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  })
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string
    refresh_token?: string
    error?: string
    error_description?: string
  }
  if (!data.access_token) {
    throw new Error(`Яндекс: ${data.error_description ?? data.error ?? `HTTP ${res.status}`}`)
  }
  return { accessToken: data.access_token, refreshToken: data.refresh_token ?? refreshToken }
}

// --- «Мне нравится» ---------------------------------------------------------------

export interface YaLikeTrack {
  title: string
  artist: string
}

interface YaApiTrack {
  title?: string
  artists?: Array<{ name?: string }>
}

interface YaApiPage {
  library?: { tracks?: Array<{ track?: YaApiTrack }> }
  error?: string
  error_description?: string
}

/**
 * Лайки пользователя (GET api.music.yandex.net/2.1/landing/liketracks,
 * пагинация не нужна — отдаёт всё разом). Заголовок Authorization: OAuthToken.
 */
export async function yaLikesWith(
  requester: YaRequester,
  accessToken: string,
): Promise<YaLikeTrack[]> {
  const res = await requester('https://api.music.yandex.net/2.1/landing/liketracks', {
    headers: { authorization: `OAuth ${accessToken}` },
  })
  const data = (await res.json().catch(() => ({}))) as YaApiPage
  if (res.status === 401) throw new Error('Яндекс: сессия истекла — переподключите сервис')
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Яндекс: ${data.error_description ?? data.error ?? `HTTP ${res.status}`}`)
  }
  if (!Array.isArray(data.library?.tracks)) throw new Error('Яндекс: неизвестный формат списка лайков — импорт не изменён')
  const items = data.library.tracks
  return items
    .map((i) => ({
      title: i.track?.title ?? '',
      artist: (i.track?.artists ?? []).map((a) => a.name).filter(Boolean).join(', '),
    }))
    .filter((t) => t.title !== '' || t.artist !== '')
}

// --- Реальные транспорты ------------------------------------------------------------

const realRequester: YaRequester = (url, init) => fetch(url, init)

export function yaExchange(code: string): Promise<{ accessToken: string; refreshToken: string }> {
  return yaExchangeWith(realRequester, code)
}

export function yaRefresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  return yaRefreshWith(realRequester, refreshToken)
}

export function yaLikes(accessToken: string): Promise<YaLikeTrack[]> {
  return yaLikesWith(realRequester, accessToken)
}
