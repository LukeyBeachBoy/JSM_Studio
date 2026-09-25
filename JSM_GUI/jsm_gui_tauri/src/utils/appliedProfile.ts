/** The runtime applies unsaved edits through this internal file. Its filename
 * is transport state; the library name captured by Apply remains the identity. */
export function appliedProfileLabel(runtimePath: unknown, appliedName: string | null): string | null {
  const layer = typeof runtimePath === 'string' ? runtimePath.replace(/\\/g, '/').match(/\/\.layers\/([^/]+)\/\d+-(.+)\.txt$/i) : null
  if (layer) return `${layer[1].toLowerCase() === 'applied-preview' ? appliedName ?? 'Profile' : layer[1]} · ${layer[2]}`
  const name = typeof runtimePath === 'string'
    ? runtimePath.trim().replace(/\\/g, '/').split('/').pop()?.replace(/\.txt$/i, '')
    : undefined
  return name && name.toLowerCase() !== 'applied-preview' ? name : appliedName
}
