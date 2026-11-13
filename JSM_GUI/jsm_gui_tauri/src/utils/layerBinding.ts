/** Native layer removal uses the binding's activator (including Hold's delay).
 * Keep this transport detail behind the Switch layer picker, including for
 * profiles that already contain the equivalent quoted command. */
export function parseLayerRemoval(value: string) {
  const match = /^"?LAYER_REMOVE ([A-Za-z][A-Za-z0-9_-]{0,63})"?$/.exec(value.trim())
  return match ? { layerId: match[1], verb: 'remove' as const } : null
}

export const layerRemovalValue = (layerId: string) => `LAYER_REMOVE ${layerId}`
