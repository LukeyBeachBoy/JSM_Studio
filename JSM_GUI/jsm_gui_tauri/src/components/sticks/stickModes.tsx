import type { ReactNode } from 'react'

// Sticks (console v2, Sticks.dc.html; D9): which card each STICK_MODE value
// belongs to, the names the rail and the cards use, and the cards' flat art.

export type StickSide = 'left' | 'right'
export type StickCard = 'MOVING' | 'LOOK' | 'FLICK' | 'WHEEL' | 'GAMEPAD' | 'MORE'

/** The "More" list (StickSmallModes): every other STICK_MODE_VALUES mode. The
 *  four angle-to-axis values and the two steering ones are one entry each,
 *  with the target picked in Fine-tune (D9). */
export const MORE_MODES = ['MOUSE_RING', 'SCROLL_WHEEL', 'RINGS', 'MOUSE_AREA', 'ANGLE', 'STEERING', 'HYBRID_AIM', 'FLICK_ONLY', 'ROTATE_ONLY'] as const
export type MoreMode = typeof MORE_MODES[number]

export const MORE_MODE_NAMES: Record<MoreMode, { label: string; caption: string }> = {
  MOUSE_RING: { label: 'Mouse ring', caption: 'Cursor on a ring round the screen centre' },
  SCROLL_WHEEL: { label: 'Scroll wheel', caption: 'Roll the stick to scroll' },
  RINGS: { label: 'Walk/run rings', caption: 'Directions, plus a light-push or full-push binding' },
  MOUSE_AREA: { label: 'Mouse area', caption: 'The cursor moves as far as the stick does' },
  ANGLE: { label: 'Angle to axis', caption: 'Where you point sets one gamepad axis' },
  STEERING: { label: 'Steering', caption: 'Wind the stick round to steer' },
  HYBRID_AIM: { label: 'Aim + flick', caption: 'Looking around with a mouse-like feel' },
  FLICK_ONLY: { label: 'Flick only', caption: 'Point to face that way; no turning' },
  ROTATE_ONLY: { label: 'Turn only', caption: 'Roll round the edge to turn; no flicks' },
}

/** The More entry a mode belongs to, or null for a front card's own mode. */
export function moreModeOf(mode: string): MoreMode | null {
  const upper = mode.toUpperCase()
  if (upper === 'MOUSE_RING' || upper === 'SCROLL_WHEEL' || upper === 'MOUSE_AREA' || upper === 'HYBRID_AIM' || upper === 'FLICK_ONLY' || upper === 'ROTATE_ONLY') return upper
  if (upper === 'INNER_RING' || upper === 'OUTER_RING') return 'RINGS'
  if (upper.includes('_ANGLE_TO_')) return 'ANGLE'
  if (upper.endsWith('_WIND_X')) return 'STEERING'
  return null
}

/** The front card a mode lights: Looking around also covers mouse-like aim,
 *  Flick to turn its flick-only and turn-only variants. */
export function stickCardOf(mode: string): StickCard {
  const upper = (mode || 'NO_MOUSE').toUpperCase()
  if (upper === 'NO_MOUSE') return 'MOVING'
  if (upper === 'AIM' || upper === 'HYBRID_AIM') return 'LOOK'
  if (upper === 'FLICK' || upper === 'FLICK_ONLY' || upper === 'ROTATE_ONLY') return 'FLICK'
  if (upper === 'RADIAL_MENU') return 'WHEEL'
  if (upper === 'LEFT_STICK' || upper === 'RIGHT_STICK') return 'GAMEPAD'
  return 'MORE'
}

/** The mode a More entry writes when picked on a stick. */
export function moreModeValue(entry: MoreMode, current: string, side: StickSide): string {
  const upper = current.toUpperCase()
  if (entry === 'RINGS') return upper === 'INNER_RING' || upper === 'OUTER_RING' ? upper : 'OUTER_RING'
  if (entry === 'ANGLE') return upper.includes('_ANGLE_TO_') ? upper : `${side === 'left' ? 'LEFT' : 'RIGHT'}_ANGLE_TO_X`
  if (entry === 'STEERING') return upper.endsWith('_WIND_X') ? upper : 'LEFT_WIND_X'
  return entry
}

/** The short name for a stick's mode: the rail's status, the footer. */
export function stickModeName(mode: string): string {
  const upper = (mode || 'NO_MOUSE').toUpperCase()
  const card = stickCardOf(upper)
  if (card === 'MOVING') return 'Moving'
  if (upper === 'HYBRID_AIM') return 'Looking around · mouse-like'
  if (card === 'LOOK') return 'Looking around'
  if (upper === 'FLICK_ONLY') return 'Flick only'
  if (upper === 'ROTATE_ONLY') return 'Turn only'
  if (card === 'FLICK') return 'Flick to turn'
  if (card === 'WHEEL') return 'Wheel'
  if (card === 'GAMEPAD') return `Gamepad stick · ${upper === 'LEFT_STICK' ? 'left' : 'right'}`
  const more = moreModeOf(upper)
  return more ? MORE_MODE_NAMES[more].label : upper.replace(/_/g, ' ').toLowerCase()
}

const W = (x: number, y: number, label: string, on = false) => (
  <g key={label}>
    <rect x={x} y={y} width="26" height="26" rx="5" fill={on ? 'var(--accent)' : '#2e3844'} stroke="rgba(255,255,255,.08)" />
    <text x={x + 13} y={y + 17.5} textAnchor="middle" fontSize="12" fontWeight="700" fill={on ? '#07131d' : '#e3eaf1'}>{label}</text>
  </g>
)

/** The cards' flat pictures (STYLE-FLAT: 2px strokes, accent for what's chosen). */
export function StickCardArt({ card }: { card: StickCard }): ReactNode {
  switch (card) {
    case 'MOVING': return <svg viewBox="0 0 120 90" aria-hidden="true">{W(47, 12, 'W', true)}{W(17, 44, 'A')}{W(47, 44, 'S')}{W(77, 44, 'D')}</svg>
    case 'LOOK': return <svg viewBox="0 0 120 90" aria-hidden="true"><path d="M16 74 C40 70 52 40 84 30" stroke="var(--accent)" strokeWidth="2.5" fill="none" /><circle cx="90" cy="28" r="9" fill="none" stroke="#e3eaf1" strokeWidth="2" /><path d="M90 14 v8 M90 34 v8 M76 28 h8 M96 28 h8" stroke="#e3eaf1" strokeWidth="2" /><circle cx="90" cy="28" r="2.5" fill="var(--accent)" /></svg>
    case 'FLICK': return <svg viewBox="0 0 120 90" aria-hidden="true"><circle cx="60" cy="45" r="30" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="2" strokeDasharray="2 6" /><path d="M60 15 A30 30 0 0 1 86 60" stroke="var(--accent)" strokeWidth="3" fill="none" /><circle cx="86" cy="60" r="4" fill="#e3eaf1" /><path d="M60 45 L48 52 L60 30 L72 52 Z" fill="#e3eaf1" /></svg>
    case 'WHEEL': return <svg viewBox="0 0 120 90" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => { const a0 = (index / 8) * Math.PI * 2 - Math.PI / 2 - Math.PI / 8, a1 = a0 + Math.PI / 4; const p = (a: number, r: number) => `${60 + Math.cos(a) * r},${45 + Math.sin(a) * r}`; return <path key={index} d={`M${p(a0, 14)} L${p(a0, 36)} A36 36 0 0 1 ${p(a1, 36)} L${p(a1, 14)} A14 14 0 0 0 ${p(a0, 14)} Z`} fill={index === 1 ? 'var(--accent)' : index % 2 ? '#131a21' : '#0f141a'} stroke="rgba(255,255,255,.08)" /> })}<circle cx="60" cy="45" r="12" fill="#1c242d" stroke="rgba(255,255,255,.16)" /></svg>
    case 'GAMEPAD': return <svg viewBox="0 0 120 90" aria-hidden="true"><circle cx="60" cy="45" r="30" fill="#0e1419" stroke="#aebbc8" strokeWidth="1.5" strokeDasharray="3 4" /><circle cx="60" cy="45" r="17" fill="#212a34" stroke="#e3eaf1" strokeWidth="2" /><circle cx="60" cy="45" r="11" fill="none" stroke="#aebbc8" strokeWidth="1.5" /></svg>
    default: return null
  }
}

/** A More entry's picture, for its card in the touch stick's "Dragging acts as". */
export function MoreModeArt({ entry }: { entry: MoreMode }) {
  return (
    <svg viewBox="0 0 120 90" aria-hidden="true">
      {entry === 'MOUSE_RING' && <><rect x="18" y="14" width="84" height="54" rx="4" fill="#0e1419" stroke="#aebbc8" strokeWidth="1.5" /><circle cx="60" cy="41" r="16" fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="3 3" /><path d="M72 30 l8 8 l-4 0 l2 5 l-2 1 l-2 -5 l-3 3 z" fill="#e3eaf1" /></>}
      {entry === 'SCROLL_WHEEL' && <><rect x="44" y="12" width="32" height="56" rx="16" fill="#212a34" stroke="#e3eaf1" strokeWidth="2" /><path d="M60 22 v12" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" /><path d="M86 30 a26 26 0 0 1 0 30" stroke="var(--accent)" strokeWidth="2" fill="none" /></>}
      {entry === 'RINGS' && <><circle cx="60" cy="45" r="30" fill="none" stroke="var(--accent)" strokeWidth="2.5" /><circle cx="60" cy="45" r="15" fill="none" stroke="#aebbc8" strokeWidth="1.5" strokeDasharray="3 3" /><circle cx="84" cy="27" r="4" fill="#e3eaf1" /></>}
      {entry === 'MOUSE_AREA' && <><rect x="18" y="14" width="84" height="54" rx="4" fill="#0e1419" stroke="#aebbc8" strokeWidth="1.5" /><circle cx="60" cy="41" r="4" fill="#aebbc8" /><path d="M60 41 L84 26" stroke="var(--accent)" strokeWidth="2" /><circle cx="84" cy="26" r="4" fill="var(--accent)" /></>}
      {entry === 'ANGLE' && <><circle cx="60" cy="45" r="28" fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="2" /><path d="M24 80 H96" stroke="#aebbc8" strokeWidth="2" /><path d="M60 45 L80 25" stroke="var(--accent)" strokeWidth="2.5" /><circle cx="84" cy="80" r="4" fill="var(--accent)" /></>}
      {entry === 'STEERING' && <><circle cx="60" cy="45" r="26" fill="none" stroke="#e3eaf1" strokeWidth="2.5" /><circle cx="60" cy="45" r="6" fill="#e3eaf1" /><path d="M34 45 H54 M66 45 H86 M60 51 V71" stroke="#e3eaf1" strokeWidth="2.5" /><path d="M30 26 a36 36 0 0 1 20 -12" stroke="var(--accent)" strokeWidth="2" fill="none" /></>}
      {entry === 'HYBRID_AIM' && <><path d="M16 74 C40 70 52 40 84 30" stroke="var(--accent)" strokeWidth="2.5" fill="none" /><path d="M84 30 a12 12 0 1 1 0 0.1" stroke="#e3eaf1" strokeWidth="2" fill="none" /></>}
      {entry === 'FLICK_ONLY' && <><circle cx="60" cy="45" r="26" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="2" /><path d="M60 45 L82 32" stroke="var(--accent)" strokeWidth="2.5" /><circle cx="82" cy="32" r="4" fill="#e3eaf1" /></>}
      {entry === 'ROTATE_ONLY' && <><circle cx="60" cy="45" r="26" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="2" /><path d="M60 19 A26 26 0 0 1 86 45" stroke="var(--accent)" strokeWidth="2.5" fill="none" /><path d="M86 45 l-5 -6 m5 6 l5 -6" stroke="var(--accent)" strokeWidth="2" /></>}
    </svg>
  )
}
