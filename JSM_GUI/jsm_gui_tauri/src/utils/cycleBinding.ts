export const CYCLE_MAX_STEPS = 32

// Native binding extension: one quoted action, ordinary output tokens inside.
// Timing stays on its normal outer activator, never in an annotation runtime.
export function parseCycleBinding(value: string): string[] | null {
  const plain = value.trim().replace(/^"|"$/g, '')
  if (!plain.startsWith('CYCLE ')) return null
  const steps = plain.slice(6).split('|').map(step => step.trim())
  if (steps.length < 2 || steps.length > CYCLE_MAX_STEPS || steps.some(step => !step || /[\s"\\/'^!]/.test(step))) return null
  return steps
}

export function cycleBinding(steps: string[]) {
  const value = 'CYCLE ' + steps.join(' | ')
  return parseCycleBinding(value) ? value : null
}
