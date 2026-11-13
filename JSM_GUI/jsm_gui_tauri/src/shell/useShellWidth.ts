import { useEffect, useState } from 'react'

/**
 * wide    ≥ 1280: labelled tabs and full section rail.
 * compact ≥ 900: labelled tabs in their own row and a compact section rail.
 * narrow  < 900: below the supported app minimum, tabs use the drawer.
 */
export type ShellWidth = 'wide' | 'compact' | 'narrow'

const measure = (): ShellWidth => {
  const width = typeof window === 'undefined' ? 1440 : window.innerWidth
  return width < 900 ? 'narrow' : width < 1280 ? 'compact' : 'wide'
}

export function useShellWidth() {
  const [width, setWidth] = useState<ShellWidth>(measure)
  useEffect(() => {
    const update = () => setWidth(measure())
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return width
}
