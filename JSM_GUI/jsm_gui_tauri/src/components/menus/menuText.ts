import type { MenuAttachment, MenuSelection, MenuSource, MenuType, VirtualMenu } from '../../utils/virtualMenus'
import type { ConfigLayer } from '../../utils/layers'
import { layerEntries, defaultLayer } from '../../utils/layers'

// The Menus tab in the player's words (console v2, MenuEditor, MenuEditorMore):
// every value of the catalogue gets a label here, so the editor never shows
// TOUCH_RELEASE or ACTIVATION_RELEASE.

export const SOURCE_LABEL: Record<MenuSource, string> = { RIGHT: 'Right pad', LEFT: 'Left pad', RSTICK: 'Right stick', LSTICK: 'Left stick', DPAD: 'D-pad', ABXY: 'Face buttons' }
export const SOURCE_CAPTION: Record<MenuSource, string> = {
  RIGHT: 'Move your thumb on the right pad to highlight a slice.', LEFT: 'Move your thumb on the left pad to highlight a slice.',
  RSTICK: 'Tilt the right stick toward a slice.', LSTICK: 'Tilt the left stick toward a slice.',
  DPAD: 'Left and right step through a hotbar; up uses it.', ABXY: 'The left and right face buttons step through a hotbar; the top one uses it.',
}
export const TYPE_LABEL: Record<MenuType, string> = { RADIAL: 'Wheel', TOUCH: 'Grid', HOTBAR: 'Hotbar' }
export const TYPE_CAPTION: Record<MenuType, string> = {
  RADIAL: 'Pick by direction round a wheel; the centre can have its own action.',
  TOUCH: 'Pick by place in a grid of zones.',
  HOTBAR: 'Step left and right along a strip; it remembers the slot.',
}
export const unitOf = (type: MenuType, count: number) => `${count} ${type === 'TOUCH' ? count === 1 ? 'zone' : 'zones' : type === 'HOTBAR' ? count === 1 ? 'slot' : 'slots' : count === 1 ? 'slice' : 'slices'}`

export const ACTIVATION_LABEL: Record<MenuAttachment['activation'], string> = { COMMAND: 'From a button', HOLD: 'While held', TOGGLE: 'Tap to open and close', ALWAYS: 'Always ready' }
export const ACTIVATION_CAPTION: Record<MenuAttachment['activation'], string> = {
  COMMAND: 'A button’s own binding opens, holds or toggles it.',
  HOLD: 'Open while you hold the opener.',
  TOGGLE: 'Tap the opener to open it, tap again to close.',
  ALWAYS: 'No opener: the stick or pad is always the menu.',
}
const isStick = (source: MenuSource) => source === 'LSTICK' || source === 'RSTICK'
export function selectionLabel(selection: MenuSelection, attachment: Pick<MenuAttachment, 'activation' | 'source'>) {
  if (selection === 'ACTIVATION_RELEASE') return attachment.activation === 'TOGGLE' ? 'When it closes' : 'When you let go'
  if (selection === 'CLICK') return 'On a press'
  if (selection === 'TOUCH_RELEASE') return isStick(attachment.source) ? 'Stick returns' : 'Lift your thumb'
  return 'Holds while pointing'
}
export function selectionCaption(selection: MenuSelection, attachment: Pick<MenuAttachment, 'activation' | 'source'>) {
  if (selection === 'ACTIVATION_RELEASE') return attachment.activation === 'TOGGLE' ? 'The highlighted slice is used when the opener closes it.' : 'Let go of the button and the highlighted slice is used.'
  if (selection === 'CLICK') return 'Press the confirm button to use the highlighted slice.'
  if (selection === 'TOUCH_RELEASE') return isStick(attachment.source) ? 'Let the stick spring back to use the highlighted slice.' : 'Lift your thumb to use the highlighted slice.'
  return 'The slice you point at is held down until you move off it.'
}
export const NAVIGATION_LABEL: Record<NonNullable<MenuAttachment['navigation']>, string> = { JOYSTICK: 'Straight to a slice', JOYSTICK_CURSOR: 'Like a cursor' }
export const NAVIGATION_CAPTION: Record<NonNullable<MenuAttachment['navigation']>, string> = {
  JOYSTICK: 'Tilting the stick highlights the slice it points at.',
  JOYSTICK_CURSOR: 'The stick moves a cursor from the centre, like a thumb on a pad.',
}
export const REVEAL_LABEL: Record<VirtualMenu['placement']['reveal'], string> = { touch: 'When opened', navigate: 'While moving', ring: 'On a slice', never: 'Never' }
export const REVEAL_CAPTION: Record<VirtualMenu['placement']['reveal'], string> = {
  touch: 'Shows as soon as it opens.',
  navigate: 'Shows while you touch the pad or tilt the stick.',
  ring: 'Shows while a slice is highlighted.',
  never: 'Never drawn; the menu still works.',
}

/** "Tilt the right stick to pick, let go to use". */
export function behaviourSentence(menu: VirtualMenu) {
  const attachment = menu.attachments[0]
  if (!attachment) return 'Nothing opens it yet: add a way under Opened by'
  const pick = isStick(attachment.source) ? `Tilt the ${attachment.source === 'RSTICK' ? 'right' : 'left'} stick to pick`
    : attachment.source === 'DPAD' ? 'Step with the D-pad' : attachment.source === 'ABXY' ? 'Step with the face buttons'
    : `Touch the ${attachment.source === 'RIGHT' ? 'right' : 'left'} pad to pick`
  const use = attachment.selection === 'CLICK' ? 'press to use'
    : attachment.selection === 'CONTINUOUS' ? 'it holds what you point at'
    : attachment.selection === 'TOUCH_RELEASE' ? (isStick(attachment.source) ? 'let it spring back to use' : 'lift to use')
    : attachment.activation === 'TOGGLE' ? 'close it to use' : 'let go to use'
  return `${pick}, ${use}`
}

export type MenuOpener = { input: string; layer?: ConfigLayer; layerIndex?: number; verb: string }
const MENU_COMMAND = /MENU_(OPEN|HOLD|TOGGLE|CLOSE)\s+([A-Za-z][A-Za-z0-9_-]*)/g

/** The buttons whose bindings open each menu, and the mode they are in
 *  (MenuEditor's rail: "■ Comms · right pad · 6"). */
export function menuOpeners(defaultText: string, layers: ConfigLayer[]): Map<string, MenuOpener[]> {
  const result = new Map<string, MenuOpener[]>()
  const scan = (entries: Readonly<Record<string, string>>, layer?: ConfigLayer, layerIndex?: number) => {
    for (const [key, value] of Object.entries(entries)) {
      if (key.startsWith('#')) continue
      for (const match of value.matchAll(MENU_COMMAND)) {
        if (match[1] === 'CLOSE') continue
        const list = result.get(match[2]) ?? []
        list.push({ input: key.split(',').pop() ?? key, layer, layerIndex, verb: match[1].toLowerCase() })
        result.set(match[2], list)
      }
    }
  }
  scan(layerEntries(defaultLayer(defaultText)))
  layers.forEach((layer, index) => scan(layer.overrides, layer, index))
  return result
}
