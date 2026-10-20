import { restoreAppearance } from '../appearanceStorage'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Tokens only (no element styles): the accent and theme reach this window too.
import '../styles/design-tokens.css'
import '../styles/accents.css'
import { initAccent } from '../hooks/useAccent'
import { initI18n } from '../i18n'
import { Overlay } from './Overlay'

void restoreAppearance().then(async () => {
  await initI18n({ updateDocumentTitle: false })
  initAccent()
  const root = document.getElementById('overlay-root')
  if (root) createRoot(root).render(<StrictMode><Overlay /></StrictMode>)

})
