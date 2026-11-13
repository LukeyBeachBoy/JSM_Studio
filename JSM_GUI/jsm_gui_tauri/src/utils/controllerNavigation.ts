import type { RuntimeMappingState } from '../platform/desktopBridge'

export function controllerNavigationEnabled(state: RuntimeMappingState | null, target: string): boolean {
  return state?.controllerNavOverrides?.[target] ?? state?.controllerNavOverrides?.[target.split('-device-')[0]] ?? (target.split('-device-')[0] === 'type-25' ? false : state?.controllerNavEnabled ?? true)
}
export function anyControllerNavigation(state: RuntimeMappingState): boolean {
  return state.controllerNavEnabled || Object.values(state.controllerNavOverrides ?? {}).some(Boolean)
}
