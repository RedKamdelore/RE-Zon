export interface Track {
  id: string;            // `${sourceId}:${path или demoId}`
  sourceId: string;      // 'local' | 'demo' | 'vk' | 'soundcloud'
  title: string;
  artist: string;
  album: string;
  durationSec: number;
  coverDataUrl?: string; // base64 из тегов
  filePath: string;      // для media:// resolution
  lyrics?: string;       // из тегов или редактора
}

export interface Playlist {
  id: string;
  name: string;
  coverDataUrl?: string;
  trackIds: string[];
  createdAt: number;
}

export type RepeatMode = 'off' | 'all' | 'one';

export interface AppearanceSettings {
  skin: string; // 'spotify-dark' | 'light' | 'midnight' | 'frutiger-aero' | 'liquid-glass'
  accent: string; // hex
  radius: number; // px, базовый радиус карточек
  scale: number; // 0.85..1.15, масштаб UI (zoom)
}

export interface PlaybackSettings {
  crossfadeSec: number; // 0 = выкл, 1..12
}

export interface PersistedData {
  version: 2;
  musicFolders: string[];
  playlists: Playlist[];
  lyricsOverrides: Record<string, string>;
  volume: number;
  eqGains: number[]; // 10 значений dB
  appearance: AppearanceSettings;
  playback: PlaybackSettings;
  playStats: Record<string, { count: number; lastPlayed: number }>; // для будущих рекомендаций
  lastfmApiKey: string;
  importSources: Record<string, unknown>;
  // Импортированные внешние треки (VK, SoundCloud): плейлисты ссылаются на их id,
  // поэтому без персистентности после рестарта ссылки вели бы в никуда.
  importedTracks: Track[];
}
