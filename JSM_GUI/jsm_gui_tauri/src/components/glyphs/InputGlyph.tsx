import type { ReactNode, SVGProps } from 'react'
import type { ControllerVisualFamily } from '../../utils/controllerStatus'
import { FaceMark, HomeMark, Letter, MenuMark, QuickAccessMark, ViewMark } from './inputMarks'

// Drawn input glyphs, in the same idiom as NavIcons: a 16px grid, currentColor,
// no baked fills. Deliberately our own shapes rather than Valve's artwork --
// they only have to read at 16px and stay recognisable across the four
// controller families, not match Steam pixel for pixel. What is printed on each
// button lives in ./inputMarks; this file draws the button under it.

type GlyphProps = {
  command: string
  family?: ControllerVisualFamily
  size?: number
  className?: string
  title?: string
}

const svgBase: SVGProps<SVGSVGElement> = {
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
}

/** A round button face with something drawn inside it. The soft currentColor
 *  fill makes it read as a physical button at 16px, where a hairline outline
 *  plus a letter just turns to mush -- and it works on any backdrop. */
const Face = ({ children }: { children: ReactNode }) => (
  <>
    <circle cx="8" cy="8" r="6.7" fill="currentColor" fillOpacity="0.18" strokeWidth="1.35" />
    {children}
  </>
)

/** The rounded-rect body the small centre buttons are printed on. */
const Pill = ({ children }: { children: ReactNode }) => (
  <>
    <rect x="2.1" y="4.5" width="11.8" height="7" rx="3.5" fill="currentColor" fillOpacity="0.18" strokeWidth="1.35" />
    {children}
  </>
)

const DPAD_ROTATION: Record<string, number> = { UP: 0, RIGHT: 90, DOWN: 180, LEFT: 270 }

const Dpad = ({ rotate }: { rotate: number }) => (
  <g transform={`rotate(${rotate} 8 8)`}>
    <path d="M6.3 9.7V6.3H4.2L8 2.6l3.8 3.7H9.7v3.4z" />
    <path d="M4.4 12.4h7.2" opacity="0.45" />
  </g>
)

const Shoulder = ({ side, tall }: { side: 'L' | 'R'; tall?: boolean }) => (
  <g transform={side === 'R' ? 'scale(-1 1) translate(-16 0)' : undefined}>
    <path d={tall ? 'M2.6 10.2V6.6a3 3 0 0 1 3-3h5.2a2.6 2.6 0 0 1 2.6 2.6v3.8' : 'M2.6 9.6V7.4a2.8 2.8 0 0 1 2.8-2.8h5.4a2.8 2.8 0 0 1 2.8 2.8v2.2'} />
    <path d={tall ? 'M2.6 10.2h10.8' : 'M2.6 9.6h10.8'} />
    {tall && <path d="M5.4 12.6h5.2" opacity="0.5" />}
  </g>
)

const Stick = ({ clicked }: { clicked?: boolean }) => (
  <>
    <circle cx="8" cy="8" r="5.6" />
    <circle cx="8" cy="8" r="2.4" fill={clicked ? 'currentColor' : 'none'} />
  </>
)

const Pad = ({ side, clicked }: { side?: 'left' | 'right'; clicked?: boolean }) => (
  <>
    <rect x="2.4" y="3.4" width="11.2" height="9.2" rx="2.4" />
    {clicked && <circle cx={side === 'left' ? 6.2 : 9.8} cy="8" r="1.5" fill="currentColor" stroke="none" />}
    {!clicked && <circle cx="8" cy="8" r="1.4" opacity="0.55" />}
  </>
)

const Grip = ({ side }: { side: 'left' | 'right' }) => (
  <g transform={side === 'right' ? 'scale(-1 1) translate(-16 0)' : undefined}>
    <path d="M9.6 2.8c-2.6 0-4.4 1.9-4.4 4.6 0 2.3.7 4 2.1 5.8" />
    <path d="M11.8 6.1c-1 .5-1.6 1.5-1.6 2.7" opacity="0.55" />
  </g>
)

const Paddle = ({ side }: { side: 'left' | 'right' }) => (
  <g transform={side === 'right' ? 'scale(-1 1) translate(-16 0)' : undefined}>
    <path d="M4.2 3.4h3.2c2 0 3.4 1.5 3.4 3.5v6.1" />
    <path d="M4.2 3.4v3.1" opacity="0.55" />
  </g>
)

// Command -> drawing. Anything absent falls back to a lettered circle, which
// still beats printing the raw token like MISC1.
const GLYPHS: Record<string, (family: ControllerVisualFamily) => ReactNode> = {
  N: family => (
    <Face>
      <FaceMark command="N" family={family} />
    </Face>
  ),
  E: family => (
    <Face>
      <FaceMark command="E" family={family} />
    </Face>
  ),
  S: family => (
    <Face>
      <FaceMark command="S" family={family} />
    </Face>
  ),
  W: family => (
    <Face>
      <FaceMark command="W" family={family} />
    </Face>
  ),

  UP: () => <Dpad rotate={DPAD_ROTATION.UP} />,
  DOWN: () => <Dpad rotate={DPAD_ROTATION.DOWN} />,
  LEFT: () => <Dpad rotate={DPAD_ROTATION.LEFT} />,
  RIGHT: () => <Dpad rotate={DPAD_ROTATION.RIGHT} />,

  L: () => <Shoulder side="L" />,
  R: () => <Shoulder side="R" />,
  ZL: () => <Shoulder side="L" tall />,
  ZR: () => <Shoulder side="R" tall />,
  ZLF: () => <Shoulder side="L" tall />,
  ZRF: () => <Shoulder side="R" tall />,

  L3: () => <Stick clicked />,
  R3: () => <Stick clicked />,
  LTOUCH: () => <Stick />,
  RTOUCH: () => <Stick />,

  MISC2: () => <Pad side="right" clicked />,
  MISC3: () => <Pad side="left" clicked />,
  TOUCH: () => <Pad />,
  CAPTURE: () => <Pad />,

  MISC5: () => <Grip side="right" />,
  MISC6: () => <Grip side="left" />,

  LSL: () => <Paddle side="left" />,
  LSR: () => <Paddle side="left" />,
  RSR: () => <Paddle side="right" />,
  RSL: () => <Paddle side="right" />,

  // The Steam button keeps its own ring; every other family prints its mark on
  // an ordinary round face button.
  HOME: family =>
    family === 'steam' ? (
      <>
        <circle cx="8" cy="8" r="6.4" strokeWidth="1.5" />
        <HomeMark family={family} />
      </>
    ) : (
      <Face>
        <HomeMark family={family} />
      </Face>
    ),

  MISC1: () => (
    <Pill>
      <QuickAccessMark />
    </Pill>
  ),

  '+': family => (
    <Pill>
      <MenuMark family={family} />
    </Pill>
  ),

  '-': family => (
    <Pill>
      <ViewMark family={family} />
    </Pill>
  ),

  MIC: () => (
    <>
      <rect x="6.2" y="2.6" width="3.6" height="6.6" rx="1.8" />
      <path d="M4.4 8.2a3.6 3.6 0 0 0 7.2 0M8 11.8v1.6" />
    </>
  ),
}

export function InputGlyph({ command, family = 'generic', size = 16, className, title }: GlyphProps) {
  const key = command.toUpperCase()

  let content: ReactNode
  if (key in GLYPHS) {
    content = GLYPHS[key](family)
  } else {
    // Unknown input: a lettered disc using the first two characters, so an
    // unmapped token still reads as a button rather than as raw config text.
    content = (
      <Face>
        <Letter char={key.slice(0, 2)} size={key.length > 1 ? 5.6 : 8.6} />
      </Face>
    )
  }

  return (
    <svg {...svgBase} width={size} height={size} className={className} role={title ? 'img' : undefined} aria-label={title}>
      {title && <title>{title}</title>}
      {content}
    </svg>
  )
}
