import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_ACCENT, isAccent, type Accent } from '../brand/brand'
import { syncBrandIcons } from '../brand/brandIcons'

/**
 * The accent (Appearance page): which of the four JSM Evolved marks the app
 * wears. Mirrors useTheme: painted on <html> as data-accent before the first
 * render, kept in localStorage, and broadcast so every window (the tray menu,
 * the overlay) follows the same pick.
 */
const STORAGE_KEY = 'jsm-accent'
const EVENT = 'jsm-accent-changed'

const readStored = (): Accent => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isAccent(stored) ? stored : DEFAULT_ACCENT
  } catch { return DEFAULT_ACCENT }
}
const paint = (accent: Accent) => { document.documentElement.dataset.accent = accent }

let ownsIcons = false

/**
 * Paint the stored accent before anything draws. The main window also owns
 * the window and tray icons: it redraws them now (the exe's icon is always
 * cyan) and whenever the pick changes, in this window or another.
 */
export function initAccent(options: { syncIcons?: boolean } = {}) {
  const accent = readStored()
  paint(accent)
  ownsIcons = !!options.syncIcons
  if (ownsIcons) syncBrandIcons(accent)
  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY && isAccent(event.newValue)) {
      paint(event.newValue)
      if (ownsIcons) syncBrandIcons(event.newValue)
    }
  })
}

export const currentAccent = (): Accent => {
  const painted = typeof document !== 'undefined' ? document.documentElement.dataset.accent : undefined
  return isAccent(painted) ? painted : readStored()
}

export function useAccent() {
  const [accent, setAccentState] = useState<Accent>(currentAccent)

  const setAccent = useCallback((next: Accent) => {
    setAccentState(next)
    paint(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* private mode */ }
    if (ownsIcons) syncBrandIcons(next)
    window.dispatchEvent(new CustomEvent<Accent>(EVENT, { detail: next }))
  }, [])

  useEffect(() => {
    const onCustom = (event: Event) => {
      const next = (event as CustomEvent<Accent>).detail
      if (isAccent(next)) setAccentState(next)
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && isAccent(event.newValue)) setAccentState(event.newValue)
    }
    window.addEventListener(EVENT, onCustom)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(EVENT, onCustom)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  return { accent, setAccent }
}
