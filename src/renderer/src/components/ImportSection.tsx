import { useState, type ReactNode } from 'react'
import type { Track } from '@shared/types'
import { useLibraryStore } from '../stores/libraryStore'
import { usePlaylistStore, getPersistedBase, persistPatch } from '../stores/playlistStore'
import { useNavStore } from '../stores/navStore'
import { plural } from '../utils/plural'

/**
 * Секция «Импорт» в настройках. Карточка на провайдера: имя, статус,
 * action-кнопка. Готова к metadata-only провайдерам (см. shared/matching).
 */
export default function ImportSection() {
  return (
    <section className="settings-section">
      <h2>Импорт</h2>
      <VkCard />
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

/** «VK: Мои аудио», при коллизии — «VK: Мои аудио (N)», наименьший свободный N */
function nextVkPlaylistName(existing: string[]): string {
  const base = 'VK: Мои аудио'
  if (!existing.includes(base)) return base
  let n = 2
  while (existing.includes(`${base} (${n})`)) n++
  return `${base} (${n})`
}

function VkCard() {
  const [token, setToken] = useState<string>(() => {
    const sources = getPersistedBase()?.importSources as { vkToken?: string } | undefined
    return sources?.vkToken ?? ''
  })
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onTokenChange = (value: string): void => {
    setToken(value)
    const base = getPersistedBase()
    persistPatch({ importSources: { ...(base?.importSources ?? {}), vkToken: value } })
  }

  const doImport = async (): Promise<void> => {
    if (!window.api || busy) return
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const res = await window.api.vkImport(token.trim())
      if (!res.ok) {
        setError(res.error)
        return
      }
      const playable = res.tracks.filter((t) => t.streamUrl)
      const skipped = res.tracks.length - playable.length
      if (playable.length === 0) {
        setStatus(
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
      const pl = usePlaylistStore.getState()
      const name = nextVkPlaylistName(pl.playlists.map((p) => p.name))
      const playlistId = pl.create(name)
      for (const t of tracks) pl.addTrack(playlistId, t.id)
      setStatus(
        skipped > 0
          ? `Импортировано ${tracks.length} ${plural(tracks.length, 'трек', 'трека', 'треков')}, ${skipped} без аудиопотока пропущено`
          : `Импортировано ${tracks.length} ${plural(tracks.length, 'трек', 'трека', 'треков')}`,
      )
      useNavStore.getState().setView({ name: 'playlist', id: playlistId })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ProviderCard name="ВКонтакте">
      <div className="settings-label">Токен доступа (vkhost.github.io)</div>
      <input
        type="password"
        className="settings-input"
        placeholder="Введите токен VK"
        value={token}
        onChange={(e) => onTokenChange(e.target.value)}
      />
      <div className="import-actions">
        <button
          className="btn-outline"
          disabled={busy || token.trim() === ''}
          onClick={() => void doImport()}
        >
          {busy ? 'Импорт…' : 'Импортировать из VK'}
        </button>
      </div>
      {error && <div className="import-status import-error">{error}</div>}
      {status && <div className="import-status">{status}</div>}
    </ProviderCard>
  )
}
