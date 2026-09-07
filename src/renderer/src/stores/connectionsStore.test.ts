// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useConnectionsStore, describeWhen } from './connectionsStore'

interface ConnectionStatusView {
  connected: boolean
  connectedAt?: number
  userId?: string
  playlistName?: string
}

function fakeApi(statuses: Record<string, ConnectionStatusView>) {
  return {
    connectionsList: vi.fn(async () => statuses),
    connectionsDisconnect: vi.fn(async (id: string) => true),
  }
}

describe('connectionsStore', () => {
  beforeEach(() => {
    useConnectionsStore.setState({ statuses: {}, loading: true })
  })

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).api
  })

  it('refresh loads statuses from window.api', async () => {
    ;(window as unknown as Record<string, unknown>).api = fakeApi({
      vk: { connected: true, connectedAt: 5, userId: '42' },
    })
    await useConnectionsStore.getState().refresh()
    expect(useConnectionsStore.getState().statuses.vk?.connected).toBe(true)
    expect(useConnectionsStore.getState().statuses.vk?.userId).toBe('42')
    expect(useConnectionsStore.getState().statuses.lastfm).toBeUndefined()
  })

  it('init clears loading after refresh', async () => {
    ;(window as unknown as Record<string, unknown>).api = fakeApi({})
    await useConnectionsStore.getState().init()
    expect(useConnectionsStore.getState().loading).toBe(false)
  })

  it('refresh without window.api is a no-op', async () => {
    delete (window as unknown as Record<string, unknown>).api
    await useConnectionsStore.getState().refresh()
    expect(useConnectionsStore.getState().statuses).toEqual({})
  })

  it('disconnect removes the status locally and calls IPC', async () => {
    const api = fakeApi({ vk: { connected: true }, lastfm: { connected: true } })
    ;(window as unknown as Record<string, unknown>).api = api
    await useConnectionsStore.getState().refresh()
    await useConnectionsStore.getState().disconnect('vk')
    expect(useConnectionsStore.getState().statuses.vk).toBeUndefined()
    expect(useConnectionsStore.getState().statuses.lastfm?.connected).toBe(true)
    expect(api.connectionsDisconnect).toHaveBeenCalledWith('vk')
  })

  it('applyConnected patches a single status', () => {
    useConnectionsStore.getState().applyConnected('lastfm', {
      connected: true,
      connectedAt: 9,
      userId: 'user',
    })
    expect(useConnectionsStore.getState().statuses.lastfm).toEqual({
      connected: true,
      connectedAt: 9,
      userId: 'user',
    })
  })
})

describe('describeWhen', () => {
  it('formats today/yesterday/N days', () => {
    const now = Date.now()
    expect(describeWhen(now - 3600 * 1000)).toBe('сегодня')
    expect(describeWhen(now - 24 * 3600 * 1000)).toBe('вчера')
    expect(describeWhen(now - 3 * 24 * 3600 * 1000)).toBe('3 дн назад')
  })

  it('empty for undefined', () => {
    expect(describeWhen(undefined)).toBe('')
  })
})
