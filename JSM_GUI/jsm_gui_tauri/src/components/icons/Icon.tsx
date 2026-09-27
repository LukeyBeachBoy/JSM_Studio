import { MODE_ICONS, UI_ICONS, type IconName } from './iconData'

export type { IconName } from './iconData'

// Optical stroke per rendered size, in user units of the 24 viewBox
// (HANDOFF.md, "Icons and glyphs"): 1.5px at 16, 1.75 at 20, 2 at 24, 2.5 at
// 36, 3 at 48. One drawing, re-tuned per size, rather than a set per size.
const STROKE_RAMP: [size: number, stroke: number][] = [[16, 2.25], [20, 2.1], [24, 2], [36, 1.67], [48, 1.5]]

export const opticalStroke = (size: number) => {
  if (size <= STROKE_RAMP[0][0]) return STROKE_RAMP[0][1]
  for (let index = 1; index < STROKE_RAMP.length; index++) {
    const [s1, w1] = STROKE_RAMP[index]
    if (size <= s1) {
      const [s0, w0] = STROKE_RAMP[index - 1]
      return +(w0 + ((w1 - w0) * (size - s0)) / (s1 - s0)).toFixed(3)
    }
  }
  return STROKE_RAMP[STROKE_RAMP.length - 1][1]
}

// Drawings imported with a stroke of their own rather than the ramp: the cog
// is Lucide's "settings" at 1.8 (binding card refresh §1).
const FIXED_STROKE: Partial<Record<IconName, number>> = { cog: 1.8 }

type IconProps = {
  name: IconName
  size?: number
  className?: string
  /** Given a title the icon is announced; without one it is decorative. */
  title?: string
}

export function Icon({ name, size = 20, className, title }: IconProps) {
  const markup = (UI_ICONS as Record<string, string>)[name] ?? (MODE_ICONS as Record<string, string>)[name] ?? ''
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={FIXED_STROKE[name] ?? opticalStroke(size)}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      data-icon={name}
      // Generated from the handoff SVGs at build time; no runtime input.
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  )
}
