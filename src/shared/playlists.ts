import type { Playlist } from './types'

export function createPlaylist(existing: Playlist[], name: string): Playlist {
  return {
    id: `pl-${Date.now()}-${existing.length}`,
    name,
    trackIds: [],
    createdAt: Date.now(),
  }
}

export function renamePlaylist(p: Playlist, name: string): Playlist {
  return { ...p, name }
}

export function addTrack(p: Playlist, trackId: string): Playlist {
  if (p.trackIds.includes(trackId)) return p
  return { ...p, trackIds: [...p.trackIds, trackId] }
}

export function removeTrack(p: Playlist, index: number): Playlist {
  return { ...p, trackIds: p.trackIds.filter((_, i) => i !== index) }
}
