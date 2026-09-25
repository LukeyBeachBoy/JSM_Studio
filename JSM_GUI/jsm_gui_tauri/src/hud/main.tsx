import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CalibrationHud } from './CalibrationHud'

const root = document.getElementById('hud-root')
if (root) createRoot(root).render(<StrictMode><CalibrationHud /></StrictMode>)
