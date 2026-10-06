import type { ReactNode } from 'react'
import { useAppIcon } from '../hooks/useAppIcon'

// A game's icon where a generic glyph used to be (TODO-46): the Configurations
// rows, the Selected panel, the Home card and the Associations list. Falls back
// to whatever the host drew before while the icon loads or when there is none.
export function AppIconImage({ exePath, size, alt = '', fallback, className }: { exePath: string | null | undefined; size: number; alt?: string; fallback: ReactNode; className?: string }) {
  const url = useAppIcon(exePath)
  if (!url) return <>{fallback}</>
  return <img src={url} width={size} height={size} alt={alt} className={className} draggable={false} data-app-icon={exePath ?? undefined} style={{ width: size, height: size, objectFit: 'contain', borderRadius: Math.round(size / 5) }} />
}
