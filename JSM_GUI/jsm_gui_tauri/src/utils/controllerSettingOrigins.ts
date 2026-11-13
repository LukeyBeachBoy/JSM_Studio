import { controllerBase, controllerOverrides, projectController, sharedController, targetModel } from './controllerLayouts'
import { defaultLayer, layerEntries } from './layers'

/** Ownership is the saved scope, not the flattened controller preview. Removing
 * an instance assignment must reveal its model without editing other devices. */
export function controllerSettingOrigins(text: string, target: string, imported: string, importedOrigins: Record<string, string>) {
  const origins = { ...importedOrigins }
  const sourceTargets: Record<string, string> = {}
  const scopes = target ? [...new Set(['', targetModel(target), target])] : ['']
  for (const scope of scopes) {
    // Includes can themselves carry model/instance layouts. They are not owned
    // by this file and cannot be removed by its per-setting reset.
    if (scope) for (const key of Object.keys(layerEntries(defaultLayer(controllerOverrides(imported, scope).join('\n'))))) {
      origins[key] = 'Imported controller layout'
      delete sourceTargets[key]
    }
    if (scope === target) continue
    const source = defaultLayer(scope ? controllerOverrides(text, scope).join('\n') : controllerBase(text))
    for (const key of Object.keys(layerEntries(source))) {
      origins[key] = scope ? 'Controller model layout' : 'Shared game layout'
      sourceTargets[key] = scope
    }
  }
  const effectiveBase = `${imported}\n${controllerBase(text)}`
  return {
    own: defaultLayer(target ? controllerOverrides(text, target).join('\n') : controllerBase(text)),
    base: target ? defaultLayer(sharedController(text, target, effectiveBase)) : imported,
    origins,
    sourceTargets,
    defaultText: defaultLayer(target ? projectController(text, target, effectiveBase) : effectiveBase),
  }
}
