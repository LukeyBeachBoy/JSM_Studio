import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../components/icons/Icon'
import { Menu, type MenuItem } from '../components/ui/Menu'
import appMark from '../assets/app-icon-16.svg'
import type { ShellWidth } from './useShellWidth'
import { windowControls } from './windowControls'

export type MappingPlateState = 'studio' | 'testing' | 'on' | 'off' | 'disconnected'
export type VirtualOutput = 'NONE' | 'XBOX' | 'DS4'

export type TitleBarProfile = { name: string; description?: string; template?: boolean }
export type TitleBarLayer = { id: string; name: string; description?: string; colorIndex: number }

type TitleBarProps = {
  width: ShellWidth
  frameless: boolean
  onOpenStudio: () => void

  editingName: string | null
  dirty: boolean
  profiles: TitleBarProfile[]
  appliedName: string | null
  onSelectProfile: (name: string) => void
  onOpenLibrary: () => void
  editingDisabled?: boolean

  layers: TitleBarLayer[]
  layerId: string
  onSelectLayer: (id: string) => void
  onManageLayers: () => void

  onEditApplied: () => void

  mapping: MappingPlateState
  mappingBusy: boolean
  onToggleMapping: () => void
  output: VirtualOutput
  onOutputChange: (output: VirtualOutput) => void
  onBindWholeController: () => void

  onTest: () => void
  onExitTest: () => void

  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  /** Save / Apply stay focusable when idle and say why (HANDOFF.md, 2a "Disabled"). */
  saveIdleReason: string | null
  applyIdleReason: string | null
  onSave: () => void
  onApply: () => void
}

const OUTPUT_LABELS: Record<VirtualOutput, string> = { NONE: 'Disabled', XBOX: 'Virtual Xbox', DS4: 'Virtual DualShock 4' }
const OUTPUT_DESCRIPTIONS: Record<VirtualOutput, string> = {
  NONE: 'Keyboard and mouse only',
  XBOX: 'Games see an Xbox 360 pad',
  DS4: 'Games see a DualShock 4',
}
export const layerColor = (index: number) => `var(--layer-${(index % 3) + 1})`

// Tooltips always name the file the button acts on; an idle button adds why.
const withReason = (action: string, shortcut: string, reason: string | null) => reason ? `${action} · ${reason}` : `${action} (${shortcut})`

const Chevron = () => <span className="titlebar__chevron" aria-hidden="true"><Icon name="chevronDown" size={16} /></span>

function MappingDot({ state }: { state: MappingPlateState }) {
  return <span className="mapping-plate__dot" data-state={state} aria-hidden="true"><span /></span>
}

function WindowControls() {
  const [maximized, setMaximized] = useState(false)
  useEffect(() => {
    let dispose: (() => void) | undefined
    let cancelled = false
    const refresh = () => { void windowControls.isMaximized().then(value => { if (!cancelled) setMaximized(value) }) }
    refresh()
    void windowControls.onResized(refresh).then(unlisten => { if (cancelled) unlisten(); else dispose = unlisten })
    return () => { cancelled = true; dispose?.() }
  }, [])
  // Mouse-only (HANDOFF.md, "Focus model"): out of the tab order and the pad's.
  return (
    <div className="window-controls" data-focusable="false">
      <button type="button" tabIndex={-1} aria-label="Minimise" onClick={() => void windowControls.minimize()}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5.5h10" stroke="currentColor" /></svg>
      </button>
      <button type="button" tabIndex={-1} aria-label={maximized ? 'Restore' : 'Maximise'} onClick={() => void windowControls.toggleMaximize()}>
        {maximized
          ? <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" fill="none" stroke="currentColor"><rect x=".5" y="2.5" width="7" height="7" rx="1" /><path d="M2.5 2.5V1.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1" /></svg>
          : <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" fill="none" stroke="currentColor"><rect x=".5" y=".5" width="9" height="9" rx="1" /></svg>}
      </button>
      <button type="button" tabIndex={-1} className="window-controls__close" aria-label="Close" onClick={() => void windowControls.close()}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M.5.5l9 9M9.5.5l-9 9" stroke="currentColor" /></svg>
      </button>
    </div>
  )
}

export function TitleBar(props: TitleBarProps) {
  const { t } = useTranslation()
  const { width, mapping } = props
  const compact = width !== 'wide'
  const [profileQuery, setProfileQuery] = useState('')
  const editingLabel = props.editingName ?? t('app.profileSummary.selectProfile', 'Select configuration')
  const currentLayer = props.layers.find(layer => layer.id === props.layerId)
  const appliedIsEditing = Boolean(props.appliedName && props.appliedName === props.editingName)

  // ---- Editing menu (Shell Directions 2b): grouped and searchable.
  const query = profileQuery.trim().toLowerCase()
  const matches = (profile: TitleBarProfile) => !query || profile.name.toLowerCase().includes(query)
  const profileItem = (profile: TitleBarProfile): MenuItem => ({
    label: profile.name,
    description: profile.description,
    checked: profile.name === props.editingName,
    tag: profile.name === props.appliedName ? { label: 'Applied', tone: 'ok' } : profile.template ? { label: 'Template' } : undefined,
    onSelect: () => props.onSelectProfile(profile.name),
  })
  const regular = props.profiles.filter(profile => !profile.template && matches(profile))
  const templates = props.profiles.filter(profile => profile.template && matches(profile))
  const editingItems: MenuItem[] = [
    // Below 1280px Applied has no segment of its own; it lives here instead.
    ...(compact && props.appliedName && !appliedIsEditing
      ? [{ kind: 'label' as const, label: 'Applied' }, { label: props.appliedName, description: 'Running now · select to edit', tag: { label: 'Applied', tone: 'ok' as const }, onSelect: props.onEditApplied }]
      : []),
    ...(regular.length ? [{ kind: 'label' as const, label: 'Profiles' }, ...regular.map(profileItem)] : []),
    ...(templates.length ? [{ kind: 'label' as const, label: 'Templates' }, ...templates.map(profileItem)] : []),
    { kind: 'separator' },
    { label: 'Open configuration library', navigates: true, onSelect: props.onOpenLibrary },
  ]

  // ---- Layer menu (2c): switches the editing layer only.
  const layerItems: MenuItem[] = [
    { kind: 'label', label: 'Editing layer' },
    { label: 'Default', description: 'Base bindings', checked: !props.layerId, onSelect: () => props.onSelectLayer('') },
    ...props.layers.map(layer => ({
      label: layer.name,
      description: layer.description,
      checked: layer.id === props.layerId,
      swatch: layer.id === props.layerId ? undefined : layerColor(layer.colorIndex),
      onSelect: () => props.onSelectLayer(layer.id),
    })),
    { kind: 'separator' },
    { label: 'Manage layers…', onSelect: props.onManageLayers },
  ]

  // ---- Mapping plate menu (2d): on/off first, then the virtual output.
  const mappingOn = mapping !== 'off'
  const mappingItems: MenuItem[] = [
    {
      label: 'Mapping',
      description: mappingOn ? 'JSM is reading the controller' : 'Your controller is not mapped',
      keepOpen: true,
      disabled: props.mappingBusy,
      onSelect: props.onToggleMapping,
      trailing: (
        <span className="segmented segmented--tiny" aria-hidden="true">
          <span data-selected={mappingOn ? 'true' : undefined} data-tone="telemetry">On</span>
          <span data-selected={!mappingOn ? 'true' : undefined}>Off</span>
        </span>
      ),
    },
    { kind: 'label', label: 'Virtual output' },
    ...(Object.keys(OUTPUT_LABELS) as VirtualOutput[]).map(value => ({
      label: OUTPUT_LABELS[value],
      description: OUTPUT_DESCRIPTIONS[value],
      checked: value === props.output,
      onSelect: () => props.onOutputChange(value),
    })),
    { kind: 'separator' },
    {
      label: 'Bind whole controller',
      description: props.output === 'NONE' ? 'Choose a virtual output first' : `Map every input to the matching ${props.output === 'DS4' ? 'DualShock 4' : 'Xbox'} button`,
      disabled: props.output === 'NONE',
      navigates: true,
      onSelect: props.onBindWholeController,
    },
  ]

  const plateLabel = (() => {
    switch (mapping) {
      case 'testing': return <b className="mapping-plate__label mapping-plate__label--testing">Testing {props.editingName ?? ''}</b>
      case 'studio': return <><b className="mapping-plate__label">Mapping</b>{!compact && <span className="mapping-plate__note">paused in Studio</span>}</>
      case 'on': return <b className="mapping-plate__label">Mapping</b>
      case 'off': return <b className="mapping-plate__label mapping-plate__label--off">Mapping off</b>
      case 'disconnected': return <b className="mapping-plate__label mapping-plate__label--warn">No controller</b>
    }
  })()
  const showOutput = !compact && (mapping === 'on' || mapping === 'off') && props.output !== 'NONE'

  return (
    <header className="titlebar" data-focus-scope="titlebar" data-tauri-drag-region data-frameless={props.frameless ? 'true' : undefined}>
      <button type="button" className="titlebar__brand" tabIndex={-1} data-focusable="false" onClick={props.onOpenStudio} title="Studio: configurations, preferences and tools">
        <img src={appMark} alt="" width={18} height={18} />
        {t('common.appName', 'JSM Studio')}
      </button>

      <Menu
        ariaLabel="Editing configuration"
        width={380}
        items={editingItems}
        empty="No configurations match"
        search={{ placeholder: 'Search configurations', value: profileQuery, onChange: setProfileQuery }}
        onOpenChange={open => { if (!open) setProfileQuery('') }}
        trigger={
          <button type="button" className="context-segment context-segment--editing profile-chip" disabled={props.editingDisabled}
            data-hints="A:Open;X:Edit applied;B:Back" data-pad-keys="X" onKeyDown={event => { if ((event.key === 'x' || event.key === 'X') && props.appliedName) { event.preventDefault(); props.onEditApplied() } }}
            aria-label={`${t('app.profileSummary.editingTitle', 'Editing')}: ${editingLabel}${props.dirty ? ', unsaved changes' : ''}`}>
            <span className="context-segment__key">Editing</span>
            <b className="profile-chip-name">{editingLabel}</b>
            {props.dirty && <span className="unsaved-dot profile-chip-dot" title="Unsaved changes" />}
            <Chevron />
          </button>
        }
      />

      <Menu
        ariaLabel="Editing layer"
        width={320}
        items={layerItems}
        trigger={
          <button type="button" className="context-segment context-segment--layer" disabled={props.editingDisabled} aria-label={`Editing layer: ${currentLayer?.name ?? 'Default'}`}>
            <span className="context-segment__key">Layer</span>
            {currentLayer && <span className="context-segment__swatch" style={{ background: layerColor(currentLayer.colorIndex) }} aria-hidden="true" />}
            <b>{currentLayer?.name ?? 'Default'}</b>
            <Chevron />
          </button>
        }
      />

      {!compact && (
        <button type="button" className="context-segment context-segment--applied utility-applied" aria-live="polite"
          disabled={!props.appliedName || appliedIsEditing}
          title={props.appliedName && !appliedIsEditing ? 'Edit the applied configuration' : undefined}
          onClick={props.onEditApplied}>
          <span className="context-segment__key">Applied</span>
          {!props.appliedName && <span className="context-segment__muted">Nothing applied</span>}
          {props.appliedName && appliedIsEditing && <span>{props.appliedName}</span>}
          {props.appliedName && !appliedIsEditing && <>
            <span className="context-segment__strong">{props.appliedName}</span>
            <span className="context-segment__tag">Not editing · select to edit</span>
          </>}
        </button>
      )}

      <div className="titlebar__drag" data-tauri-drag-region />

      <Menu
        ariaLabel="Mapping and virtual output"
        width={340}
        align="end"
        items={mappingItems}
        trigger={
          <button type="button" className="mapping-plate mapping-status" data-state={mapping} role="button"
            aria-label={`${t('app.profileSummary.mappingOutput', 'Mapping')}: ${mapping === 'off' ? 'off' : mapping === 'disconnected' ? 'no controller' : 'on'}`}
            data-hints="A:Open;X:Toggle mapping;B:Back" data-pad-keys="X"
            onKeyDown={event => { if ((event.key === 'x' || event.key === 'X') && !props.mappingBusy) { event.preventDefault(); props.onToggleMapping() } }}>
            <MappingDot state={mapping} />
            {plateLabel}
            {showOutput && <><span className="mapping-plate__rule" aria-hidden="true" /><span className="mapping-plate__output">{OUTPUT_LABELS[props.output]}</span></>}
            <Chevron />
          </button>
        }
      />

      {mapping === 'testing'
        ? <button type="button" className="button button--secondary button--sm button--test-exit" onClick={props.onExitTest}>Return to Studio</button>
        : mapping === 'studio' && (
          <button type="button" className="button button--ghost button--sm button--test" onClick={props.onTest} title="Run the configuration while Studio is focused">
            <Icon name="test" size={16} />Test
          </button>
        )}

      <div className="titlebar__history">
        <button type="button" className="icon-button" disabled={!props.canUndo} onClick={props.onUndo}
          title={`${t('app.profileSummary.undo', 'Undo')} (Ctrl+Z)`} aria-label={t('app.profileSummary.undo', 'Undo')}><Icon name="undo" size={18} /></button>
        <button type="button" className="icon-button" disabled={!props.canRedo} onClick={props.onRedo}
          title={`${t('app.profileSummary.redo', 'Redo')} (Ctrl+Shift+Z)`} aria-label={t('app.profileSummary.redo', 'Redo')}><Icon name="redo" size={18} /></button>
      </div>
      <button type="button" className="button button--secondary button--sm" aria-disabled={props.saveIdleReason ? true : undefined}
        data-reason={props.saveIdleReason ?? undefined} title={withReason(props.editingName ? t('app.profileSummary.saveNamed', { name: props.editingName }) : t('app.profileSummary.saveConfiguration', 'Save'), 'Ctrl+S', props.saveIdleReason)}
        aria-label={t('app.profileSummary.saveConfiguration', 'Save configuration')}
        onClick={() => { if (!props.saveIdleReason) props.onSave() }}>Save</button>
      <button type="button" className="button button--primary button--sm primary-btn" aria-disabled={props.applyIdleReason ? true : undefined}
        data-reason={props.applyIdleReason ?? undefined} title={withReason(props.editingName ? t('app.profileSummary.applyNamed', { name: props.editingName }) : t('app.profileSummary.applyEditingConfiguration', 'Apply'), 'Ctrl+Shift+A', props.applyIdleReason)}
        onClick={() => { if (!props.applyIdleReason) props.onApply() }}>Apply</button>

      {props.frameless && <WindowControls />}
    </header>
  )
}
