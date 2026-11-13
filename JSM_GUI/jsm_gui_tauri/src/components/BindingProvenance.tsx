import { layerHue, layerSlot } from '../utils/layers'
import { createContext, useContext, useMemo, type CSSProperties, type ReactNode } from 'react'
import { createBindingProvenance, type BindingSource } from '../utils/bindingProvenance'
import { LayerUsageContext } from './LayerBar'
import './BindingProvenance.css'

const BindingProvenanceContext = createContext<ReturnType<typeof createBindingProvenance> | null>(null)
export function BindingProvenanceProvider({ children, ownText, baseText, baseOrigins, gameName }: {
  children: ReactNode; ownText: string; baseText: string; baseOrigins?: Record<string, string>; gameName?: string
}) {
  const { selected, layers } = useContext(LayerUsageContext)
  const value = useMemo(() => createBindingProvenance({ ownText, baseText, baseOrigins, gameName, selected, layers }), [ownText, baseText, baseOrigins, gameName, selected, layers])
  return <BindingProvenanceContext.Provider value={value}>{children}</BindingProvenanceContext.Provider>
}
export const useBindingProvenance = () => useContext(BindingProvenanceContext)
export const bindingSourceStyle = (source: BindingSource): CSSProperties => ({
  '--binding-source-color': source.color,
  '--input-color': source.color,
  '--input-dash': source.kind === 'base' ? '5 3' : source.kind === 'mixed' ? '2 3' : 'none',
}) as CSSProperties

export function BindingSourceMark({ source, className = '' }: { source: BindingSource; className?: string }) {
  if (source.kind === 'unset') return null
  return <span className={`binding-source-mark ${className}`} data-binding-source={source.kind} style={bindingSourceStyle(source)} title={source.label}>
    {source.sources?.map(part => <span key={part.label} className="binding-source-part" data-binding-source={part.kind} style={bindingSourceStyle(part)} aria-hidden="true" />)}
    <span className="binding-source-spoken">{source.label}</span>
  </span>
}

export function BindingSourceLegend() {
  const provenance = useBindingProvenance()
  const { selected, layers } = useContext(LayerUsageContext)
  if (!provenance) return null
  const sources: BindingSource[] = [
    ...(provenance.hasBase ? [{ kind: 'base' as const, label: `Inherited from ${provenance.baseNames.join(', ') || 'base config'}`, color: 'var(--binding-base)' }] : []),
    { kind: 'game', label: `From ${provenance.gameName}`, color: 'var(--binding-game)' },
    ...(selected ? [{ kind: 'layer' as const, label: `Layer · ${selected.name}`, color: layerHue(layerSlot(layers, selected.id)) }] : []),
    ...(provenance.mixed ? [provenance.mixed] : []),
  ]
  return <div className="binding-source-legend" role="list" aria-label="Binding sources">
    <span className="binding-source-legend-label">Binding sources</span>
    {sources.map(source => <span role="listitem" key={source.kind} title={source.label}><BindingSourceMark source={source} /><span>{source.kind === 'base' ? 'Base' : source.kind === 'game' ? 'Game config' : source.kind === 'mixed' ? 'Mixed' : selected?.name}</span></span>)}
  </div>
}
