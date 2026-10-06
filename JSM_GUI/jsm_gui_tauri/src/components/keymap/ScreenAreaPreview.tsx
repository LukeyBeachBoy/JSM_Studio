import { padFootprint, sanitizeMouseArea, type MouseArea, type MouseAreaFit } from '../../utils/mouseArea'

// A thumbnail of the screen with a Mouse area pad's rectangle on it, for the
// pad's well in the editor. The screen is drawn 16:9 (the shape of nearly
// every monitor the mapper will meet); the rectangle is fractions, so it is
// right whatever the real resolution. Under UNIFORM the pad's full travel is
// dashed, as the picker draws it.

type Props = {
  area: MouseArea | null
  fit: MouseAreaFit
  padAspect: number
  /** Width in CSS pixels; the height follows 16:9. */
  width?: number
  /** The live finger, as screen fractions, when a pad is being touched. */
  cursor?: { x: number; y: number } | null
}

export function ScreenAreaPreview({ area, fit, padAspect, width = 176, cursor }: Props) {
  const W = 160
  const H = 90
  const shown = sanitizeMouseArea(area ?? { x: 0, y: 0, w: 1, h: 1 })
  const footprint = fit === 'UNIFORM' ? padFootprint(shown, fit, padAspect, 16 / 9) : null
  return (
    <svg viewBox={`-2 -2 ${W + 4} ${H + 4}`} width={width} height={Math.round((width * (H + 4)) / (W + 4))} aria-hidden="true" style={{ display: 'block' }}>
      <rect x={0} y={0} width={W} height={H} rx={4} fill="var(--surface-sunken)" stroke="var(--line-2)" />
      {footprint && (
        <rect x={footprint.x * W} y={footprint.y * H} width={footprint.w * W} height={footprint.h * H}
          fill="none" stroke="var(--text-3)" strokeDasharray="3 3" strokeWidth={1} />
      )}
      <rect x={shown.x * W} y={shown.y * H} width={shown.w * W} height={shown.h * H} rx={1.5}
        fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth={1.5} />
      {cursor && (
        <circle cx={cursor.x * W} cy={cursor.y * H} r={3} fill="var(--accent)" stroke="var(--surface-sunken)" strokeWidth={1} />
      )}
    </svg>
  )
}
