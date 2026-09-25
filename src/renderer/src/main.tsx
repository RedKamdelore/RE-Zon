import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/global.css'
import './styles/shell.css'
import './styles/components.css'
import './styles/pages.css'
import { applyTheme, DEFAULT_APPEARANCE } from './theme'

applyTheme(DEFAULT_APPEARANCE.theme)

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
