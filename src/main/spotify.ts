import { createHash, randomBytes } from 'crypto'

/**
 * Spotify PKCE-флоу (V3-3). Пользователь создаёт бесплатное приложение в
 * Spotify Dashboard, вводит client_id в настройки; redirect URI приложения
 * ДОЛЖЕН содержать http://127.0.0.1:8888/callback (подсказываем в UI).
 * Код перехватываем из локального callback-сервера, обмениваем на токен.
 * Refresh-токен бессрочный — храним в connections.spotify.refreshToken.
 *
 * spPkce* — чистые функции (тестируются); spExchange/spRefresh/spImport* —
 * обёртки над fetch (DI через spRequester для тестов).
 */

export const SPOTIFY_REDIRECT = 'http://127.0.0.1:8888/callback'
export const SPOTIFY_SCOPES = 'playlist-read-private playlist-read-collaborative'

// --- PKCE-примитивы -----------------------------------------------------------

/** cryptographically random code_verifier (43–128 chars, base64url) */
export function spPkceVerifier(): string {
  return randomBytes(32).toString('base64url')
}

/** S256 challenge: base64url(sha256(verifier)) — без паддинга */
export function spPkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'utf8').digest('base64url')
}

/** URL окна авторизации Spotify (authorize endpoint + PKCE) */
export function spAuthUrl(clientId: string, challenge: string, state: string): string {
  const qs = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: SPOTIFY_REDIRECT,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SPOTIFY_SCOPES,
    state,
  })
  return `https://accounts.spotify.com/authorize?${qs.toString()}`
}

/** Матчит redirect: ?code=…&state=… — успех; ?error=… — отказ пользователя */
export function matchSpotifyCallback(url: string, state: string): { code: string } | null {
  if (!url.startsWith(SPOTIFY_REDIRECT)) return null
  const params = new URLSearchParams(url.split('?')[1] ?? '')
  if (params.get('error')) return null
  if (params.get('state') !== state) return null
  const code = params.get('code')
  return code ? { code } : null
}

// --- Транспорт (DI) ------------------------------------------------------------

export interface SpRequesterResponse {
  status: number
  json: () => Promise<unknown>
}

export type SpRequester = (url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) => Promise<SpRequesterResponse>

// --- Токены ---------------------------------------------------------------------

export interface SpTokens {
  accessToken: string
  refreshToken: string
}

/** Обмен authorization code на токены (POST accounts.spotify.com/api/token) */
export async function spExchangeWith(
  requester: SpRequester,
  clientId: string,
  code: string,
  verifier: string,
): Promise<SpTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: SPOTIFY_REDIRECT,
    client_id: clientId,
    code_verifier: verifier,
  })
  const res = await requester('https://accounts.spotify.com/api/token', {
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
    throw new Error(
      `Spotify: ${data.error_description ?? data.error ?? `HTTP ${res.status}`}`,
    )
  }
  return { accessToken: data.access_token, refreshToken: data.refresh_token ?? '' }
}

/** Refresh access-токена по бессрочному refresh-токену */
export async function spRefreshWith(
  requester: SpRequester,
  clientId: string,
  refreshToken: string,
): Promise<SpTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  })
  const res = await requester('https://accounts.spotify.com/api/token', {
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
    throw new Error(
      `Spotify: ${data.error_description ?? data.error ?? `HTTP ${res.status}`}`,
    )
  }
  return { accessToken: data.access_token, refreshToken: data.refresh_token ?? refreshToken }
}

// --- Импорт плейлистов -----------------------------------------------------------

export interface SpPlaylist {
  id: string
  name: string
  /** метаданные треков плейлиста (title/artist) для матчинга по библиотеке */
  tracks: Array<{ title: string; artist: string }>
}

interface SpApiPlaylist {
  id?: string
  name?: string
  tracks?: { total?: number }
}

interface SpApiPage {
  items?: Array<{
    track?: {
      id?: string
      name?: string
      artists?: Array<{ name?: string }>
    }
  }>
  next?: string | null
}

/** GET с Bearer; 429 → понятная ошибка (rate limit) */
async function spGet(requester: SpRequester, url: string, token: string): Promise<unknown> {
  const res = await requester(url, {
    headers: { authorization: `Bearer ${token}` },
  })
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
  if (res.status === 429) throw new Error('Spotify: слишком много запросов, попробуйте позже')
  if (res.status === 401) throw new Error('Spotify: сессия истекла — переподключите сервис')
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Spotify: ${data.error?.message ?? `HTTP ${res.status}`}`)
  }
  return data
}

/** Все плейлисты пользователя (v1/me/playlists, пагинация по 50) */
export async function spPlaylistsWith(requester: SpRequester, token: string): Promise<SpPlaylist[]> {
  const out: SpPlaylist[] = []
  let url: string | null = 'https://api.spotify.com/v1/me/playlists?limit=50'
  while (url) {
    const data = (await spGet(requester, url, token)) as { items?: SpApiPlaylist[]; next?: string | null }
    for (const p of data.items ?? []) {
      if (p.id && p.name) out.push({ id: p.id, name: p.name, tracks: [] })
    }
    url = data.next ?? null
  }
  return out
}

/** Треки одного плейлиста (v1/playlists/{id}/tracks, пагинация по 100) */
export async function spPlaylistTracksWith(
  requester: SpRequester,
  token: string,
  playlistId: string,
): Promise<Array<{ title: string; artist: string }>> {
  const out: Array<{ title: string; artist: string }> = []
  let url: string | null = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`
  while (url) {
    const data = (await spGet(requester, url, token)) as SpApiPage
    for (const item of data.items ?? []) {
      const t = item.track
      if (!t?.name) continue // локальные/удалённые треки
      out.push({
        title: t.name,
        artist: (t.artists ?? []).map((a) => a.name).filter(Boolean).join(', '),
      })
    }
    url = data.next ?? null
  }
  return out
}

// --- Реальные транспорты --------------------------------------------------------

const realRequester: SpRequester = (url, init) => fetch(url, init)

export function spExchange(clientId: string, code: string, verifier: string): Promise<SpTokens> {
  return spExchangeWith(realRequester, clientId, code, verifier)
}

export function spRefresh(clientId: string, refreshToken: string): Promise<SpTokens> {
  return spRefreshWith(realRequester, clientId, refreshToken)
}

export function spPlaylists(token: string): Promise<SpPlaylist[]> {
  return spPlaylistsWith(realRequester, token)
}

export function spPlaylistTracks(token: string, playlistId: string): Promise<Array<{ title: string; artist: string }>> {
  return spPlaylistTracksWith(realRequester, token, playlistId)
}
