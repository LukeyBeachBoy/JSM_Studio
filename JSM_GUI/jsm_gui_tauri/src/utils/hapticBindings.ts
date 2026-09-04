// The controller's actuators, addressed by name. JoyShockMapper accepts
// HAPTIC_<side>_<effect>[_<gain>] anywhere a key goes, so this file only has to
// agree with parseHapticName in PlatformDefinitions.cpp -- same sides, same
// effect order, same gain grammar. Anything it cannot parse is left alone as a
// plain binding rather than guessed at.

export const HAPTIC_PREFIX = 'HAPTIC_'

export type HapticSide = 'L' | 'R' | 'BOTH'

// The firmware's own effects, in the firmware's own order. The index is what
// travels in the report, so do not reorder.
export const HAPTIC_EFFECTS = ['OFF', 'TICK', 'CLICK', 'TONE', 'RUMBLE', 'NOISE', 'SCRIPT', 'SWEEP'] as const

export type HapticEffect = (typeof HAPTIC_EFFECTS)[number]

export const HAPTIC_SIDES: HapticSide[] = ['L', 'R', 'BOTH']

// The firmware clamps here; matching it means the UI cannot offer a value the
// controller would silently truncate.
export const HAPTIC_GAIN_MIN = -127
export const HAPTIC_GAIN_MAX = 127

export type HapticBinding = {
  side: HapticSide
  effect: HapticEffect
  gain: number
}

export const DEFAULT_HAPTIC_BINDING: HapticBinding = { side: 'BOTH', effect: 'CLICK', gain: 0 }

export const isHapticBindingValue = (value: string) =>
  value.trim().toUpperCase().startsWith(HAPTIC_PREFIX)

export function parseHapticBinding(value: string): HapticBinding | null {
  const normalized = value.trim().toUpperCase()
  if (!normalized.startsWith(HAPTIC_PREFIX)) return null
  let rest = normalized.slice(HAPTIC_PREFIX.length)

  // BOTH_ before L_/R_, or "BOTH" would match nothing and a bare B would match
  // the wrong thing.
  let side: HapticSide
  if (rest.startsWith('BOTH_')) {
    side = 'BOTH'
    rest = rest.slice(5)
  } else if (rest.startsWith('L_')) {
    side = 'L'
    rest = rest.slice(2)
  } else if (rest.startsWith('R_')) {
    side = 'R'
    rest = rest.slice(2)
  } else {
    return null
  }

  const underscore = rest.indexOf('_')
  const effectName = underscore === -1 ? rest : rest.slice(0, underscore)
  const gainText = underscore === -1 ? '' : rest.slice(underscore + 1)

  const effect = HAPTIC_EFFECTS.find(candidate => candidate === effectName)
  if (!effect) return null

  let gain = 0
  if (gainText) {
    const negative = gainText.startsWith('N') || gainText.startsWith('-')
    const digits = negative ? gainText.slice(1) : gainText
    if (!digits || !/^[0-9]+$/.test(digits)) return null
    gain = Math.min(HAPTIC_GAIN_MAX, Number(digits))
    if (negative) gain = -gain
  }

  return { side, effect, gain }
}

export function formatHapticBinding(binding: HapticBinding): string {
  const gain = Math.round(Math.min(HAPTIC_GAIN_MAX, Math.max(HAPTIC_GAIN_MIN, binding.gain || 0)))
  // Negative gains use N rather than -, because a token is parsed out of a
  // config line where a leading minus is already the release-only modifier.
  const suffix = gain === 0 ? '' : `_${gain < 0 ? `N${-gain}` : gain}`
  return `${HAPTIC_PREFIX}${binding.side}_${binding.effect}${suffix}`
}
