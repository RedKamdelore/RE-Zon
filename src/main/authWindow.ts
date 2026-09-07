import { BrowserWindow, shell } from 'electron'

/**
 * Универсальное окно веб-авторизации для кнопок «Подключить» (V3-3).
 * Открывает URL логина сервиса, ловит redirect, при котором в URL
 * появляется токен/код, и закрывается. Само ничего не парсит —
 * матчер-предикат передаётся вызывающим кодом (VK: fragment
 * access_token=, Spotify: ?code=, Яндекс: cookie/token по политике сервиса).
 */

export interface AuthWindowOptions {
  /** Стартовый URL (oauth.vk.com/authorize, accounts.spotify.com/… и т.д.) */
  url: string
  /**
   * Признак успеха: вызывается на каждую навигацию/redirect;
   * возвращает данные при перехвате, null — продолжаем ждать.
   */
  match: (url: string) => unknown | null
  /** Заголовок окна */
  title?: string
  /** Ширина/высота (VK/Spotify хватает 720×640) */
  width?: number
  height?: number
}

/**
 * Открывает окно авторизации. Промис резолвится данными из match() либо
 * null (пользователь закрыл окно без авторизации). Окно всегда закрывается
 * само при резолве/закрытии пользователем — утечки нет.
 */
export function openAuthWindow(
  parent: BrowserWindow | null,
  opts: AuthWindowOptions,
): Promise<unknown | null> {
  return new Promise((resolve) => {
    let done = false
    const finish = (value: unknown | null): void => {
      if (done) return
      done = true
      try {
        win.close()
      } catch {
        // окно могло закрыться само
      }
      resolve(value)
    }

    const win = new BrowserWindow({
      width: opts.width ?? 720,
      height: opts.height ?? 640,
      parent: parent ?? undefined,
      modal: parent !== null,
      title: opts.title ?? 'Вход в сервис',
      autoHideMenuBar: true,
      backgroundColor: '#121212',
      webPreferences: {
        // Авторизационное окно — без preload, только сайт сервиса.
        // nodeIntegration выключен по умолчанию; sandbox true.
        sandbox: true,
      },
    })

    // Стрим URL-изменений VK не всегда даёт did-navigate (fragment!),
    // поэтому матчим оба события; fragment приходит в url обоих.
    const tryMatch = (url: string): void => {
      const m = opts.match(url)
      if (m !== null) finish(m)
    }

    win.webContents.on('did-navigate', (_e, url) => tryMatch(url))
    win.webContents.on('did-redirect-navigation' as never, (_e: unknown, url: string) => tryMatch(url))
    win.on('closed', () => finish(null))

    // Внешние ссылки (помощь сервиса и т.п.) — в системный браузер
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) void shell.openExternal(url)
      return { action: 'deny' }
    })

    void win.loadURL(opts.url)
  })
}
