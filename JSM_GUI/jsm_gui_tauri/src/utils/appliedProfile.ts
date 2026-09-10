/** The runtime applies unsaved edits through this internal file. Its filename
 * is transport state; the library name captured by Apply remains the identity. */
export function appliedProfileLabel(runtimePath: unknown, appliedName: string | null): string | null {
  const name = typeof runtimePath === 'string'
    ? runtimePath.trim().replace(/\\/g, '/').split('/').pop()?.replace(/\.txt$/i, '')
    : undefined
  return name && name.toLowerCase() !== 'applied-preview' ? name : appliedName
}
