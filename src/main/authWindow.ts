import { BrowserWindow, shell } from 'electron'

/**
 * Универсальное окно веб-авторизации для кнопок «Подключить» (V3-3).
 * Открывает URL логина сервиса, ловит redirect, при котором в URL
 * появляется токен/код, и закрывается. Само ничего не парсит —
 * матчер-предикат передаётся вызывающим кодом.
 *
 * partition (V3-3 VK-web): постоянная сессионная коробка (persist:…) —
 * куки сохраняются на диск и переживают рестарты. Для VK это и есть
 * авторизация: вошёл один раз как в браузер — сессия живёт месяцами.
 */

export interface AuthWindowOptions {
  /** Стартовый URL (oauth.vk.com/authorize, m.vk.com/audio и т.д.) */
  url: string
  /**
   * Признак успеха: вызывается на каждую навигацию/redirect;
   * возвращает данные при перехвате, null — продолжаем ждать.
   */
  match: (url: string) => unknown | null
  /** Заголовок окна */
  title?: string
  /** Ширина/высота */
  width?: number
  height?: number
  /** Постоянная session partition (persist:name) — сессия на диск. */
  partition?: string
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
        // partition: persist-куки на диск (VK-сессия) или изолированная in-memory.
        partition: opts.partition ?? 'rezon-auth',
        sandbox: true,
      },
    })

    const tryMatch = (url: string): void => {
      const m = opts.match(url)
      if (m !== null) finish(m)
    }

    win.webContents.on('did-navigate', (_e, url) => tryMatch(url))
    win.webContents.on('did-navigate-in-page', (_e, url) => tryMatch(url))
    win.on('closed', () => finish(null))

    // Внешние ссылки (помощь сервиса и т.п.) — в системный браузер
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) void shell.openExternal(url)
      return { action: 'deny' }
    })

    void win.loadURL(opts.url)
  })
}
