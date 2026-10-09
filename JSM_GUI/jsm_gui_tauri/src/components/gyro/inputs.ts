import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { buildModifierOptions, resolveModifierOptionLabel } from '../../utils/modifierOptions'
import { inputDisplayName } from '../../keymap/inputNames'
import type { ControllerVisualFamily } from '../../utils/controllerStatus'
import type { TelemetryDevice } from '../../hooks/useTelemetry'
import { getPressedControllerCommandSet } from '../../utils/controllerStatus'

/** Every input that can turn gyro (or tilt) on, as "Hold which button?" lists them. */
export function useHoldInputs(family: ControllerVisualFamily, gridCommands: string[] = []) {
  const { t } = useTranslation()
  return useMemo(() => buildModifierOptions(gridCommands.length > 0, gridCommands.length, gridCommands)
    .filter(option => !['NONE'].includes(option.value))
    .map(option => ({ value: option.value, label: resolveModifierOptionLabel(option, t, family), disabled: option.disabled })), [family, gridCommands, t])
}

/** "Right grip", "LT". */
export const inputName = (command: string, family: ControllerVisualFamily) => inputDisplayName(command, family)

/** The input to suggest first: the right grip on a controller that has grips, else R3. */
export const defaultHoldInput = (device?: { type?: number }) => (device?.type === 24 ? 'MISC5' : 'R3')

/** Inputs held or touched on the first controller right now. */
export function pressedNow(device?: TelemetryDevice): Set<string> {
  if (!device?.status) return new Set()
  const pressed = getPressedControllerCommandSet(device)
  // Grip sense and pad touch, which the button mask does not carry.
  if (device.status.rightGrip?.pressed) { pressed.add('MISC5'); pressed.add('GRIP_R') }
  if (device.status.leftGrip?.pressed) { pressed.add('MISC6'); pressed.add('GRIP_L') }
  if (device.status.rightPad?.touched || device.status.leftPad?.touched) pressed.add('TOUCH')
  if (device.status.leftStickTouch) pressed.add('LTOUCH')
  if (device.status.rightStickTouch) pressed.add('RTOUCH')
  return pressed
}

/** Whether the activation's input (or combined condition) is matched by what is held now. */
export function activationMatched(button: string, pressed: Set<string>) {
  const [first, ...rest] = button.trim().toUpperCase().split(/\s+/)
  const match = (token: string) => token.startsWith('!') ? !pressed.has(token.slice(1)) : pressed.has(token)
  if (first === 'ANY') return rest.some(match)
  if (first === 'ALL') return rest.length > 0 && rest.every(match)
  return first ? match(first) : false
}

/** Is gyro (or tilt) on right now, given its activation and what is held. */
export function isActiveNow(activation: { mode: string; button: string }, pressed: Set<string>) {
  if (activation.mode === 'always_on') return true
  if (activation.mode === 'always_off') return false
  const matched = activationMatched(activation.button, pressed)
  return activation.mode === 'hold_on' ? matched : !matched
}
