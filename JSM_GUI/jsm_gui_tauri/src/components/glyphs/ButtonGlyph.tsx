import type { ControllerVisualFamily } from '../../utils/controllerStatus'
import { useLastSeenController } from '../../hooks/useLastSeenController'
import { InputGlyph } from './InputGlyph'

// Controller button art for hints, badges and inline references (console
// refinement D11): a button is always drawn, never named. The positions are
// the standard (Xbox-lettered) ones the navigation reads; each maps to the
// JSM input id whose glyph the family draws, so a PlayStation pad shows its
// cross and a Switch pad its B.
export type PadButtonName = 'A' | 'B' | 'X' | 'Y' | 'LB' | 'RB' | 'LT' | 'RT' | 'VIEW' | 'MENU' | 'DPAD'

const PAD_BUTTON_IDS: Record<PadButtonName, string> = {
  A: 'S', B: 'E', X: 'W', Y: 'N', LB: 'L', RB: 'R', LT: 'ZL', RT: 'ZR', VIEW: 'MINUS', MENU: 'PLUS', DPAD: 'DPAD',
}

// What a screen reader hears for each; never drawn.
const SPOKEN: Record<PadButtonName, string> = {
  A: 'A button', B: 'B button', X: 'X button', Y: 'Y button', LB: 'Left bumper', RB: 'Right bumper',
  LT: 'Left trigger', RT: 'Right trigger', VIEW: 'View button', MENU: 'Menu button', DPAD: 'D-pad',
}

type ButtonGlyphProps = {
  button: PadButtonName
  size?: number
  /** Defaults to the controller seen most recently this session. */
  family?: ControllerVisualFamily
  className?: string
  /** Announce the button; off where the label beside it already says what it does. */
  spoken?: boolean
}

export function ButtonGlyph({ button, size = 22, family, className, spoken = false }: ButtonGlyphProps) {
  const seen = useLastSeenController()
  return <InputGlyph command={PAD_BUTTON_IDS[button]} family={family ?? seen.family} size={size}
    className={className ?? 'button-glyph'} title={spoken ? SPOKEN[button] : undefined} />
}
