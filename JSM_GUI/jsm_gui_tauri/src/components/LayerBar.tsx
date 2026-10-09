import { createContext, useContext } from 'react'
import { inputUses, type ConfigLayer, type LayerAction } from '../utils/layers'
import { type ControllerVisualFamily } from '../utils/controllerStatus'
import { inputDisplayName } from '../keymap/inputNames'
import { Icon } from './icons/Icon'
import './Layers.css'

// What every page shares about modes (console v2: "Layer" reads "Mode" in the
// UI; the config keeps JSM's # @layer). Managing modes -- creating, naming,
// ordering, deleting, what turns them on -- is the Modes tab
// (components/modes/ModesPage.tsx); this file keeps the context the binding
// rows read and the small marks they draw.

/** The mode mark (binding card refresh 2a): stacked sheets, the top one filled. */
export function LayerIcon({ size = 16 }: { size?: number }) { return <Icon name="layer" size={size} /> }

export const LayerUsageContext = createContext<{
  text: string; layers: ConfigLayer[]; actions: LayerAction[]; selected?: ConfigLayer
  onChangeLayers?: (layers: ConfigLayer[]) => void
  /** Replaces every mode action on one input. */
  onSetActions?: (input: string, actions: LayerAction[]) => void
  onSelect?: (id: string) => void; onNavigate?: (command: string) => void; disabled?: boolean
  /** The pad in front of you, so inputs read L4 / LB rather than LSL / L. */
  family?: ControllerVisualFamily
}>({ text: '', layers: [], actions: [] })

export function useInputUses(command?: string) {
  const { text, layers, family = 'generic' } = useContext(LayerUsageContext)
  return command ? inputUses(text, command, layers, input => inputDisplayName(input, family)) : []
}

/** "Changed" or "Default" beside a value while a mode is being edited. */
export function LayerValueBadge({ command }: { command?: string }) {
  const { selected } = useContext(LayerUsageContext)
  if (!selected || !command) return null
  const side = command === 'LEFT_PAD' ? 'LEFT' : command === 'RIGHT_PAD' ? 'RIGHT' : null
  const overridden = Object.keys(selected.overrides).some(key => key === command || key.endsWith(`,${command}`) ||
    (side && key.startsWith(`${side}_`)) || (command === 'L3' && key.startsWith('LEFT_STICK_')) || (command === 'R3' && key.startsWith('RIGHT_STICK_')))
  return <small className="layer-value-badge" data-caption={overridden ? `Changed in ${selected.name}` : 'From Default'}>{overridden ? 'Changed' : 'Default'}</small>
}
