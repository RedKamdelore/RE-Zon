import type { BufferedRange } from './playbackBuffer'
import type { OfflineItem } from './offline'

export interface TrayPlayerState {
  title: string
  artist: string
  cover?: string
  playing: boolean
  currentSec: number
  durationSec: number
  hasTrack: boolean
  volume?: number
  playbackError?: string | null
  theme?: Record<string, string>
  bufferedRanges?: BufferedRange[]
  offline?: OfflineItem
  local?: boolean
}

export interface TrayPlayerApi {
  state: () => Promise<TrayPlayerState | null>
  onState: (callback: (state: TrayPlayerState) => void) => () => void
  command: (command: string) => void
  showMain: () => void
  hide: () => void
}

export const TRAY_POPUP_SIZE = { width: 352, height: 352 }

export function isTrayPlayerCommand(command: string): boolean {
  if (['toggle', 'stop', 'next', 'prev', 'expand', 'lyrics', 'queue'].includes(command)) return true
  if (!/^(seek|volume):\d+(\.\d+)?$/.test(command)) return false
  const value = Number(command.slice(command.indexOf(':') + 1))
  return Number.isFinite(value) && (command.startsWith('seek:') || value <= 1)
}
