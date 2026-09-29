import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Tokens only (no element styles): the accent and theme reach this window too.
import '../styles/design-tokens.css'
import '../styles/accents.css'
import { initAccent } from '../hooks/useAccent'
import { CalibrationHud } from './CalibrationHud'

initAccent()
const root = document.getElementById('hud-root')
if (root) createRoot(root).render(<StrictMode><CalibrationHud /></StrictMode>)
