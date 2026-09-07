import type { JSX } from 'react'

interface IconProps {
  size?: number
}

function icon(path: string, size = 24): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={path} />
    </svg>
  )
}

export const HomeIcon = ({ size }: IconProps) => icon('M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3z', size)

export const SearchIcon = ({ size }: IconProps) =>
  icon(
    'M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z',
    size,
  )

export const PlusIcon = ({ size }: IconProps) => icon('M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z', size)

export const MusicNoteIcon = ({ size }: IconProps) =>
  icon('M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z', size)

export const PlayIcon = ({ size }: IconProps) => icon('M8 5v14l11-7z', size)

export const PauseIcon = ({ size }: IconProps) => icon('M6 5h4v14H6zM14 5h4v14h-4z', size)

export const PrevIcon = ({ size }: IconProps) => icon('M6 6h2v12H6zM18 6l-8.5 6L18 18z', size)

export const NextIcon = ({ size }: IconProps) => icon('M16 6h2v12h-2zM6 18l8.5-6L6 6z', size)

export const ShuffleIcon = ({ size }: IconProps) =>
  icon(
    'M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z',
    size,
  )

export const RepeatIcon = ({ size }: IconProps) =>
  icon('M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z', size)

export const QueueIcon = ({ size }: IconProps) =>
  icon('M3 6h10v2H3zm0 5h10v2H3zm0 5h10v2H3zM15 6l6 4-6 4z', size)

export const LyricsIcon = ({ size }: IconProps) =>
  icon(
    'M12 15a4 4 0 0 0 4-4V6a4 4 0 1 0-8 0v5a4 4 0 0 0 4 4zm6-4a6 6 0 0 1-12 0H4a8 8 0 0 0 7 7.94V22h2v-3.06A8 8 0 0 0 20 11h-2z',
    size,
  )

export const EqIcon = ({ size }: IconProps) =>
  icon(
    'M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z',
    size,
  )

export const MiniIcon = ({ size }: IconProps) =>
  icon(
    'M19 7h-8v6h8V7zm2-4H3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 16H3V5h18v14z',
    size,
  )

export const ExpandIcon = ({ size }: IconProps) =>
  icon('M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z', size)

export const VolumeIcon = ({ size }: IconProps) =>
  icon('M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12z', size)

export const ClockIcon = ({ size }: IconProps) =>
  icon(
    'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z',
    size,
  )

export const CloseIcon = ({ size }: IconProps) =>
  icon(
    'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
    size,
  )

export const HeartIcon = ({ size, filled }: IconProps & { filled?: boolean }) =>
  icon(
    filled
      ? 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'
      : 'M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-3.95 15.55l-.05.05-.05-.05C7.87 17.34 4 13.75 4 8.5 4 6.54 5.54 5 7.5 5c1.49 0 2.79.94 3.36 2.29h2.28C13.71 5.94 15.01 5 16.5 5c1.96 0 3.5 1.54 3.5 3.5 0 5.25-3.87 8.84-8.45 12.05z',
    size,
  )

export const GearIcon = ({ size }: IconProps) =>
  icon(
    'M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 15.6 12 3.6 3.6 0 0 1 12 15.6z',
    size,
  )
