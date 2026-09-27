import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles/design-tokens.css'
import { initTheme } from '../hooks/useTheme'
import { TrayMenu } from './TrayMenu'

initTheme()
const root = document.getElementById('tray-root')
if (root) createRoot(root).render(<StrictMode><TrayMenu /></StrictMode>)
