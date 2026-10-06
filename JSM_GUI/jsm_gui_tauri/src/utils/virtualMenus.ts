import { getKeymapValue } from './keymap'
import { isNativeInput } from '../constants/nativeInputs'
import type { OverlayPlacement } from './overlayLayout'

export type MenuSource = 'LEFT' | 'RIGHT' | 'LSTICK' | 'RSTICK' | 'DPAD' | 'ABXY'
export type MenuType = 'RADIAL' | 'TOUCH' | 'HOTBAR'
export type MenuSelection = 'CLICK' | 'TOUCH_RELEASE' | 'ACTIVATION_RELEASE' | 'CONTINUOUS'
export type MenuAttachment = { source: MenuSource; activation: 'COMMAND' | 'HOLD' | 'TOGGLE' | 'ALWAYS'; input: string; selection: MenuSelection; confirm: string; cancel: string; navigation?: 'JOYSTICK' | 'JOYSTICK_CURSOR' }
export type MenuAction = { binding: string; label: string; icon: string; [key: string]: unknown }
export type VirtualMenu = {
  id: string; name: string; type: MenuType; columns: number; deadzone: number;
  actions: MenuAction[]; centerAction?: MenuAction;
  attachments: MenuAttachment[]; placement: OverlayPlacement;
  /** Unrecognised presentation properties survive edits by newer/older editors. */
  extra?: Record<string, unknown>;
}
export const MENU_SOURCES: { value: MenuSource; label: string }[] = [
  { value: 'RIGHT', label: 'Right trackpad' }, { value: 'LEFT', label: 'Left trackpad' },
  { value: 'RSTICK', label: 'Right stick' }, { value: 'LSTICK', label: 'Left stick' }, { value: 'DPAD', label: 'D-pad' }, { value: 'ABXY', label: 'Face buttons' },
]
export const MENU_SELECTIONS: { value: MenuSelection; label: string }[] = [
  { value: 'ACTIVATION_RELEASE', label: 'Release the activation input' }, { value: 'CLICK', label: 'Click or confirm' },
  { value: 'TOUCH_RELEASE', label: 'Lift off or return to centre' }, { value: 'CONTINUOUS', label: 'Hold the highlighted action' },
]
const PRESENTATION_DEFAULT: OverlayPlacement = { x: .5, y: .5, size: 360, showLabels: true, showKeys: true, showIcons: true, fontSize: 18, labelFontSize: 18, outputFontSize: 18, reveal: 'touch' }
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/

export function createVirtualMenu(id: string, name = 'Weapon Wheel'): VirtualMenu {
  return { id, name, type: 'RADIAL', columns: 8, deadzone: .2, actions: Array.from({ length: 8 }, (_, index) => ({ binding: String(index + 1), label: `Weapon ${index + 1}`, icon: '' })), attachments: [], placement: { ...PRESENTATION_DEFAULT } }
}
function encode(text: string) { return 'HEX:' + [...new TextEncoder().encode(text)].map(byte => byte.toString(16).padStart(2, '0')).join('') }
function decode(text: string) {
  if (!/^HEX:(?:[a-f0-9]{2})*$/i.test(text) || text.length > 400004) throw new Error('Invalid native menu catalog')
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(text.slice(4).match(/../g) ?? [], byte => parseInt(byte, 16)))
}
export function virtualMenuProblem(menus: VirtualMenu[]): string | null {
  if (menus.length > 16 || new Set(menus.map(menu => menu.id)).size !== menus.length) return 'Use at most 16 menus with distinct identities.'
  let attachments = 0; const sources = new Set<string>()
  for (const menu of menus) {
    if (!IDENTIFIER.test(menu.id) || !menu.name.trim() || menu.name.length > 120 || !['RADIAL', 'TOUCH', 'HOTBAR'].includes(menu.type)) return 'A menu needs a name and supported layout.'
    const minimum = menu.type === 'RADIAL' ? 2 : 1
    if (menu.actions.length < minimum || menu.actions.length > 25 || !Number.isInteger(menu.columns) || menu.columns < 1 || menu.columns > menu.actions.length) return 'Use 1–25 actions (at least 2 for a wheel) and a valid column count.'
    if (!Number.isFinite(menu.deadzone) || menu.deadzone < 0 || menu.deadzone >= 1) return 'The centre deadzone must be between 0% and 99%.'
    if ([...menu.actions, ...(menu.centerAction ? [menu.centerAction] : [])].some(action => !action.binding.trim() || /[\r\n\0]/.test(action.binding))) return 'Each action needs a single-line JSM binding.'
    const placement = menu.placement
    if (![placement.x, placement.y, placement.size, placement.fontSize, placement.labelFontSize ?? 18, placement.outputFontSize ?? placement.fontSize].every(Number.isFinite) || placement.x < 0 || placement.x > 1 || placement.y < 0 || placement.y > 1 || placement.size < 120 || placement.size > 1600 || placement.fontSize < 8 || placement.fontSize > 40 || (placement.labelFontSize ?? 18) < 8 || (placement.labelFontSize ?? 18) > 40 || (placement.outputFontSize ?? placement.fontSize) < 8 || (placement.outputFontSize ?? placement.fontSize) > 40) return 'Keep the menu position, size and text sizes within their shown ranges.'
    for (const attachment of menu.attachments) {
      if (attachment.navigation !== undefined && (!['JOYSTICK', 'JOYSTICK_CURSOR'].includes(attachment.navigation) || !['LSTICK', 'RSTICK'].includes(attachment.source))) return 'Joystick navigation modes require a left or right stick.'
      if (attachment.navigation === 'JOYSTICK_CURSOR' && menu.type === 'HOTBAR') return 'Joystick cursor requires a radial wheel or touch grid. Choose Joystick before switching to a hotbar.'
      if (!MENU_SOURCES.some(source => source.value === attachment.source) || !['COMMAND', 'HOLD', 'TOGGLE', 'ALWAYS'].includes(attachment.activation) || !MENU_SELECTIONS.some(selection => selection.value === attachment.selection) || ![attachment.input, attachment.confirm, attachment.cancel].every(input => isNativeInput(input))) return 'Choose supported activation, navigation and selection inputs.'
      if (['HOLD', 'TOGGLE'].includes(attachment.activation) && attachment.input === 'NONE') return 'Hold and toggle activation require an input.'
      if (attachment.activation === 'ALWAYS' && attachment.selection === 'ACTIVATION_RELEASE') return 'An always available menu needs click, lift or continuous selection.'
      if (['DPAD', 'ABXY'].includes(attachment.source) && (menu.type !== 'HOTBAR' || attachment.selection === 'TOUCH_RELEASE')) return 'D-pad and face-button navigation require a hotbar with click, activation-release or continuous selection. Remove their attachments before switching layouts.'
      const key = attachment.source + ':' + (attachment.activation === 'COMMAND' ? menu.id : attachment.input)
      if (sources.has(key)) return 'Each navigation source and activation input can own one menu at a time.'
      sources.add(key); attachments += 1
    }
  }
  return attachments > 32 ? 'Use at most 32 menu attachments.' : null
}
export function encodeVirtualMenus(menus: VirtualMenu[]): string | null {
  if (virtualMenuProblem(menus)) return null
  const lines: string[] = []
  for (const menu of menus) {
    lines.push(`DEFINE ${menu.id} ${menu.type} ${menu.actions.length} ${menu.columns} ${menu.deadzone}`)
    menu.actions.forEach((action, index) => lines.push(`ACTION ${menu.id} ${index + 1} ${action.binding}`))
    if (menu.centerAction) lines.push(`ACTION ${menu.id} 0 ${menu.centerAction.binding}`)
    lines.push(`PRESENTATION ${menu.id} ${JSON.stringify({ ...menu.extra, name: menu.name, placement: menu.placement, actions: menu.actions.map(({ binding: _binding, ...presentation }) => { void _binding; return presentation }), ...(menu.centerAction ? { centerAction: (({ binding: _binding, ...display }) => { void _binding; return display })(menu.centerAction) } : {}) })}`)
  }
  for (const menu of menus) for (const attachment of menu.attachments)
    lines.push(`SOURCE ${menu.id} ${attachment.source} ${attachment.activation} ${attachment.input} ${attachment.selection} ${attachment.confirm} ${attachment.cancel}${attachment.navigation ? ` ${attachment.navigation}` : ''}`)
  const packed = encode(lines.join('\n'))
  return packed.length <= 400004 ? packed : null
}
export function readVirtualMenus(text: string): { menus: VirtualMenu[]; problem: string | null } {
  const packed = getKeymapValue(text, 'VIRTUAL_MENUS')
  const individual = text.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\s*VIRTUAL_MENU(_ACTION|_SOURCE)?\s+(.+)$/)
    return match ? [`${match[1] === '_ACTION' ? 'ACTION' : match[1] === '_SOURCE' ? 'SOURCE' : 'DEFINE'} ${match[2]}`] : []
  })
  if (!packed && !individual.length) return { menus: [], problem: null }
  try {
    const menus = new Map<string, VirtualMenu>()
    for (const line of (packed ? decode(packed).split('\n') : individual)) {
      if (!line.trim()) continue
      const [command, id, ...values] = line.split(' ')
      if (command === 'DEFINE') {
        if (values.length !== 4 || !IDENTIFIER.test(id)) throw new Error()
        const [type, count, columns, deadzone] = values
        if (!Number.isInteger(Number(count)) || Number(count) < 1 || Number(count) > 25) throw new Error()
        const menu = createVirtualMenu(id, id)
        menu.type = type as MenuType; menu.columns = Number(columns); menu.deadzone = Number(deadzone)
        menu.actions = Array.from({ length: Number(count) }, () => ({ binding: 'NONE', label: '', icon: '' }))
        menus.set(id, menu)
      } else {
        const menu = menus.get(id); if (!menu) throw new Error()
        if (command === 'ACTION') {
          const index = Number(values[0]) - 1
          if (index === -1) menu.centerAction = { binding: values.slice(1).join(' '), label: '', icon: '' }
          else {
            if (!Number.isInteger(index) || !menu.actions[index]) throw new Error()
            menu.actions[index].binding = values.slice(1).join(' ')
          }
        } else if (command === 'SOURCE') {
          if (values.length !== 6 && values.length !== 7) throw new Error()
          const [source, activation, input, selection, confirm, cancel, navigation] = values
          menu.attachments.push({ source: source as MenuSource, activation: activation as MenuAttachment['activation'], input, selection: selection as MenuSelection, confirm, cancel, ...(navigation ? { navigation: navigation as MenuAttachment['navigation'] } : {}) })
        } else if (command === 'PRESENTATION') {
          const data = JSON.parse(values.join(' '))
          if (!data || typeof data !== 'object' || typeof data.name !== 'string' || !Array.isArray(data.actions)) throw new Error()
          const { name, placement = {}, actions, centerAction, ...extra } = data
          if (menu.centerAction && centerAction && typeof centerAction.label === 'string' && typeof centerAction.icon === 'string') {
            const { binding: _binding, ...display } = centerAction; void _binding; Object.assign(menu.centerAction, display)
          }
          menu.name = name; menu.extra = extra; menu.placement = {
            ...PRESENTATION_DEFAULT,
            ...placement,
            // Old catalogs used fontSize for output bindings. Keep that size
            // while giving action labels their own readable default.
            labelFontSize: placement.labelFontSize ?? PRESENTATION_DEFAULT.labelFontSize,
            outputFontSize: placement.outputFontSize ?? placement.fontSize ?? PRESENTATION_DEFAULT.outputFontSize,
          }
          actions.forEach((item: { label: string; icon: string; binding?: unknown }, index: number) => {
            // Presentation cannot replace the native ACTION binding. Future
            // display fields do survive edits made by this version.
            const { binding: _binding, ...display } = item; void _binding
            if (menu.actions[index] && typeof item.label === 'string' && typeof item.icon === 'string') Object.assign(menu.actions[index], display)
          })
        } else throw new Error()
      }
    }
    const list = [...menus.values()], problem = virtualMenuProblem(list)
    return { menus: list, problem }
  } catch { return { menus: [], problem: 'This menu catalog uses unsupported or invalid data. It is preserved; correct it in the source before graphical editing.' } }
}
export function writeVirtualMenus(text: string, menus: VirtualMenu[]): string {
  const value = encodeVirtualMenus(menus)
  if (value === null) return text
  // Only these named-menu statements are consolidated. Legacy physical menus,
  // unrelated bindings and unknown future commands are not rewritten.
  const retained = text.split(/(\r?\n)/).map(line => /^\s*VIRTUAL_MENU(?:_ACTION|_SOURCE)?\s+/.test(line) ? '' : line).join('')
  const lines = retained.split(/(\r?\n)/)
  const indices = lines.flatMap((line, index) => /^[ \t]*VIRTUAL_MENUS[ \t]*=/i.test(line) ? [index] : [])
  if (indices.length) {
    const last = indices[indices.length - 1]
    const indent = lines[last].match(/^[ \t]*/)?.[0] ?? ''
    const note = lines[last].match(/[ \t]+#.*$/)?.[0] ?? ''
    indices.forEach(index => { lines[index] = index === last ? `${indent}VIRTUAL_MENUS = ${value}${note}` : '' })
    return lines.join('')
  }
  const newline = retained.includes('\r\n') ? '\r\n' : '\n'
  return retained + (retained && !retained.endsWith('\n') ? newline : '') + `VIRTUAL_MENUS = ${value}${newline}`
}
