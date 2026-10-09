import { createContext, useContext } from 'react'
import { controllerOverrides } from '../../../utils/controllerLayouts'

// The controller variant being edited (console v2, V4: the game chip's scope):
// which controller model, what it is called, and the configuration's whole
// text, where `# @controller <model> KEY = value` lines hold its own layout.
// App provides it; the Buttons list's variant line and Details' origin stack
// read it ("Only for Steam Controller. Other controllers use the shared layout.").
export type VariantScope = { model: string; label: string; text: string }

export const VariantScopeContext = createContext<VariantScope | null>(null)

/** How one input stands in the variant: changed for this controller only, shared, or no variant at all. */
export function useInputVariant(command: string | undefined): { label: string; changed: boolean; value?: string } | null {
  const scope = useContext(VariantScopeContext)
  if (!scope || !scope.model || !command) return null
  const key = command.toUpperCase()
  const own = controllerOverrides(scope.text, scope.model)
    .map(line => /^\s*([^=#\s]+)\s*=\s*(.*)$/.exec(line))
    .find(match => match && match[1].toUpperCase() === key)
  return { label: scope.label, changed: Boolean(own), value: own?.[2]?.trim() }
}

/** Asks a binding row to open its sheet (Details' "Open in <mode>", Layout). */
export const OPEN_BINDING_EVENT = 'jsm:open-binding'
export type OpenBindingDetail = { command: string; activation?: string }
export const requestOpenBinding = (detail: OpenBindingDetail) => window.dispatchEvent(new CustomEvent<OpenBindingDetail>(OPEN_BINDING_EVENT, { detail }))
