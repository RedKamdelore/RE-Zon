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
  /** Дополнительное подтверждение веб-сессии: URL сам по себе не доказывает вход. */
  validateMatch?: () => Promise<boolean>
  /** Заголовок окна */
  title?: string
  /** Ширина/высота */
  width?: number
  height?: number
  /** Постоянная session partition (persist:name) — сессия на диск. */
  partition?: string
  /** OAuth callback можно перехватить до загрузки локального адреса. */
  interceptRedirect?: boolean
  /** Использовать стандартную строку Chromium для совместимости формы входа. */
  browserCompatibility?: boolean
  /** undefined сохраняет стандартную сеть; пустая строка возвращает системный прокси. */
  proxyUrl?: string
  forbiddenMessage?: string
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
  return new Promise((resolve, reject) => {
    let done = false
    let lastUrl = ''
    let checking = false
    let validationTimer: ReturnType<typeof setInterval> | undefined
    const finish = (value: unknown | null, error?: Error): void => {
      if (done) return
      done = true
      if (validationTimer) clearInterval(validationTimer)
      try {
        win.close()
      } catch {
        // окно могло закрыться само
      }
      if (error) reject(error)
      else resolve(value)
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

    if (opts.browserCompatibility) {
      const userAgent = win.webContents.session.getUserAgent()
        .replace(/\sElectron\/\S+/gi, '')
        .replace(/\srezon\/\S+/gi, '')
      win.webContents.session.setUserAgent(userAgent, 'ru-RU,ru;q=0.9,en;q=0.8')
      win.webContents.setUserAgent(userAgent)
    }

    const tryMatch = (url: string): void => {
      lastUrl = url
      if (done) return
      const m = opts.match(url)
      if (m === null) return
      if (!opts.validateMatch) { finish(m); return }
      if (checking) return
      checking = true
      void opts.validateMatch().then(valid => {
        if (valid && lastUrl === url && !done) finish(m)
      }).catch(() => { /* При временной ошибке проверки оставляем окно входа открытым. */ })
        .finally(() => { checking = false })
    }
    if (opts.validateMatch) validationTimer = setInterval(() => tryMatch(lastUrl), 1000)

    win.webContents.on('did-navigate', (_e, url, status) => {
      if (status === 403 && opts.forbiddenMessage) {
        finish(null, new Error(opts.forbiddenMessage))
        return
      }
      tryMatch(url)
    })
    win.webContents.on('did-navigate-in-page', (_e, url) => tryMatch(url))
    if (opts.interceptRedirect) {
      const intercept = (event: Electron.Event, url: string): void => {
        const result = opts.match(url)
        if (result !== null) { event.preventDefault(); finish(result) }
      }
      win.webContents.on('will-redirect', intercept)
      win.webContents.on('will-navigate', intercept)
    }
    win.on('closed', () => finish(null))

    // Внешние ссылки (помощь сервиса и т.п.) — в системный браузер
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) void shell.openExternal(url)
      return { action: 'deny' }
    })

    const load = async (): Promise<void> => {
      if (opts.proxyUrl !== undefined) {
        const ses = win.webContents.session
        if (opts.proxyUrl.trim()) {
          let proxy: URL
          try { proxy = new URL(opts.proxyUrl.trim()) }
          catch { throw new Error('Неверный адрес прокси. Используйте http://host:port') }
          if (!['http:', 'https:'].includes(proxy.protocol)) throw new Error('Для входа поддерживается HTTP/HTTPS-прокси')
          if (proxy.username || proxy.password) {
            win.webContents.on('login', (event, _details, auth, callback) => {
              if (!auth.isProxy || auth.host !== proxy.hostname) return
              event.preventDefault()
              callback(decodeURIComponent(proxy.username), decodeURIComponent(proxy.password))
            })
          }
          await ses.setProxy({ mode: 'fixed_servers', proxyRules: proxy.origin })
        } else {
          await ses.setProxy({ mode: 'system' })
        }
        await ses.closeAllConnections()
      }
      if (!done) await win.loadURL(opts.url)
    }
    void load().catch(() => {
      if (!done) finish(null, new Error('Не удалось открыть страницу входа. Проверьте соединение и адрес прокси в настройках сервиса.'))
    })
  })
}
