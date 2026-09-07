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

/** Результат IPC lastfm:call — сырой JSON Last.fm или читаемая ошибка */
export type LfmCallResult = { ok: true; data: unknown } | { ok: false; error: string };

import type { ThemeConfig } from './themeModel'

export interface AppearanceSettings {
  skin: string // id выбранного пресета (встроенного или из customThemes)
  theme: ThemeConfig; // активный конфиг темы (редактируется живьём)
  customThemes: Record<string, ThemeConfig>; // пользовательские темы по имени
  scale: number; // 0.85..1.15, масштаб UI (zoom)
}

export interface PlaybackSettings {
  crossfadeSec: number; // 0 = выкл, 1..12
}

export interface PersistedData {
  version: 4;
  musicFolders: string[];
  playlists: Playlist[];
  lyricsOverrides: Record<string, string>;
  volume: number;
  eqGains: number[]; // 10 значений dB
  appearance: AppearanceSettings;
  playback: PlaybackSettings;
  playStats: Record<string, { count: number; lastPlayed: number }>; // для будущих рекомендаций
  lastfmApiKey: string;
  lastfmApiSecret: string; // для скробблинга/сессии (подпись запросов); '' = нет
  // HTTP-прокси для запросов к Last.fm (Last.fm блокирует API по региону); '' = без прокси
  lastfmProxy: string;
  importSources: Record<string, unknown>;
  // Подключения сервисов: токены/сессии от кнопок «Подключить» (v3). importSources
  // с vkToken мигрирует сюда; само поле оставлено для совместимости.
  connections: Record<string, import('./connections').ServiceConnection>;
  // Импортированные внешние треки (VK, SoundCloud): плейлисты ссылаются на их id,
  // поэтому без персистентности после рестарта ссылки вели бы в никуда.
  importedTracks: Track[];
  // id треков, скрытых пользователем из библиотеки: остаются в tracks,
  // но фильтруются из всех списков (visibleTracks в libraryStore)
  hiddenTracks: string[];
  // id треков, добавленных в «Любимое» (сердечко; виртуальный плейлист)
  favoriteIds: string[];
}
