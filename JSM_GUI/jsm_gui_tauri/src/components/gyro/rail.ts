import { parseGyroActivation, gyroConditions } from '../../utils/gyroActivation'
import { inputDisplayName } from '../../keymap/inputNames'
import type { ControllerVisualFamily } from '../../utils/controllerStatus'

// The shell's rail on the Gyro tab (console v2): one item, with the activation
// as its status line ("Gyro · While I hold Right grip"), like a one-pad
// controller's Trackpads rail. LT / RT then have nothing to step.

export function gyroRailStatus(text: string, family: ControllerVisualFamily): string {
  const activation = parseGyroActivation(text)
  const combined = gyroConditions(activation.button)
  const held = combined ? `${combined.match === 'ANY' ? 'any' : 'all'} of ${combined.conditions.length} inputs` : inputDisplayName(activation.button || 'R3', family)
  if (activation.mode === 'always_on') return 'Always on'
  if (activation.mode === 'always_off') return 'Off'
  if (activation.mode === 'hold_off') return `Unless I hold ${held}`
  return `While I hold ${held}`
}
