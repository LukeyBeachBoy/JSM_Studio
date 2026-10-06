export const PAD_FEEDBACK_FIELDS = [
  { field: 'HAPTIC_INTENSITY', fallback: '0' },
  { field: 'HAPTIC_EFFECT', fallback: 'TICK' },
  { field: 'HAPTIC_INTERVAL', fallback: '250' },
  { field: 'CLICK_HAPTIC_INTENSITY', fallback: '0' },
  { field: 'CLICK_HAPTIC_EFFECT', fallback: 'CLICK' },
  { field: 'RELEASE_HAPTIC_INTENSITY', fallback: '0' },
  { field: 'RELEASE_HAPTIC_EFFECT', fallback: 'TICK' },
] as const
export type PadFeedbackSide = 'LEFT' | 'RIGHT'
export type FeedbackRead = (key: string) => string | undefined
export const padFeedbackKey = (side: PadFeedbackSide, field: string) => `${side}_TOUCHPAD_${field}`
export const hasSeparatePadFeedback = (read: FeedbackRead, side: PadFeedbackSide) => read(padFeedbackKey(side, 'HAPTICS'))?.trim().toUpperCase() === 'ON'
export function padFeedbackValue(read: FeedbackRead, side: PadFeedbackSide, field: string) {
  const fallback = PAD_FEEDBACK_FIELDS.find(entry => entry.field === field)?.fallback ?? ''
  return (read(hasSeparatePadFeedback(read, side) ? padFeedbackKey(side, field) : `TOUCHPAD_${field}`) ?? fallback).trim()
}
// Preserve latent custom values. The first opt-in copies effective shared values
// into ordinary native settings, so enabling separation doesn't change the feel.
export function padFeedbackPolicyChanges(read: FeedbackRead, side: PadFeedbackSide, separate: boolean): Record<string, string> {
  const result: Record<string, string> = { [padFeedbackKey(side, 'HAPTICS')]: separate ? 'ON' : 'OFF' }
  if (separate) for (const { field, fallback } of PAD_FEEDBACK_FIELDS) {
    const key = padFeedbackKey(side, field)
    if (read(key) === undefined) result[key] = read(`TOUCHPAD_${field}`) ?? fallback
  }
  return result
}
