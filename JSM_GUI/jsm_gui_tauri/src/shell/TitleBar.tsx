import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../components/icons/Icon'
import { Menu, type MenuItem } from '../components/ui/Menu'
import { ButtonGlyph } from '../components/glyphs/ButtonGlyph'
import { BrandMark } from '../components/BrandMark'
import type { ShellWidth } from './useShellWidth'
import { windowControls } from './windowControls'
import { layerHue, layerSlotOf } from '../utils/layers'
import type { HeldShiftStatus } from './HintCapsule'

export type MappingPlateState = 'studio' | 'testing' | 'on' | 'off' | 'disconnected'
export type VirtualOutput = 'NONE' | 'XBOX' | 'DS4'

export type TitleBarProfile = { name: string; description?: string; template?: boolean }
export type TitleBarLayer = { id: string; name: string; description?: string; colorIndex: number }

/**
 * The one state button (console refinement 1e): its label says what it will
 * do. Unsaved edits: "Apply 3 changes" (saves and applies). Saved but not
 * running: "Apply Wardogs". Saved and running: "✓ Applied", still focusable
 * so A can say so. Test mode: "Return to Studio".
 */
export type StateButton =
  | { kind: 'changes'; count: number }
  | { kind: 'apply'; name: string }
  | { kind: 'applied' }
  | { kind: 'testing' }
  | { kind: 'idle'; reason: string }

/** Which bar: Home (2a), a configuration page (2b) or Studio (2f). */
export type TitleBarVariant = 'home' | 'editing' | 'studio'

type TitleBarProps = {
  width: ShellWidth
  /** A modeshift held now: "L4 held · 3 inputs shifted" in a fixed slot. */
  heldShift?: HeldShiftStatus | null
  /** Keep that slot, empty, while the configuration has any modeshift. */
  reserveShiftSlot?: boolean
  frameless: boolean
  variant: TitleBarVariant
  /** The Home chip: View from anywhere, or a click. */
  onHome: () => void
  /** Home's bar shows the controller where the editing bar has page tabs. */
  controllerLabel?: { text: string; connected: boolean }

  editingName: string | null
  dirty: boolean
  profiles: TitleBarProfile[]
  appliedName: string | null
  /** Layers the mapper has active on the applied configuration right now (JSM Shell 3d). */
  appliedLayers?: { name: string; color: string }[]
  onSelectProfile: (name: string) => void
  onOpenLibrary: () => void
  /** The Configuration menu (1e), also on the Menu button. */
  onOpenConfigMenu: () => void
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

  state: StateButton
  onStatePress: () => void
}

export const OUTPUT_LABELS: Record<VirtualOutput, string> = { NONE: 'Disabled', XBOX: 'Virtual Xbox', DS4: 'Virtual DualShock 4' }
export const OUTPUT_DESCRIPTIONS: Record<VirtualOutput, string> = {
  NONE: 'Keyboard and mouse only',
  XBOX: 'Games see an Xbox 360 pad',
  DS4: 'Games see a DualShock 4',
}
export const layerColor = (index: number) => layerHue(layerSlotOf(index))

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
    // The bar has no Applied segment (2b): what is running lives here, with
    // the layers the mapper has active on it.
    ...(props.appliedName && !appliedIsEditing
      ? [{ kind: 'label' as const, label: 'Applied' }, { label: props.appliedName, description: ['Running now', ...(props.appliedLayers ?? []).map(layer => layer.name), 'select to edit'].join(' · '), tag: { label: 'Applied', tone: 'ok' as const }, onSelect: props.onEditApplied }]
      : []),
    ...(regular.length ? [{ kind: 'label' as const, label: 'Profiles' }, ...regular.map(profileItem)] : []),
    ...(templates.length ? [{ kind: 'label' as const, label: 'Templates' }, ...templates.map(profileItem)] : []),
    { kind: 'separator' },
    { label: 'Open configuration library', navigates: true, onSelect: props.onOpenLibrary },
    ...(props.editingName
      ? [{ label: 'Configuration menu…', description: 'Undo, save as copy, test, values & inheritance', icon: <ButtonGlyph button="MENU" size={18} />, onSelect: props.onOpenConfigMenu }]
      : []),
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

  const homeChip = (
    <button type="button" className="home-chip" onClick={props.onHome} data-hints="A:Home;B:Back"
      title="Home: this configuration and Studio">
      <BrandMark size={20} />
      <span>Home</span>
      {/* 24, not 22: the glyphs are drawn on a 24 grid, so this is the size
          at which every edge lands on a whole pixel. */}
      <ButtonGlyph button="VIEW" size={24} />
    </button>
  )

  const stateButton = (() => {
    const state = props.state
    switch (state.kind) {
      case 'testing':
        return <button type="button" className="state-button" data-tone="testing" onClick={props.onStatePress} data-hints="A:Return to Studio;B:Back">Return to Studio</button>
      case 'changes':
        return <button type="button" className="state-button" data-tone="accent" onClick={props.onStatePress} data-hints="A:Save and apply;B:Back"
          title={`Save ${props.editingName ?? ''} and apply it (Ctrl+Shift+A)`}>Apply {state.count} {state.count === 1 ? 'change' : 'changes'}</button>
      case 'apply':
        return <button type="button" className="state-button" data-tone="control" onClick={props.onStatePress} data-hints="A:Apply;B:Back"
          title={`Make ${state.name} the applied configuration (Ctrl+Shift+A)`}>Apply {state.name}</button>
      case 'applied':
        // Stays focusable; A says so rather than doing nothing silently.
        return <button type="button" className="state-button" data-tone="applied" onClick={props.onStatePress} data-hints="A:Applied;B:Back"
          title={`${props.editingName ?? ''} is saved and running`}>✓ Applied</button>
      case 'idle':
        return <button type="button" className="state-button" data-tone="control" aria-disabled="true" data-reason={state.reason} title={state.reason}>Apply</button>
    }
  })()

  const mappingPlate = (
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
  )

  return (
    <header className="titlebar" data-variant={props.variant} data-focus-scope="titlebar" data-tauri-drag-region data-frameless={props.frameless ? 'true' : undefined}>
      {props.variant === 'home'
        ? (
          // Home's mark is a name, not a button (§8: the logo isn't clickable).
          <div className="titlebar__brand" data-tauri-drag-region>
            <BrandMark size={20} />
            {t('common.appName', 'JSM Evolved')}
          </div>
        )
        : <>{homeChip}<span className="titlebar__divider" aria-hidden="true" /></>}

      {props.variant === 'studio' && (
        <div className="titlebar__studio" data-tauri-drag-region><b>Studio</b><span>Applies to every configuration</span></div>
      )}

      {props.variant === 'editing' && <>
        <Menu
          ariaLabel="Editing configuration"
          width={380}
          items={editingItems}
          empty="No configurations match"
          search={{ placeholder: 'Search configurations', value: profileQuery, onChange: setProfileQuery }}
          onOpenChange={open => { if (!open) setProfileQuery('') }}
          trigger={
            <button type="button" className="context-segment context-segment--editing profile-chip" disabled={props.editingDisabled}
              data-hints={props.appliedName ? 'A:Switch configuration;X:Edit applied;B:Back' : 'A:Switch configuration;B:Back'} data-pad-keys="X" onKeyDown={event => { if ((event.key === 'x' || event.key === 'X') && props.appliedName) { event.preventDefault(); props.onEditApplied() } }}
              aria-label={`${t('app.profileSummary.editingTitle', 'Editing')}: ${editingLabel}${props.dirty ? ', unsaved changes' : ''}`}>
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
            // The layer's own tile colours (2a): its soft fill, its hue, its mark.
            <button type="button" className="context-segment context-segment--layer" disabled={props.editingDisabled} aria-label={`Editing layer: ${currentLayer?.name ?? 'Default'}`} data-hints="A:Open;B:Back"
              data-layer-slot={currentLayer ? layerSlotOf(currentLayer.colorIndex) : undefined}>
              <Icon name="layer" size={14} />
              <span className="context-segment__key">{t('keymap.editingLayerLabel', 'Editing layer:')}</span>
              <b>{currentLayer?.name ?? 'Default'}</b>
              <Chevron />
            </button>
          }
        />
        {(props.reserveShiftSlot || props.heldShift) && (
          <span className="shift-status" data-held={props.heldShift ? 'true' : undefined} role="status" aria-live="off">
            {props.heldShift && (
              <span key={props.heldShift.name} className="shift-status__fill">
                <span className="shift-status__held"><Icon name="modeshift" size={14} /><span className="shift-status__text">{t('keymap.shiftHeld', '{{name}} held', { name: props.heldShift.name })}</span></span>
                <span className="shift-status__count">{props.heldShift.kind === 'chord'
                  ? props.heldShift.only ? t('keymap.chordedNamed', 'with {{name}}', { name: props.heldShift.only }) : t('keymap.chordedInputs', { count: props.heldShift.count, defaultValue: '{{count}} inputs chorded' })
                  : props.heldShift.only ? t('keymap.shiftedNamed', '→ {{name}}', { name: props.heldShift.only }) : t('keymap.shiftedInputs', { count: props.heldShift.count, defaultValue: '{{count}} inputs shifted' })}</span>
              </span>
            )}
          </span>
        )}
      </>}

      <div className="titlebar__drag" data-tauri-drag-region />

      {props.variant === 'home' && props.controllerLabel && (
        <span className="titlebar__controller" data-state={props.controllerLabel.connected ? 'connected' : 'searching'} role="status">
          <span className="controller-status__dot" />{props.controllerLabel.text}
        </span>
      )}

      {mappingPlate}

      {props.variant === 'editing' && stateButton}

      {props.frameless && <WindowControls />}
    </header>
  )
}
