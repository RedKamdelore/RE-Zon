export interface LyricsLookupRequest {
  artist: string
  title: string
  album?: string
  durationSec?: number
}

export interface LyricsLookupResult {
  text: string
  synced: boolean
  source: 'lrclib' | 'lrcapi'
}
