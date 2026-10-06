import type { VirtualMenu } from './virtualMenus'
import type { OverlayMenu } from './overlayLayout'
export type NamedMenuState = { open: boolean; selected: number; navigating?: boolean }
/** Visibility never controls native highlighting or action execution. */
export function namedMenuVisible(reveal: VirtualMenu['placement']['reveal'], state: NamedMenuState): boolean {
  if (!state.open || reveal === 'never') return false
  if (reveal === 'touch') return true
  // Older mappers do not report navigation. Do not guess from a latched highlight.
  if (!state.navigating) return false
  return reveal === 'navigate' || state.selected >= 0
}
export function namedMenuOverlay(menu: VirtualMenu): OverlayMenu {
  return { displayAspect: menu.type === 'HOTBAR' ? 5 : 1, pad: 'RIGHT', layer: '', shape: menu.type === 'RADIAL' ? 'RADIAL' : 'RECTANGLE', columns: menu.type === 'HOTBAR' ? menu.actions.length : menu.columns,
    rows: menu.type === 'HOTBAR' ? 1 : Math.ceil(menu.actions.length / menu.columns), deadzone: menu.deadzone, centreDeadzone: menu.deadzone, requiresClick: false,
    ...(menu.type === 'RADIAL' && menu.centerAction ? { centerRegion: { command: `${menu.id}:${menu.actions.length}`, ...menu.centerAction } } : {}),
    regions: menu.actions.map((action, index) => ({ command: `${menu.id}:${index}`, ...action })), placement: menu.placement }
}
