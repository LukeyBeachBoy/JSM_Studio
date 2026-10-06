import { parseCycleBinding } from './cycleBinding'
import { parsePlaySound } from './controllerSounds'
import { parseHapticBinding } from './hapticBindings'
import { isLoadConfigBindingValue } from './loadConfigBinding'

/** Native rumble packs the small motor into the low byte, big into the high. */
export function parseRumbleBinding(value: string) {
  const normalized = value.trim().toUpperCase()
  const token = normalized === 'SMALL_RUMBLE' ? 'R0080' : normalized === 'BIG_RUMBLE' ? 'RFF00' : normalized
  if (!/^R[0-9A-F]{4}$/.test(token)) return null
  const packed = Number.parseInt(token.slice(1), 16)
  return { small: packed & 255, big: packed >>> 8 }
}

export function rumbleBinding({ small, big }: { small: number; big: number }) {
  const byte = (value: number) => Math.round(Math.max(0, Math.min(255, value)))
  return `R${((byte(big) << 8) | byte(small)).toString(16).padStart(4, '0').toUpperCase()}`
}

/** Used by add and replace flows so parameter-bearing actions stay discoverable. */
export function hasBindingParameters(value: string) {
  return /^"?\s*(LIGHT_BAR|LED_BRIGHTNESS)\s*=/i.test(value)
    || Boolean(parsePlaySound(value) || parseCycleBinding(value) || parseHapticBinding(value) || parseRumbleBinding(value))
    || isLoadConfigBindingValue(value)
}
