import type { ReactNode } from 'react'

// Triggers (console v2, Triggers.dc.html): what each ZL_MODE / ZR_MODE value is
// called on its card, the line under it, and its flat picture. Vocabulary V8:
// half press and full press, never soft and full pull.

export type TriggerSide = 'left' | 'right'

export const TRIGGER_CARD_VALUES = ['NO_FULL', 'NO_SKIP', 'NO_SKIP_EXCLUSIVE', 'MUST_SKIP', 'MAY_SKIP', 'MUST_SKIP_R', 'MAY_SKIP_R', 'GAMEPAD'] as const

export const TRIGGER_MODE_NAMES: Record<string, { label: string; caption: string; help: string }> = {
  NO_FULL: { label: 'One press', caption: 'One action, no full press', help: 'The half-press binding is the only one; pulling further adds nothing.' },
  NO_SKIP: { label: 'Half then full press', caption: 'Full adds on top', help: 'Half press fires first; full press adds its own binding on top while the half press stays held.' },
  NO_SKIP_EXCLUSIVE: { label: 'Full press replaces half', caption: 'Half lets go at full', help: 'Half press fires first, then lets go while the full press is held.' },
  MUST_SKIP: { label: 'Quick full press skips half', caption: 'Slow pull: half only', help: 'A quick full press fires only the full binding; a slow pull fires only the half press.' },
  MAY_SKIP: { label: 'Quick full press may skip half', caption: 'Slow pull: half, then both', help: 'A quick full press skips the half press; a slow pull fires the half press, then both.' },
  MUST_SKIP_R: { label: 'Responsive skip', caption: 'Half fires at once', help: 'Half press fires at once and is swapped for the full press if you reach it quickly.' },
  MAY_SKIP_R: { label: 'Responsive may skip', caption: 'Half at once, full adds on', help: 'Half press fires at once; a quick full press swaps it, a slow one adds the full press.' },
  GAMEPAD: { label: 'Gamepad trigger', caption: 'Analog · sends as a pad trigger', help: 'The trigger goes to the game as a real analog pad trigger. Needs Xbox or PlayStation output.' },
}

export const isGamepadTriggerMode = (mode: string) => /^(X_LT|X_RT|PS_L2|PS_R2)$/.test(mode)
/** The card a ZL_MODE / ZR_MODE value belongs to. */
export const triggerCardValue = (mode: string) => isGamepadTriggerMode(mode) ? 'GAMEPAD' : (mode || 'NO_FULL')
/** Two-step cards have a full press; One press and Gamepad trigger don't. */
export const hasFullPress = (mode: string) => !isGamepadTriggerMode(mode) && (mode || 'NO_FULL') !== 'NO_FULL'
export const usesSkipWindow = (mode: string) => /SKIP/.test(mode) && mode !== 'NO_SKIP' && mode !== 'NO_SKIP_EXCLUSIVE'

/** Which pad trigger a Gamepad trigger card sends as: X_LT / PS_L2 are the left. */
export const gamepadTarget = (mode: string): TriggerSide => /^(X_LT|PS_L2)$/.test(mode) ? 'left' : 'right'
/** The ZL_MODE value for a Gamepad trigger sending as `target`, in the output's own scheme. */
export const gamepadModeValue = (target: TriggerSide, scheme: string) => scheme === 'DS4' ? (target === 'left' ? 'PS_L2' : 'PS_R2') : (target === 'left' ? 'X_LT' : 'X_RT')

const BLADE = 'M8 10 h18 a4 4 0 0 1 4 4 v8 c0 9 -5 16 -13 18 h-5 a4 4 0 0 1 -4 -4 z'

/** A card's picture: the trigger blade beside a track of what fires as you pull. */
export function TriggerCardArt({ mode, side = 'left' }: { mode: string; side?: TriggerSide }) {
  const value = triggerCardValue(mode)
  const track = (from: number, to: number, dash = false) => <path d={`M${from} 30 H${to}`} stroke={dash ? '#808c99' : 'var(--accent)'} strokeWidth="3" strokeLinecap="round" strokeDasharray={dash ? '4 4' : undefined} fill="none" />
  const arc = (from: number, to: number, dash = false) => <path d={`M${from} 22 Q${(from + to) / 2} 6 ${to} 22`} stroke={dash ? '#808c99' : 'var(--accent)'} strokeWidth="2" strokeDasharray={dash ? '4 4' : undefined} fill="none" />
  const dot = (x: number, fill = '#e3eaf1') => <circle cx={x} cy="30" r="4" fill={fill} />
  const ticks = [50, 66, 82, 98, 114, 130, 146].map(x => <path key={x} d={`M${x} 36 v3`} stroke="rgba(255,255,255,.18)" strokeWidth="1.5" />)
  let body: ReactNode
  switch (value) {
    case 'NO_FULL': body = <>{track(44, 92)}{dot(92, '#e3eaf1')}<path d="M100 30 H156" stroke="rgba(255,255,255,.1)" strokeWidth="3" /></>; break
    case 'NO_SKIP': body = <>{track(44, 120)}{dot(98, 'var(--accent)')}{arc(98, 152, true)}{dot(152)}</>; break
    case 'NO_SKIP_EXCLUSIVE': body = <>{track(44, 98, true)}<circle cx="98" cy="30" r="4" fill="none" stroke="#e3eaf1" strokeWidth="2" />{arc(98, 152)}{dot(152)}</>; break
    case 'MUST_SKIP': body = <>{arc(52, 152)}<path d="M96 26 l8 8 M104 26 l-8 8" stroke="#808c99" strokeWidth="2" />{dot(152)}</>; break
    case 'MAY_SKIP': body = <>{arc(52, 152, true)}{dot(98, 'var(--accent)')}{dot(152)}</>; break
    case 'MUST_SKIP_R': body = <>{arc(52, 152)}<circle cx="98" cy="30" r="6" fill="none" stroke="var(--accent)" strokeWidth="2" /><path d="M95 33 l6 -6" stroke="#e3eaf1" strokeWidth="2" />{dot(152)}</>; break
    case 'MAY_SKIP_R': body = <>{arc(52, 152, true)}<circle cx="98" cy="30" r="6" fill="none" stroke="var(--accent)" strokeWidth="2" />{dot(98, 'var(--accent)')}{dot(152)}</>; break
    default: body = <>{Array.from({ length: 12 }, (_, index) => <rect key={index} x={52 + index * 9} y={38 - index * 2.4} width="5" height={2 + index * 2.4} rx="1" fill="var(--accent)" opacity={0.45 + index * 0.045} />)}</>
  }
  return (
    <svg viewBox="0 0 168 48" role="img" aria-hidden="true">
      <g transform={side === 'right' ? 'translate(4 0)' : undefined}>
        <path d={BLADE} fill={value === 'NO_FULL' ? 'var(--accent)' : '#212a34'} stroke="#e3eaf1" strokeWidth="1.6" />
      </g>
      {value !== 'GAMEPAD' && ticks}
      {body}
    </svg>
  )
}
