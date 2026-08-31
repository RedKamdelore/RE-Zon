export interface Track {
  id: string;            // `${sourceId}:${path или demoId}`
  sourceId: string;      // 'local' | 'demo' | 'vk'
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

export interface PersistedData {
  version: 1;
  musicFolders: string[];
  playlists: Playlist[];
  lyricsOverrides: Record<string, string>;
  volume: number;
  eqGains: number[]; // 10 значений dB
}
