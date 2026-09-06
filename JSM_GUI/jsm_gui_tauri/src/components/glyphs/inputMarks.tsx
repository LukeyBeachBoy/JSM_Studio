import type { ReactNode } from 'react'
import type { ControllerVisualFamily } from '../../utils/controllerStatus'

// What a controller family actually prints on its buttons, drawn on its own with
// no button body around it. InputGlyph draws a body underneath these; the live
// controller diagram already draws its own, so it takes them bare.
//
// These are drawings rather than font characters on purpose: the ones a font
// does have (triangle, circle, cross, square, the little house) come out
// off-centre and at the wrong weight inside a button, and the rest are missing
// from most UI fonts entirely.

/** Centred letter, for the families that print letters on their face buttons. */
export const Letter = ({ char, size = 8.6 }: { char: string; size?: number }) => (
  <text
    x="8"
    y="8.15"
    textAnchor="middle"
    dominantBaseline="central"
    fontSize={size}
    fontWeight="800"
    fill="currentColor"
    stroke="none"
    fontFamily="inherit"
    letterSpacing="-0.02em"
  >
    {char}
  </text>
)

// PlayStation prints shapes rather than letters.
const PS_SHAPES: Record<string, ReactNode> = {
  N: <path d="M8 4.3 10.9 9.9H5.1z" />,
  E: <circle cx="8" cy="8" r="2.9" />,
  S: <path d="M5.7 5.7 10.3 10.3M10.3 5.7 5.7 10.3" />,
  W: <rect x="5.3" y="5.3" width="5.4" height="5.4" rx="0.7" />,
}

// Which letter each family prints on which physical position. An unrecognised
// controller gets the Xbox layout rather than N/E/S/W: those are JoyShockMapper
// command names, not anything printed on a pad, and Steam falls back the same way.
const FACE_LETTERS: Record<Exclude<ControllerVisualFamily, 'playstation'>, Record<string, string>> = {
  xbox: { N: 'Y', E: 'B', S: 'A', W: 'X' },
  steam: { N: 'Y', E: 'B', S: 'A', W: 'X' },
  nintendo: { N: 'X', E: 'A', S: 'B', W: 'Y' },
  generic: { N: 'Y', E: 'B', S: 'A', W: 'X' },
}

/** What a family prints on one of the four face buttons. */
export const FaceMark = ({ command, family }: { command: string; family: ControllerVisualFamily }) =>
  family === 'playstation' ? (
    <>{PS_SHAPES[command] ?? <Letter char={command} />}</>
  ) : (
    <Letter char={FACE_LETTERS[family][command] ?? command} />
  )

/** Quick Access is the "..." button on a Steam Controller. */
export const QuickAccessMark = () => (
  <>
    <circle cx="5.2" cy="8" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="8" cy="8" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="10.8" cy="8" r="0.9" fill="currentColor" stroke="none" />
  </>
)

/** Menu / Options: three stacked lines on every family except Nintendo, which
 *  really does print a plus. */
export const MenuMark = ({ family }: { family: ControllerVisualFamily }) =>
  family === 'nintendo' ? (
    <path d="M8 5.9v4.2M5.9 8h4.2" />
  ) : (
    <path d="M5.2 6.4h5.6M5.2 8h5.6M5.2 9.6h5.6" strokeWidth="1.2" />
  )

/** View / Share: two overlapping panes, the modern Xbox View glyph. Nintendo
 *  prints a minus. */
export const ViewMark = ({ family }: { family: ControllerVisualFamily }) =>
  family === 'nintendo' ? (
    <path d="M5.9 8h4.2" />
  ) : (
    <>
      <rect x="4.6" y="5.9" width="4" height="4.2" rx="0.7" strokeWidth="1.2" />
      <path d="M9.1 6.7h2.3v3.4" strokeWidth="1.2" />
    </>
  )

/** The home button's marking: the valve stem for Steam -- the silhouette Valve's
 *  mark reads as at this size, drawn rather than copied -- and each other
 *  family's own. */
export const HomeMark = ({ family }: { family: ControllerVisualFamily }) => {
  if (family === 'steam') {
    return (
      <>
        <circle cx="9.6" cy="6.4" r="2" />
        <path d="M4.1 9.9 7.8 8.2" />
        <circle cx="5.3" cy="10.4" r="1.5" />
      </>
    )
  }
  if (family === 'playstation') return <Letter char="PS" size={5.6} />
  if (family === 'nintendo') return <path d="M5.4 8.2 8 5.8l2.6 2.4M6.4 7.6v2.9h3.2V7.6" />
  // Xbox nexus: the ring with the stylised X.
  return <path d="M5.6 11.2c.7-2 1.6-3.3 2.4-4.1.8.8 1.7 2.1 2.4 4.1M6.2 4.9C7 5.4 7.6 6 8 6.4c.4-.4 1-1 1.8-1.5" />
}

type InputMarkProps = {
  command: string
  family: ControllerVisualFamily
  /** Centre of the button this marking is printed on, in the caller's own units. */
  cx: number
  cy: number
  /** Radius of that button, so the marking is scaled to sit inside it. */
  radius: number
  className?: string
  /** Drawn instead when this family just prints a letter (A, LB, ...), which a
   *  plain text label already renders well. */
  fallback?: ReactNode
}

/** One input's marking, placed on a button that the caller has already drawn --
 *  the live controller diagram, which works in its own large coordinate space
 *  rather than the 16px box the icons use. */
export function InputMark({ command, family, cx, cy, radius, className, fallback }: InputMarkProps) {
  const key = command.toUpperCase()
  let mark: ReactNode = null
  if (key in FACE_LETTERS.generic) {
    // Only PlayStation prints a shape here; the rest print a letter, and a text
    // label sets that in the same face as the labels around it.
    if (family === 'playstation') mark = <FaceMark command={key} family={family} />
  } else if (key === 'HOME') mark = <HomeMark family={family} />
  else if (key === 'MISC1') mark = <QuickAccessMark />
  else if (key === '+') mark = <MenuMark family={family} />
  else if (key === '-') mark = <ViewMark family={family} />

  if (!mark) return <>{fallback ?? null}</>

  // The marks are drawn against the same 6.7-unit button face InputGlyph uses,
  // so scaling by the caller's radius keeps their proportions. The stroke thins
  // out a little on the way up: at icon size it has to survive rounding, at
  // diagram size it would just look heavy.
  const scale = radius / 6.7
  return (
    <g
      className={className}
      transform={`translate(${cx - 8 * scale} ${cy - 8 * scale}) scale(${scale})`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.1}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {mark}
    </g>
  )
}
