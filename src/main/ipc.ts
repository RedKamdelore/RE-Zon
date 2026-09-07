import { ipcMain, dialog, app, shell, BrowserWindow } from 'electron'
import { join, extname } from 'path'
import { readFile } from 'fs/promises'
import { loadData, saveData } from './persistence'
import { scanFolders, demoTracks } from './library'
import { vkAudioGet, vkAuthUrl, matchVkAuthUrl } from './vk'
import { scSearch, scResolveStream } from './soundcloud'
import { lastfmApi, lfmAuthUrl, matchLfmAuthUrl, lfmGetSession, lfmScrobble, type ScrobblePayload } from './lastfm'
import { openAuthWindow } from './authWindow'
import {
  spPkceVerifier,
  spPkceChallenge,
  spAuthUrl,
  spExchange,
  spRefresh,
  spPlaylists,
  spPlaylistTracks,
} from './spotify'
import { connectionStatus, type ServiceId } from '../shared/connections'
import type { PersistedData, LfmCallResult } from '../shared/types'
import type { VkImportResult, ScSearchResult } from '../shared/matching'

const COVER_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

// electron-builder.yml (Task 15) будет копировать resources/demo в resourcesPath
const DEMO_DIR = app.isPackaged
  ? join(process.resourcesPath, 'demo')
  : join(__dirname, '../../resources/demo')

export function registerIpc(win: BrowserWindow): void {
  ipcMain.handle('data:load', () => loadData())
  ipcMain.handle('data:save', (_e, data: PersistedData) => saveData(data))
  ipcMain.handle('library:pickFolder', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('library:scan', (_e, folders: string[]) => scanFolders(folders))
  ipcMain.handle('library:demo', () => demoTracks(DEMO_DIR))
  ipcMain.handle('vk:import', async (_e, token: string): Promise<VkImportResult> => {
    try {
      return { ok: true, tracks: await vkAudioGet(token) }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
  ipcMain.handle('sc:search', async (_e, query: string): Promise<ScSearchResult> => {
    try {
      return { ok: true, tracks: await scSearch(query) }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
  // Last.fm зовём из main: API блокируется по региону, через main можно идти по прокси
  ipcMain.handle(
    'lastfm:call',
    async (_e, method: string, params: Record<string, string | number>): Promise<LfmCallResult> => {
      try {
        const data = loadData()
        return { ok: true, data: await lastfmApi(method, params, data.lastfmApiKey, data.lastfmProxy) }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    },
  )
  // Transcoding API URL → финальный mp3-поток (резолвится при воспроизведении)
  ipcMain.handle('sc:resolveStream', (_e, url: string): Promise<string> => scResolveStream(url))
  ipcMain.handle('playlist:pickCover', async () => {
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Изображения', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    })
    if (r.canceled || r.filePaths.length === 0) return null
    const file = r.filePaths[0]
    const mime = COVER_MIME[extname(file).toLowerCase()]
    if (!mime) return null
    const buf = await readFile(file)
    return `data:${mime};base64,${buf.toString('base64')}`
  })
  ipcMain.handle('window:mini', (_e, mini: boolean) => {
    if (mini) { win.setAlwaysOnTop(true); win.setMinimumSize(360, 120); win.setSize(360, 140) }
    else { win.setAlwaysOnTop(false); win.setMinimumSize(940, 600); win.setSize(1280, 800) }
  })
  ipcMain.on('player:cmd', (_e, cmd: string) => win.webContents.send('player:cmd', cmd))
  ipcMain.on('shell:showItemInFolder', (_e, p: string) => shell.showItemInFolder(p))

  // --- Подключения сервисов (V3-3) ------------------------------------------

  /** Статусы всех сервисов: connected-флаги без токенов */
  ipcMain.handle('connections:list', () => {
    const conns = loadData().connections
    const out: Record<string, ReturnType<typeof connectionStatus>> = {}
    for (const id of ['vk', 'lastfm', 'spotify', 'yandex'] as ServiceId[]) {
      out[id] = connectionStatus(conns, id)
    }
    return out
  })

  /** Записывает/заменяет подключение (токен уже получен) в persistence */
  ipcMain.handle(
    'connections:save',
    (_e, id: ServiceId, conn: { token: string; userId?: string; refreshToken?: string }) => {
      const data = loadData()
      const connections = {
        ...data.connections,
        [id]: { token: conn.token, connectedAt: Date.now(), userId: conn.userId, refreshToken: conn.refreshToken },
      }
      saveData({ ...data, connections })
      return connectionStatus(connections, id)
    },
  )

  /** Удаляет подключение сервиса */
  ipcMain.handle('connections:disconnect', (_e, id: ServiceId) => {
    const data = loadData()
    const connections = { ...data.connections }
    delete connections[id]
    saveData({ ...data, connections })
    return true
  })

  /** Запоминает имя плейлиста последнего импорта (реимпорт обновит его) */
  ipcMain.handle('connections:setPlaylistName', (_e, id: ServiceId, name: string) => {
    const data = loadData()
    const prev = data.connections[id]
    if (!prev) return false
    saveData({
      ...data,
      connections: { ...data.connections, [id]: { ...prev, playlistName: name } },
    })
    return true
  })

  /** OAuth VK: окно → fragment access_token → сохраняем соединение */
  ipcMain.handle('connect:vk', async (): Promise<{ ok: boolean; error?: string; userId?: string }> => {
    const auth = (await openAuthWindow(win, {
      url: vkAuthUrl(),
      title: 'Вход ВКонтакте',
      match: matchVkAuthUrl,
    })) as Awaited<ReturnType<typeof matchVkAuthUrl>> | null
    if (!auth) return { ok: false, error: 'Авторизация не завершена' }
    const data = loadData()
    saveData({
      ...data,
      connections: {
        ...data.connections,
        vk: { token: auth.token, connectedAt: Date.now(), userId: auth.userId },
      },
    })
    return { ok: true, userId: auth.userId }
  })

  /** OAuth Last.fm: окно → token → auth.getSession → бессрочная сессия */
  ipcMain.handle('connect:lastfm', async (): Promise<{ ok: boolean; error?: string; username?: string }> => {
    const data = loadData()
    const apiKey = data.lastfmApiKey
    if (!apiKey) return { ok: false, error: 'Сначала введите API key в полях ниже' }
    const token = (await openAuthWindow(win, {
      url: lfmAuthUrl(apiKey),
      title: 'Вход Last.fm',
      width: 480,
      height: 640,
      match: matchLfmAuthUrl,
    })) as string | null
    if (!token) return { ok: false, error: 'Авторизация не завершена' }
    try {
      const session = await lfmGetSession(apiKey, data.lastfmApiSecret, token, data.lastfmProxy)
      saveData({
        ...data,
        connections: {
          ...data.connections,
          lastfm: { token: session.key, connectedAt: Date.now(), userId: session.username },
        },
      })
      return { ok: true, username: session.username }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  /** Скробблинг (V3-4): батч прослушанных треков в Last.fm-профиль */
  ipcMain.handle(
    'lastfm:scrobble',
    async (_e, scrobbles: ScrobblePayload[]): Promise<{ ok: boolean; count?: number; error?: string }> => {
      try {
        const data = loadData()
        const sk = data.connections.lastfm?.token
        if (!sk) return { ok: false, error: 'Last.fm не подключён' }
        const count = await lfmScrobble(
          data.lastfmApiKey,
          data.lastfmApiSecret,
          sk,
          data.lastfmProxy,
          scrobbles,
        )
        return { ok: true, count }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    },
  )

  // --- Spotify PKCE (V3-3) ----------------------------------------------------

  /**
   * OAuth PKCE: открываем окно авторизации и параллельно поднимаем
   * одноразовый HTTP-сервер на 127.0.0.1:8888 — Spotify redirect'ит на него
   * с ?code=. Возвращаемся с access/refresh токенами.
   */
  ipcMain.handle('connect:spotify', async (): Promise<{ ok: boolean; error?: string }> => {
    const data = loadData()
    const clientId = (data.importSources as { spotifyClientId?: string }).spotifyClientId ?? ''
    if (!clientId) return { ok: false, error: 'Сначала укажите Client ID в полях ниже' }

    const verifier = spPkceVerifier()
    const state = spPkceVerifier().slice(0, 24)
    const { createServer } = await import('http')

    // Одноразовый callback-сервер: резолвимся при ?code=, закрываемся сразу
    const codePromise = new Promise<string>((resolve, reject) => {
      const srv = createServer((req, res) => {
        const url = `http://127.0.0.1:8888${req.url ?? '/'}`
        const m = url.includes('code=') ? new URLSearchParams(url.split('?')[1]).get('code') : null
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end('<h3>Re:Zon — Spotify подключён. Можно закрыть это окно.</h3>')
        if (m) {
          resolve(m)
          srv.close()
        }
      })
      srv.on('error', (e) => reject(e))
      srv.listen(8888, '127.0.0.1')
      // Тайтмаут 3 минуты: закрыли окно / передумали
      setTimeout(() => {
        reject(new Error('Время ожидания истекло'))
        srv.closeAllConnections?.()
        srv.close()
      }, 180_000).unref?.()
    })

    // Окно авторизации: любой уход с accounts.spotify.com нас не интересует —
    // код придёт на callback-сервер. Окно закрываем по resolve.
    const windowPromise = openAuthWindow(win, {
      url: spAuthUrl(clientId, spPkceChallenge(verifier), state),
      title: 'Вход Spotify',
      width: 480,
      // Матчим финальный redirect — окно закрывается как только код получен
      match: (url) => (/127\.0\.0\.1:8888/.test(url) ? 'done' : null),
    })

    let code: string
    try {
      code = await codePromise
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    } finally {
      await windowPromise
    }

    try {
      const tokens = await spExchange(clientId, code, verifier)
      saveData({
        ...data,
        connections: {
          ...data.connections,
          spotify: {
            token: tokens.accessToken,
            connectedAt: Date.now(),
            refreshToken: tokens.refreshToken,
          },
        },
      })
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  /**
   * Импорт плейлистов Spotify: refresh токена (access живёт 1 час),
   * выкачка плейлистов с треками. Метаданные для матчинга по библиотеке —
   * стриминга из Spotify нет (нет Web API playback для бесплатных ключей).
   */
  ipcMain.handle('spotify:import', async (): Promise<
    { ok: true; playlists: Array<{ id: string; name: string; tracks: Array<{ title: string; artist: string }> }> } | { ok: false; error: string }
  > => {
    const data = loadData()
    const conn = data.connections.spotify
    const clientId = (data.importSources as { spotifyClientId?: string }).spotifyClientId ?? ''
    if (!conn?.refreshToken || !clientId) {
      return { ok: false, error: 'Spotify не подключён' }
    }
    try {
      // refresh: access-токен мог протухнуть (1 час), refresh бессрочный
      const tokens = await spRefresh(clientId, conn.refreshToken)
      saveData({
        ...data,
        connections: {
          ...data.connections,
          spotify: { ...conn, token: tokens.accessToken, refreshToken: tokens.refreshToken },
        },
      })
      const lists = await spPlaylists(tokens.accessToken)
      const out = []
      for (const pl of lists) {
        out.push({ id: pl.id, name: pl.name, tracks: await spPlaylistTracks(tokens.accessToken, pl.id) })
      }
      return { ok: true, playlists: out }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
}
