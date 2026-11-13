import { addControllerLayout, controllerOverrides, controllerBase, resetControllerVariant } from './controllerLayouts'
import { inputDefinitions, layerEntries, readLayers } from './layers'
import { encodeVirtualMenus } from './virtualMenus'

/** Keyboard on foot, analog steering in the thumb-toggled driving layer.
 * All rows belong to type-25; the original game layout remains byte-for-byte.
 */
export function addAzeronCyberpunkLayout(text: string, effectiveText = text) {
  const model = 'type-25'
  const lines: string[] = []
  const binding = (key: string, value: string, label?: string) => {
    lines.push(`${key} = ${value}`)
    if (label) lines.push(`# @label ${key} = ${label}`)
  }
  // Suppress inherited physical bindings, including chords, while retaining them
  // in the source for the Steam Controller. Do not inherit its menus or layers.
  const inputs = new Set(inputDefinitions.map(button => button.command))
  const isBinding = (key: string) => key.split(/[,+*]/).filter(Boolean).every(part => inputs.has(part.replace(/^!/, '')) || /^[LR]?[TM]\d+$/.test(part))
  for (const key of new Set([...inputs, ...Object.keys(layerEntries(controllerBase(effectiveText))).filter(isBinding)])) binding(key, 'NONE')
  for (const layer of readLayers(controllerBase(effectiveText))) lines.push(`# @layer ${JSON.stringify({ ...layer, overrides: {}, deleted: true })}`)
  // Hardware fit and direction response come from the user’s global preferences.
  const settings = {
    VIRTUAL_CONTROLLER: 'XBOX', GYRO_SENS: '0', GYRO_OUTPUT: 'MOUSE',
    LEFT_STICK_MODE: 'NO_MOUSE', RIGHT_STICK_MODE: 'NO_MOUSE', MOTION_STICK_MODE: 'NO_MOUSE',
    VIRTUAL_MENUS: encodeVirtualMenus([]) ?? 'NONE',
  }
  Object.entries(settings).forEach(([key, value]) => binding(key, value))
  const keys: [string, string, string][] = [
    ['LUP','W','Forward'], ['LDOWN','S','Backward'], ['LLEFT','A','Left'], ['LRIGHT','D','Right'],
    ['JOY1','SPACE','Jump'], ['JOY2','LSHIFT','Sprint'], ['JOY3','LCONTROL','Crouch'], ['JOY4','F','Interact'],
    ['JOY5','R','Reload'], ['JOY6','Q','Quick melee'], ['JOY7','X','Heal'], ['JOY8','E','Cyberware'], ['JOY9','TAB','Scanner'],
    ['JOY10','1','Weapon 1'], ['JOY11','2','Weapon 2'], ['JOY12','3','Weapon 3'], ['JOY13','4','Fists'],
    ['JOY14','I','Inventory'], ['JOY15','J','Journal'], ['JOY16','M','Map'], ['JOY17','T','Phone'],
    ['JOY18','V','Call vehicle'], ['JOY19','B','Holster weapon'], ['JOY20','CAPS_LOCK','Toggle scanner'],
    ['JOY21','C','Toggle crouch'], ['JOY23','T','Cycle objective'], ['JOY24','ALT','Weapon wheel'],
    ['JOY25','ESC','Escape'], ['JOY26','N','Photo mode'],
    ['UP','UP','Up'], ['DOWN','DOWN','Down'], ['LEFT','LEFT','Left'], ['RIGHT','RIGHT','Right'],
  ]
  keys.forEach(([key, value, label]) => binding(key, value, label))
  binding('JOY22','NONE','Toggle Driving')
  lines.push('# @layer-action JOY22 = toggle cyborg-driving')
  lines.push(`# @layer ${JSON.stringify({ id: 'cyborg-driving', name: 'Driving', overrides: {
    LEFT_STICK_MODE: 'LEFT_STICK', LUP: 'NONE', LDOWN: 'NONE', LLEFT: 'NONE', LRIGHT: 'NONE',
    JOY1: 'W', JOY2: 'S', JOY3: 'SPACE', JOY4: 'F', JOY5: 'R', JOY6: 'Q', JOY18: 'V', JOY21: 'LCONTROL',
    '# @label JOY1': 'Accelerate', '# @label JOY2': 'Brake / reverse', '# @label JOY3': 'Handbrake',
    '# @label JOY4': 'Exit vehicle', '# @label JOY5': 'Radio', '# @label JOY6': 'Change camera',
    '# @label JOY18': 'Vehicle lights', '# @label JOY21': 'Vehicle combat',
  } })}`)
  const source = addControllerLayout(resetControllerVariant(text, model), model)
  return `${source.trimEnd()}\n${lines.map(line => `# @controller ${model} ${line}`).join('\n')}\n`
}

export const hasAzeronCyberpunkLayout = (text: string) => controllerOverrides(text, 'type-25').some(line => line.includes('cyborg-driving'))
