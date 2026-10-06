import { getKeymapValue, updateKeymapEntry } from './keymap'
import { parseBindingLabels } from './bindingLabels'
import { parseBindingIcons } from './bindingIcons'
import { parseOverlayPlacements, resolveOverlayMenu } from './overlayLayout'
import { createVirtualMenu, encodeVirtualMenus, readVirtualMenus, writeVirtualMenus, virtualMenuProblem, type MenuAttachment, type VirtualMenu } from './virtualMenus'

export type StickSide = 'left' | 'right'
export const stickMenuSource = (side: StickSide) => side === 'left' ? 'LSTICK' : 'RSTICK'
export function stickMenuLinks(text: string, side: StickSide) {
  return readVirtualMenus(text).menus.flatMap(menu => menu.attachments.filter(attachment => attachment.source === stickMenuSource(side)).map(attachment => ({ menu, attachment })))
}
export function isDirectStickMenu(attachment: MenuAttachment, trigger = '') {
  return trigger ? attachment.activation === 'HOLD' && attachment.input === trigger : attachment.activation === 'ALWAYS'
}
export function detachStickMenu(text: string, side: StickSide, trigger = '') {
  const catalog = readVirtualMenus(text)
  if (catalog.problem) return text
  return writeVirtualMenus(text, catalog.menus.map(menu => ({ ...menu,
    ...(trigger && Array.isArray(menu.extra?.stickModeshiftControls) ? { extra: { ...menu.extra, stickModeshiftControls: menu.extra.stickModeshiftControls.filter(key => key !== `${stickMenuSource(side)}:${trigger}`) } } : {}),
    attachments: menu.attachments.filter(a => a.source !== stickMenuSource(side) || !isDirectStickMenu(a, trigger)),
  })))
}

/** Conversion is explicit. The old bindings remain in source for recovery. */
export function connectStickMenu(text: string, side: StickSide, existingId?: string, trigger = ''): { text: string; id?: string; problem?: string } {
  const catalog = readVirtualMenus(text)
  if (catalog.problem) return { text, problem: catalog.problem }
  const SIDE = side.toUpperCase(), prefix = side === 'left' ? 'LM' : 'RM'
  const key = (name: string) => trigger ? `${trigger},${name}` : name
  const read = (name: string) => getKeymapValue(text, key(name)) ?? getKeymapValue(text, name)
  let menu: VirtualMenu | undefined = existingId ? catalog.menus.find(m => m.id === existingId) : undefined
  if (existingId && (!menu || menu.type !== 'RADIAL')) return { text, problem: 'Choose an existing radial menu.' }
  if (!menu) {
    let index = 1
    while (catalog.menus.some(m => m.id === `menu${index}`) || text.includes(`MENU_OPEN menu${index}`) || text.includes(`MENU_HOLD menu${index}`) || text.includes(`MENU_TOGGLE menu${index}`) || text.includes(`MENU_CLOSE menu${index}`)) index++
    menu = createVirtualMenu(`menu${index}`, `${side === 'left' ? 'Left' : 'Right'} stick wheel${trigger ? ` (${trigger})` : ''}`)
    const legacy = read(`${SIDE}_STICK_MODE`) === 'RADIAL_MENU'
    // Menu actions have no physical chord/simultaneous input identity. Never
    // silently discard such bindings during conversion.
    if (legacy && text.split(/\r?\n/).some(line => {
      const lhs = line.split('=')[0].trim()
      return new RegExp(`(?:^|[,+ ])${prefix}\\d+`).test(lhs) && !(trigger && new RegExp(`^${prefix}\\d+$`).test(lhs)) && !new RegExp(`^${trigger ? trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ',' : ''}${prefix}\\d+$`).test(lhs) && !lhs.startsWith('#')
    })) return { text, problem: 'This wheel has conditional segment bindings. Keep its existing editor until those bindings have been moved to separate virtual menus.' }
    const count = legacy ? Math.max(2, Math.min(25, Number(read(`${SIDE}_STICK_MENU_SIZE`)) || 8)) : 8
    const labels = parseBindingLabels(text), icons = parseBindingIcons(text)
    menu.columns = count
    menu.deadzone = legacy ? Number(read(`${SIDE}_STICK_MENU_DEADZONE`) ?? .35) : .35
    menu.actions = Array.from({ length: count }, (_, i) => ({ binding: legacy ? read(`${prefix}${i + 1}`) || 'NONE' : 'NONE', label: legacy ? labels[key(`${prefix}${i + 1}`)] ?? labels[`${prefix}${i + 1}`] ?? '' : '', icon: legacy ? icons[key(`${prefix}${i + 1}`)] ?? icons[`${prefix}${i + 1}`] ?? '' : '' }))
    const placements = parseOverlayPlacements(text)
    menu.placement = legacy ? resolveOverlayMenu(text, labels, icons, placements, stickMenuSource(side), trigger)?.placement ?? { ...menu.placement, reveal: 'ring' } : { ...menu.placement, reveal: 'never' }
  }
  const id = menu.id
  const menus = catalog.menus.filter(m => m.id !== id).concat(menu).map(m => ({ ...m, attachments: m.attachments.filter(a => a.source !== stickMenuSource(side) || !isDirectStickMenu(a, trigger)) }))
  menus.find(m => m.id === id)!.attachments.push({ source: stickMenuSource(side), activation: trigger ? 'HOLD' : 'ALWAYS', input: trigger || 'NONE', selection: 'CONTINUOUS', confirm: 'NONE', cancel: 'NONE', navigation: 'JOYSTICK' })
  if (trigger) {
    const owner = menus.find(m => m.id === id)!
    const controls = Array.isArray(owner.extra?.stickModeshiftControls) ? owner.extra.stickModeshiftControls : []
    owner.extra = { ...owner.extra, stickModeshiftControls: [...new Set([...controls, `${stickMenuSource(side)}:${trigger}`])] }
  }
  const problem = virtualMenuProblem(menus)
  if (problem) return { text, problem }
  if (encodeVirtualMenus(menus) === null) return { text, problem: 'This menu catalog exceeds the supported size. The existing stick configuration has been preserved.' }
  return { text: writeVirtualMenus(updateKeymapEntry(text, key(`${SIDE}_STICK_MODE`), ['NO_MOUSE']), menus), id }
}
