import { readVirtualSetting, writeVirtualSetting } from './virtualStickSettings'

type EffectField = { label: string; min: number; max: number; default: number; unit?: string }
const zone = (label: string, max = 9, value = 2): EffectField => ({ label, min: 0, max, default: value, unit: ' / 9 travel zones' })
const force = (label = 'Strength', max = 8): EffectField => ({ label, min: 0, max, default: 4 })
const byte = (label: string, value: number): EffectField => ({ label, min: 0, max: 255, default: value, unit: ' / 255' })
const frequency: EffectField = { label: 'Pulse frequency', min: 0, max: 255, default: 20, unit: ' Hz' }

// Parameter order follows operators.cpp. Ranges follow the actual SDL packet
// encoder, which uses raw bytes for the older segment/weapon/vibration modes.
export const TRIGGER_EFFECTS = {
  ON: { label: 'Automatic resistance', help: 'JSM places resistance at the digital trigger threshold using the trigger calibration.', fields: [] },
  OFF: { label: 'No resistance', help: 'Disable this trigger’s adaptive effect.', fields: [] },
  RESISTANCE: { label: 'Resistance', help: 'Constant resistance from a selected travel zone.', fields: [zone('Resistance begins'), force()] },
  BOW: { label: 'Bow', help: 'Resistance followed by a snap. The end zone must be beyond the start.', fields: [zone('Resistance begins', 8), zone('Snap point', 8, 7), force(), force('Snap strength')] },
  GALLOPING: { label: 'Galloping', help: 'Two pulses repeat between the selected zones. The second pulse phase must exceed the first.', fields: [zone('Effect begins', 8), zone('Effect ends', 9, 8), { ...force('First pulse phase', 6), default: 2 }, { ...force('Second pulse phase', 7), default: 5 }, frequency] },
  SEMI_AUTOMATIC: { label: 'Semi-automatic', help: 'Legacy weapon effect: start, end and force are encoded directly as bytes. These are not the ten-zone values used by Resistance.', fields: [byte('Resistance begins', 64), byte('Resistance ends', 160), byte('Strength', 128)] },
  AUTOMATIC: { label: 'Automatic pulses', help: 'Legacy vibration effect. Position and amplitude use the full byte range; frequency is in hertz.', fields: [byte('Effect begins', 64), byte('Amplitude', 128), frequency] },
  MACHINE: { label: 'Machine', help: 'Alternates two amplitudes between the selected zones. End must exceed start.', fields: [zone('Effect begins', 8), zone('Effect ends', 9, 8), force('First amplitude', 7), force('Second amplitude', 7), frequency, byte('Pulse period', 10)] },
  SEGMENT: { label: 'Resistance segment', help: 'Legacy segment effect using raw byte positions and force.', fields: [byte('Effect begins', 64), byte('Effect ends', 160), byte('Strength', 128)] },
} satisfies Record<string, { label: string; help: string; fields: EffectField[] }>
export type TriggerEffectMode = keyof typeof TRIGGER_EFFECTS
export type TriggerEffect = { mode: TriggerEffectMode; values: number[] }
export function triggerEffectProblem(effect: TriggerEffect) {
  const fields: EffectField[] = TRIGGER_EFFECTS[effect.mode].fields
  if (effect.values.length !== fields.length || fields.some((field, index) => !Number.isInteger(effect.values[index]) || effect.values[index] < field.min || effect.values[index] > field.max)) return 'A parameter is outside the supported effect range.'
  if (['BOW', 'GALLOPING', 'MACHINE'].includes(effect.mode) && effect.values[0] >= effect.values[1]) return 'Effect end must be beyond its start.'
  if (effect.mode === 'GALLOPING' && effect.values[2] >= effect.values[3]) return 'The second pulse phase must exceed the first.'
  return null
}
export function defaultTriggerEffect(mode: TriggerEffectMode): TriggerEffect {
  return { mode, values: (TRIGGER_EFFECTS[mode].fields as EffectField[]).map(field => field.default) }
}
export function parseTriggerEffect(value = 'ON'): TriggerEffect | null {
  const [mode, ...values] = value.trim().split(/\s+/)
  if (!(mode in TRIGGER_EFFECTS)) return null
  const effect = { mode: mode as TriggerEffectMode, values: values.map(Number) }
  return effect.values.length === TRIGGER_EFFECTS[effect.mode].fields.length ? effect : null
}
export function writeTriggerEffect(text: string, side: 'LEFT' | 'RIGHT', effect: TriggerEffect) {
  return triggerEffectProblem(effect) ? text : writeVirtualSetting(text, side + '_TRIGGER_EFFECT', [effect.mode, ...effect.values].join(' '))
}
export function readTriggerCalibration(text: string, side: 'LEFT' | 'RIGHT', field: 'OFFSET' | 'RANGE') {
  const value = Number(readVirtualSetting(text, side + '_TRIGGER_' + field) ?? (field === 'OFFSET' ? 25 : 150))
  return Number.isFinite(value) ? value : field === 'OFFSET' ? 25 : 150
}
