import { useCallback, useState } from 'react'
import { persistAppearance, readAppearance } from '../appearanceStorage'

// Console v2 display preferences, painted on <html> so plain CSS can follow:
// - Screen distance (V10): `data-density="couch"` swaps in the 10-foot type
//   and target scale; "desk" keeps today's density.
// - Show config names (V12): `data-config-names="on"` reveals the JSM key
//   beside every friendly label that renders a <ConfigName>.

export type Density = 'couch' | 'desk'

const DENSITY_KEY = 'jsm-density'
const NAMES_KEY = 'jsm-config-names'

const readDensity = (): Density => (readAppearance(DENSITY_KEY) === 'couch' ? 'couch' : 'desk')
const readNames = (): boolean => readAppearance(NAMES_KEY) === 'on'

const paintDensity = (density: Density) => { document.documentElement.dataset.density = density }
const paintNames = (on: boolean) => { document.documentElement.dataset.configNames = on ? 'on' : 'off' }

/** Paint the stored choices before the first render, and follow other windows. */
export function initDisplayPrefs() {
  paintDensity(readDensity())
  paintNames(readNames())
  window.addEventListener('storage', event => {
    if (event.key === DENSITY_KEY) paintDensity(readDensity())
    if (event.key === NAMES_KEY) paintNames(readNames())
  })
}

export function useDensity() {
  const [density, setState] = useState<Density>(readDensity)
  const setDensity = useCallback((next: Density) => {
    setState(next)
    paintDensity(next)
    void persistAppearance(DENSITY_KEY, next)
  }, [])
  return { density, setDensity }
}

export function useConfigNames() {
  const [shown, setState] = useState<boolean>(readNames)
  const setShown = useCallback((next: boolean) => {
    setState(next)
    paintNames(next)
    void persistAppearance(NAMES_KEY, next ? 'on' : 'off')
  }, [])
  return { shown, setShown }
}
