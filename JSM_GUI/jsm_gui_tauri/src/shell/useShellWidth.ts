import { useEffect, useState } from 'react'

/**
 * wide    ≥ 1280: tabs with labels, 216px section list.
 * compact ≥ 1024: tabs show icons except the selected one, 184px section list,
 *                 Applied folds into the Editing menu.
 * narrow  < 1024: tabs and section list fold into the drawer button.
 *
 * HANDOFF.md puts the drawer below 1060px, but its own frame 3b draws
 * 1024 × 720 with compact tabs as the minimum comfortable size; the frame
 * wins, so the drawer starts below 1024.
 */
export type ShellWidth = 'wide' | 'compact' | 'narrow'

const measure = (): ShellWidth => {
  const width = typeof window === 'undefined' ? 1440 : window.innerWidth
  return width < 1024 ? 'narrow' : width < 1280 ? 'compact' : 'wide'
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
