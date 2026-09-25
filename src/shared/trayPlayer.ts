export interface TrayPlayerState {
  title: string
  artist: string
  cover?: string
  playing: boolean
  currentSec: number
  durationSec: number
  hasTrack: boolean
}
