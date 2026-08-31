import type { Track } from './types'

export function searchTracks(tracks: Track[], query: string): Track[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return tracks.filter(
    t =>
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q) ||
      t.album.toLowerCase().includes(q),
  )
}
