// CmdRegistry registers each of these legacy assignment shortcuts twice.
// They alias binding targets, not physical input conditions. In particular,
// SL,SL is not the same thing as a double press on LSL or RSL.
export const BINDING_ALIASES = { SL: ['LSL', 'RSL'], SR: ['LSR', 'RSR'] } as const

/** Effective physical keys, also usable for per-output annotation keys. */
export function physicalBindingTargets(key: string): string[] {
  const annotation = key.indexOf('::')
  const input = annotation >= 0 ? key.slice(0, annotation) : key
  const suffix = annotation >= 0 ? key.slice(annotation) : ''
  const parts = input.split(/([,+*])/)
  const target = parts[parts.length - 1].trim().toUpperCase()
  const members = BINDING_ALIASES[target as keyof typeof BINDING_ALIASES]
  return members ? members.map(member => [...parts.slice(0, -1), member].join('') + suffix) : [key]
}

export function bindingTargetAlias(key: string): string | undefined {
  const parts = key.split(/([,+*])/)
  const target = parts[parts.length - 1].trim().toUpperCase()
  const alias = Object.entries(BINDING_ALIASES).find(([, targets]) => (targets as readonly string[]).includes(target))?.[0]
  if (!alias) return undefined
  parts[parts.length - 1] = alias
  return parts.join('')
}

export function bindingTargetMatches(actual: string, target: string) {
  return actual === target || (BINDING_ALIASES[actual as keyof typeof BINDING_ALIASES] as readonly string[] | undefined)?.includes(target) === true
}
