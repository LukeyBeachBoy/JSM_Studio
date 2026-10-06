import { restoreAppearance } from '../appearanceStorage'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles/design-tokens.css'
import '../styles/accents.css'
import { initTheme } from '../hooks/useTheme'
import { initAccent } from '../hooks/useAccent'
import { TrayMenu } from './TrayMenu'

void restoreAppearance().then(() => {
  initTheme()
  initAccent()
  const root = document.getElementById('tray-root')
  if (root) createRoot(root).render(<StrictMode><TrayMenu /></StrictMode>)

})
