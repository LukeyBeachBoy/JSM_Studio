/** The runtime applies unsaved edits through this internal file. Its filename
 * is transport state; the library name captured by Apply remains the identity.
 *
 * AppNavigation is the same kind of thing: Studio loads it while its own
 * window is in front so the pad drives Studio, and it is not a configuration
 * anyone chose, edits, or should be told about. What is applied is still the
 * configuration games get once Studio loses focus. */
const INTERNAL = new Set(['applied-preview', 'appnavigation'])

/** The selected controller can load a profile without changing the mapper's
 * app-wide profile. Callers put the selected device first. */
export function activeControllerProfilePath(sample: { activeProfile?: unknown; devices?: { activeProfile?: unknown }[] } | null | undefined): string {
  const devicePath = sample?.devices?.[0]?.activeProfile
  if (typeof devicePath === 'string' && devicePath.trim()) return devicePath.trim()
  return typeof sample?.activeProfile === 'string' ? sample.activeProfile.trim() : ''
}

export const isStudioNavigationProfile = (runtimePath: unknown) =>
  typeof runtimePath === 'string' && /(^|[\\/])AppNavigation\.txt$/i.test(runtimePath.trim())

type SlotIdentity = { id: number; profileName?: string | null }
type AppliedProfile = { name: string | null; readPath: string | null }

/** Resolve transport files to their owning configuration. Layer filenames can
 * contain a hash and a controller scope; neither is a library identity. Keep
 * the snapshot path separately so a newer saved source cannot masquerade as
 * the content currently running in a slot. */
export function resolveAppliedProfile(runtimePath: unknown, appliedName: string | null, slots: readonly SlotIdentity[] = []): AppliedProfile {
  const path = typeof runtimePath === 'string' ? runtimePath.trim().replace(/\\/g, '/') : ''
  const layer = path.match(/(?:^|\/)profiles-library\/\.layers\/([^/]+)\/(?:[^/]+\/)?[^/]+\.txt$/i)
  const slot = path.match(/(?:^|\/)profiles-library\/\.slots\/slot-([1-4])\.txt$/i)
    ?? (layer ? layer[1].match(/^slot-([1-4])$/i) : null)
  if (slot) return {
    name: slots.find(item => item.id === Number(slot[1]))?.profileName ?? null,
    readPath: `profiles-library/.slots/slot-${slot[1]}.txt`,
  }
  const name = layer?.[1] ?? path.split('/').pop()?.replace(/\.txt$/i, '')
  if (!name || INTERNAL.has(name.toLowerCase())) return { name: appliedName, readPath: null }
  // Unknown internal paths must never become a user-facing name or edit target.
  if (!layer && /(?:^|\/)profiles-library\/\./i.test(path)) return { name: null, readPath: null }
  return { name, readPath: name === appliedName ? null : layer ? `profiles-library/${name}.txt` : path }
}

export function appliedProfileLabel(runtimePath: unknown, appliedName: string | null, slots: readonly SlotIdentity[] = []): string | null {
  return resolveAppliedProfile(runtimePath, appliedName, slots).name
}
