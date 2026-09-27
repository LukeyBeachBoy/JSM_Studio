import { desktopBridge } from '../platform/desktopBridge'
import { HAPTIC_EFFECTS } from './hapticBindings'

export type HapticPreviewSide = 'left' | 'right' | 'both'

/**
 * Plays a haptic on the connected controller the way a setting would, so a
 * strength or an effect can be felt while it is being chosen rather than after
 * Save, Apply and a trip into Test mode. It rides Studio's own feedback channel
 * (nav/feedback.ts), which plays whatever configuration is loaded and uses the
 * same 0-100 dial as the settings; Studio's feedback strength does not scale it.
 * Nothing plays at 0 or for OFF. `grips` plays it as the grip sensors' haptic
 * does, which puts PULSE and TAP on the grip actuators instead of the pads.
 */
export function previewHaptic(effect: string | undefined, intensity: number, side: HapticPreviewSide = 'both', grips = false) {
  const ordinal = HAPTIC_EFFECTS.findIndex(name => name === (effect ?? 'CLICK').toUpperCase())
  if (ordinal <= 0 || !(intensity > 0)) return
  void desktopBridge.controllerFeedback({
    effect: ordinal,
    intensity: Math.min(100, intensity),
    side: side === 'left' ? 1 : side === 'right' ? 2 : 3,
    rumbleMs: 0,
    rumble: 0,
    // Where the grip sensors' own pulse plays: PULSE and TAP at the grips.
    ...(grips ? { grips: true } : {}),
  }).catch(() => {})
}
