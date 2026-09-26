import { useSyncExternalStore } from 'react'
import { desktopBridge } from '../platform/desktopBridge'

// What the pad feels as it drives Studio (JoyShockMapper StudioFeedback.h).
//
// The Steam Controller plays the firmware's own haptic effects on the pad on
// the side of the hand that pressed: the D-pad and LB/LT tick under the left
// thumb, A/B and RB/RT under the right. Controllers without haptic actuators
// get a short rumble pulse for the deliberate actions (select, back, section,
// page) and nothing for plain focus moves -- a motor spinning up on every
// D-pad press reads as a buzz, not a tick.
//
// The weights, lightest to firmest: a move is a tick, hitting the end of a
// list is a dull click, A is a crisp click, a section a firm tick, a page the
// firmest click. Different enough to tell apart without looking.

export type FeedbackKind = 'move' | 'edge' | 'select' | 'back' | 'section' | 'page' | 'titleBar'
export type FeedbackSide = 'left' | 'right' | 'both'
export type FeedbackStrength = 'off' | 'light' | 'medium' | 'strong'

// HapticEffect ordinals (JoyShockMapper.h): the controller's canned effects.
const TICK = 1
const CLICK = 2

type Feel = { effect: number; intensity: number; rumble: number; rumbleMs: number; side: FeedbackSide }

// Intensity is the 0-100 dial the mapper's other haptics use (-24 to +12 dB);
// rumble is 0-100 of motor strength.
const FEEL: Record<FeedbackKind, Feel> = {
  move: { effect: TICK, intensity: 38, rumble: 0, rumbleMs: 0, side: 'left' },
  edge: { effect: CLICK, intensity: 30, rumble: 18, rumbleMs: 18, side: 'left' },
  select: { effect: CLICK, intensity: 62, rumble: 32, rumbleMs: 28, side: 'right' },
  back: { effect: TICK, intensity: 55, rumble: 22, rumbleMs: 22, side: 'right' },
  section: { effect: TICK, intensity: 72, rumble: 38, rumbleMs: 32, side: 'both' },
  // Still the firmest of the set, a notch softer than it was (80 / 50).
  page: { effect: CLICK, intensity: 68, rumble: 40, rumbleMs: 45, side: 'both' },
  titleBar: { effect: TICK, intensity: 50, rumble: 0, rumbleMs: 0, side: 'left' },
}

// A multiplier on the dial rather than an offset: Light keeps the order of
// weights intact, just softer.
const SCALE: Record<FeedbackStrength, number> = { off: 0, light: 0.65, medium: 1, strong: 1.3 }
const SIDE: Record<FeedbackSide, number> = { left: 1, right: 2, both: 3 }

const STORAGE_KEY = 'jsm-studio.controller-feedback'
const read = (): FeedbackStrength => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'off' || stored === 'light' || stored === 'medium' || stored === 'strong') return stored
  } catch { /* storage unavailable */ }
  return 'medium'
}

let strength: FeedbackStrength = read()
const listeners = new Set<() => void>()

export const getFeedbackStrength = () => strength
export function setFeedbackStrength(next: FeedbackStrength) {
  strength = next
  try { localStorage.setItem(STORAGE_KEY, next) } catch { /* storage unavailable */ }
  listeners.forEach(listener => listener())
}
export function useFeedbackStrength() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener) } }, getFeedbackStrength)
}

/**
 * Play one kind of feedback. `side` overrides the default hand, e.g. LB on
 * the left and RB on the right. Does nothing with feedback turned off.
 */
export function padFeedback(kind: FeedbackKind, side?: FeedbackSide) {
  const scale = SCALE[strength]
  if (!scale) return
  const feel = FEEL[kind]
  const intensity = Math.min(100, feel.intensity * scale)
  // The rumble pulse scales with strength too, but is never so weak the motor
  // cannot start.
  const rumble = feel.rumble ? Math.min(100, Math.max(15, feel.rumble * scale)) : 0
  void desktopBridge.controllerFeedback({
    effect: feel.effect,
    intensity,
    side: SIDE[side ?? feel.side],
    rumbleMs: rumble ? feel.rumbleMs : 0,
    rumble,
  })
}
