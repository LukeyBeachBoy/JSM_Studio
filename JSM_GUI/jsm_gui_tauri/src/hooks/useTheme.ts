import { useEffect, useState, useCallback } from 'react'
import { persistAppearance, readAppearance } from '../appearanceStorage'

/** The choice: Dark, Light, or follow the OS (Preferences 16j). */
export type Theme = 'dark' | 'light' | 'system'
export type ResolvedTheme = 'dark' | 'light'

const STORAGE_KEY = 'jsm-theme'
const THEMES: Theme[] = ['dark', 'light', 'system']

const query = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: light)') : null)
const systemTheme = (): ResolvedTheme => (query()?.matches ? 'light' : 'dark')
const resolve = (theme: Theme): ResolvedTheme => (theme === 'system' ? systemTheme() : theme)
const readStored = (): Theme => {
  try {
    const stored = readAppearance(STORAGE_KEY)
    return THEMES.includes(stored as Theme) ? (stored as Theme) : 'dark'
  } catch { return 'dark' }
}
const paint = (theme: Theme) => { document.documentElement.dataset.theme = resolve(theme) }

/**
 * Paint the stored choice before the first render, and keep "System" in step
 * with the OS for the life of the window. The hook below used to be the only
 * thing that applied the choice, and it only runs on pages that show the
 * theme (Preferences, the gyro graph): Light reverted to dark on every
 * launch until one of those pages was opened.
 */
export function initTheme() {
  paint(readStored())
  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY) paint(readStored())
  })
  query()?.addEventListener?.('change', () => { if (readStored() === 'system') paint('system') })
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readStored)
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolve(readStored()))

  const apply = useCallback((next: Theme, broadcast = true) => {
    setTheme(next)
    setResolved(resolve(next))
    void persistAppearance(STORAGE_KEY, next)
    paint(next)
    if (broadcast && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent<Theme>('jsm-theme-changed', { detail: next }))
    }
  }, [])

  useEffect(() => {
    const stored = readStored()
    setTheme(stored)
    setResolved(resolve(stored))
    paint(stored)

    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && event.newValue && THEMES.includes(event.newValue as Theme)) {
        const next = event.newValue as Theme
        setTheme(next)
        setResolved(resolve(next))
        paint(next)
      }
    }
    const onCustom = (event: Event) => {
      const next = (event as CustomEvent<Theme>).detail
      if (next) { setTheme(next); setResolved(resolve(next)) }
    }
    // System follows the OS as it changes, not just at launch.
    const media = query()
    const onMedia = () => {
      if (readStored() !== 'system') return
      setResolved(systemTheme())
      paint('system')
    }
    media?.addEventListener?.('change', onMedia)

    window.addEventListener('storage', onStorage)
    window.addEventListener('jsm-theme-changed', onCustom as EventListener)
    return () => {
      media?.removeEventListener?.('change', onMedia)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('jsm-theme-changed', onCustom as EventListener)
    }
  }, [apply])

  const toggle = useCallback(() => {
    apply(resolved === 'dark' ? 'light' : 'dark')
  }, [apply, resolved])

  return { theme, resolved, setTheme: apply, toggle }
}
