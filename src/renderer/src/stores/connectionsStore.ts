import { create } from 'zustand'
import type { ServiceId } from '@shared/connections'

/** View-модель статуса сервиса из IPC (токен не приходит в renderer) */
export interface ConnectionView {
  connected: boolean
  connectedAt?: number
  userId?: string
  playlistName?: string
}

interface ConnectionsState {
  statuses: Partial<Record<ServiceId, ConnectionView>>
  loading: boolean
  init: () => Promise<void> // вызвать после loadData (статусы с сервера)
  refresh: () => Promise<void>
  /** disconnect локально + IPC */
  disconnect: (id: ServiceId) => Promise<void>
  /** отметить локально после успешного connect из карточки */
  applyConnected: (id: ServiceId, view: ConnectionView) => void
}

export const useConnectionsStore = create<ConnectionsState>()((set, get) => ({
  statuses: {},
  loading: true,

  init: async () => {
    await get().refresh()
    set({ loading: false })
  },

  refresh: async () => {
    if (typeof window === 'undefined' || !window.api) return
    try {
      const statuses = await window.api.connectionsList()
      set({ statuses })
    } catch (e) {
      console.error('connections list failed:', e)
    }
  },

  disconnect: async (id) => {
    if (typeof window === 'undefined' || !window.api) return
    await window.api.connectionsDisconnect(id)
    const statuses = { ...get().statuses }
    delete statuses[id]
    set({ statuses })
  },

  applyConnected: (id, view) => {
    set({ statuses: { ...get().statuses, [id]: view } })
  },
}))

/** Человекочитаемый возраст подключения («сегодня», «N дн назад») */
export function describeWhen(ts: number | undefined): string {
  if (!ts) return ''
  const days = Math.floor((Date.now() - ts) / 86400000)
  if (days <= 0) return 'сегодня'
  if (days === 1) return 'вчера'
  return `${days} дн назад`
}
