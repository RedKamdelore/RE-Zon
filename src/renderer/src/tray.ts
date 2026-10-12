import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import TrayPlayer from './components/TrayPlayer'
import type { TrayPlayerApi } from '../../shared/trayPlayer'
import './styles/global.css'
import './styles/tray.css'

declare global { interface Window { trayApi: TrayPlayerApi } }

createRoot(document.getElementById('root')!).render(createElement(TrayPlayer, { api: window.trayApi }))
