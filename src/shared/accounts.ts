import type { ServiceConnection, ServiceId } from './connections'
import type { ImportedTrack } from './matching'

export const ACCOUNT_SERVICES: ServiceId[] = ['vk', 'spotify', 'yandex', 'lastfm']
export const SERVICE_NAMES: Record<ServiceId, string> = {vk:'ВКонтакте',spotify:'Spotify',yandex:'Яндекс Музыка',lastfm:'Last.fm'}
export interface ServiceAccount extends ServiceConnection {
  id: string
  service: ServiceId
  label: string
  partition: string
  clientId?: string
  autoRefresh: boolean
}
export interface AccountView {
  id: string
  service: ServiceId
  label: string
  userId?: string
  connectedAt: number
  autoRefresh: boolean
}
export type AccountSection = 'all' | 'liked' | 'albums' | 'playlists'
export const SECTION_NAMES: Record<AccountSection, string> = {all:'Все песни',liked:'Понравилось',albums:'Сохранённые альбомы',playlists:'Плейлисты'}
export interface AccountAlbum { id: string; title: string; artist: string; tracks?: ImportedTrack[] }
export interface AccountPlaylist { id: string; title: string; owner?: string; tracks: ImportedTrack[] }
export interface AccountLibrary {
  all: ImportedTrack[]
  liked: ImportedTrack[]
  albums: AccountAlbum[]
  playlists?: AccountPlaylist[] // absent in snapshots written before playlist support
  unavailable: Partial<Record<AccountSection, string>>
  updatedAt: number
}
export function accountView(account: ServiceAccount): AccountView {
  const {id, service, label, userId, connectedAt, autoRefresh} = account
  return {id, service, label, userId, connectedAt, autoRefresh}
}
/** Идемпотентный перенос старого подключения без смены cookie partition. */
export function migrateAccounts(connections: Record<string, ServiceConnection>, accounts?: Record<string, ServiceAccount>): Record<string, ServiceAccount> {
  const result = {...accounts}
  for (const service of ACCOUNT_SERVICES) {
    const old = connections[service]
    const id = `${service}:default`
    if (old?.token && !result[id]) result[id] = {...old, id, service, label:old.userId || 'Основной аккаунт',
      partition:service === 'vk' ? 'persist:vk' : `persist:rezon-${service}-default`, autoRefresh:true}
  }
  return result
}
export function accountTrackId(service: ServiceId, accountId: string, externalId: string): string {
  return accountId === `${service}:default` ? `${service}:${externalId}` : `${service}:${accountId}:${externalId}`
}
