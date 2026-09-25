import type { Track } from './types'
import type { ImportedTrack } from './matching'
import type { AccountLibrary, AccountView } from './accounts'
import { accountTrackId } from './accounts'

export interface CatalogSource {
  id: string
  service: string
  accountId?: string
  label: string
  track?: Track
}
export interface CatalogEntry {
  id: string
  title: string
  artist: string
  albumId?: string
  albumArtist?: string
  album: string
  durationSec: number
  coverDataUrl?: string
  sources: CatalogSource[]
}
export const normalizeRecording = (s: string): string => s.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim()
const sourceNames: Record<string,string> = {local:'Файл',demo:'Демо',vk:'VK',soundcloud:'SoundCloud',spotify:'Spotify',yandex:'Яндекс Музыка',lastfm:'Last.fm'}

/** Conservative grouping: retain version text and separate noticeably different durations. */
export function buildCatalog(tracks: Track[], accounts: AccountView[], libraries: Record<string, AccountLibrary>, hiddenIds: string[] = []): CatalogEntry[] {
  const hidden = new Set(hiddenIds)
  const groups = new Map<string,CatalogEntry[]>()
  const sourceIds = new Set<string>()
  const add = (item: ImportedTrack, source: CatalogSource, cover?: string): void => {
    if (hidden.has(source.id) || sourceIds.has(source.id) || !item.title) return
    sourceIds.add(source.id)
    const key = `${normalizeRecording(item.artist)}\0${normalizeRecording(item.title)}`
    const bucket = groups.get(key) ?? []
    const duration = item.durationSec ?? 0
    const candidates=bucket.filter(e => !duration || !e.durationSec || Math.abs(e.durationSec-duration)<=3)
    let entry = candidates.length===1 && item.artist.trim() ? candidates[0] : undefined
    if (!entry) {
      entry={albumId:item.albumId,albumArtist:item.albumArtist,id:source.id,title:item.title,artist:item.artist,album:item.album ?? '',durationSec:duration,sources:[]}
      bucket.push(entry); groups.set(key,bucket)
    }
    entry.albumId ||= item.albumId
    entry.albumArtist ||= item.albumArtist
    entry.sources.push(source)
    if (!entry.coverDataUrl && cover) entry.coverDataUrl=cover
    if (!entry.album && item.album) entry.album=item.album
    if (!entry.durationSec) entry.durationSec=duration
  }
  for (const t of tracks) add(t,{id:t.id,service:t.sourceId,accountId:t.accountId,label:sourceNames[t.sourceId] ?? t.sourceId,track:t.filePath?t:undefined},t.coverDataUrl)
  for (const account of accounts) {
    const data=libraries[account.id]
    if(!data) continue
    for(const t of [...data.all,...data.liked,...data.albums.flatMap(a=>a.tracks ?? [])]) {
      const id=accountTrackId(account.service,account.id,t.extId ?? `${t.artist}:${t.title}`)
      add(t,{id,service:account.service,accountId:account.id,label:`${sourceNames[account.service]} · ${account.label}`},t.coverUrl)
    }
  }
  return [...groups.values()].flat()
}
export function preferredSource(entry: CatalogEntry): CatalogSource | undefined {
  return entry.sources.find(s=>s.track?.sourceId==='local') ?? entry.sources.find(s=>s.track)
}
