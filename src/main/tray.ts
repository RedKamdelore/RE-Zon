import { app, Menu, Tray, nativeImage } from 'electron'
import type { BrowserWindow } from 'electron'
import { join } from 'path'

// electron-builder.yml (Task 15) будет копировать resources/icon.png в resourcesPath
const ICON_PATH = app.isPackaged
  ? join(process.resourcesPath, 'icon.png')
  : join(__dirname, '../../resources/icon.png')

export function createTray(win: BrowserWindow): void {
  // 512px иконку даунскейлим до 16px — иначе в трее Windows выглядит битой
  const icon = nativeImage.createFromPath(ICON_PATH).resize({ width: 16 })
  const tray = new Tray(icon)
  tray.setToolTip('Re:Zon')

  const send = (cmd: string): void => {
    win.webContents.send('player:cmd', cmd)
  }

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Воспроизвести/Пауза', click: () => send('toggle') },
      { label: 'Следующий трек', click: () => send('next') },
      { label: 'Предыдущий трек', click: () => send('prev') },
      { type: 'separator' },
      {
        label: 'Показать Re:Zon',
        click: () => {
          win.show()
          win.focus()
        },
      },
      { label: 'Выход', click: () => app.quit() },
    ]),
  )

  tray.on('click', () => {
    win.show()
    win.focus()
  })
}
