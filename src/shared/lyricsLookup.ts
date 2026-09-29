export interface LyricsLookupRequest {
  artist: string
  title: string
  album?: string
  durationSec?: number
  checkAll?: boolean
}

export const LYRIC_SOURCE_IDS = ['lrclib', 'lrcapi', 'lrcmux', 'synclrc'] as const
export type LyricSourceId = typeof LYRIC_SOURCE_IDS[number]

export interface LyricsLookupResult {
  text: string
  synced: boolean
  source: LyricSourceId
  provider?: string
  plainText?: string
}

export interface LyricsSourceStatus {
  source: LyricSourceId
  status: 'both' | 'synced' | 'plain' | 'missing' | 'error' | 'skipped'
  result?: LyricsLookupResult
}

export interface LyricsLookupReport {
  best: LyricsLookupResult | null
  sources: LyricsSourceStatus[]
  checkedAll?: boolean
  demo?: boolean
}
