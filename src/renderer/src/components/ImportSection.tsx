import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { Track } from '@shared/types'
import type { ServiceId } from '@shared/connections'
import { useLibraryStore } from '../stores/libraryStore'
import { usePlaylistStore, getPersistedBase, persistPatch } from '../stores/playlistStore'
import { useConnectionsStore, describeWhen, type ConnectionView } from '../stores/connectionsStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useNavStore } from '../stores/navStore'
import { plural } from '../utils/plural'

/**
 * Секция «Импорт» в настройках. Карточка на провайдера: имя, статус
 * «Подключено ✅ / Не подключено», кнопки Подключить / Импортировать /
 * Обновить / Отключить. Подключение = OAuth-окно, токен ловится сам.
 */
export default function ImportSection() {
  return (
    <section className="settings-section">
      <h2>Импорт</h2>
      <VkCard />
      <LastfmCard />
      <ScCard />
    </section>
  )
}

function ProviderCard({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="import-card">
      <div className="import-card-name">{name}</div>
      {children}
    </div>
  )
}

/** Бейдж статуса подключения + когда подключено */
function StatusLine({ status }: { status?: ConnectionView }) {
  return (
    <div className={status?.connected ? 'import-status import-ok' : 'import-status'}>
      {status?.connected
        ? `Подключено ✅ (${describeWhen(status.connectedAt)}${status.userId ? ` — ${status.userId}` : ''})`
        : 'Не подключено'}
    </div>
  )
}

/** «VK: Мои аудио», при коллизии — «VK: Мои аудио (N)», наименьший свободный N */
function nextVkPlaylistName(existing: string[]): string {
  const base = 'VK: Мои аудио'
  if (!existing.includes(base)) return base
  let n = 2
  while (existing.includes(`${base} (${n})`)) n++
  return `${base} (${n})`
}

/** «SoundCloud: <query>», при коллизии — «… (N)», наименьший свободный N */
function nextScPlaylistName(existing: string[], query: string): string {
  const base = `SoundCloud: ${query}`
  if (!existing.includes(base)) return base
  let n = 2
  while (existing.includes(`${base} (${n})`)) n++
  return `${base} (${n})`
}

/**
 * Реимпорт: обновляет существующий плейлист сервиса (по playlistName из
 * connection), создавая новый только при первом импорте. Возвращает имя
 * плейлиста (для сохранения в connection).
 */
function upsertServicePlaylist(id: ServiceId, tracks: Track[], fallbackName: () => string): string {
  const pl = usePlaylistStore.getState()
  const status = useConnectionsStore.getState().statuses[id]
  const existingName = status?.playlistName
  const target = existingName ? pl.playlists.find((p) => p.name === existingName) : undefined
  if (target) {
    // Обновляем существующий плейлист: полная замена trackIds
    usePlaylistStore.setState({
      playlists: pl.playlists.map((p) =>
        p.id === target.id ? { ...p, trackIds: tracks.map((t) => t.id) } : p,
      ),
    })
    persistPatch({ playlists: usePlaylistStore.getState().playlists })
    return target.name
  }
  const name = fallbackName()
  const playlistId = pl.create(name)
  for (const t of tracks) pl.addTrack(playlistId, t.id)
  return name
}

function VkCard() {
  const status = useConnectionsStore((s) => s.statuses.vk)
  const [busy, setBusy] = useState<string | null>(null) // 'connect' | 'import'
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Ручной токен остаётся как fallback (раскрывается по ссылке)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualToken, setManualToken] = useState<string>(() => {
    const sources = getPersistedBase()?.importSources as { vkToken?: string } | undefined
    return sources?.vkToken ?? ''
  })

  useEffect(() => {
    setError(null)
    setStatusMsg(null)
  }, [status?.connected])

  const connect = async (): Promise<void> => {
    if (!window.api || busy) return
    setBusy('connect')
    setError(null)
    setStatusMsg(null)
    try {
      const res = await window.api.connectVk()
      if (!res.ok) {
        setError(res.error ?? 'Не удалось подключить VK')
        return
      }
      await useConnectionsStore.getState().refresh()
      setStatusMsg('VK подключён — можно импортировать аудио')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const disconnect = async (): Promise<void> => {
    if (!window.api || busy) return
    await useConnectionsStore.getState().disconnect('vk')
    setStatusMsg('VK отключён')
  }

  const doImport = async (): Promise<void> => {
    if (!window.api || busy !== null || !status?.connected) return
    setBusy('import')
    setError(null)
    setStatusMsg(null)
    try {
      // Токен живёт в persisted base (connections.vk) — не в renderer-сторе
      const token = getPersistedBase()?.connections?.vk?.token
      if (!token) {
        setError('Токен VK не найден — подключите заново')
        return
      }
      const res = await window.api.vkImport(token)
      if (!res.ok) {
        setError(res.error)
        return
      }
      const playable = res.tracks.filter((t) => t.streamUrl)
      const skipped = res.tracks.length - playable.length
      if (playable.length === 0) {
        setStatusMsg(
          res.tracks.length === 0
            ? 'В VK не найдено аудиозаписей'
            : `Найдено ${res.tracks.length} ${plural(res.tracks.length, 'трек', 'трека', 'треков')}, но ни у одного нет аудиопотока`,
        )
        return
      }
      const tracks: Track[] = playable.map((t, i) => ({
        id: `vk:${t.extId ?? i}`,
        sourceId: 'vk',
        title: t.title,
        artist: t.artist,
        album: t.album ?? 'VK',
        durationSec: t.durationSec ?? 0,
        filePath: t.streamUrl!,
      }))
      useLibraryStore.getState().addTracks(tracks)
      const name = upsertServicePlaylist('vk', tracks, () =>
        nextVkPlaylistName(usePlaylistStore.getState().playlists.map((p) => p.name)),
      )
      void window.api.connectionsSetPlaylistName('vk', name)
      void useConnectionsStore.getState().refresh()
      const playlistId = usePlaylistStore.getState().playlists.find((p) => p.name === name)?.id
      if (playlistId) useNavStore.getState().setView({ name: 'playlist', id: playlistId })
      setStatusMsg(
        `Обновлено «${name}»: ${tracks.length} ${plural(tracks.length, 'трек', 'трека', 'треков')}` +
          (skipped > 0 ? `, ${skipped} без потока пропущено` : ''),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const onManualTokenChange = (value: string): void => {
    setManualToken(value)
    const base = getPersistedBase()
    persistPatch({ importSources: { ...(base?.importSources ?? {}), vkToken: value } })
  }

  /** Ручной токен из старого поля тоже становится подключением */
  const applyManualToken = async (): Promise<void> => {
    if (!window.api || busy !== null || manualToken.trim() === '') return
    setBusy('connect')
    try {
      const view = await window.api.connectionsSave('vk', { token: manualToken.trim() })
      useConnectionsStore.getState().applyConnected('vk', view)
      setStatusMsg('Токен сохранён')
    } finally {
      setBusy(null)
    }
  }

  return (
    <ProviderCard name="ВКонтакте">
      <StatusLine status={status} />
      <div className="import-actions">
        {status?.connected ? (
          <>
            <button className="btn-outline" disabled={busy !== null} onClick={() => void doImport()}>
              {busy === 'import'
                ? 'Импорт…'
                : status.playlistName
                  ? 'Обновить плейлист'
                  : 'Импортировать аудио'}
            </button>
            <button className="btn-outline" disabled={busy !== null} onClick={() => void disconnect()}>
              Отключить
            </button>
          </>
        ) : (
          <button className="btn-outline" disabled={busy !== null} onClick={() => void connect()}>
            {busy === 'connect' ? 'Ожидание входа…' : 'Подключить VK'}
          </button>
        )}
      </div>
      <p className="muted import-note">
        Вход через аккаунт VK. Доступ к аудио даёт только неофициальное приложение
        (Kate Mobile) — небольшой риск блокировки аккаунта. Токен живёт ~24 часа.
      </p>
      <div className="import-fallback">
        <button className="link-btn" onClick={() => setManualOpen((v) => !v)}>
          {manualOpen ? 'Скрыть ручной ввод токена' : 'Ввести токен вручную'}
        </button>
        {manualOpen && (
          <>
            <input
              type="password"
              className="settings-input"
              placeholder="Токен (vkhost.github.io)"
              value={manualToken}
              onChange={(e) => onManualTokenChange(e.target.value)}
            />
            <div className="import-actions">
              <button
                className="btn-outline"
                disabled={busy !== null || manualToken.trim() === ''}
                onClick={() => void applyManualToken()}
              >
                Сохранить токен
              </button>
            </div>
          </>
        )}
      </div>
      {error && <div className="import-status import-error">{error}</div>}
      {statusMsg && <div className="import-status">{statusMsg}</div>}
    </ProviderCard>
  )
}

function LastfmCard() {
  const status = useConnectionsStore((s) => s.statuses.lastfm)
  const apiKey = useSettingsStore((s) => s.lastfmApiKey)
  const apiSecret = useSettingsStore((s) => s.lastfmApiSecret)
  const proxy = useSettingsStore((s) => s.lastfmProxy)
  const setApiKey = useSettingsStore((s) => s.setLastfmKey)
  const setApiSecret = useSettingsStore((s) => s.setLastfmSecret)
  const setProxy = useSettingsStore((s) => s.setLastfmProxy)
  const [busy, setBusy] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Локальная правка полей (не debounce-спамить persist на каждый символ):
  // вводим локально, коммитим в settingsStore по blur/Enter
  const [key, setKey] = useState(apiKey)
  const [secret, setSecret] = useState(apiSecret)
  useEffect(() => {
    setKey(apiKey)
  }, [apiKey])
  useEffect(() => {
    setSecret(apiSecret)
  }, [apiSecret])

  const commitKey = useCallback((v: string) => setKey(v), [])
  const commitSecret = useCallback((v: string) => setSecret(v), [])

  const connect = async (): Promise<void> => {
    if (!window.api || busy) return
    // Сначала фиксируем свежевведённые ключи, потом открываем окно
    setApiKey(key.trim())
    setApiSecret(secret.trim())
    setBusy(true)
    setError(null)
    setStatusMsg(null)
    try {
      const res = await window.api.connectLastfm()
      if (!res.ok) {
        setError(res.error ?? 'Не удалось подключить Last.fm')
        return
      }
      await useConnectionsStore.getState().refresh()
      setStatusMsg(`Подключено как ${res.username ?? 'пользователь'} — скробблинг активен`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async (): Promise<void> => {
    if (!window.api || busy) return
    await useConnectionsStore.getState().disconnect('lastfm')
    setStatusMsg('Last.fm отключён')
  }

  return (
    <ProviderCard name="Last.fm">
      <StatusLine status={status} />
      <div className="settings-label">
        API key <span className="muted">(last.fm/api — бесплатно)</span>
      </div>
      <input
        type="password"
        className="settings-input"
        placeholder="32-символьный ключ"
        value={key}
        onChange={(e) => commitKey(e.target.value)}
        onBlur={() => setApiKey(key.trim())}
      />
      <div className="settings-label">
        Shared secret <span className="muted">(для скробблинга и сессии)</span>
      </div>
      <input
        type="password"
        className="settings-input"
        placeholder="Общий секрет приложения"
        value={secret}
        onChange={(e) => commitSecret(e.target.value)}
        onBlur={() => setApiSecret(secret.trim())}
      />
      <div className="settings-label">Прокси (опционально, http://host:port)</div>
      <input
        type="text"
        className="settings-input"
        placeholder="http://127.0.0.1:8080"
        value={proxy}
        onChange={(e) => setProxy(e.target.value)}
      />
      <p className="muted import-note">
        {status?.connected
          ? 'Скробблинг: прослушанные треки уходят в профиль Last.fm автоматически.'
          : 'Для рекомендаций достаточно API key. Скробблинг требует key + secret + подключение.'}
        {proxy === '' && ' Last.fm блокирует API по региону — при ошибке 403 укажите прокси.'}
      </p>
      <div className="import-actions">
        {status?.connected ? (
          <button className="btn-outline" disabled={busy} onClick={() => void disconnect()}>
            Отключить
          </button>
        ) : (
          <button
            className="btn-outline"
            disabled={busy || key.trim() === '' || secret.trim() === ''}
            onClick={() => void connect()}
          >
            {busy ? 'Ожидание входа…' : 'Подключить Last.fm'}
          </button>
        )}
      </div>
      {error && <div className="import-status import-error">{error}</div>}
      {statusMsg && <div className="import-status">{statusMsg}</div>}
    </ProviderCard>
  )
}

// --- SoundCloud (поиск без логина) -------------------------------------------

function ScCard() {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const doImport = async (): Promise<void> => {
    const q = query.trim()
    if (!window.api || busy || q === '') return
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const res = await window.api.scSearch(q)
      if (!res.ok) {
        setError(res.error)
        return
      }
      const playable = res.tracks.filter((t) => t.streamUrl)
      if (playable.length === 0) {
        setStatus(
          res.tracks.length === 0
            ? 'По запросу ничего не найдено'
            : 'Найденные треки недоступны для стриминга',
        )
        return
      }
      // filePath — transcoding API URL: финальный поток резолвится при старте
      // воспроизведения (playerStore → scResolveStream)
      const tracks: Track[] = playable.map((t, i) => ({
        id: `sc:${t.extId ?? i}`,
        sourceId: 'soundcloud',
        title: t.title,
        artist: t.artist,
        album: 'SoundCloud',
        durationSec: t.durationSec ?? 0,
        filePath: t.streamUrl!,
      }))
      useLibraryStore.getState().addTracks(tracks)
      const pl = usePlaylistStore.getState()
      const name = nextScPlaylistName(pl.playlists.map((p) => p.name), q)
      const playlistId = pl.create(name)
      for (const t of tracks) pl.addTrack(playlistId, t.id)
      setStatus(`Импортировано ${tracks.length} ${plural(tracks.length, 'трек', 'трека', 'треков')}`)
      useNavStore.getState().setView({ name: 'playlist', id: playlistId })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ProviderCard name="SoundCloud">
      <div className="settings-label">Поиск по публичному каталогу (без токена)</div>
      <input
        type="text"
        className="settings-input"
        placeholder="Например: lofi"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void doImport()
        }}
      />
      <div className="import-actions">
        <button
          className="btn-outline"
          disabled={busy || query.trim() === ''}
          onClick={() => void doImport()}
        >
          {busy ? 'Импорт…' : 'Импортировать топ-50 как плейлист'}
        </button>
      </div>
      {error && <div className="import-status import-error">{error}</div>}
      {status && <div className="import-status">{status}</div>}
    </ProviderCard>
  )
}
