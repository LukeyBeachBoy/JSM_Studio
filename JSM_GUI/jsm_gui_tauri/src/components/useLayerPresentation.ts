import { bindingSourceStyle, useBindingProvenance } from './BindingProvenance'
import { useContext, useMemo, type CSSProperties } from 'react'
import { LayerUsageContext } from './LayerBar'
import { layerHue, layerSlot, overrideInput } from '../utils/layers'

/** Shared by settings, binding summaries and every controller drawing. */
export function useLayerPresentation() {
  const { selected, layers } = useContext(LayerUsageContext)
  const provenance = useBindingProvenance()
  return useMemo(() => {
    const color = selected ? layerHue(layerSlot(layers, selected.id)) : undefined
    const changed = new Set(Object.keys(selected?.overrides ?? {}).map(overrideInput))
    for (const input of [...changed]) {
      if (input && /^L(UP|DOWN|LEFT|RIGHT|RING|TOUCH)$/.test(input)) changed.add('L3')
      if (input && /^R(UP|DOWN|LEFT|RIGHT|RING|TOUCH)$/.test(input)) changed.add('R3')
      if (input === 'ZLF') changed.add('ZL')
      if (input === 'ZRF') changed.add('ZR')
    }
    const overrides = (command?: string) => Boolean(command && (changed.has(command) ||
      (command === 'LUP' && changed.has('L3')) ||
      (command === 'LEFT_PAD' && changed.has('MISC3')) ||
      (command === 'RIGHT_PAD' && changed.has('MISC2'))))
    return {
      selected, color, overrides,
      provenance,
      hasSource: (command?: string) => Boolean(provenance && provenance.input(command).kind !== 'unset'),
      style: color ? { '--layer-color': color, '--origin-override': color } as CSSProperties : undefined,
      inputProps: (command?: string) => ({
        'data-input-command': command,
        'data-layer-override': selected && overrides(command) ? 'true' : undefined,
        'data-binding-source': provenance?.input(command).kind,
        style: provenance ? bindingSourceStyle(provenance.input(command)) : selected ? { '--input-color': overrides(command) ? color : 'var(--text-3)' } as CSSProperties : undefined,
      }),
    }
  }, [selected, layers, provenance])
}
