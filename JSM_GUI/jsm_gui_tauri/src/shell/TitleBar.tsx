import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../components/icons/Icon'
import { Menu, type MenuItem } from '../components/ui/Menu'
import { ButtonGlyph } from '../components/glyphs/ButtonGlyph'
import { BrandMark } from '../components/BrandMark'
import type { ShellWidth } from './useShellWidth'
import { windowControls } from './windowControls'
import { layerHue, layerSlotOf } from '../utils/layers'
import { useProfileAssociation } from '../hooks/useAppIcon'
import { AppIconImage } from '../components/AppIconImage'
import { useShowsKeys } from '../nav/inputSource'

export type MappingPlateState = 'studio' | 'testing' | 'on' | 'off' | 'disconnected'
export type VirtualOutput = 'NONE' | 'XBOX' | 'DS4'

export type TitleBarProfile = { name: string; description?: string; template?: boolean }
export type TitleBarLayer = { id: string; name: string; description?: string; colorIndex: number }

/**
 * The status chip's state (console v2, V3). One chip says it all:
 *   applied           "Live · saved"
 *   changes           "Unsaved · ☰ to save"
 *   testing           "Testing · B to stop"
 *   apply / idle      "Paused while you edit": the configuration being edited
 *                     is saved but is not the one live (A makes it live), or
 *                     nothing can be made live right now (idle, with why).
 */
export type StateButton =
  | { kind: 'changes'; count: number }
  | { kind: 'apply'; name: string }
  | { kind: 'applied' }
  | { kind: 'testing' }
  | { kind: 'idle'; reason: string }

/** Which bar: Home, a configuration page, or the Library / Settings. */
export type TitleBarVariant = 'home' | 'editing' | 'studio'

type TitleBarProps = {
  width: ShellWidth
  frameless: boolean
  variant: TitleBarVariant
  /** The Home chip: View from anywhere, or a click. */
  onHome: () => void
  /** The Library or Settings bar's title (console v2, V6). */
  studioTitle?: string
  /** The controller, with its battery: Home's bar shows it on the right. */
  controllerLabel?: { text: string; connected: boolean; battery?: string }
  /** The game chip's second line (V4): the controller, and "only for this
   *  controller" when the configuration has a layout of its own for it. */
  chipController?: string
  /** The mode being edited, when not Default (P6 mode indicator): shown in the chip. */
  modeName?: string | null
  modeColor?: string
  /** The page tabs, drawn in this one row (V3). */
  tabs?: ReactNode

  editingName: string | null
  dirty: boolean
  profiles: TitleBarProfile[]
  appliedName: string | null
  onSelectProfile: (name: string) => void
  onOpenLibrary: () => void
  /** The configuration menu (☰): Review changes, Undo, Save, and the rest. */
  onOpenConfigMenu: () => void
  editingDisabled?: boolean
  onEditApplied: () => void

  /** Mapping off or no controller shows in the game chip; the switch itself
   *  is in the ☰ menu (V3: the Mapping dropdown is gone). */
  mapping: MappingPlateState

  state: StateButton
  onStatePress: () => void
  /** Console v2 (V4): which controller the edits go to ("Shared layout",
   *  "Only for Steam Controller"); the game chip's menu opens the sheet. */
  controllerScope?: string
  onOpenControllerLayout?: () => void
}

export const OUTPUT_LABELS: Record<VirtualOutput, string> = { NONE: 'Disabled', XBOX: 'Virtual Xbox', DS4: 'Virtual DualShock 4' }
export const OUTPUT_DESCRIPTIONS: Record<VirtualOutput, string> = {
  NONE: 'Keyboard and mouse only',
  XBOX: 'Games see an Xbox 360 pad',
  DS4: 'Games see a DualShock 4',
}
export const layerColor = (index: number) => layerHue(layerSlotOf(index))

/** The four words the chip can say (Kit: "Status chip · one, top right"). */
export const STATUS_TEXT = {
  live: 'Live · saved',
  unsaved: 'Unsaved',
  testing: 'Testing · B to stop',
  paused: 'Paused while you edit',
} as const

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

/** Home's clock (Home.dc.html: "21:40"), to the minute. */
function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15_000)
    return () => window.clearInterval(timer)
  }, [])
  return <time className="titlebar__clock" dateTime={now.toISOString()}>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</time>
}

export function TitleBar(props: TitleBarProps) {
  const { t } = useTranslation()
  const [profileQuery, setProfileQuery] = useState('')
  const showsKeys = useShowsKeys()
  const editingLabel = props.editingName ?? t('app.profileSummary.selectProfile', 'Choose a configuration')
  const appliedIsEditing = Boolean(props.appliedName && props.appliedName === props.editingName)
  // The game's own icon in the chip (Layout header), when it launches with one.
  const game = useProfileAssociation(props.editingName)

  // ---- The game chip's menu: switch configuration, grouped and searchable.
  const query = profileQuery.trim().toLowerCase()
  const matches = (profile: TitleBarProfile) => !query || profile.name.toLowerCase().includes(query)
  const profileItem = (profile: TitleBarProfile): MenuItem => ({
    label: profile.name,
    description: profile.description,
    checked: profile.name === props.editingName,
    tag: profile.name === props.appliedName ? { label: 'Live', tone: 'ok' } : profile.template ? { label: 'Base' } : undefined,
    onSelect: () => props.onSelectProfile(profile.name),
  })
  const games = props.profiles.filter(profile => !profile.template && matches(profile))
  const bases = props.profiles.filter(profile => profile.template && matches(profile))
  const chipItems: MenuItem[] = [
    ...(props.appliedName && !appliedIsEditing
      ? [{ kind: 'label' as const, label: 'Live now' }, { label: props.appliedName, description: 'Running now · select to edit', tag: { label: 'Live', tone: 'ok' as const }, onSelect: props.onEditApplied }]
      : []),
    ...(games.length ? [{ kind: 'label' as const, label: 'Games' }, ...games.map(profileItem)] : []),
    ...(bases.length ? [{ kind: 'label' as const, label: 'Bases' }, ...bases.map(profileItem)] : []),
    { kind: 'separator' },
    ...(props.onOpenControllerLayout ? [{ label: 'This controller only', description: props.controllerScope === 'Shared layout' || !props.controllerScope ? 'Off · shared layout' : `On · ${props.controllerScope}`, navigates: true, onSelect: props.onOpenControllerLayout }] : []),
    { label: 'Open the library', navigates: true, onSelect: props.onOpenLibrary },
    ...(props.editingName
      ? [{ label: 'Options…', description: 'Review changes, undo, save', icon: <ButtonGlyph button="MENU" size={18} />, onSelect: props.onOpenConfigMenu }]
      : []),
  ]

  const homeChip = (
    <button type="button" className="home-chip" onClick={props.onHome} data-hints="A:Home;B:Back"
      data-caption="Home · this configuration, your games and Settings">
      <BrandMark size={20} />
      <span>Home</span>
      {/* 24, not 22: the glyphs are drawn on a 24 grid, so this is the size
          at which every edge lands on a whole pixel. */}
      {!showsKeys && <ButtonGlyph button="VIEW" size={24} />}
    </button>
  )

  // Mapping off or no controller replaces the controller line: the one thing
  // the old Mapping plate said that the status chip does not.
  const chipLine = props.mapping === 'off' ? 'Mapping off · ☰ turns it on'
    : props.mapping === 'disconnected' ? 'No controller'
      : `${props.chipController ?? 'Controller'}${props.modeName ? ` · ${props.modeName} layer` : ''}`

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
        : homeChip}

      {props.variant === 'studio' && (
        <div className="titlebar__studio" data-tauri-drag-region><b>{props.studioTitle ?? 'Settings'}</b><span>For every configuration</span></div>
      )}

      {props.variant === 'editing' && (
        <Menu
          ariaLabel="Configuration"
          width={380}
          items={chipItems}
          empty="No configurations match"
          search={{ placeholder: 'Search configurations', value: profileQuery, onChange: setProfileQuery }}
          onOpenChange={open => { if (!open) setProfileQuery('') }}
          trigger={
            <button type="button" className="context-segment context-segment--editing profile-chip game-chip" disabled={props.editingDisabled}
              data-mapping={props.mapping}
              data-hints={props.appliedName && !appliedIsEditing ? 'A:Switch game;X:Edit the live one;B:Back' : 'A:Switch game;B:Back'} data-pad-keys="X"
              onKeyDown={event => { if ((event.key === 'x' || event.key === 'X') && props.appliedName) { event.preventDefault(); props.onEditApplied() } }}
              data-caption={`${editingLabel} · ${chipLine}${props.controllerScope ? ` · ${props.controllerScope}` : ''}`}
              aria-label={`${t('app.profileSummary.editingTitle', 'Editing')}: ${editingLabel}${props.dirty ? ', unsaved changes' : ''}`}>
              <span className="game-chip__art" aria-hidden="true"><AppIconImage exePath={game?.exePath} size={30} fallback={editingLabel.slice(0, 1).toUpperCase()} /></span>
              <span className="game-chip__text">
                <b className="profile-chip-name">{editingLabel}{props.dirty && <span className="unsaved-dot profile-chip-dot" aria-hidden="true" />}</b>
                <span className="game-chip__controller" data-mapping={props.mapping}>{props.modeName && props.mapping !== 'off' && props.mapping !== 'disconnected' && <span className="game-chip__mode" style={{ background: props.modeColor }} aria-hidden="true" />}{chipLine}</span>
              </span>
              <span className="titlebar__chevron" aria-hidden="true"><Icon name="chevronDown" size={16} /></span>
            </button>
          }
        />
      )}

      {props.tabs}

      <div className="titlebar__drag" data-tauri-drag-region />

      {props.variant === 'home' && props.controllerLabel && (
        <span className="titlebar__controller" data-state={props.controllerLabel.connected ? 'connected' : 'searching'} role="status">
          <span className="controller-status__dot" />{props.controllerLabel.text}
        </span>
      )}
      {props.variant === 'home' && <Clock />}

      {props.variant !== 'studio' && <>
        {props.variant === 'editing' && <StatusChip state={props.state} onPress={props.onStatePress} editingName={props.editingName} />}
        <button type="button" className="menu-chip" aria-label="Options: review changes, undo, save" onClick={props.onOpenConfigMenu}
          data-hints="A:Options;B:Back" data-caption="Options · review changes, undo, save, test and more · hold Menu (M) to open">
          <Icon name="more" size={20} />
        </button>
      </>}

      {props.frameless && <WindowControls />}
    </header>
  )
}

/** The header's one status chip (console v2, V3): the title bar draws it, and
 *  so does every full-screen sub-page's header (ui/SubPage via ShellContext). */
export function StatusChip({ state, onPress, editingName }: { state: StateButton; onPress: () => void; editingName: string | null }) {
  const name = editingName ?? 'This configuration'
  const showsKeys = useShowsKeys()
  switch (state.kind) {
    case 'testing':
      // One exit, named the same everywhere: B (Esc with the keyboard) stops
      // the test; the banner's button and holding View + Menu do too.
      return <button type="button" className="state-button" data-tone="testing" data-state="testing" onClick={onPress} data-hints="A:Stop testing;B:Stop testing"
        data-caption={`Testing ${name} · B (Esc), the banner's Stop testing, or holding View + Menu stops it`}><span className="state-button__dot" aria-hidden="true" />{showsKeys ? 'Testing · Esc to stop' : STATUS_TEXT.testing}</button>
    case 'changes':
      // Menu (M) saves from anywhere; holding it opens the Configuration menu.
      return <button type="button" className="state-button" data-tone="accent" data-state="unsaved" onClick={onPress} data-hints="A:Save and make live;MENU:Save · hold for options;B:Back"
        data-caption={`Unsaved · ${state.count} ${state.count === 1 ? 'change' : 'changes'} to ${name}. Menu saves and makes it live (Ctrl+Shift+A); hold Menu to review first`}>
        <span className="state-button__dot" aria-hidden="true" />{STATUS_TEXT.unsaved}<span className="state-button__sep" aria-hidden="true">·</span><ButtonGlyph button="MENU" size={20} className="state-button__glyph" />Save</button>
    case 'apply':
      return <button type="button" className="state-button" data-tone="control" data-state="paused" onClick={onPress} data-hints="A:Make live;B:Back"
        data-caption={`Paused while you edit · ${state.name || name} is saved but not live. A makes it live (Ctrl+Shift+A)`}><span className="state-button__dot" aria-hidden="true" />{STATUS_TEXT.paused}</button>
    case 'applied':
      // Stays focusable; A says so rather than doing nothing silently.
      return <button type="button" className="state-button" data-tone="applied" data-state="live" onClick={onPress} data-hints="A:Live;B:Back"
        data-caption={`Live · saved · ${name} is saved and live`}><span className="state-button__dot" aria-hidden="true" />{STATUS_TEXT.live}</button>
    case 'idle':
      return <button type="button" className="state-button" data-tone="control" data-state="paused" aria-disabled="true" data-reason={state.reason}
        data-caption={`Paused while you edit · ${state.reason}`}><span className="state-button__dot" aria-hidden="true" />{STATUS_TEXT.paused}</button>
  }
}
