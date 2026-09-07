/**
 * Модель подключений внешних сервисов (VK, Last.fm, Spotify, Яндекс Музыка).
 * Чистый модуль: типы, дефолты, миграции importSources → connections.
 * Токены живут ТОЛЬКО в persistedData.connections (player-data.json) и
 * передаются в renderer как флаги isConnected — сам токен не утекает в UI.
 */

export type ServiceId = 'vk' | 'lastfm' | 'spotify' | 'yandex'

/** Подключение: токен/сессия + метаданные для реимпорта и скробблинга */
export interface ServiceConnection {
  /** Токен доступа (VK — access_token, Last.fm — session key, Spotify — refresh token) */
  token: string
  /** Когда выдан (ms epoch) — VK-токены живут ~24ч, показываем возраст */
  connectedAt: number
  /** VK: id пользователя (число строкой), для Last.fm — имя пользователя */
  userId?: string
  /** Spotify: refresh token (живёт вечно до отзыва) */
  refreshToken?: string
  /** Имя плейлиста, созданного последним импортом — реимпорт обновляет его, а не создаёт копию */
  playlistName?: string
}

export type Connections = Partial<Record<ServiceId, ServiceConnection>>

/** UI-вью этой модели: подключен ли сервис (без раскрытия токена) */
export function connectionStatus(
  conns: Connections,
  id: ServiceId,
): { connected: boolean; connectedAt?: number; userId?: string; playlistName?: string } {
  const c = conns[id]
  if (!c || !c.token) return { connected: false }
  return { connected: true, connectedAt: c.connectedAt, userId: c.userId, playlistName: c.playlistName }
}

/** VK-токен живёт ~24 ч (expires_in 86400); считаем протухшим через 24 ч */
export function isVkTokenExpired(c: ServiceConnection, now = Date.now()): boolean {
  return now - c.connectedAt > 24 * 3600 * 1000
}

/**
 * Миграция старых importSources (V3-1 формат) → connections.
 * VK-токен сохранялся как { vkToken: string } — переносим, connectedAt неизвестен (0).
 */
export function migrateImportSources(
  importSources: Record<string, unknown>,
): Connections {
  const conns: Connections = {}
  const vkToken = (importSources as { vkToken?: string }).vkToken
  if (typeof vkToken === 'string' && vkToken.length > 0) {
    conns.vk = { token: vkToken, connectedAt: 0 }
  }
  return conns
}

/** OAuth-константы VK (окно авторизации). Kate Mobile — как в плане v3 */
export const VK_CLIENT_ID = 2685278
/** scope 1073737727 = audio + offline + базовые (как у vkhost по умолчанию) */
export const VK_SCOPE = 1073737727
export const VK_REDIRECT = 'https://oauth.vk.com/blank.html'
