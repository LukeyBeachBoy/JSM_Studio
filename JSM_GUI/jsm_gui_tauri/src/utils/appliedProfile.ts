/** The runtime applies unsaved edits through this internal file. Its filename
 * is transport state; the library name captured by Apply remains the identity.
 *
 * AppNavigation is the same kind of thing: Studio loads it while its own
 * window is in front so the pad drives Studio, and it is not a configuration
 * anyone chose, edits, or should be told about. What is applied is still the
 * configuration games get once Studio loses focus. */
const INTERNAL = new Set(['applied-preview', 'appnavigation'])

export const isStudioNavigationProfile = (runtimePath: unknown) =>
  typeof runtimePath === 'string' && /(^|[\\/])AppNavigation\.txt$/i.test(runtimePath.trim())

export function appliedProfileLabel(runtimePath: unknown, appliedName: string | null): string | null {
  const layer = typeof runtimePath === 'string' ? runtimePath.replace(/\\/g, '/').match(/\/\.layers\/([^/]+)\/\d+-(.+)\.txt$/i) : null
  if (layer) return `${layer[1].toLowerCase() === 'applied-preview' ? appliedName ?? 'Profile' : layer[1]} · ${layer[2]}`
  const name = typeof runtimePath === 'string'
    ? runtimePath.trim().replace(/\\/g, '/').split('/').pop()?.replace(/\.txt$/i, '')
    : undefined
  return name && !INTERNAL.has(name.toLowerCase()) ? name : appliedName
}
