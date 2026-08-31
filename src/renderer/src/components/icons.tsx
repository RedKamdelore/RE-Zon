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

export const VolumeIcon = ({ size }: IconProps) =>
  icon('M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12z', size)
