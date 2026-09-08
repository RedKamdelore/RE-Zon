import { useConnectionsStore } from './stores/connectionsStore'
import { useLibraryStore } from './stores/libraryStore'
import { usePlaylistStore, persistPatch } from './stores/playlistStore'
import type { Track } from '@shared/types'

/**
 * Автообновление VK-плейлиста при старте приложения (V3-3b):
 * если VK подключён — тихо подтягиваем свежие аудиозаписи и обновляем
 * протухшие stream-url у существующих треков. Ошибки только в консоль:
 * это фоновая забота, пользователь не должен видеть алертов.
 *
 * vkAutoRefreshPure — чистая функция для тестов (принимает зависимости).
 */
export interface VkAutoRefreshDeps {
  isVkConnected: () => boolean
  vkImport: () => Promise<{ ok: true; tracks: Array<{ title: string; artist: string; album?: string; durationSec?: number; streamUrl?: string; extId?: string }> } | { ok: false; error: string }>
  upsertTracks: (tracks: Track[]) => [number, number]
  refreshPlaylist: (tracks: Track[]) => void
}

export async function vkAutoRefreshPure(deps: VkAutoRefreshDeps): Promise<void> {
  if (!deps.isVkConnected()) return
  let res: Awaited<ReturnType<VkAutoRefreshDeps['vkImport']>>
  try {
    res = await deps.vkImport()
  } catch (e) {
    console.warn('VK auto-refresh failed:', e)
    return
  }
  if (!res.ok) {
    console.warn('VK auto-refresh failed:', res.error)
    return
  }
  const tracks: Track[] = res.tracks
    .filter((t) => t.streamUrl)
    .map((t) => ({
      id: `vk:${t.extId ?? t.title}`,
      sourceId: 'vk',
      title: t.title,
      artist: t.artist,
      album: t.album ?? 'VK',
      durationSec: t.durationSec ?? 0,
      filePath: t.streamUrl!,
    }))
  if (tracks.length === 0) return
  const [updated, added] = deps.upsertTracks(tracks)
  deps.refreshPlaylist(tracks)
  if (updated > 0 || added > 0) {
    console.info(`VK auto-refresh: ${updated} updated, ${added} new`)
  }
}

/** Обновляет плейлист VK (по connections.vk.playlistName) без переходов UI */
export function refreshVkPlaylistQuiet(tracks: Track[]): void {
  const status = useConnectionsStore.getState().statuses.vk
  const name = status?.playlistName
  if (!name) return
  const pl = usePlaylistStore.getState()
  const target = pl.playlists.find((p) => p.name === name)
  if (!target) return
  usePlaylistStore.setState({
    playlists: pl.playlists.map((p) =>
      p.id === target.id ? { ...p, trackIds: tracks.map((t) => t.id) } : p,
    ),
  })
  persistPatch({ playlists: usePlaylistStore.getState().playlists })
}

/** Точка входа из App: автообновление при старте */
export async function vkAutoRefresh(): Promise<void> {
  if (typeof window === 'undefined' || !window.api) return
  await vkAutoRefreshPure({
    isVkConnected: () => useConnectionsStore.getState().statuses.vk?.connected === true,
    vkImport: () => window.api.vkImport(),
    upsertTracks: (tracks) => useLibraryStore.getState().upsertTracks(tracks),
    refreshPlaylist: refreshVkPlaylistQuiet,
  })
}
