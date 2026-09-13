import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Overlay } from './Overlay'

const root = document.getElementById('overlay-root')
if (root) createRoot(root).render(<StrictMode><Overlay /></StrictMode>)
