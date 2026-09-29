import { useAccent } from '../hooks/useAccent'
import { markFor, type Accent } from '../brand/brand'

type BrandMarkProps = {
  size: number
  /** Show a specific colour rather than the chosen one (the Appearance swatches). */
  accent?: Accent
  className?: string
}

/** The JSM Evolved mark in the chosen accent; the 16px cut below 24px. */
export function BrandMark({ size, accent, className }: BrandMarkProps) {
  const chosen = useAccent().accent
  return <img className={className} src={markFor(accent ?? chosen, size)} alt="" width={size} height={size} draggable={false} />
}
