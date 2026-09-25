import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { requestProfileReset } from './profileReset'

export function registerProfileReset(getWindow: () => BrowserWindow | null, canReset: () => boolean): void {
  let pending = false
  ipcMain.handle('profile:reset', async event => {
    const win = getWindow()
    if (!win || win.isDestroyed()) return false
    if (event.sender !== win.webContents || pending) return false
    if (!canReset()) throw new Error('Дождитесь завершения операции обновления.')
    pending = true
    try {
      const result = await dialog.showMessageBox(win, {
        type: 'warning', title: 'Сбросить данные Re:Zon?',
        message: 'Удалить локальный профиль и начать заново?',
        detail: 'Будут удалены настройки, плейлисты, избранное, сохранённые тексты, данные входа и кэш этого профиля. Аккаунты в самих сервисах и музыкальные файлы вне папки профиля останутся. Действие нельзя отменить. Re:Zon перезапустится.',
        buttons: ['Отмена', 'Удалить данные и перезапустить'], defaultId: 0, cancelId: 0, noLink: true,
      })
      if (result.response !== 1) return false
      if (!canReset()) throw new Error('Дождитесь завершения операции обновления.')
      requestProfileReset(app.getPath('appData'), app.getPath('userData'))
      app.relaunch()
      // No beforeunload persistence: clearing happens after this process exits.
      app.exit(0)
      return true
    } finally { pending = false }
  })
}
