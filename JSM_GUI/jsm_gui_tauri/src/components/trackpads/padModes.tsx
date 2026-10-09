import { getKeymapValue } from '../../utils/keymap'
import { readWord } from '../sticks/shared'
import { normalizeTouchpadMode } from '../../utils/touchpadConfig'

// Trackpads (console v2, Trackpads.dc.html; D9): the pad's cards and what each
// writes. JoyShockMapper has four pad modes (GRID_AND_STICK, MOUSE, MOUSE_AREA,
// PS_TOUCHPAD). "Touch stick" is not one of them: the touch stick runs inside
// GRID_AND_STICK, alongside the zones (main.cpp handleTouchStickChange). The
// card writes GRID_AND_STICK with a single 1 × 1 zone and the pad's
// TOUCH_STICK_MODE (Directions you bind unless one is already chosen), so the
// drag is the stick and the one zone is the whole pad. "Off" removes the mode,
// which leaves the mapper's default (zones) with nothing bound.

export type PadSide = 'left' | 'right' | 'single'
export type PadCard = 'ZONES' | 'MOUSE' | 'MOUSE_AREA' | 'TOUCH_STICK' | 'PS_TOUCHPAD' | 'OFF'
export const PAD_CARDS: PadCard[] = ['ZONES', 'MOUSE', 'MOUSE_AREA', 'TOUCH_STICK', 'PS_TOUCHPAD', 'OFF']

export const PAD_CARD_NAMES: Record<PadCard, { label: string; caption: string }> = {
  ZONES: { label: 'Zones you bind', caption: 'Zones you bind · nothing on screen' },
  MOUSE: { label: 'Mouse', caption: 'Swipe to move the cursor' },
  MOUSE_AREA: { label: 'Mouse area', caption: 'Pad maps to part of the screen' },
  TOUCH_STICK: { label: 'Touch stick', caption: 'Drag from where you land' },
  PS_TOUCHPAD: { label: 'PlayStation touchpad', caption: 'Passes touches to a DS4 game' },
  OFF: { label: 'Off', caption: 'Touching does nothing' },
}

/** The key prefix a pad's settings use: LEFT_, RIGHT_, or none on a one-pad controller. */
export const padPrefix = (side: PadSide) => side === 'left' ? 'LEFT_' : side === 'right' ? 'RIGHT_' : ''
const gridKey = (side: PadSide, name: 'SIZE' | 'SHAPE' | 'DEADZONE' | 'REQUIRES_CLICK') => side === 'single' && name === 'REQUIRES_CLICK' ? 'TOUCHPAD_GRID_REQUIRES_CLICK' : `${padPrefix(side)}GRID_${name}`
export const padKey = { gridSize: (side: PadSide) => gridKey(side, 'SIZE'), gridShape: (side: PadSide) => gridKey(side, 'SHAPE'), gridDeadzone: (side: PadSide) => gridKey(side, 'DEADZONE'), requiresClick: (side: PadSide) => gridKey(side, 'REQUIRES_CLICK') }

export function padModeOf(text: string, side: PadSide) {
  return normalizeTouchpadMode(getKeymapValue(text, `${padPrefix(side)}TOUCHPAD_MODE`) ?? (side === 'single' ? '' : getKeymapValue(text, 'TOUCHPAD_MODE') ?? ''))
}

export function padCardOf(text: string, side: PadSide): PadCard {
  const mode = padModeOf(text, side)
  if (mode === 'MOUSE') return 'MOUSE'
  if (mode === 'MOUSE_AREA') return 'MOUSE_AREA'
  if (mode === 'PS_TOUCHPAD') return 'PS_TOUCHPAD'
  if (mode === 'GRID_AND_STICK') {
    const size = (getKeymapValue(text, padKey.gridSize(side)) ?? '').trim().split(/\s+/).map(Number)
    const stick = (getKeymapValue(text, `${padPrefix(side)}TOUCH_STICK_MODE`) ?? '').trim()
    return size[0] === 1 && size[1] === 1 && stick ? 'TOUCH_STICK' : 'ZONES'
  }
  return 'OFF'
}

/** The keys a card writes ('' / null removes a key). */
export function padCardWrites(text: string, side: PadSide, card: PadCard): Record<string, string | null> {
  const prefix = padPrefix(side)
  const modeKey = `${prefix}TOUCHPAD_MODE`
  const size = (getKeymapValue(text, padKey.gridSize(side)) ?? '').trim()
  switch (card) {
    case 'MOUSE': return { [modeKey]: 'MOUSE' }
    case 'MOUSE_AREA': return { [modeKey]: 'MOUSE_AREA' }
    case 'PS_TOUCHPAD': return { [modeKey]: 'PS_TOUCHPAD' }
    case 'OFF': return { [modeKey]: null }
    case 'TOUCH_STICK': return { [modeKey]: 'GRID_AND_STICK', [padKey.gridSize(side)]: '1 1', [padKey.gridShape(side)]: null, [`${prefix}TOUCH_STICK_MODE`]: getKeymapValue(text, `${prefix}TOUCH_STICK_MODE`) || 'NO_MOUSE' }
    case 'ZONES': {
      // Coming back from the Touch stick card undoes what that card wrote: the
      // one-zone grid, and the touch stick mode it set (a mode you chose on
      // the pad yourself is left alone).
      const fromTouchStick = /^1\s+1$/.test(size)
      const stickKey = `${prefix}TOUCH_STICK_MODE`
      return { [modeKey]: 'GRID_AND_STICK', ...(fromTouchStick ? { [padKey.gridSize(side)]: '2 2', ...(readWord(text, stickKey) === 'NO_MOUSE' ? { [stickKey]: null } : {}) } : {}) }
    }
  }
}

export const SHAPE_NAMES: Record<string, string> = { RECTANGLE: 'Grid', FOUR_WAY: '4-way', EIGHT_WAY: '8-way', RADIAL: 'Wheel' }

/** The rail's line for a pad: "Zones · 4-way · 4 zones", "Mouse", "Mouse area". */
export function padStatus(text: string, side: PadSide) {
  const card = padCardOf(text, side)
  if (card === 'ZONES') {
    const shape = (getKeymapValue(text, padKey.gridShape(side)) ?? 'RECTANGLE').toUpperCase()
    const size = (getKeymapValue(text, padKey.gridSize(side)) ?? '2 1').trim().split(/\s+/).map(Number)
    const zones = shape === 'FOUR_WAY' ? 4 : shape === 'EIGHT_WAY' ? 8 : Math.max(1, (size[0] || 1) * (size[1] || size[0] || 1))
    return `Zones · ${SHAPE_NAMES[shape] ?? shape} · ${zones} zone${zones === 1 ? '' : 's'}`
  }
  return PAD_CARD_NAMES[card].label
}

/** Flat pad art for a card (STYLE-FLAT: the overlay's pad and zones). */
export function PadCardArt({ card }: { card: PadCard }) {
  const pad = <rect x="34" y="8" width="52" height="52" rx="8" fill="rgba(8,12,18,.72)" stroke="rgba(255,255,255,.16)" />
  return (
    <svg viewBox="0 0 120 68" aria-hidden="true">
      {card === 'ZONES' && <>{pad}<path d="M34 8 L60 34 L86 8 Z" fill="color-mix(in srgb, var(--accent) 90%, transparent)" /><path d="M34 60 L86 8 M34 8 L86 60" stroke="rgba(255,255,255,.12)" /><circle cx="60" cy="34" r="7" fill="#0e1419" stroke="rgba(255,255,255,.16)" /></>}
      {card === 'MOUSE' && <>{pad}<path d="M44 50 L72 22" stroke="var(--accent)" strokeWidth="2" strokeDasharray="3 3" /><circle cx="72" cy="22" r="3.5" fill="#e3eaf1" /><path d="M92 18 l10 10 l-5 0 l3 6 l-3 1 l-3 -6 l-4 4 z" fill="#e3eaf1" /></>}
      {card === 'MOUSE_AREA' && <><rect x="10" y="30" width="26" height="26" rx="5" fill="rgba(8,12,18,.72)" stroke="rgba(255,255,255,.16)" /><circle cx="23" cy="43" r="3" fill="#e3eaf1" /><rect x="48" y="8" width="62" height="40" rx="3" fill="#0e1419" stroke="#aebbc8" strokeWidth="1.5" /><rect x="80" y="12" width="24" height="18" rx="2" fill="color-mix(in srgb, var(--accent) 25%, transparent)" stroke="var(--accent)" /><circle cx="92" cy="21" r="2.5" fill="#e3eaf1" /><path d="M36 30 L80 12 M36 56 L80 30" stroke="rgba(255,255,255,.18)" strokeDasharray="2 3" /></>}
      {card === 'TOUCH_STICK' && <>{pad}<circle cx="52" cy="40" r="14" fill="none" stroke="#aebbc8" strokeDasharray="3 3" /><path d="M52 40 L68 26" stroke="var(--accent)" strokeWidth="2" /><circle cx="52" cy="40" r="3" fill="#aebbc8" /><circle cx="68" cy="26" r="5" fill="none" stroke="#e3eaf1" strokeWidth="2" /></>}
      {card === 'PS_TOUCHPAD' && <><rect x="14" y="16" width="92" height="36" rx="8" fill="rgba(8,12,18,.72)" stroke="rgba(255,255,255,.16)" /><circle cx="44" cy="34" r="5" fill="none" stroke="#e3eaf1" strokeWidth="2" /><circle cx="76" cy="30" r="5" fill="none" stroke="#e3eaf1" strokeWidth="2" /><circle cx="44" cy="34" r="1.5" fill="#e3eaf1" /><circle cx="76" cy="30" r="1.5" fill="#e3eaf1" /></>}
      {card === 'OFF' && <>{pad}<path d="M42 52 L78 16" stroke="#aebbc8" strokeWidth="2" /></>}
    </svg>
  )
}
