import { describe, it, expect, vi } from 'vitest'
import { vkAutoRefreshPure, type VkAutoRefreshDeps } from './vkAutoRefresh'
import type { Track } from '@shared/types'

function makeDeps(over: Partial<VkAutoRefreshDeps> = {}): {
  deps: VkAutoRefreshDeps
  upsert: ReturnType<typeof vi.fn>
  refresh: ReturnType<typeof vi.fn>
  vkImport: ReturnType<typeof vi.fn>
} {
  const upsert = vi.fn(() => [2, 3] as [number, number])
  const refresh = vi.fn()
  const vkImport = vi.fn().mockResolvedValue({
    ok: true as const,
    tracks: [
      { title: 'A', artist: 'X', extId: '1_1', streamUrl: 'https://a.mp3', durationSec: 10 },
      { title: 'B', artist: 'Y', extId: '1_2', streamUrl: 'https://b.mp3' },
      { title: 'no-url', artist: 'Z', extId: '1_3' }, // без потока — пропуск
    ],
  })
  const deps: VkAutoRefreshDeps = {
    isVkConnected: () => true,
    vkImport,
    upsertTracks: upsert,
    refreshPlaylist: refresh,
    ...over,
  }
  return { deps, upsert, refresh, vkImport }
}

describe('vkAutoRefreshPure', () => {
  it('does nothing when VK is not connected', async () => {
    const { deps, vkImport } = makeDeps({ isVkConnected: () => false })
    await vkAutoRefreshPure(deps)
    expect(vkImport).not.toHaveBeenCalled()
  })

  it('imports, skips streamless tracks, upserts and refreshes playlist', async () => {
    const { deps, upsert, refresh } = makeDeps()
    await vkAutoRefreshPure(deps)
    const tracks = upsert.mock.calls[0][0] as Track[]
    expect(tracks).toHaveLength(2) // no-url пропущен
    expect(tracks[0]).toMatchObject({ id: 'vk:1_1', sourceId: 'vk', filePath: 'https://a.mp3' })
    expect(refresh).toHaveBeenCalledWith(tracks)
  })

  it('swallows API error silently (console.warn only)', async () => {
    const { deps, upsert } = makeDeps({
      vkImport: vi.fn().mockResolvedValue({ ok: false as const, error: 'Сессия истекла' }),
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await vkAutoRefreshPure(deps)
    expect(upsert).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith('VK auto-refresh failed:', 'Сессия истекла')
    warn.mockRestore()
  })

  it('swallows network exception silently', async () => {
    const { deps } = makeDeps({ vkImport: vi.fn().mockRejectedValue(new Error('network')) })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(vkAutoRefreshPure(deps)).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('skips refresh when all tracks lack stream urls', async () => {
    const { deps, upsert, refresh } = makeDeps({
      vkImport: vi.fn().mockResolvedValue({ ok: true as const, tracks: [{ title: 'x', artist: 'y' }] }),
    })
    await vkAutoRefreshPure(deps)
    expect(upsert).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })
})
