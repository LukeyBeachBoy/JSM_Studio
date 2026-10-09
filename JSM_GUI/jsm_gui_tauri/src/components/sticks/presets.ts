// Named presets on the Sticks and Trackpads Fine-tune groups (console v2, D7).
// Each maps to the numbers it writes; a group shows "Custom" when the current
// numbers match none. Chosen from the mapper's defaults (JoyShockMapper
// main.cpp) and the curves the artboards draw. Documented in notes/P4.md.

/** "How a push becomes speed" → STICK_POWER (1 = even; JSM default 1). */
export const STICK_POWER_PRESETS = [
  { value: 'quick', label: 'Quick start', power: 0.5, caption: 'Quick start reaches speed early; small pushes already turn fast.' },
  { value: 'even', label: 'Even', power: 1, caption: 'Even: speed grows in step with the push.' },
  { value: 'precise', label: 'Precise centre', power: 2, caption: 'Precise centre slows small pushes so fine aim is easier.' },
] as const

/** "Speed-up · How much" → STICK_ACCELERATION_RATE and _CAP (JSM default 0 and 1000000, i.e. off). */
export const STICK_SPEEDUP_PRESETS = [
  { value: 'off', label: 'Off', rate: 0, cap: 1000000, caption: 'No speed-up: full tilt always turns at your turn speed.' },
  { value: 'gentle', label: 'Gentle', rate: 1, cap: 2, caption: 'Builds by one turn speed a second, up to 2×.' },
  { value: 'strong', label: 'Strong', rate: 2, cap: 3, caption: 'Builds by two turn speeds a second, up to 3×.' },
] as const
export const NO_SPEEDUP_CAP = 1000000

/** "Small flicks" → FLICK_TIME_EXPONENT (JSM default 0: every flick takes Flick time). */
export const FLICK_EXPONENT_PRESETS = [
  { value: 'same', label: 'Same time', exponent: 0, caption: 'Same time: every flick takes the full flick time.' },
  { value: 'shorter', label: 'Shorter', exponent: 1, caption: 'Shorter: a 90° flick takes half the time.' },
  { value: 'much', label: 'Much shorter', exponent: 2, caption: 'Much shorter: a 90° flick takes a quarter of the time.' },
] as const

/** "Smoothing for tiny turns" → ROTATE_SMOOTH_OVERRIDE (JSM default -1, automatic). */
export const ROTATE_SMOOTH_PRESETS = [
  { value: 'auto', label: 'Automatic', smooth: -1, caption: 'Automatic picks the right amount for your controller.' },
  { value: 'off', label: 'Off', smooth: 0, caption: 'Off: tiny turns are sent as they are; you may feel steps.' },
] as const

/** "Response curve" (gamepad stick) → <TARGET>_UNPOWER (0 or 1 even, 2 undoes a squared game curve). */
export const UNPOWER_PRESETS = [
  { value: 'even', label: 'Even', unpower: 0, caption: 'Even: the game gets your push as it is.' },
  { value: 'square', label: 'Undo square', unpower: 2, caption: 'Undo square: for a game that is slow near the centre.' },
] as const

/** Trackpad "Speed up fast swipes" → TOUCHPAD_ACCEL_* (JSM default: min and max gain 1, off). */
export const TOUCHPAD_ACCEL_PRESETS = [
  { value: 'off', label: 'Off', curve: 'LINEAR', minSpeed: 0, maxSpeed: 2000, minGain: 1, maxGain: 1, caption: 'Off: the same distance at every speed.' },
  { value: 'gentle', label: 'Gentle', curve: 'NATURAL', minSpeed: 0, maxSpeed: 2000, minGain: 1, maxGain: 1.6, caption: 'Gentle: quick flicks go up to 1.6× further.' },
  { value: 'strong', label: 'Strong', curve: 'NATURAL', minSpeed: 0, maxSpeed: 2000, minGain: 1, maxGain: 2.5, caption: 'Strong: quick flicks go up to 2.5× further.' },
] as const

/** Trackpad feel strength words → *_HAPTIC_INTENSITY (0–100; strengthWord reads ≤33 Light, ≤66 Medium). */
export const FEEL_STRENGTHS = [
  { value: 'off', label: 'Off', intensity: 0 },
  { value: 'light', label: 'Light', intensity: 25 },
  { value: 'medium', label: 'Medium', intensity: 50 },
  { value: 'strong', label: 'Strong', intensity: 85 },
] as const

export const near = (a: number, b: number, epsilon = 0.0001) => Math.abs(a - b) < epsilon
