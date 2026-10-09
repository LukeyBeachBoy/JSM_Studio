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

// Console v2 (TriggersResistance, TriggersEffects): each effect as a card, and
// each field in the design's words and units. Byte positions and strengths are
// shown as a percent of the pull (byte / 255); zones and forces stay steps.
export const TRIGGER_EFFECT_CARDS: Record<TriggerEffectMode, { label: string; caption: string; fields: string[] }> = {
  ON: { label: 'Automatic', caption: 'Firm at half press', fields: [] },
  OFF: { label: 'None', caption: 'Free pull', fields: [] },
  RESISTANCE: { label: 'Resistance', caption: 'Firm from a point', fields: ['Starts at', 'Strength'] },
  BOW: { label: 'Bow', caption: 'Builds, then snaps', fields: ['Starts at', 'Snap point', 'Strength', 'Snap strength'] },
  GALLOPING: { label: 'Galloping', caption: 'Two-beat pulses', fields: ['Starts at', 'Ends at', 'First beat', 'Second beat', 'Pulses'] },
  SEMI_AUTOMATIC: { label: 'Semi-automatic', caption: 'Firm, then gives way', fields: ['Starts at', 'Ends at', 'Strength'] },
  AUTOMATIC: { label: 'Automatic pulses', caption: 'Buzzes as you hold', fields: ['Starts at', 'Strength', 'Pulses'] },
  MACHINE: { label: 'Machine', caption: 'Uneven pulses', fields: ['Starts at', 'Ends at', 'First strength', 'Second strength', 'Pulses', 'Period'] },
  SEGMENT: { label: 'Resistance segment', caption: 'Firm in one stretch', fields: ['Starts at', 'Ends at', 'Strength'] },
}

export type EffectFieldDisplay = { label: string; kind: 'percent' | 'step' | 'hz'; min: number; max: number; value: number; text: string; help: string }

/** One field of an effect, read for a row: "Starts at · 25%", "Zone 2 · 0–9". */
export function effectFieldDisplay(effect: TriggerEffect, index: number): EffectFieldDisplay {
  const field = (TRIGGER_EFFECTS[effect.mode].fields as EffectField[])[index]
  const label = TRIGGER_EFFECT_CARDS[effect.mode].fields[index] ?? field.label
  const value = effect.values[index]
  if (field.unit === ' Hz') return { label, kind: 'hz', min: field.min, max: field.max, value, text: `${value} Hz`, help: 'How many pulses a second.' }
  if (field.unit === ' / 255' && label !== 'Period') return { label, kind: 'percent', min: field.min, max: field.max, value, text: `${Math.round(value / 2.55)}%`, help: label === 'Strength' ? 'How hard it pushes back.' : label === 'Ends at' ? 'Where it gives way.' : 'Where along the pull it begins. 0% is fully released.' }
  if (label === 'Period') return { label, kind: 'step', min: field.min, max: field.max, value, text: `${value} · 0–${field.max}`, help: 'How long each pulse pattern lasts.' }
  const zone = field.unit === ' / 9 travel zones'
  return { label, kind: 'step', min: field.min, max: field.max, value, text: zone ? `Zone ${value} · 0–${field.max}` : `${value} · 0–${field.max}`, help: zone ? 'Travel zone where this begins; the pull is split into ten zones.' : 'Force step; higher pushes back harder.' }
}

/** The push-back an effect gives along the pull (0..1 → 0..1), for its graph. */
export function effectProfile(effect: TriggerEffect | null, threshold = 0): (pull: number) => number {
  if (!effect) return () => 0
  const v = effect.values
  switch (effect.mode) {
    case 'OFF': return () => 0
    case 'ON': return pull => pull >= Math.max(0.05, threshold) ? 0.7 : 0.05
    case 'RESISTANCE': return pull => pull >= v[0] / 9 ? v[1] / 8 : 0
    case 'BOW': return pull => pull < v[0] / 8 ? 0 : pull < v[1] / 8 ? (v[2] / 8) * ((pull - v[0] / 8) / Math.max(0.01, (v[1] - v[0]) / 8)) : (v[3] / 8) * 0.25
    case 'GALLOPING': return pull => pull >= v[0] / 8 && pull <= v[1] / 9 ? (Math.sin(pull * 60) > 0 ? 0.6 : 0.2) : 0
    case 'MACHINE': return pull => pull >= v[0] / 8 && pull <= v[1] / 9 ? (Math.sin(pull * 50) > 0 ? v[2] / 7 : v[3] / 7) : 0
    case 'AUTOMATIC': return pull => pull >= v[0] / 255 ? (v[1] / 255) * (0.6 + 0.4 * Math.sin(pull * 70)) : 0
    case 'SEMI_AUTOMATIC':
    case 'SEGMENT': return pull => pull >= v[0] / 255 && pull <= v[1] / 255 ? v[2] / 255 : 0
  }
  return () => 0
}
