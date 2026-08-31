# Player_DXD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Десктопный аудиоплеер для Windows (exe через electron-builder), визуально повторяющий Spotify desktop, с локальными файлами + демо-контентом как источниками музыки (адаптер ВК — следующий этап).

**Architecture:** Electron (main: окно/трей/сканирование/JSON-persistence/IPC; preload: contextBridge; renderer: React+zustand+Web Audio). Источник музыки — интерфейс `MusicSource` с реализациями `LocalFolderSource` и `DemoSource`. Вся тестируемая логика (очередь, поиск, плейлисты) — чистые функции в `src/shared/`.

**Tech Stack:** electron-vite, React 19, TypeScript, zustand, music-metadata, Web Audio API, electron-builder (NSIS), vitest.
> Note: installed majors — react 19, zustand 5, music-metadata 11, typescript 7, vite 7, electron-vite 5 (pinned for peer-dep compatibility).

**Project root:** `C:\Users\Administrator\Desktop\САМОПАЛ\Player_DXD`

---

## File Structure

```
Player_DXD/
├── package.json
├── electron.vite.config.ts
├── electron-builder.yml
├── tsconfig.json
├── vitest.config.ts
├── resources/
│   ├── icon.png                  # иконка приложения (сгенерировать)
│   └── demo/                     # сгенерированные demo WAV-файлы
├── docs/superpowers/specs/2026-08-31-player-dxd-design.md
├── src/
│   ├── shared/
│   │   ├── types.ts              # Track, Playlist, PlayerState, IPC-контракты
│   │   ├── queue.ts              # чистая логика очереди/shuffle/repeat (TDD)
│   │   ├── search.ts             # чистая логика поиска (TDD)
│   │   └── playlists.ts          # чистые операции над плейлистами (TDD)
│   ├── main/
│   │   ├── index.ts              # entry: app lifecycle, BrowserWindow, media:// protocol
│   │   ├── tray.ts               # системный трей
│   │   ├── ipc.ts                # все ipcMain.handle
│   │   ├── library.ts            # сканирование папок + music-metadata
│   │   └── persistence.ts        # JSON store в userData
│   ├── preload/
│   │   └── index.ts              # contextBridge → window.api
│   └── renderer/
│       ├── index.html
│       └── src/
│           ├── main.tsx
│           ├── App.tsx           # layout: Sidebar | MainView, PlayerBar; mini-mode
│           ├── env.d.ts          # типы window.api
│           ├── audio/engine.ts   # AudioContext + EQ-цепочка + playback
│           ├── stores/playerStore.ts
│           ├── stores/libraryStore.ts
│           ├── stores/playlistStore.ts
│           ├── components/Sidebar.tsx
│           ├── components/PlayerBar.tsx
│           ├── components/HomeView.tsx
│           ├── components/TrackList.tsx
│           ├── components/PlaylistView.tsx
│           ├── components/SearchView.tsx
│           ├── components/RightPanel.tsx   # очередь + тексты песен
│           ├── components/Equalizer.tsx
│           ├── components/MiniPlayer.tsx
│           └── styles/global.css           # тёмная тема Spotify
└── src/shared/*.test.ts          # vitest, colocated
```

**Ключевые решения:**
- Локальные и демо файлы отдаются renderer'у через custom protocol `media://<base64url пути>` (регистрируется в main через `protocol.handle`) — безопасно и стримится.
- Состояние плеера живёт только в renderer основного окна; мини-плеер — это **режим того же окна** (`?mini=1` route + resize через IPC), без второго окна и синхронизации состояния.
- Persistence (плейлисты, настройки, папки библиотеки, тексты песен) — JSON в `app.getPath('userData')/player-data.json`, пишет main, renderer читает/пишет через IPC (debounced 500 ms).
- Эквалайзер: `MediaElementAudioSourceNode → 10 × BiquadFilterNode (peaking) → GainNode → destination`. Частоты: 31, 62, 125, 250, 500, 1k, 2k, 4k, 8k, 16k Гц.

---

### Task 1: Скаффолд проекта

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `vitest.config.ts`, `src/renderer/index.html`

- [ ] **Step 1: Инициализировать npm-проект и установить зависимости**

```powershell
cd "C:\Users\Administrator\Desktop\САМОПАЛ\Player_DXD"
npm init -y
npm install react react-dom zustand music-metadata
npm install -D electron electron-vite vite @vitejs/plugin-react typescript vitest electron-builder @types/react @types/react-dom jsdom
```

- [ ] **Step 2: Заполнить `package.json`**

```json
{
  "name": "player-dxd",
  "version": "0.1.0",
  "private": true,
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "test": "vitest run",
    "dist": "electron-vite build && electron-builder",
    "dist:dir": "electron-vite build && electron-builder --dir"
  }
}
```

(поля dependencies/devDependencies заполнит npm install — версии берутся из npm)

- [ ] **Step 3: `electron.vite.config.ts`**

```ts
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    build: { outDir: 'out/main' },
    resolve: { alias: { '@shared': resolve('src/shared') } },
  },
  preload: {
    build: { outDir: 'out/preload' },
    resolve: { alias: { '@shared': resolve('src/shared') } },
  },
  renderer: {
    root: 'src/renderer',
    build: { outDir: 'out/renderer' },
    plugins: [react()],
    resolve: { alias: { '@shared': resolve('src/shared') } },
  },
})
```

- [ ] **Step 4: `tsconfig.json` + `src/renderer/index.html`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["vite/client", "node"],
    "paths": { "@shared/*": ["./src/shared/*"] }
  },
  "include": ["src", "electron.vite.config.ts"]
}
```

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <title>Player_DXD</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Проверить сборку пустого шаблона**

Run: `npm run build`
Expected: `out/main`, `out/preload`, `out/renderer` собраны без ошибок (main/preload пока пустые — создать заглушки `export {}`).

- [ ] **Step 6: Commit**

```bash
git init; git add -A; git commit -m "chore: scaffold electron-vite + react + ts"
```

---

### Task 2: Shared types + логика очереди (TDD)

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/queue.ts`
- Test: `src/shared/queue.test.ts`

- [ ] **Step 1: `src/shared/types.ts`**

```ts
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
```

- [ ] **Step 2: Написать падающий тест `src/shared/queue.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { nextIndex, prevIndex, buildShuffleOrder } from './queue'

describe('queue logic', () => {
  const order = [0, 1, 2, 3]

  it('next: linear advance, stops at end when repeat=off', () => {
    expect(nextIndex(order, 0, 1, 'off')).toBe(1)
    expect(nextIndex(order, 3, 3, 'off')).toBeNull()
  })

  it('next: wraps when repeat=all', () => {
    expect(nextIndex(order, 3, 3, 'all')).toBe(0)
  })

  it('next: stays when repeat=one', () => {
    expect(nextIndex(order, 2, 2, 'one')).toBe(2)
  })

  it('prev: goes back, at 0 stays 0', () => {
    expect(prevIndex(order, 2)).toBe(1)
    expect(prevIndex(order, 0)).toBe(0)
  })

  it('buildShuffleOrder: permutation containing all indices, first = current', () => {
    const shuffled = buildShuffleOrder(10, 3)
    expect(shuffled[0]).toBe(3)
    expect([...shuffled].sort((a, b) => a - b)).toEqual([0,1,2,3,4,5,6,7,8,9])
  })
})
```

- [ ] **Step 3: Запустить — убедиться, что падает**

Run: `npx vitest run src/shared/queue.test.ts`
Expected: FAIL (module `./queue` не существует)

- [ ] **Step 4: Реализация `src/shared/queue.ts`**

```ts
import type { RepeatMode } from './types'

/** Позиция внутри order → следующая позиция, либо null (конец при repeat=off) */
export function nextIndex(
  order: number[],
  pos: number,
  _current: number,
  repeat: RepeatMode,
): number | null {
  if (repeat === 'one') return pos
  if (pos + 1 < order.length) return pos + 1
  return repeat === 'all' ? 0 : null
}

export function prevIndex(order: number[], pos: number): number {
  return Math.max(0, pos - 1)
}

/** Перемешанный порядок: текущий трек первым, остальные — Fisher–Yates */
export function buildShuffleOrder(length: number, current: number): number[] {
  const rest: number[] = []
  for (let i = 0; i < length; i++) if (i !== current) rest.push(i)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  return [current, ...rest]
}
```

- [ ] **Step 5: Тесты зелёные → commit**

Run: `npx vitest run`
Expected: 5 tests passed
Commit: `feat: queue/shuffle/repeat logic`

---

### Task 3: Поиск (TDD)

**Files:**
- Create: `src/shared/search.ts`
- Test: `src/shared/search.test.ts`

- [ ] **Step 1: Падающий тест**

```ts
import { describe, it, expect } from 'vitest'
import { searchTracks } from './search'
import type { Track } from './types'

const t = (id: string, title: string, artist: string, album: string): Track => ({
  id, sourceId: 'local', title, artist, album, durationSec: 0, filePath: '',
})

const lib = [
  t('1', 'Bohemian Rhapsody', 'Queen', 'A Night at the Opera'),
  t('2', 'Another One Bites the Dust', 'Queen', 'The Game'),
  t('3', 'Пора домой', 'Кино', 'Новая волна'),
]

describe('searchTracks', () => {
  it('empty query returns empty result', () => {
    expect(searchTracks(lib, '  ')).toEqual([])
  })
  it('matches title case-insensitively', () => {
    expect(searchTracks(lib, 'bohemian').map(x => x.id)).toEqual(['1'])
  })
  it('matches artist', () => {
    expect(searchTracks(lib, 'queen')).toHaveLength(2)
  })
  it('matches cyrillic', () => {
    expect(searchTracks(lib, 'КИНО').map(x => x.id)).toEqual(['3'])
  })
  it('matches album', () => {
    expect(searchTracks(lib, 'the game').map(x => x.id)).toEqual(['2'])
  })
})
```

- [ ] **Step 2: Запуск — FAIL (нет модуля)**

- [ ] **Step 3: Реализация `src/shared/search.ts`**

```ts
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
```

- [ ] **Step 4: Тесты зелёные → commit** `feat: library search`

---

### Task 4: Операции с плейлистами (TDD)

**Files:**
- Create: `src/shared/playlists.ts`
- Test: `src/shared/playlists.test.ts`

- [ ] **Step 1: Падающий тест**

```ts
import { describe, it, expect } from 'vitest'
import { createPlaylist, renamePlaylist, addTrack, removeTrack } from './playlists'

describe('playlists', () => {
  it('creates playlist with unique id and empty tracks', () => {
    const p = createPlaylist([], 'Мой плейлист')
    expect(p.name).toBe('Мой плейлист')
    expect(p.trackIds).toEqual([])
    expect(p.id).toBeTruthy()
  })

  it('renames', () => {
    const p = createPlaylist([], 'a')
    expect(renamePlaylist(p, 'b').name).toBe('b')
  })

  it('addTrack appends, deduplicates', () => {
    let p = createPlaylist([], 'a')
    p = addTrack(p, 't1')
    p = addTrack(p, 't1')
    p = addTrack(p, 't2')
    expect(p.trackIds).toEqual(['t1', 't2'])
  })

  it('removeTrack removes by index', () => {
    let p = createPlaylist([], 'a')
    p = addTrack(p, 't1'); p = addTrack(p, 't2'); p = addTrack(p, 't3')
    expect(removeTrack(p, 1).trackIds).toEqual(['t1', 't3'])
  })
})
```

- [ ] **Step 2: Запуск — FAIL**

- [ ] **Step 3: Реализация `src/shared/playlists.ts`**

```ts
import type { Playlist } from './types'

export function createPlaylist(existing: Playlist[], name: string): Playlist {
  return {
    id: `pl-${Date.now()}-${existing.length}`,
    name,
    trackIds: [],
    createdAt: Date.now(),
  }
}

export function renamePlaylist(p: Playlist, name: string): Playlist {
  return { ...p, name }
}

export function addTrack(p: Playlist, trackId: string): Playlist {
  if (p.trackIds.includes(trackId)) return p
  return { ...p, trackIds: [...p.trackIds, trackId] }
}

export function removeTrack(p: Playlist, index: number): Playlist {
  return { ...p, trackIds: p.trackIds.filter((_, i) => i !== index) }
}
```

- [ ] **Step 4: Тесты зелёные → commit** `feat: playlist operations`

---

### Task 5: Main-процесс — окно, persistence, IPC-скелет

**Files:**
- Create: `src/main/index.ts`, `src/main/persistence.ts`, `src/main/ipc.ts`
- Create: `src/preload/index.ts`
- Test: `src/main/persistence.test.ts` (чистая логика merge дефолтов)

- [ ] **Step 1: `src/main/persistence.ts`**

```ts
import { app } from 'electron'
import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs'
import { join } from 'path'
import type { PersistedData } from '../shared/types'

export const DEFAULT_DATA: PersistedData = {
  version: 1,
  musicFolders: [],
  playlists: [],
  lyricsOverrides: {},
  volume: 0.8,
  eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
}

/** Чистая функция — тестируется без Electron */
export function mergeWithDefaults(raw: Partial<PersistedData> | null): PersistedData {
  return { ...DEFAULT_DATA, ...(raw ?? {}), version: 1 }
}

let cache: PersistedData | null = null

function dataPath(): string {
  return join(app.getPath('userData'), 'player-data.json')
}

export function loadData(): PersistedData {
  if (cache) return cache
  try {
    cache = mergeWithDefaults(
      existsSync(dataPath()) ? JSON.parse(readFileSync(dataPath(), 'utf-8')) : null,
    )
  } catch {
    cache = mergeWithDefaults(null)
  }
  return cache
}

export function saveData(data: PersistedData): void {
  cache = data
  const tmp = dataPath() + '.tmp'
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  renameSync(tmp, dataPath()) // атомарная запись
}
```

Тест `src/main/persistence.test.ts` — только `mergeWithDefaults` (null → дефолты; частичные данные мержатся).

- [ ] **Step 2: `src/main/index.ts` — окно + `media://` протокол**

```ts
import { app, BrowserWindow, protocol, net, shell } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { registerIpc } from './ipc'
import { createTray } from './tray'

// Декодирует media://<base64url путь> → file stream
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { stream: true, supportFetchAPI: true } },
])

function decodeMediaUrl(url: string): string {
  const encoded = new URL(url).hostname + new URL(url).pathname
  return Buffer.from(encoded, 'base64url').toString('utf-8')
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 940, minHeight: 600,
    backgroundColor: '#121212',
    autoHideMenuBar: true,
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

app.whenReady().then(() => {
  protocol.handle('media', (req) =>
    net.fetch(pathToFileURL(decodeMediaUrl(req.url)).toString()),
  )
  const win = createWindow()
  registerIpc(win)
  createTray(win)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 3: `src/main/ipc.ts` — скелет хендлеров**

```ts
import { ipcMain, dialog, BrowserWindow } from 'electron'
import { loadData, saveData } from './persistence'
import { scanFolders } from './library'
import type { PersistedData } from '../shared/types'

export function registerIpc(win: BrowserWindow): void {
  ipcMain.handle('data:load', () => loadData())
  ipcMain.handle('data:save', (_e, data: PersistedData) => saveData(data))
  ipcMain.handle('library:pickFolder', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('library:scan', (_e, folders: string[]) => scanFolders(folders))
  ipcMain.handle('window:mini', (_e, mini: boolean) => {
    if (mini) { win.setAlwaysOnTop(true); win.setMinimumSize(360, 120); win.setSize(360, 140) }
    else { win.setAlwaysOnTop(false); win.setMinimumSize(940, 600); win.setSize(1280, 800) }
  })
  ipcMain.on('player:cmd', (_e, cmd: string) => win.webContents.send('player:cmd', cmd))
}
```

- [ ] **Step 4: `src/preload/index.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { PersistedData, Track } from '../shared/types'

const api = {
  loadData: (): Promise<PersistedData> => ipcRenderer.invoke('data:load'),
  saveData: (d: PersistedData): Promise<void> => ipcRenderer.invoke('data:save', d),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('library:pickFolder'),
  scanLibrary: (folders: string[]): Promise<Track[]> =>
    ipcRenderer.invoke('library:scan', folders),
  setMiniMode: (mini: boolean): Promise<void> => ipcRenderer.invoke('window:mini', mini),
  onPlayerCommand: (cb: (cmd: string) => void) => {
    ipcRenderer.on('player:cmd', (_e, cmd) => cb(cmd))
  },
}

export type Api = typeof api
contextBridge.exposeInMainWorld('api', api)
```

- [ ] **Step 5: Создать заглушки `src/main/library.ts` (`scanFolders` → `[]`), `src/main/tray.ts` (пустой `createTray`), renderer `main.tsx`/`App.tsx` (Hello). Запустить `npm run dev` — окно открывается**

- [ ] **Step 6: Commit** `feat: main process window, persistence, ipc skeleton`

---

### Task 6: Сканирование библиотеки + демо-контент + иконка

**Files:**
- Modify: `src/main/library.ts`
- Create: `scripts/generate-demo.cjs` (генерация demo WAV), `scripts/generate-icon.cjs`
- Create: `resources/demo/*.wav`, `resources/icon.png`

- [ ] **Step 1: Генератор иконки** — чистый Node-скрипт, пишет PNG 512×512 (зелёный круг с чёрной «волной») через ручную сборку PNG (zlib + CRC, без зависимостей) или через canvas если доступен. Запуск: `node scripts/generate-icon.cjs`.

- [ ] **Step 2: Генератор демо-аудио** — `scripts/generate-demo.cjs` синтезирует 3–4 WAV-файла (44.1 kHz, 16-bit mono, ~20 сек): простые мелодии из синусов (разные тональности/темпы). Пишет в `resources/demo/`. Запуск: `node scripts/generate-demo.cjs`.

- [ ] **Step 3: `src/main/library.ts` — сканер**

```ts
import { readdirSync, statSync } from 'fs'
import { join, extname } from 'path'
import { parseFile } from 'music-metadata'
import type { Track } from '../shared/types'

const AUDIO_EXT = new Set(['.mp3', '.flac', '.ogg', '.wav', '.m4a', '.opus'])

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) walk(p, acc)
    else if (AUDIO_EXT.has(extname(entry.name).toLowerCase())) acc.push(p)
  }
  return acc
}

async function toTrack(filePath: string): Promise<Track | null> {
  try {
    const meta = await parseFile(filePath, { duration: true })
    const pic = meta.common.picture?.[0]
    return {
      id: `local:${filePath}`,
      sourceId: 'local',
      title: meta.common.title ?? filePath.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, ''),
      artist: meta.common.artist ?? 'Неизвестный исполнитель',
      album: meta.common.album ?? 'Неизвестный альбом',
      durationSec: Math.round(meta.format.duration ?? 0),
      coverDataUrl: pic
        ? `data:${pic.format};base64,${Buffer.from(pic.data).toString('base64')}`
        : undefined,
      filePath,
      lyrics: meta.common.lyrics?.[0]?.text,
    }
  } catch (err) {
    console.error('[library] skip unreadable file:', filePath, err)
    return null
  }
}

export async function scanFolders(folders: string[]): Promise<Track[]> {
  const files = folders.flatMap(f => walk(f))
  const tracks = await Promise.all(files.map(toTrack))
  return tracks.filter((t): t is Track => t !== null)
}

/** Демо-треки из resources/demo — когда локальной музыки нет */
export function demoTracks(demoDir: string): Track[] {
  const NAMES: Array<[string, string]> = [
    ['Neon Sunset', 'DXD Ensemble'], ['Night Drive', 'DXD Ensemble'],
    ['Rainy Loops', 'Sampled Souls'], ['Analog Dreams', 'Sampled Souls'],
  ]
  return readdirSync(demoDir)
    .filter(f => f.endsWith('.wav'))
    .map((f, i) => ({
      id: `demo:${f}`,
      sourceId: 'demo',
      title: NAMES[i]?.[0] ?? f,
      artist: NAMES[i]?.[1] ?? 'Demo',
      album: 'Player_DXD Demo Pack',
      durationSec: 20,
      filePath: join(demoDir, f),
    }))
}
```

- [ ] **Step 4: Подключить `demoTracks` в `ipc.ts` (канал `library:demo`) и в `preload`. Проверить: `npm run dev`, вызвать сканирование из DevTools консоли**

- [ ] **Step 5: Commit** `feat: library scanner, demo audio, icon`

---

### Task 7: Аудио-движок + player store

**Files:**
- Create: `src/renderer/src/audio/engine.ts`
- Create: `src/renderer/src/stores/playerStore.ts`
- Create: `src/renderer/src/env.d.ts`

- [ ] **Step 1: `engine.ts` — Web Audio граф**

```ts
const EQ_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

export class AudioEngine {
  private ctx = new AudioContext()
  private el = new Audio()
  private src = this.ctx.createMediaElementSource(this.el)
  private filters = EQ_FREQS.map(f => {
    const node = this.ctx.createBiquadFilter()
    node.type = 'peaking'; node.frequency.value = f; node.Q.value = 1
    return node
  })
  private gain = this.ctx.createGain()

  constructor() {
    const chain = [this.src, ...this.filters, this.gain]
    for (let i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1])
    this.gain.connect(this.ctx.destination)
    this.el.crossOrigin = 'anonymous'
  }

  get element(): HTMLAudioElement { return this.el }

  play(url: string): void {
    this.el.src = url
    void this.ctx.resume()
    void this.el.play()
  }
  pause(): void { this.el.pause() }
  resume(): void { void this.ctx.resume(); void this.el.play() }
  seek(sec: number): void { this.el.currentTime = sec }
  setVolume(v: number): void { this.gain.gain.value = v }
  setEqGain(band: number, db: number): void {
    this.filters[band].gain.value = db
  }
}

/** Локальный/демо путь → media:// URL */
export function mediaUrl(filePath: string): string {
  return `media://${Buffer.from(filePath, 'utf-8').toString('base64url')}`
}
```

- [ ] **Step 2: `playerStore.ts` (zustand)** — state: `queue: Track[]`, `order: number[]`, `pos`, `playing`, `shuffle`, `repeat`, `currentSec`, `volume`, `eqGains`; actions: `playTracks(tracks, startIndex)` (ставит очередь, строит order), `togglePlay`, `next`, `prev`, `seek`, `setVolume`, `setEq`, `enqueue(track)`, `removeFromQueue(pos)`, `moveInQueue(from, to)`. Использует чистые функции из `@shared/queue`. Подписывается на события `engine.element` (`timeupdate`, `ended` → `next()`).

- [ ] **Step 3: Commit** `feat: audio engine with equalizer, player store`

---

### Task 8: Каркас UI — layout, тема, Sidebar, PlayerBar

**Files:**
- Create: `src/renderer/src/styles/global.css`
- Create: `src/renderer/src/App.tsx`, `components/Sidebar.tsx`, `components/PlayerBar.tsx`, `stores/libraryStore.ts`

- [ ] **Step 1: `global.css`** — тёмная тема Spotify: фон `#121212`, панели `#000/#181818`, текст `#fff/#b3b3b3`, акцент `#1DB954`; CSS grid layout: `sidebar | main` сверху, `playerbar` на всю ширину снизу (высота 90px). Кастомные скроллбары, hover-эффекты.

- [ ] **Step 2: `libraryStore.ts`** — `tracks: Track[]`, `loading`, action `init()`: `loadData()` → если `musicFolders` пусты → `demoTracks`, иначе `scanLibrary`; `addFolder()` → `pickFolder` + rescan.

- [ ] **Step 3: `Sidebar.tsx`** — логотип «Player_DXD», кнопки Главная/Поиск (nav state в App), блок «Моя медиатека» со списком плейлистов + кнопка «+».

- [ ] **Step 4: `PlayerBar.tsx`** — слева обложка/название/исполнитель; центр: shuffle, prev, play/pause (круглая белая кнопка), next, repeat (с индикатором «1» для repeat=one), под ними seek-бар с временами; справа: иконки очереди/текста/эквалайзера/мини-плеера + ползунок громкости. Всё подключено к `playerStore`.

- [ ] **Step 5: `App.tsx`** — grid layout, роутинг по состоянию (`view: 'home' | 'search' | 'playlist:<id>'`), `RightPanel` справа когда открыт. Проверить `npm run dev`: окно в стиле Spotify, демо-треки играют.

- [ ] **Step 6: Commit** `feat: spotify-style layout, sidebar, player bar`

---

### Task 9: Home + TrackList + PlaylistView

**Files:**
- Create: `components/HomeView.tsx`, `components/TrackList.tsx`, `components/PlaylistView.tsx`

- [ ] **Step 1: `TrackList.tsx`** — таблица Spotify: `#`, обложка+название+исполнитель, альбом, длительность (m:ss); hover-подсветка строки; играющий трек — зелёное название; dblclick/клик → `playTracks`; контекстное меню (правый клик): «Добавить в очередь», «Добавить в плейлист →».

- [ ] **Step 2: `HomeView.tsx`** — заголовок «Добрый день», плитки 2×3 (последние плейлисты/альбомы), секция «Все треки» с TrackList, кнопка «Добавить папку с музыкой».

- [ ] **Step 3: `PlaylistView.tsx`** — шапка плейлиста (большая обложка/плейсхолдер, название, кол-во треков), кнопка Play, TrackList по `trackIds`, удаление трека из плейлиста.

- [ ] **Step 4: Commit** `feat: home, track list, playlist views`

---

### Task 10: Поиск

**Files:**
- Create: `components/SearchView.tsx`

- [ ] **Step 1:** Поле ввода сверху (как в Spotify), результаты через `searchTracks` (debounce 200 мс), «Лучший результат»-карточка + TrackList. Пустой запрос → «Найдите трек, исполнителя или альбом».

- [ ] **Step 2: Commit** `feat: search view`

---

### Task 11: Плейлисты CRUD + persistence

**Files:**
- Create: `stores/playlistStore.ts`
- Modify: `components/Sidebar.tsx`, `components/PlaylistView.tsx`

- [ ] **Step 1: `playlistStore.ts`** — `playlists: Playlist[]`, actions: `create`, `rename`, `remove`, `addTrack(playlistId, trackId)`, `removeTrack(playlistId, index)`; каждая мутация → debounced `saveData()` (мержит с текущими `PersistedData`). `init()` из `loadData()`.

- [ ] **Step 2:** Sidebar: кнопка «+ Создать плейлист», контекстное меню плейлиста (переименовать/удалить), переход по клику. PlaylistView: inline-переименование по клику на название.

- [ ] **Step 3: Проверить персистентность:** создать плейлист, перезапустить `npm run dev` — плейлист на месте.

- [ ] **Step 4: Commit** `feat: playlists crud with persistence`

---

### Task 12: Правая панель — очередь + тексты песен

**Files:**
- Create: `components/RightPanel.tsx`

- [ ] **Step 1:** Вкладки «Очередь» / «Текст песни». Очередь: «Сейчас играет» + «Далее в очереди» (drag-and-drop HTML5 для `moveInQueue`, крестик для удаления). Текст: `track.lyrics` или `lyricsOverrides[id]`; кнопка «Редактировать» → textarea → сохранить в `lyricsOverrides` через persistence.

- [ ] **Step 2: Commit** `feat: queue panel and lyrics`

---

### Task 13: Эквалайзер UI

**Files:**
- Create: `components/Equalizer.tsx`

- [ ] **Step 1:** Popover/панель из PlayerBar: 10 вертикальных слайдеров (−12…+12 dB) → `playerStore.setEq`, пресеты (Flat, Bass, Rock, Pop, Vocal — захардкоженные массивы из 10 dB-значений), сохранение `eqGains` в persistence.

- [ ] **Step 2: Commit** `feat: equalizer ui with presets`

---

### Task 14: Мини-плеер и трей

**Files:**
- Create: `components/MiniPlayer.tsx`
- Modify: `src/main/tray.ts`, `App.tsx`

- [ ] **Step 1: `tray.ts`** — `Tray` с иконкой, контекстное меню: Play/Pause, Next, «Показать», «Выход»; команды шлёт `win.webContents.send('player:cmd', ...)`; клик по иконке — show/focus.

- [ ] **Step 2: `MiniPlayer.tsx` + App** — state `mini: boolean`; toggle вызывает `api.setMiniMode(true/false)`; в mini-режиме App рендерит только MiniPlayer (обложка 48px, название, play/prev/next). В renderer: `api.onPlayerCommand(cmd => …)` → togglePlay/next.

- [ ] **Step 3: Проверить вручную:** трей-кнопки управляют воспроизведением; мини-режим ресайзит окно.

- [ ] **Step 4: Commit** `feat: mini player and system tray`

---

### Task 15: Сборка .exe + финальная верификация

**Files:**
- Create: `electron-builder.yml`

- [ ] **Step 1: `electron-builder.yml`**

```yaml
appId: com.playerdxd.app
productName: Player_DXD
directories:
  output: release
files:
  - out/**
  - resources/**
win:
  target: nsis
  icon: resources/icon.png
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  shortcutName: Player_DXD
```

- [ ] **Step 2: Прогнать тесты**

Run: `npm test`
Expected: все vitest-тесты зелёные

- [ ] **Step 3: Собрать**

Run: `npm run dist`
Expected: `release/Player_DXD Setup 0.1.0.exe` создан без ошибок

- [ ] **Step 4: Smoke-проверка собранного приложения** — установить/запустить из `release/win-unpacked/Player_DXD.exe`: демо-треки играют, плейлист создаётся и переживает перезапуск, трей работает.

- [ ] **Step 5: Commit** `build: electron-builder nsis config`

---

## Self-Review

- **Spec coverage:** окно/трей/IPC (T5, T14), сканирование+метаданные (T6), MusicSource-абстракция (T6: `sourceId` в Track, демо/локал разнесены; VkSource — вне scope v1, как в спеке), движок+EQ (T7, T13), layout/sidebar/playerbar (T8), главная/треки/поиск/плейлисты (T9–T11), очередь+тексты (T12), мини-плеер (T14), exe+тесты (T15). Покрыто всё.
- **Placeholders:** заглушки только в T5 Step 5 — временные, заменяются в T6/T8.
- **Type consistency:** `Track`, `Playlist`, `RepeatMode`, `PersistedData`, `Api` определены в T2/T5 и используются единообразно; `nextIndex`/`prevIndex`/`buildShuffleOrder` — единая сигнатура из T2; `mediaUrl()` из T7 используется везде для воспроизведения.
