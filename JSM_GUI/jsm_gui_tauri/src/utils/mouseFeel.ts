// Mouse feel's named smoothing presets and its one-line summary (console
// refinement 2c). The pair is what the backend reads (TOUCHPAD_MIN_CUTOFF /
// TOUCHPAD_SPEED_COEFF); these are labelled points in that space.

export const SMOOTHING_PRESETS = [
  { id: 'off', label: 'Off', cutoff: 0, speed: 0 },
  { id: 'light', label: 'Light', cutoff: 10, speed: 0.8 },
  { id: 'balanced', label: 'Balanced', cutoff: 6, speed: 0.6 },
  { id: 'heavy', label: 'Heavy', cutoff: 2.5, speed: 3.0 },
] as const

export const smoothingPreset = (cutoff: number, speed: number) =>
  SMOOTHING_PRESETS.find(preset => Math.abs(preset.cutoff - cutoff) < 0.001 && Math.abs(preset.speed - speed) < 0.0001)?.id ?? 'custom'

export const strengthWord = (intensity: number) => intensity <= 0 ? 'Off' : intensity <= 33 ? 'Light' : intensity <= 66 ? 'Medium' : 'Strong'

/** The line under the Mouse feel row: "Balanced smoothing · glide on · light ticks". */
export function mouseFeelSummary(values: { cutoff?: number; speed?: number; trackballDecay?: number; hapticIntensity?: number }) {
  const preset = smoothingPreset(values.cutoff ?? 6, values.speed ?? 0.6)
  const smoothing = preset === 'off' ? 'No smoothing' : preset === 'custom' ? 'Custom smoothing' : `${SMOOTHING_PRESETS.find(p => p.id === preset)!.label} smoothing`
  const glide = (values.trackballDecay ?? 0) > 0 ? 'glide on' : 'no glide'
  const ticks = (values.hapticIntensity ?? 0) > 0 ? `${strengthWord(values.hapticIntensity ?? 0).toLowerCase()} ticks` : 'no ticks'
  return `${smoothing} · ${glide} · ${ticks}`
}
