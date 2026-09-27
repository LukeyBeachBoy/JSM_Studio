import { LayerBar, LayerUsageContext, InputUsageInspector } from './components/LayerBar'
import { LayersPage } from './components/LayersPage'
import { AssociationsPage } from './components/AssociationsPage'
import { MapperDown, ConfigErrors, type ConfigError } from './components/SystemNotices'
import type { MapperExit, LayerStack } from './platform/desktopBridge'
import { writeLayers, defaultLayer, layerEntries, readLayerActions, setLayerActions, describeLayerActivation } from './utils/layers'
import { inputDisplayName } from './keymap/inputNames'
import { SettingOrigins, SettingsInventory } from './components/SettingOrigin'
import { controllerDisplayName, controllerVisualFamily } from './utils/controllerStatus'
import { TimingPage } from './components/TimingPage'
import { ControllerPreferences } from './components/ControllerPreferences'
import { flushSync } from 'react-dom'
import { appliedProfileLabel, isStudioNavigationProfile } from './utils/appliedProfile'
import { ConfigScope } from './components/ConfigScope'
import { ConfigBaseline } from './hooks/configContext'
import { TuningClipboard } from './components/TuningClipboard'
import './App.css'
import { padAspectFromDevices } from './utils/padGeometry'
import { inputPage, normalizePreviewInput } from './utils/inputNavigation'
// The version people see must be the one on the installer they downloaded, and
// tauri.conf.json is what the installer is built from.
import tauriConf from '../src-tauri/tauri.conf.json'
import sideNavStyles from './components/SideNav.module.css'
import { ThemeToggle } from './components/ThemeToggle'
import { ControllerFeedbackSetting } from './components/ControllerFeedbackSetting'
import themeToggleStyles from './components/ThemeToggle.module.css'
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useTelemetry } from './hooks/useTelemetry'
import miscStyles from './components/Misc.module.css'
import { SectionActions } from './components/SectionActions'
import { NumberField } from './components/NumberField'
import { DEFAULT_HOLD_PRESS_TIME } from './constants/defaults'
import { OverviewPage } from './components/OverviewPage'
import { HidHidePage } from './components/HidHidePage'
import { useProfileLibrary } from './hooks/useProfileLibrary'
import { useKeymapConfig } from './hooks/useKeymapConfig'
import { useCalibration } from './hooks/useCalibration'
import { ToastHost } from './components/ToastHost'
import { LongOperationHost } from './components/LongOperation'
import { FocusGlide } from './components/FocusGlide'
import { desktopBridge } from './platform/desktopBridge'
import { usePreferences, patchRuntimePreferences, setCachedAutostart, primePreferences } from './platform/preferenceStore'
import { getKeymapValue, removeKeymapEntry, updateKeymapEntry } from './utils/keymap'
import { parseBindingLabels, setBindingLabel } from './utils/bindingLabels'
import { parseBindingIcons, setBindingIcon } from './utils/bindingIcons'
import { resolveTouchpadGrids, touchpadGridCommands } from './utils/touchpadGrids'
import { showToast } from './utils/toast'
import { includeDisplayName } from './utils/configIncludes'
import { LanguageSelect } from './components/LanguageSelect'
import { useKeyboardNav } from './hooks/useKeyboardNav'
import { AppSelect } from './components/ui/AppSelect'
import { controllerHasTwoTrackpads } from './utils/controllerStatus'
import { useSectionScrollSpy } from './hooks/useSectionScrollSpy'


import { TitleBar, layerColor, OUTPUT_LABELS, OUTPUT_DESCRIPTIONS, type MappingPlateState, type StateButton, type TitleBarProfile, type VirtualOutput } from './shell/TitleBar'
import { ConfigurationMenu, type ConfigurationMenuItem } from './shell/ConfigurationMenu'
import { HomePage, type HomeTune } from './components/HomePage'
import { MouseFeelSheet } from './components/keymap/MouseFeelSheet'
import { OnScreenMenus } from './components/keymap/OnScreenMenus'
import { GripSensorsSheet } from './components/keymap/GripSensorsSheet'
import { ButtonGlyph } from './components/glyphs/ButtonGlyph'
import { countChanges, describeChange } from './utils/configChanges'
import { serializeConfig, parseConfigText } from './utils/configSerializer'
import { ensureHeaderLines } from './utils/config'
import { controllerSupportsInput } from './utils/controllerStatus'
import { PageTabs, type ControllerStatus } from './shell/PageTabs'
import { SectionList, scrollToSection, useDiscoveredSections, type ShellSection } from './shell/SectionList'
import { sectionInFlight } from './nav/scroller'
import { NavDrawer } from './shell/NavDrawer'
import { HintCapsule } from './shell/HintCapsule'
import { useShellWidth } from './shell/useShellWidth'
import { isFramelessWindow } from './shell/windowControls'
import { useControllerNavigation } from './nav/useControllerNavigation'
import { ALL_PAGES, isHomePage, isStudioPage, pageMeta, pageOrder, type ControlTab, type PrimaryTab, type StudioTab } from './shell/pages'

// Which of KeymapControls' button groups each control page is about.
const CONTROL_TAB_SECTIONS: Record<ControlTab, string[]> = {
  buttons: ['face', 'bumpers', 'center', 'paddles', 'extra'],
  dpad: ['dpad'],
  triggers: ['triggers'],
  joysticks: ['leftStick', 'rightStick'],
}

// The section list for pages KeymapControls lays out as one long column: it
// renders each group under a matching `mapping-section-<key>` id, and the
// shell's section list scrolls to it.
const SUB_NAV_GROUPS: Record<ControlTab, { key: string; titleKey: string }[]> = {
  buttons: [
    { key: 'face', titleKey: 'keymap.faceButtonsTitle' },
    { key: 'bumpers', titleKey: 'keymap.bumpersTitle' },
    { key: 'center', titleKey: 'keymap.centerButtonsTitle' },
    { key: 'paddles', titleKey: 'keymap.paddlesTitle' },
    { key: 'extra', titleKey: 'keymap.extraButtonsTitle' },
  ],
  dpad: [{ key: 'dpad', titleKey: 'keymap.dpadTitle' }],
  triggers: [{ key: 'triggers', titleKey: 'keymap.triggersTitle' }],
  joysticks: [
    { key: 'leftStick', titleKey: 'keymap.leftStickTitle' },
    { key: 'rightStick', titleKey: 'keymap.rightStickTitle' },
  ],
}

const asNumber = (value: unknown) => (typeof value === 'number' ? value : undefined)
const formatNumber = (value: number | undefined, digits = 2) =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '0.00'
const FLOATING_WINDOW_MARGIN = 16

type FloatingWindowPosition = {
  x: number
  y: number
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const clampFloatingWindowPosition = (
  position: FloatingWindowPosition,
  width: number,
  height: number
): FloatingWindowPosition => {
  const maxX = Math.max(FLOATING_WINDOW_MARGIN, window.innerWidth - width - FLOATING_WINDOW_MARGIN)
  const maxY = Math.max(FLOATING_WINDOW_MARGIN, window.innerHeight - height - FLOATING_WINDOW_MARGIN)

  return {
    x: clamp(position.x, FLOATING_WINDOW_MARGIN, maxX),
    y: clamp(position.y, FLOATING_WINDOW_MARGIN, maxY),
  }
}

const getDefaultFloatingWindowPosition = (width: number, height: number): FloatingWindowPosition =>
  clampFloatingWindowPosition(
    {
      x: window.innerWidth - width - FLOATING_WINDOW_MARGIN,
      y: Math.round((window.innerHeight - height) / 2),
    },
    width,
    height
  )

const GyroPage = lazy(async () => {
  const module = await import('./components/GyroPage')
  return { default: module.GyroPage }
})

const KeymapControls = lazy(async () => {
  const module = await import('./components/KeymapControls')
  return { default: module.KeymapControls }
})

const ConfigEditor = lazy(async () => {
  const module = await import('./components/ConfigEditor')
  return { default: module.ConfigEditor }
})

const ProfileManager = lazy(async () => {
  const module = await import('./components/ProfileManager')
  return { default: module.ProfileManager }
})

const AutoloadManager = lazy(async () => {
  const module = await import('./components/AutoloadManager')
  return { default: module.AutoloadManager }
})

const HelpDocsPage = lazy(async () => {
  const module = await import('./components/HelpDocsPage')
  return { default: module.HelpDocsPage }
})

const GlobalChordsPage = lazy(async () => {
  const module = await import('./components/GlobalChordsPage')
  return { default: module.GlobalChordsPage }
})

const MappingDebugPage = lazy(async () => {
  const module = await import('./components/MappingDebugPage')
  return { default: module.MappingDebugPage }
})

const AiMappingPage = lazy(async () => {
  const module = await import('./components/AiMappingPage')
  return { default: module.AiMappingPage }
})

const UpdateBanner = lazy(async () => {
  const module = await import('./components/UpdateBanner')
  return { default: module.UpdateBanner }
})

const RwcGuideModal = lazy(async () => {
  const module = await import('./components/RwcGuideModal')
  return { default: module.RwcGuideModal }
})

type LazyPanelFallbackProps = {
  title?: string
  compact?: boolean
}

const LazyPanelFallback = ({ title, compact = false }: LazyPanelFallbackProps) => (
  <div className={`lazy-panel-fallback ${compact ? 'compact' : ''}`} data-capture-ignore="true">
    {title && <div className="lazy-panel-fallback-title">{title}</div>}
    <div className="lazy-panel-fallback-text">Loading...</div>
  </div>
)


// Registers a Windows Scheduled Task rather than a Registry Run entry -- see
// desktopBridge.getAutostartEnabled/setAutostartEnabled and
// src-tauri/src/services/autostart.rs for why that's the version that
// actually launches without a UAC prompt at every logon.

// Read the Preferences page's values as soon as the app loads, so the page
// mounts with them rather than asking (and visibly changing) on every visit.
void primePreferences()

// One Preferences switch. `value` is null while the backend has not answered
// yet (only the first moments after launch: preferenceStore reads everything at
// startup). The switch only animates changes the user makes; a value that
// arrives from the backend lands in place rather than sliding on by itself.
function PreferenceSwitch({ label, value, pending, onToggle }: { label: string; value: boolean | null; pending: boolean; onToggle: (next: boolean) => void }) {
  const [touched, setTouched] = useState(false)
  const on = value === true
  return (
    <button
      type="button"
      className={`${themeToggleStyles.themeToggle} ${on ? themeToggleStyles.on : ''} ${touched ? '' : themeToggleStyles.instant} ${value === null ? themeToggleStyles.unknown : ''} ${sideNavStyles.navThemeToggle}`}
      aria-pressed={value === null ? undefined : on}
      aria-busy={value === null || undefined}
      aria-label={label}
      disabled={pending || value === null}
      onClick={() => { setTouched(true); onToggle(!on) }}
    >
      <span className={themeToggleStyles.labelGroup}>
        <span className={themeToggleStyles.text}>{label}</span>
      </span>
      <span className={themeToggleStyles.switch} aria-hidden="true">
        <span className={themeToggleStyles.thumb} />
      </span>
    </button>
  )
}

// Opens or closes the trackpad overlay: a separate always-on-top window that
// draws the live pad menu over the game. It is a plain window, not a hook into
// anything, so it can only be composited over a game running BORDERLESS
// windowed -- exclusive fullscreen will hide it.
function TrackpadOverlayToggle() {
  const { t } = useTranslation()
  const { runtime } = usePreferences()
  const [pending, setPending] = useState(false)
  const handleChange = async (next: boolean) => {
    setPending(true)
    patchRuntimePreferences({ trackpadOverlayEnabled: next })
    try {
      await desktopBridge.setTrackpadOverlayEnabled(next)
    } catch {
      patchRuntimePreferences({ trackpadOverlayEnabled: !next })
    }
    setPending(false)
  }
  return <PreferenceSwitch label={t('app.nav.trackpadOverlay', 'Trackpad overlay')} value={runtime ? Boolean(runtime.trackpadOverlayEnabled) : null}
    pending={pending} onToggle={next => void handleChange(next)} />
}
// Whether the calibration HUD appears over games (Preferences 16j).
function CalibrationHudToggle() {
  const { runtime } = usePreferences()
  const [pending, setPending] = useState(false)
  const handleChange = async (next: boolean) => {
    setPending(true)
    patchRuntimePreferences({ calibrationHudEnabled: next })
    const state = await desktopBridge.setCalibrationHudEnabled(next)
    if (!state) patchRuntimePreferences({ calibrationHudEnabled: !next })
    setPending(false)
  }
  return <PreferenceSwitch label="Calibration HUD" value={runtime ? runtime.calibrationHudEnabled !== false : null}
    pending={pending} onToggle={next => void handleChange(next)} />
}

function AutostartToggle() {
  const { t } = useTranslation()
  const { autostart } = usePreferences()
  const [pending, setPending] = useState(false)
  const handleChange = async (next: boolean) => {
    setPending(true)
    const previous = autostart ?? !next
    setCachedAutostart(next)
    const success = await desktopBridge.setAutostartEnabled(next)
    setPending(false)
    if (!success) {
      // Revert the optimistic flip and say so -- a silent failure here would
      // leave someone thinking Windows will start the app for them when it
      // won't, which they'd only discover the next time they reboot.
      setCachedAutostart(previous)
      showToast(t('messages.autostartFailed'), 'error')
    }
  }
  return <PreferenceSwitch label={t('app.nav.startWithWindows')} value={autostart} pending={pending} onToggle={next => void handleChange(next)} />
}

// Installs / removes the AutoLoad rule that maps the controller to keyboard
// and mouse while JSM Studio's own window is in front (AppNavigation.txt).
// Needs AutoLoad on to do anything, which the toggle's hint says.
function ControllerNavToggle() {
  const { t } = useTranslation()
  const { runtime } = usePreferences()
  const [pending, setPending] = useState(false)
  const handleChange = async (next: boolean) => {
    setPending(true)
    const previous = runtime?.controllerNavEnabled ?? !next
    patchRuntimePreferences({ controllerNavEnabled: next })
    try {
      const state = await desktopBridge.setControllerNavEnabled(next)
      patchRuntimePreferences({ controllerNavEnabled: state.controllerNavEnabled })
      window.dispatchEvent(new CustomEvent('jsm:controller-nav', { detail: state.controllerNavEnabled }))
    } catch (error) {
      console.error('Failed to update controller navigation', error)
      patchRuntimePreferences({ controllerNavEnabled: previous })
      showToast(t('messages.controllerNavUpdateFailed'), 'error')
    } finally {
      setPending(false)
    }
  }
  return <PreferenceSwitch label={t('app.nav.controllerNav')} value={runtime ? runtime.controllerNavEnabled : null} pending={pending} onToggle={next => void handleChange(next)} />
}

function App() {
  const { t } = useTranslation()
  const { sample, isCalibrating, countdown } = useTelemetry()
  const { runtime: runtimePreferences } = usePreferences()
  const runtimePollingMs = runtimePreferences?.defaultPollingMs ?? 3
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [recalibrating, setRecalibrating] = useState(false)
  const [isProfileModalOpen, setProfileModalOpen] = useState(false)
  const [isAutoloadModalOpen, setAutoloadModalOpen] = useState(false)
  const [isRwcGuideModalOpen, setIsRwcGuideModalOpen] = useState(false)
  const [isConfigDrawerOpen, setConfigDrawerOpen] = useState(false)
  const [configWindowPosition, setConfigWindowPosition] = useState<FloatingWindowPosition | null>(null)
  const [configWindowDragging, setConfigWindowDragging] = useState(false)
  const [mappingEnabled, setMappingEnabled] = useState(true)
  const [autoloadEnabled, setAutoloadEnabled] = useState(true)
  const [reservedChords, setReservedChords] = useState(false)
  // A reserved chord can turn mapping off or on from the controller.
  useEffect(() => desktopBridge.onRuntimeMappingState(state => {
    setMappingEnabled(state.mappingEnabled)
    setReservedChords(!!state.reservedChords)
  }), [])
  const [controllerNavEnabled, setControllerNavEnabled] = useState(true)
  const [runtimeMappingBusy, setRuntimeMappingBusy] = useState(false)
  const [calibrationTurns, setCalibrationTurns] = useState('1')
  const [selectedMenu, setSelectedMenu] = useState<string | undefined>()
  // On-screen menus (2d): a full-window view over whatever page opened it.
  const [menusOpen, setMenusOpen] = useState(false)
  // The detail sheets (2c Mouse feel, 2e Grip sensors), opened from their
  // rows, from Home's tiles, or by event from deep inside a page.
  const [sheet, setSheet] = useState<'mouseFeel' | 'gripSensors' | null>(null)
  useEffect(() => {
    const open = (event: Event) => {
      const which = (event as CustomEvent<'mouseFeel' | 'gripSensors'>).detail
      if (which === 'mouseFeel' || which === 'gripSensors') setSheet(which)
    }
    window.addEventListener('jsm:open-sheet', open)
    return () => window.removeEventListener('jsm:open-sheet', open)
  }, [])
  useEffect(() => {
    const open = (event: Event) => { setSelectedMenu((event as CustomEvent<string>).detail); setMenusOpen(true) }
    window.addEventListener('jsm:menu-layout', open)
    return () => window.removeEventListener('jsm:menu-layout', open)
  }, [])
  // Y on a setting with no description yet opens the documentation, at the
  // topic that setting is explained in.
  const [docsFocus, setDocsFocus] = useState<{ setting?: string; at: number } | undefined>()
  useEffect(() => {
    const open = (event: Event) => {
      const setting = (event as CustomEvent<{ setting?: string } | undefined>).detail?.setting
      setDocsFocus({ setting, at: Date.now() })
      setPrimaryTab('help')
    }
    // Pages ask to go elsewhere by name (the AI assistant's "Edit in Buttons").
    const goto = (event: Event) => {
      const tab = (event as CustomEvent<PrimaryTab | undefined>).detail
      if (tab && ALL_PAGES.some(page => page.tab === tab)) setPrimaryTab(tab)
    }
    window.addEventListener('jsm:navigate-page', goto)
    window.addEventListener('jsm:open-docs', open)
    return () => { window.removeEventListener('jsm:open-docs', open); window.removeEventListener('jsm:navigate-page', goto) }
  }, [])
  const [primaryTab, setPrimaryTabState] = useState<PrimaryTab>('home')
  // Page change slides 16px in the direction of travel along the tab order.
  const [pageDirection, setPageDirection] = useState<'forward' | 'back'>('forward')
  // The configuration page B on Home (and Continue editing) returns to.
  const lastEditingPage = useRef<PrimaryTab>('overview')
  const setPrimaryTab = useCallback((next: PrimaryTab | ((previous: PrimaryTab) => PrimaryTab)) => {
    setPrimaryTabState(previous => {
      const target = typeof next === 'function' ? next(previous) : next
      if (target !== previous) {
        const order = pageOrder(previous)
        setPageDirection(order.indexOf(target) < order.indexOf(previous) ? 'back' : 'forward')
        if (pageMeta(previous).group === 'controls') lastEditingPage.current = previous
      }
      return target
    })
  }, [])
  const returnToInput = useRef<(() => void) | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [layerManagerOpen, setLayerManagerOpen] = useState(false)
  // Values & inheritance: a dialog from the title bar's configuration menu.
  const [inventoryOpen, setInventoryOpen] = useState(false)
  const shellWidth = useShellWidth()
  const frameless = useMemo(isFramelessWindow, [])
  useEffect(() => { if (shellWidth !== 'narrow') setDrawerOpen(false) }, [shellWidth])

  const stepPage = useCallback((delta: 1 | -1) => {
    setPrimaryTab(prev => {
      const order = pageOrder(prev)
      const index = Math.max(0, order.indexOf(prev))
      // The strip has ends: LT on Overview stays put rather than wrapping to
      // the last Tuning page, which is behind a menu and read as a random jump.
      return order[Math.min(order.length - 1, Math.max(0, index + delta))]
    })
  }, [setPrimaryTab])
  const closeFloatingWindows = useCallback(() => {
    if (isConfigDrawerOpen) {
      setConfigDrawerOpen(false)
      return true
    }
    if (isAutoloadModalOpen) { setAutoloadModalOpen(false); return true }
    if (drawerOpen) { setDrawerOpen(false); return true }
    if (returnToInput.current) { const restore = returnToInput.current; returnToInput.current = null; restore(); return true }
    // Home: B resumes editing. A Studio page: B is Home (2f). A configuration
    // page: back to Overview, and no further.
    if (isHomePage(primaryTab)) { setPrimaryTab(lastEditingPage.current); return true }
    if (isStudioPage(primaryTab)) { setPrimaryTab('home'); return true }
    if (primaryTab !== 'overview') { setPrimaryTab('overview'); return true }
    return false
  }, [isConfigDrawerOpen, isAutoloadModalOpen, drawerOpen, primaryTab, setPrimaryTab])
  useKeyboardNav({ onPageStep: stepPage, onEscape: closeFloatingWindows, activePage: primaryTab })

  useEffect(() => {
    const handler = (event: Event) => setControllerNavEnabled(Boolean((event as CustomEvent<boolean>).detail))
    window.addEventListener('jsm:controller-nav', handler)
    return () => window.removeEventListener('jsm:controller-nav', handler)
  }, [])
  const [selectedMappingCommand, setSelectedMappingCommand] = useState<string | null>('N')
  const [inputRequest, setInputRequest] = useState<{ command: string } | null>(null)
  const navigateInput = (raw: string) => {
    const from = primaryTab, scroll = document.querySelector('.shell-scroll')?.scrollTop ?? 0, fromLayer = layerId
    returnToInput.current = () => { selectLayer(fromLayer); setPrimaryTab(from); requestAnimationFrame(() => { const pane = document.querySelector('.shell-scroll'); if (pane) pane.scrollTop = scroll; document.querySelector<HTMLElement>(`[data-overview-input="${CSS.escape(raw)}"]`)?.focus({ preventScroll: true }) }) }
    if (/^(GYRO_|MIN_GYRO|MAX_GYRO)/.test(raw)) { setPrimaryTab('gyro'); return }
    const command = normalizePreviewInput(/^(LEFT|RIGHT)_(TOUCHPAD|GRID)/.test(raw) ? raw.startsWith('LEFT') ? 'LEFT_PAD' : 'RIGHT_PAD' : raw === 'ZL_MODE' ? 'ZL' : raw === 'ZR_MODE' ? 'ZR' : raw)
    setSelectedMappingCommand(command)
    setPrimaryTab(inputPage(command))
    setInputRequest({ command })
  }
  useEffect(() => {
    if (!inputRequest) return
    const pane = document.querySelector('.main-pane')
    if (!pane) return
    const focus = () => {
      const target = pane.querySelector<HTMLElement>(`[data-input-command="${CSS.escape(inputRequest.command)}"]`)
      if (!target) return false
      let ancestor: HTMLElement | null = target
      while (ancestor) { if (ancestor instanceof HTMLDetailsElement) ancestor.open = true; ancestor = ancestor.parentElement }
      target.scrollIntoView({ block: 'center' })
      const control = target.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled]), [role="combobox"]')
      ;(control ?? target).focus({ preventScroll: true })
      return true
    }
    if (focus()) return
    const observer = new MutationObserver(() => { if (focus()) observer.disconnect() })
    // A row can change which input it is in place (Trackpads’ Region row goes
    // from LT1 to the requested LT3), so its key attribute is watched too.
    observer.observe(pane, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-input-command'] })
    return () => observer.disconnect()
  }, [inputRequest])

  const [showHidHideElevationModal, setShowHidHideElevationModal] = useState(false)
  const configWindowRef = useRef<HTMLDivElement | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const [sourceFocusLine, setSourceFocusLine] = useState<{ line: number; nonce: number } | null>(null)
  const configWindowDragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null)
  const {
    configText, documentText, setDocumentText, layers, layerId, selectLayer, selectCreatedLayer, savedLayerText, foldConfigText,
    effectiveConfigText,
    configIncludes,
    setConfigText,
    readTextFor,
    setConfigTextFor,
    resetConfigHistory, canUndo, canRedo, undo, redo, undoTarget, redoTarget,
    appliedConfig,
    setAppliedConfig,
    sensitivityView,
    setSensitivityView,
    sensitivityModeshiftButton,
    sensitivity,
    modeshiftSensitivity,
    activeSensitivityPrefix,
    ignoredGyroDevices,
    finalizePendingValues,
    selectedBaseMode,
    selectedModeshiftMode,
    holdPressTimeSeconds,
    holdPressTimeIsCustom,
    doublePressWindowSeconds,
    doublePressWindowIsCustom,
    simPressWindowSeconds,
    simPressWindowIsCustom,
    lightBarColor,
    handleLightBarChange,
    triggerThresholdValue,
    touchpadModeValue,
    touchpadMinCutoffValue,
    touchpadSpeedCoeffValue,
    touchpadTrackballDecayValue,
    touchpadTrackballMinVelocityValue,
    touchpadMovementThresholdValue,
    touchpadClickDampenValue,
    touchpadClickDampenThresholdValue,
    touchpadHapticIntensityValue,
    touchpadHapticEffectValue,
    touchpadHapticIntervalValue,
    touchpadClickHapticIntensityValue,
    touchpadClickHapticEffectValue,
    touchpadReleaseHapticIntensityValue,
    touchpadReleaseHapticEffectValue,
    handleTouchpadMovementThresholdChange,
    handleTouchpadClickDampenChange,
    handleTouchpadClickDampenThresholdChange,
    handleTouchpadHapticIntensityChange,
    handleTouchpadHapticEffectChange,
    handleTouchpadHapticIntervalChange,
    handleTouchpadClickHapticIntensityChange,
    handleTouchpadClickHapticEffectChange,
    handleTouchpadReleaseHapticIntensityChange,
    handleTouchpadReleaseHapticEffectChange,
    handleTouchpadMinCutoffChange,
    handleTouchpadSpeedCoeffChange,
    handleTouchpadTrackballDecayChange,
    handleTouchpadTrackballMinVelocityChange,
    leftGripHapticsValue,
    rightGripHapticsValue,
    handleLeftGripHapticsChange,
    handleRightGripHapticsChange,
    gripSensorRangeValue,
    gripFlickerGuardValue,
    gripHapticIntensityValue,
    gripHapticEffectValue,
    gripReleaseHapticIntensityValue,
    gripReleaseHapticEffectValue,
    handleGripSensorRangeChange,
    handleGripFlickerGuardChange,
    handleGripHapticIntensityChange,
    handleGripHapticEffectChange,
    handleGripReleaseHapticIntensityChange,
    handleGripReleaseHapticEffectChange,
    leftTouchpadModeValue,
    rightTouchpadModeValue,
    gridSizeValue,
    leftGridSizeValue,
    rightGridSizeValue,
    touchpadSensitivityValue,
    leftTouchpadSensitivityValue,
    rightTouchpadSensitivityValue,
    touchpadSensitivityYValue,
    leftTouchpadSensitivityYValue,
    rightTouchpadSensitivityYValue,
    touchpadDualStageModeValue,
    leftTouchpadDualStageModeValue,
    rightTouchpadDualStageModeValue,
    gridRequiresClickValue,
    leftGridRequiresClickValue,
    rightGridRequiresClickValue,
    handleGridRequiresClickChange,
    handleLeftGridRequiresClickChange,
    handleRightGridRequiresClickChange,
    touchStickModeValue,
    leftTouchStickModeValue,
    rightTouchStickModeValue,
    touchDeadzoneInnerValue,
    leftTouchDeadzoneInnerValue,
    rightTouchDeadzoneInnerValue,
    touchRingModeValue,
    leftTouchRingModeValue,
    rightTouchRingModeValue,
    touchStickRadiusValue,
    leftTouchStickRadiusValue,
    rightTouchStickRadiusValue,
    touchStickAxisValue,
    leftTouchStickAxisValue,
    rightTouchStickAxisValue,
    touchpadAccelValues,
    accelCurveLinkValue,
    handleTouchpadAccelCurveChange,
    handleTouchpadAccelParamChange,
    handleAccelCurveLinkChange,
    touchpadWarnings,
    hasPendingChanges,
    handleSensitivityModeshiftButtonChange,
    handleThresholdChange,
    handleCutoffSpeedChange,
    handleCutoffRecoveryChange,
    handleSmoothTimeChange,
    handleSmoothThresholdChange,
    handleSmoothingDecayChange,
    handleOneEuroFilterChange,
    handleOneEuroMinCutoffChange,
    handleOneEuroSpeedCoeffChange,
    handleAngleSnapChange,
    handleAngleSnapSmoothChange,
    handleDecelBrakeStrengthChange,
    handleDecelBrakeThresholdChange,
    handleGyroClickDampenChange,
    handleHoldPressTimeChange,
    handleDoublePressWindowChange,
    handleSimPressWindowChange,
    handleTriggerThresholdChange,
    handleGyroSpaceChange,
    handleGyroAxisXChange,
    handleGyroAxisYChange,
    handleGyroOutputChange,
    handleDualSensChange,
    handleStaticSensChange,
    handleRollContributionChange,
    handleTouchpadModeChange,
    handleLeftTouchpadModeChange,
    handleRightTouchpadModeChange,
    handleGridSizeChange,
    handleLeftGridSizeChange,
    handleRightGridSizeChange,
    gridShapeValue,
    leftGridShapeValue,
    rightGridShapeValue,
    gridDeadzoneValue,
    leftGridDeadzoneValue,
    rightGridDeadzoneValue,
    handleGridShapeChange,
    handleLeftGridShapeChange,
    handleRightGridShapeChange,
    handleGridDeadzoneChange,
    handleLeftGridDeadzoneChange,
    handleRightGridDeadzoneChange,
    handleTouchpadSensitivityChange,
    handleLeftTouchpadSensitivityChange,
    handleRightTouchpadSensitivityChange,
    handleTouchpadSensitivityYChange,
    handleLeftTouchpadSensitivityYChange,
    handleRightTouchpadSensitivityYChange,
    handleTouchpadDualStageModeChange,
    handleLeftTouchpadDualStageModeChange,
    handleRightTouchpadDualStageModeChange,
    handleTouchStickModeChange,
    handleLeftTouchStickModeChange,
    handleRightTouchStickModeChange,
    handleTouchDeadzoneInnerChange,
    handleLeftTouchDeadzoneInnerChange,
    handleRightTouchDeadzoneInnerChange,
    handleTouchRingModeChange,
    handleLeftTouchRingModeChange,
    handleRightTouchRingModeChange,
    handleTouchStickRadiusChange,
    handleLeftTouchStickRadiusChange,
    handleRightTouchStickRadiusChange,
    handleTouchStickAxisChange,
    handleLeftTouchStickAxisChange,
    handleRightTouchStickAxisChange,
    handleInGameSensChange,
    handleRealWorldCalibrationChange,
    handleAccelCurveChange,
    handleNaturalVHalfChange,
    handlePowerVRefChange,
    handlePowerExponentChange,
    handleJumpTauChange,
    handleSigmoidMidChange,
    handleSigmoidWidthChange,
    handleModeSelection,
    handleCancel,
    handleFaceButtonBindingChange,
    handleModifierChange,
    handleSpecialActionAssignment,
    handleClearSpecialAction,
    gyroActivation,
    handleGyroActivationModeChange,
    handleGyroActivationButtonChange,
    trackballDecayValue,
    handleTrackballDecayChange,
    handleBindGamepadPassthrough,
    handleBindDirectionsToWasd,
    virtualControllerType,
    virtualControllerWarnings,
    handleVirtualControllerTypeChange,
    handleStickDeadzoneChange,
    handleStickModeChange,
    handleRingModeChange,
    handleStickModeShiftChange,
    handleAdaptiveTriggerChange,
    stickAimHandlers,
    stickFlickSettings,
    stickFlickHandlers,
    mouseRingRadiusValue,
    handleMouseRingRadiusChange,
    counterOsMouseSpeedEnabled,
    handleCounterOsMouseSpeedChange,
    stickDeadzoneDefaults,
    leftStickDeadzone,
    rightStickDeadzone,
    stickModes,
    stickModeShiftAssignments,
    stickAimSettings,
    adaptiveTriggerValue,
    zlModeValue,
    zrModeValue,
    handleZlModeChange,
    handleZrModeChange,
    handleToggleIgnoreGyroDevice,
    scrollSensValue,
    handleScrollSensChange,
    resetPendingSensitivityChanges,
  } = useKeymapConfig()
  // What activates a layer lives on the inputs, so it is read from the text
  // rather than from the layers themselves.
  const layerActions = useMemo(() => readLayerActions(documentText, layers), [documentText, layers])

  // The gyro's activation button can be a touch grid cell, so it has to see the
  // same cells the Trackpads page builds -- LT1.. and RT1.. on a two-pad
  // controller, T1.. on the shared grid. Deriving it from the shared mode alone
  // meant a Steam Controller offered none at all.
  const gyroGridCommands = useMemo(
    () =>
      touchpadGridCommands(
        resolveTouchpadGrids({
          touchpadMode: touchpadModeValue,
          leftMode: leftTouchpadModeValue,
          rightMode: rightTouchpadModeValue,
          columns: gridSizeValue.columns,
          rows: gridSizeValue.rows,
          leftColumns: leftGridSizeValue.columns,
          leftRows: leftGridSizeValue.rows,
          rightColumns: rightGridSizeValue.columns,
          rightRows: rightGridSizeValue.rows,
          shape: gridShapeValue,
          leftShape: leftGridShapeValue,
          rightShape: rightGridShapeValue,
        })
      ),
    [
      gridSizeValue,
      leftGridSizeValue,
      leftTouchpadModeValue,
      rightGridSizeValue,
      rightTouchpadModeValue,
      touchpadModeValue,
      gridShapeValue,
      leftGridShapeValue,
      rightGridShapeValue,
    ]
  )

  // Mirrors KeymapControls' own showPerPadTouchpads: with nothing plugged in the
  // page still shows both pads, so the side rail has to as well.
  const hasTwoTrackpads = useMemo(() => {
    const devices = sample?.devices
    if (!devices || devices.length === 0) return true
    return devices.some(device => controllerHasTwoTrackpads(device.type))
  }, [sample?.devices])

  // The section list (LB/RB): the groups of the page on screen. Pages that
  // lay out as one long column list their anchors here and a scroll-spy lights
  // the one at the top; Gyro still switches views; any other page is read
  // from its own data-section markers.
  const scrollSections = useMemo<{ id: string; label: string }[]>(() => {
    // Triggers read per hand, then calibration (Configuration Pages 15a).
    if (primaryTab === 'triggers') return [
      { id: 'trigger-left', label: t('keymap.leftTriggerTitle', 'Left trigger') },
      { id: 'trigger-right', label: t('keymap.rightTriggerTitle', 'Right trigger') },
      { id: 'trigger-calibration', label: 'Calibration' },
    ]
    // Joysticks: each stick, then whichever mode settings are in use (15b).
    if (primaryTab === 'joysticks') {
      const modes = { left: stickModes?.left.mode ?? '', right: stickModes?.right.mode ?? '' }
      const side = (test: (mode: string) => boolean) => (['left', 'right'] as const).find(key => test(modes[key]))
      const flick = side(mode => /^(AIM|HYBRID_AIM|FLICK|FLICK_ONLY|ROTATE_ONLY)$/.test(mode))
      const radial = side(mode => mode === 'RADIAL_MENU')
      return [
        { id: 'mapping-section-leftStick', label: t('keymap.leftStickTitle') },
        { id: 'mapping-section-rightStick', label: t('keymap.rightStickTitle') },
        ...(flick ? [{ id: `stick-extras-${flick}`, label: 'Flick and aim' }] : []),
        ...(radial ? [{ id: `stick-extras-${radial}`, label: 'Radial menu' }] : []),
      ]
    }
    if (primaryTab in SUB_NAV_GROUPS) {
      // The extra buttons are the grips on a controller that has them (2e).
      const first = sample?.devices?.[0]
      const grips = Boolean(first) && controllerSupportsInput(first, 'MISC5')
      return SUB_NAV_GROUPS[primaryTab as ControlTab].map(({ key, titleKey }) => ({ id: `mapping-section-${key}`, label: key === 'extra' && grips ? t('keymap.gripsTitle', 'Grips') : t(titleKey) }))
    }
    return []
  }, [primaryTab, stickModes, t, sample?.devices])
  const discoveredSections = useDiscoveredSections(primaryTab)
  // Trackpads has no section list (2b): the pads sit side by side instead.
  const noSections = primaryTab === 'touchpad' || isHomePage(primaryTab)
  const spiedSections = useMemo(() => noSections ? [] : scrollSections.length ? scrollSections : discoveredSections, [noSections, scrollSections, discoveredSections])
  const activeSectionId = useSectionScrollSpy(spiedSections.map(section => section.id))
  const shellSections = useMemo<ShellSection[]>(() => {
    return spiedSections.map(section => ({ ...section, active: activeSectionId === section.id, onSelect: () => scrollToSection(section.id) }))
  }, [spiedSections, activeSectionId])
  const currentSection = shellSections.find(section => section.active)

  const {
    libraryProfiles,
    isLibraryLoading,
    editedLibraryNames,
    currentLibraryProfile,
    applyConfig,
    saveConfig,
    appliedProfileName, runtimeConfig,
    refreshLibraryProfiles,
    handleLoadProfileFromLibrary,
    handleLibraryProfileNameChange,
    handleCreateProfile,
    handleRenameProfile,
    handleDeleteLibraryProfile,
    handleImportProfile,
    handleCopyActiveProfile,
    handleSaveAsCopy,
  } = useProfileLibrary({
    resetConfigHistory,
    configText: documentText,
    setConfigText: setDocumentText,
    setAppliedConfig,
    setStatusMessage,
    resetPendingSensitivityChanges: resetPendingSensitivityChanges,
  })
  // First run (System States 17d): an empty library opens on the
  // Configurations page, where the welcome panel offers a starting point.
  // Asked once, directly: the library hook's loading flag flips true and back
  // inside one batched render when the listing answers at once, so nothing
  // downstream can tell "loaded and empty" from "not loaded yet".
  useEffect(() => {
    let disposed = false
    void desktopBridge.listLibraryProfiles().then(names => { if (!disposed && names.length === 0) setPrimaryTab('configurations') }).catch(() => {})
    return () => { disposed = true }
  }, [setPrimaryTab])
  const {
    isCalibrationModalOpen,
    calibrationCounterOs,
    calibrationInGameSens,
    calibrationDirty,
    setCalibrationCounterOs,
    setCalibrationInGameSens,
    setCalibrationDirty,
    calibrationLoadMessage,
    calibrationOutput,
    resetCalibrationInputs,
    handleOpenCalibration,
    handleCloseCalibration,
    handleApplyCalibrationPreset,
    handleRunCalibration,
  } = useCalibration({
    configText,
    counterOsMouseSpeedEnabled,
    sensitivityInGame: sensitivity.inGameSens,
  })


  const handleRecalibrate = async () => {
    if (isCalibrating || recalibrating) return
    setRecalibrating(true)
    try {
      const result = await desktopBridge.recalibrateGyro()
      if (result?.success) {
        setStatusMessage(t('messages.recalibrationStarted'))
      } else {
        setStatusMessage(t('messages.recalibrationFailed'))
      }
    } catch (err) {
      console.error(err)
      setStatusMessage(t('messages.recalibrationFailed'))
    } finally {
      setRecalibrating(false)
      setTimeout(() => setStatusMessage(null), 3000)
    }
  }

  const formatTimestamp = (value: unknown) => {
    if (typeof value === 'number') {
      const date = new Date(value)
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      const seconds = String(date.getSeconds()).padStart(2, '0')
      const ms = String(date.getMilliseconds()).padStart(3, '0')
      return `${hours}:${minutes}:${seconds}.${ms}`
    }
    if (typeof value === 'string') {
      return value
    }
    return '-'
  }

  const telemetryValues = {
    omega: formatNumber(asNumber(sample?.omega)),
    sensX: formatNumber(asNumber(sample?.sensX)),
    sensY: formatNumber(asNumber(sample?.sensY)),
    sampleHz: formatNumber(asNumber(sample?.sampleHz), 0),
    timestamp: formatTimestamp(sample?.ts),
  }
  const currentMode: 'static' | 'accel' =
    sensitivityView === 'modeshift' && sensitivityModeshiftButton ? selectedModeshiftMode : selectedBaseMode
  const profileLabel = currentLibraryProfile ?? t('app.profileSummary.unsavedProfile')
  const profileFileLabel = `${profileLabel}${profileLabel.endsWith('.txt') ? '' : '.txt'}`
  const lockMessage = t('messages.lockMessage')

  useEffect(() => {
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement
      const isTextInput = (el: HTMLInputElement) => {
        const excluded = ['checkbox', 'radio', 'range', 'file', 'color', 'button', 'submit', 'reset']
        return !excluded.includes(el.type)
      }
      if (target instanceof HTMLInputElement) {
        if (target.disabled || target.readOnly || !isTextInput(target)) return
        requestAnimationFrame(() => { if (document.activeElement === target) target.select() })
      } else if (target instanceof HTMLTextAreaElement) {
        if (target.disabled || target.readOnly) return
        const skipAutoSelect = target.closest('.config-panel')
        if (skipAutoSelect) return
        requestAnimationFrame(() => { if (document.activeElement === target) target.select() })
      }
    }
    window.addEventListener('focusin', handleFocusIn)
    return () => window.removeEventListener('focusin', handleFocusIn)
  }, [])

  useEffect(() => {
    if (!isConfigDrawerOpen) {
      configWindowDragRef.current = null
      setConfigWindowDragging(false)
      return
    }

    const updateFloatingWindowPosition = () => {
      const rect = configWindowRef.current?.getBoundingClientRect()
      const width = rect?.width ?? Math.min(window.innerWidth - FLOATING_WINDOW_MARGIN * 2, 400)
      const height = rect?.height ?? Math.min(window.innerHeight - FLOATING_WINDOW_MARGIN * 2, 760)
      setConfigWindowPosition(current =>
        clampFloatingWindowPosition(current ?? getDefaultFloatingWindowPosition(width, height), width, height)
      )
    }

    const frame = window.requestAnimationFrame(updateFloatingWindowPosition)
    window.addEventListener('resize', updateFloatingWindowPosition)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', updateFloatingWindowPosition)
    }
  }, [isConfigDrawerOpen])

  useEffect(() => {
    if (!isConfigDrawerOpen) return undefined

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setConfigDrawerOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isConfigDrawerOpen])

  const [editorBusy, setEditorBusy] = useState(false)
  const editorActionRef = useRef<(action: 'both' | 'save' | 'apply') => Promise<void>>(async () => {})
  const actionInFlight = useRef(false)
  const runEditorAction = async (action: 'both' | 'save' | 'apply') => {
    if (isCalibrating || actionInFlight.current) return
    actionInFlight.current = true
    setEditorBusy(true)
    try {
      const text = finalizePendingValues?.() ?? configText
      const options = { textOverride: text, profileNameOverride: currentLibraryProfile ?? undefined }
      if (action !== 'apply' && !await saveConfig(options)) return
      if (action !== 'save') await applyConfig(options)
    } finally { actionInFlight.current = false; setEditorBusy(false) }
  }
  editorActionRef.current = runEditorAction
  const historyRef = useRef({ undo, redo, isCalibrating })
  historyRef.current = { undo, redo, isCalibrating }
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || !(event.ctrlKey || event.metaKey) || event.repeat) return
      const key = event.key.toLowerCase()
      if (key !== 'z' && key !== 's' && !(key === 'a' && event.shiftKey)) return
      if (historyRef.current.isCalibrating) return
      event.preventDefault()
      flushSync(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() })
      if (key === 'z') (event.shiftKey ? historyRef.current.redo : historyRef.current.undo)()
      else void editorActionRef.current(key === 's' ? 'save' : 'apply')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Switching configuration replaces the editor's contents, so edits that were
  // never written to a file are simply gone. Ask first, and name the file they
  // would be lost from.
  const [pendingProfileSwitch, setPendingProfileSwitch] = useState<string | null>(null)
  const requestLoadProfile = (name: string) => {
    if (name === currentLibraryProfile) return
    if (hasPendingChanges) { setPendingProfileSwitch(name); return }
    void handleLoadProfileFromLibrary(name)
  }
  // Keep leaves the edits as a draft of that configuration, restored when you
  // come back to it (useProfileLibrary keeps drafts per configuration).
  const resolveProfileSwitch = async (choice: 'save' | 'discard' | 'keep') => {
    const name = pendingProfileSwitch
    if (!name) return
    setPendingProfileSwitch(null)
    // Save what is on screen, including any value still being typed, before it
    // is replaced -- the same finalize step the Save button runs.
    if (choice === 'save' && !await saveConfig({ textOverride: finalizePendingValues?.() ?? configText })) return
    void handleLoadProfileFromLibrary(name, choice === 'discard')
  }

  const handleApplyWithFinalize = () => {
    const nextText = finalizePendingValues ? finalizePendingValues() : undefined
    if (nextText !== undefined) {
      saveConfig({ textOverride: nextText })
    } else {
      saveConfig()
    }
  }

  useEffect(() => {
    let disposed = false
    void desktopBridge.getRuntimeMappingState().then(state => {
      if (disposed) return
      setMappingEnabled(state.mappingEnabled)
      setAutoloadEnabled(state.autoloadEnabled)
      setControllerNavEnabled(state.controllerNavEnabled)
      setReservedChords(!!state.reservedChords)
    }).catch(error => {
      console.error('Failed to load runtime mapping state', error)
    })
    return () => {
      disposed = true
    }
  }, [])

  useEffect(() => {
    let disposed = false
    void desktopBridge.getHidHideStatus().then(status => {
      if (disposed) return
      if (status.requiresElevation) {
        setShowHidHideElevationModal(true)
      }
    }).catch(error => {
      console.error('Failed to probe HidHide status', error)
    })
    return () => {
      disposed = true
    }
  }, [])

  const handleToggleMappingEnabled = async () => {
    if (runtimeMappingBusy) return
    const nextEnabled = !mappingEnabled
    setRuntimeMappingBusy(true)
    try {
      const nextState = await desktopBridge.setMappingEnabled(nextEnabled)
      setMappingEnabled(nextState.mappingEnabled)
      setAutoloadEnabled(nextState.autoloadEnabled)
      const message = nextState.mappingEnabled ? t('messages.mappingEnabled') : t('messages.mappingPaused')
      setStatusMessage(message)
      showToast(message)
      setTimeout(() => setStatusMessage(null), 3000)
    } catch (error) {
      console.error('Failed to toggle mapping output', error)
      const message = t('messages.mappingToggleFailed')
      setStatusMessage(message)
      showToast(message, 'error')
    } finally {
      setRuntimeMappingBusy(false)
    }
  }

  const handleAutoloadEnabledChange = async (enabled: boolean) => {
    if (runtimeMappingBusy) return
    setRuntimeMappingBusy(true)
    try {
      const nextState = await desktopBridge.setAutoloadEnabled(enabled)
      setMappingEnabled(nextState.mappingEnabled)
      setAutoloadEnabled(nextState.autoloadEnabled)
      const message = nextState.autoloadEnabled ? t('messages.autoloadEnabled') : t('messages.autoloadDisabled')
      setStatusMessage(message)
      showToast(message)
      setTimeout(() => setStatusMessage(null), 3000)
    } catch (error) {
      console.error('Failed to update AutoLoad setting', error)
      const message = t('messages.autoloadUpdateFailed')
      setStatusMessage(message)
      showToast(message, 'error')
    } finally {
      setRuntimeMappingBusy(false)
    }
  }

  // Your own names for what each input does. They live in the configuration as
  // their own comment lines, so they survive editing the binding they describe
  // and JoyShockMapper ignores them. See utils/bindingLabels.
  // Read through the imports, like every other value: a label the template
  // gives an input is that input's label here too.
  const bindingLabels = useMemo(() => parseBindingLabels(effectiveConfigText), [effectiveConfigText])
  const resolveIncludedText = configIncludes.resolveText
  const handleBindingLabelChange = useCallback((command: string, label: string) => {
    // Clearing a name the template supplies has to say so in this profile
    // (an empty label line), or the template's name would come straight back.
    setConfigText(prev => setBindingLabel(prev, command, label, {
      keepEmpty: Boolean(parseBindingLabels(resolveIncludedText(setBindingLabel(prev, command, '')))[command.trim().toUpperCase()]),
    }))
  }, [setConfigText, resolveIncludedText])
  // Icons ride alongside labels on their own comment lines, same contract.
  const bindingIcons = useMemo(() => parseBindingIcons(effectiveConfigText), [effectiveConfigText])
  const handleBindingIconChange = useCallback((command: string, icon: string) => {
    setConfigText(prev => setBindingIcon(prev, command, icon))
  }, [setConfigText])

  const handleOpenConfigDirectory = async () => {
    try {
      await desktopBridge.openConfigDirectory()
    } catch (error) {
      console.error('Failed to open config directory', error)
      showToast(t('messages.openConfigDirectoryFailed'), 'error')
    }
  }

  const handleConfigWindowDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return

    const floatingWindow = configWindowRef.current
    if (!floatingWindow) return

    const rect = floatingWindow.getBoundingClientRect()
    const nextPosition = configWindowPosition ?? { x: rect.left, y: rect.top }
    configWindowDragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - nextPosition.x,
      offsetY: event.clientY - nextPosition.y,
    }
    setConfigWindowPosition(nextPosition)
    event.currentTarget.setPointerCapture(event.pointerId)
    setConfigWindowDragging(true)
  }

  const handleConfigWindowDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = configWindowDragRef.current
    const floatingWindow = configWindowRef.current
    if (!dragState || dragState.pointerId !== event.pointerId || !floatingWindow) return

    const rect = floatingWindow.getBoundingClientRect()
    setConfigWindowPosition(
      clampFloatingWindowPosition(
        {
          x: event.clientX - dragState.offsetX,
          y: event.clientY - dragState.offsetY,
        },
        rect.width,
        rect.height
      )
    )
  }

  const handleConfigWindowDragEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (configWindowDragRef.current?.pointerId !== event.pointerId) return

    configWindowDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setConfigWindowDragging(false)
  }

  // ---- Shell context: what the title bar, tabs and capsule describe.
  const device = sample?.devices?.[0]
  const controllerFamily = controllerVisualFamily(device?.type)
  const appliedName = mappingEnabled ? appliedProfileLabel(sample?.activeProfile, appliedProfileName)?.replace(/.txt$/i, '') ?? null : null
  // What games get. While Studio is in front the mapper runs AppNavigation,
  // which is Studio's own and never shown; the configuration behind it is the
  // one that counts as running.
  const runningProfilePath = isStudioNavigationProfile(sample?.activeProfile)
    ? (appliedProfileName ? `profiles-library/${appliedProfileName.replace(/\.txt$/i, '')}.txt` : '')
    : typeof sample?.activeProfile === 'string' ? sample.activeProfile : ''
  // What this configuration's imports alone produce, and which import each
  // value came from: the value an override replaces, and whose it was.
  const importedBase = useMemo(() => {
    const imports = defaultLayer(documentText).split(/\r?\n/).filter(line => !line.includes('=')).join('\n')
    return { text: configIncludes.resolveText(imports), origins: configIncludes.resolveOrigins(imports) }
  }, [documentText, configIncludes.resolveText, configIncludes.resolveOrigins])
  const templateNames = useMemo(() => new Set(configIncludes.imports.map(includeDisplayName)), [configIncludes.imports])
  const titleBarProfiles = useMemo<TitleBarProfile[]>(() => libraryProfiles.map(name => ({
    name,
    template: templateNames.has(name),
    description: name === currentLibraryProfile
      ? [configIncludes.imports.length ? `Imports ${configIncludes.imports.map(includeDisplayName).join(', ')}` : '', layers.length ? `${layers.length} layer${layers.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ') || undefined
      : templateNames.has(name) && currentLibraryProfile ? `Imported by ${currentLibraryProfile}` : undefined,
  })), [libraryProfiles, templateNames, currentLibraryProfile, configIncludes.imports, layers.length])
  const titleBarLayers = useMemo(() => layers.map((layer, index) => ({
    id: layer.id,
    name: layer.name,
    colorIndex: index,
    description: describeLayerActivation(layerActions, layer.id, command => inputDisplayName(command, controllerFamily)),
  })), [layers, layerActions, controllerFamily])
  const [testing, setTesting] = useState(false)

  // ---- System states the backend reports (System States 17c, 17e).
  // The mapper stopping by itself: known on launch, and announced when it
  // happens. A launch clears it.
  // The mapper's live layer stack, for the Layers page.
  const [layerStack, setLayerStack] = useState<LayerStack | null>(null)
  useEffect(() => {
    void desktopBridge.getLayerStack().then(stack => { if (stack) setLayerStack(stack) })
    return desktopBridge.onLayerStack(setLayerStack)
  }, [])
  // The layers active on the applied configuration, for the title bar's
  // Applied segment ("Wardogs · Vehicles · Comms", JSM Shell 3d). Only when the
  // stack the mapper reports is for the file that is running; coloured by
  // their position in the editing configuration when that is the same file.
  const appliedLayers = useMemo(() => {
    const running = runningProfilePath
    const stackFile = layerStack?.profile.split(/[\\/]/).pop()?.toLowerCase() ?? ''
    if (!running || !layerStack || !stackFile || stackFile !== running.split(/[\\/]/).pop()?.toLowerCase()) return []
    const editingIsApplied = Boolean(currentLibraryProfile) && stackFile.replace(/\.txt$/i, '') === currentLibraryProfile?.toLowerCase()
    return layerStack.layers.map(layer => {
      const index = editingIsApplied ? layers.findIndex(candidate => candidate.id === layer.id) : -1
      return { name: layer.name, color: index >= 0 ? layerColor(index) : 'var(--text-2)' }
    })
  }, [layerStack, runningProfilePath, currentLibraryProfile, layers])
  const [mapperExit, setMapperExit] = useState<MapperExit | null>(null)
  const [mapperRestarting, setMapperRestarting] = useState(false)
  useEffect(() => {
    void desktopBridge.getMapperStatus().then(status => { if (status && !status.running && status.exit) setMapperExit(status.exit) })
    return desktopBridge.onMapperStatus(status => setMapperExit(status.running ? null : status.exit ?? null))
  }, [])
  const restartMapper = async () => {
    setMapperRestarting(true)
    try {
      await desktopBridge.launchJSM()
      setMapperExit(null)
    } catch (error) {
      showToast(`Could not restart the mapper: ${error instanceof Error ? error.message : String(error)}`, 'error')
    } finally {
      setMapperRestarting(false)
    }
  }
  // Lines of the running configuration the mapper could not use, as it
  // reports them. Matched on the file name: the mapper and Studio spell the
  // path differently.
  const baseName = (path: string) => path.split(/[\\/]/).pop()?.toLowerCase() ?? ''
  const configErrors = useMemo(() => {
    const reported = (sample?.configErrors as ConfigError[] | undefined) ?? []
    const running = runningProfilePath ? baseName(runningProfilePath) : ''
    return running ? reported.filter(error => baseName(error.profile) === running) : []
  }, [sample?.configErrors, runningProfilePath])
  const configErrorsKey = configErrors.map(error => `${error.file}:${error.line}:${error.text}`).join('|')
  const [dismissedConfigErrors, setDismissedConfigErrors] = useState('')
  const openSourceAtError = (error: ConfigError) => {
    // The applied file carries header lines the editor does not show, so find
    // the line by its text and fall back to the reported number.
    const lines = documentText.split(/\r?\n/)
    const index = lines.findIndex(line => line.trim() === error.text.trim())
    setSourceFocusLine({ line: index >= 0 ? index + 1 : error.line, nonce: Date.now() })
    setConfigWindowPosition(null)
    setConfigDrawerOpen(true)
  }
  // How a calibration run ended, wherever it was started from.
  useEffect(() => desktopBridge.onGyroCalibrationResult(result => {
    if (result.ok) showToast('Gyro calibrated')
    else if (result.reason === 'moved') showToast(`Calibration cancelled at ${result.reached ?? 0}%: the controller moved. Put it down and calibrate again.`, 'error')
  }), [])

  // A mapper that is not running maps nothing, whatever the switch says.
  const mappingPlate: MappingPlateState = mapperExit
    ? 'off'
    : !device
    ? 'disconnected'
    : !mappingEnabled
      ? 'off'
      : testing
        ? 'testing'
        : autoloadEnabled && controllerNavEnabled ? 'studio' : 'on'
  // ---- Test mode: the configuration runs inside Studio until View + Menu is
  // held, Esc is pressed, or Return to Studio is clicked. Starting it applies
  // the configuration being edited, which is what "Testing <name>" promises.
  // On exit, focus returns to what had it before the test: the last thing
  // focused in the page, since reaching Test itself moved focus to the bar.
  const lastPageFocus = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const remember = (event: FocusEvent) => {
      const target = event.target as HTMLElement
      if (target.closest?.('.shell-body')) lastPageFocus.current = target
    }
    document.addEventListener('focusin', remember)
    return () => document.removeEventListener('focusin', remember)
  }, [])
  const testReturnFocus = useRef<HTMLElement | null>(null)
  const exitTest = useCallback(() => {
    setTesting(false)
    void desktopBridge.resumeStudioNavigation()
    const back = testReturnFocus.current
    testReturnFocus.current = null
    requestAnimationFrame(() => { if (back?.isConnected) back.focus({ preventScroll: true }) })
  }, [])
  const startTest = async () => {
    testReturnFocus.current = lastPageFocus.current
    // Told first, so this Apply leaves the configuration with the controller.
    await desktopBridge.setStudioTesting(true)
    await runEditorAction('apply')
    setTesting(true)
  }
  // However the test ends (Return, Esc, View + Menu, leaving the window),
  // Apply goes back to handing the controller to Studio.
  useEffect(() => { if (!testing) void desktopBridge.setStudioTesting(false) }, [testing])
  useEffect(() => {
    if (!testing) return
    let left = false
    const key = (event: KeyboardEvent) => {
      if (!event.isTrusted || event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      exitTest()
    }
    // Leaving Studio hands the pad to whatever comes to the front, and coming
    // back reloads the navigation profile through AutoLoad: the test is over.
    const blur = () => { left = true }
    const focus = () => { if (left) setTesting(false) }
    window.addEventListener('keydown', key, true)
    window.addEventListener('blur', blur)
    window.addEventListener('focus', focus)
    return () => {
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('blur', blur)
      window.removeEventListener('focus', focus)
    }
  }, [testing, exitTest])

  // LB / RB step through the section list. A section the page is still
  // scrolling to counts as current (nav/scroller.ts knows which), so quick
  // presses keep advancing from the last one asked for, not from whatever
  // the scroll spy saw mid-flight.
  // Returns whether it moved, so the pad can feel the end of the list.
  const stepSection = useCallback((delta: 1 | -1) => {
    if (!shellSections.length) return false
    const inFlight = sectionInFlight()
    const from = shellSections.findIndex(section => inFlight ? section.id === inFlight : section.active)
    const target = shellSections[Math.min(shellSections.length - 1, Math.max(0, (from < 0 ? 0 : from + delta)))]
    if (target.id === inFlight || (!inFlight && target.active)) return false
    target.onSelect()
    return true
  }, [shellSections])
  // LT / RT from the pad: the same step as Page Up / Down, reporting whether
  // it moved (the strip has ends) for the haptic.
  const stepPageFromPad = useCallback((delta: 1 | -1) => {
    const order = pageOrder(primaryTab)
    const index = Math.max(0, order.indexOf(primaryTab))
    const next = order[Math.min(order.length - 1, Math.max(0, index + delta))]
    if (next === primaryTab) return false
    setPrimaryTab(next)
    return true
  }, [primaryTab, setPrimaryTab])

  // Hints draw the pad's buttons only while one is connected (nav/inputSource.ts).
  const padConnected = Boolean(device)
  useEffect(() => { document.body.dataset.padConnected = String(padConnected) }, [padConnected])
  useControllerNavigation({
    enabled: mappingPlate === 'studio',
    testing,
    onPageStep: stepPageFromPad,
    onSectionStep: stepSection,
    onExitTest: exitTest,
    onHome: () => setPrimaryTab('home'),
    // Menu opens the Configuration menu wherever a configuration is being
    // edited or shown (Home's card counts); Studio has none to act on.
    // Menu opens the Configuration menu wherever there is a configuration
    // to switch to or act on -- with nothing chosen yet, it is where one is
    // chosen. Studio's own pages apply to every configuration and have none.
    onMenu: () => {
      if (isStudioPage(primaryTab)) return false
      setConfigMenuOpen(true)
    },
  })

  const controllerStatus: ControllerStatus = device
    ? {
        kind: 'connected',
        name: controllerDisplayName(device.type),
        battery: typeof device.batteryPercent === 'number' && device.batteryPercent >= 0 && (device.batteryState ?? 0) > 0 && device.batteryState !== 2
          ? device.batteryState === 3 ? `Charging ${device.batteryPercent}%` : `${device.batteryPercent}%`
          : undefined,
      }
    : { kind: 'searching' }
  const editApplied = () => {
    const name = appliedProfileLabel(sample?.activeProfile, appliedProfileName)
    if (name) requestLoadProfile(name.replace(/.txt$/i, ''))
    else showToast('The applied profile source is unavailable.', 'error')
  }
  const calibratingReason = `Calibrating${countdown != null ? ` · ${countdown}s` : '…'}`
  const saveIdleReason = isCalibrating ? calibratingReason : editorBusy ? 'Working…' : !currentLibraryProfile ? 'Choose a configuration to save' : !hasPendingChanges ? 'No unsaved changes' : null
  const applyIdleReason = isCalibrating ? calibratingReason : editorBusy ? 'Working…' : !currentLibraryProfile ? 'Choose a configuration to apply' : null

  // ---- The state button and the Configuration menu (1e).
  // Changes are counted against the saved file; "running" compares what the
  // mapper was last given with the file as it would be written, so a saved
  // edit that was never applied reads "Apply Wardogs".
  const changeCount = useMemo(() => hasPendingChanges ? Math.max(1, countChanges(appliedConfig, documentText)) : 0, [hasPendingChanges, appliedConfig, documentText])
  const asWritten = useCallback((text: string) => serializeConfig(parseConfigText(ensureHeaderLines(text))), [])
  const editingIsRunning = useMemo(() => Boolean(currentLibraryProfile) && currentLibraryProfile === appliedProfileName && !!runtimeConfig
    && countChanges(asWritten(runtimeConfig), asWritten(documentText)) === 0, [currentLibraryProfile, appliedProfileName, runtimeConfig, documentText, asWritten])
  const stateButton: StateButton = testing
    ? { kind: 'testing' }
    : applyIdleReason
      ? { kind: 'idle', reason: applyIdleReason }
      : hasPendingChanges
        ? { kind: 'changes', count: changeCount }
        : editingIsRunning && !mapperExit
          ? { kind: 'applied' }
          : { kind: 'apply', name: currentLibraryProfile ?? '' }
  const pressStateButton = () => {
    if (stateButton.kind === 'testing') { exitTest(); return }
    if (stateButton.kind === 'applied') { showToast(`${currentLibraryProfile} is saved and running.`); return }
    if (stateButton.kind === 'changes') { void runEditorAction('both'); return }
    if (stateButton.kind === 'apply') void runEditorAction('apply')
  }
  const [configMenuOpen, setConfigMenuOpen] = useState(false)
  const testReason = !device ? 'Connect a controller to test' : mappingPlate !== 'studio' ? 'Test runs while Studio has the controller' : !currentLibraryProfile ? 'Choose a configuration to test' : null
  // What the title bar holds, reachable from the pad through Menu: Apply,
  // then the configuration, layer and output being worked on, then mapping.
  const stateLabel = stateButton.kind === 'changes' ? `Apply ${stateButton.count} ${stateButton.count === 1 ? 'change' : 'changes'}`
    : stateButton.kind === 'apply' ? `Apply ${stateButton.name}`
    : stateButton.kind === 'applied' ? 'Applied'
    : stateButton.kind === 'testing' ? 'Return to Studio'
    : 'Apply'
  const currentOutput = ((virtualControllerType as VirtualOutput) ?? 'NONE') as VirtualOutput
  const titleBarMenuItems: ConfigurationMenuItem[] = [
    { key: 'apply', icon: 'apply', label: stateLabel,
      meta: stateButton.kind === 'applied' ? 'Saved and running' : stateButton.kind === 'idle' ? stateButton.reason : undefined,
      idle: stateButton.kind === 'applied' || stateButton.kind === 'idle', onSelect: pressStateButton },
    { key: 'configuration', icon: 'library', label: 'Configuration', meta: currentLibraryProfile ?? 'None chosen', idle: isCalibrating,
      choices: [
        ...titleBarProfiles.map(profile => ({
          key: `profile:${profile.name}`, label: profile.name, checked: profile.name === currentLibraryProfile,
          meta: profile.name === appliedName ? 'Applied' : profile.template ? 'Template' : undefined,
          onSelect: () => requestLoadProfile(profile.name),
        })),
        { key: 'library', label: 'Open configuration library…', onSelect: () => setPrimaryTab('configurations') },
      ] },
    ...(currentLibraryProfile ? [{ key: 'layer', icon: 'layers' as const, label: 'Editing layer', meta: layers.find(layer => layer.id === layerId)?.name ?? 'Default', idle: isCalibrating,
      choices: [
        { key: 'layer:', label: 'Default', meta: 'Base bindings', checked: !layerId, onSelect: () => selectLayer('') },
        ...titleBarLayers.map(layer => ({ key: `layer:${layer.id}`, label: layer.name, meta: layer.description, checked: layer.id === layerId, swatch: layerColor(layer.colorIndex), onSelect: () => selectLayer(layer.id) })),
        { key: 'manage', label: 'Manage layers…', onSelect: () => setLayerManagerOpen(true) },
      ] }] : []),
    ...(currentLibraryProfile ? [{ key: 'output', icon: 'stVirtual' as const, label: 'Controller output', meta: OUTPUT_LABELS[currentOutput],
      choices: [
        ...(Object.keys(OUTPUT_LABELS) as VirtualOutput[]).map(value => ({ key: `output:${value}`, label: OUTPUT_LABELS[value], meta: OUTPUT_DESCRIPTIONS[value], checked: value === currentOutput, onSelect: () => handleVirtualControllerTypeChange(value) })),
        { key: 'bind', label: 'Bind whole controller', meta: currentOutput === 'NONE' ? 'Choose a virtual output first' : undefined, idle: currentOutput === 'NONE',
          onSelect: () => handleBindGamepadPassthrough(currentOutput === 'DS4' ? 'DS4' : 'XBOX') },
      ] }] : []),
    { key: 'mapping', icon: 'catJsm', label: mappingPlate === 'off' ? 'Turn mapping on' : 'Turn mapping off',
      meta: mappingPlate === 'off' ? 'Your controller is not mapped' : 'JSM is reading the controller', idle: runtimeMappingBusy,
      onSelect: () => { void handleToggleMappingEnabled() } },
  ]
  const configMenuItems: ConfigurationMenuItem[] = [
    ...titleBarMenuItems,
    { key: 'undo', divider: true, icon: 'undo', label: 'Undo', meta: canUndo && !isCalibrating ? describeChange(undoTarget, documentText) ?? 'Last change' : 'Nothing to undo', idle: !canUndo || isCalibrating, onSelect: undo },
    { key: 'redo', icon: 'redo', label: 'Redo', meta: canRedo && !isCalibrating ? describeChange(documentText, redoTarget ?? documentText) ?? 'Last undo' : 'Nothing to redo', idle: !canRedo || isCalibrating, onSelect: redo },
    { key: 'save', icon: 'save', label: 'Save without applying', meta: saveIdleReason ?? 'Ctrl+S', idle: Boolean(saveIdleReason), onSelect: () => void runEditorAction('save') },
    { key: 'copy', icon: 'copy', label: 'Save as copy…', idle: !currentLibraryProfile || isCalibrating, meta: !currentLibraryProfile ? 'Choose a configuration first' : undefined, onSelect: () => void handleSaveAsCopy(finalizePendingValues?.() ?? configText) },
    { key: 'discard', icon: 'remove', label: hasPendingChanges ? `Discard ${changeCount} ${changeCount === 1 ? 'change' : 'changes'}` : 'Discard changes', idle: !hasPendingChanges || isCalibrating, meta: hasPendingChanges ? undefined : 'No unsaved changes', onSelect: handleCancel },
    { key: 'test', icon: 'test', label: 'Test while editing', idle: Boolean(testReason) || testing, meta: testing ? 'Testing now' : testReason ?? undefined, onSelect: () => void startTest() },
    { key: 'inherit', icon: 'inherited', label: 'Values & inheritance', idle: !currentLibraryProfile, onSelect: () => setInventoryOpen(true) },
  ]

  const renderTitleBar = () => (
    <TitleBar
      width={shellWidth}
      frameless={frameless}
      variant={isHomePage(primaryTab) ? 'home' : isStudioPage(primaryTab) ? 'studio' : 'editing'}
      onHome={() => setPrimaryTab('home')}
      controllerLabel={{ text: controllerStatus.kind === 'connected' ? `${controllerStatus.name}${controllerStatus.battery ? ` · ${controllerStatus.battery}` : ''}` : 'No controller · searching', connected: controllerStatus.kind === 'connected' }}
      onOpenConfigMenu={() => setConfigMenuOpen(true)}
      editingName={currentLibraryProfile}
      dirty={hasPendingChanges}
      profiles={titleBarProfiles}
      // A mapper that has stopped applies nothing (System States 17c).
      appliedName={mapperExit ? null : appliedName}
      appliedLayers={mapperExit ? undefined : appliedLayers}
      onSelectProfile={requestLoadProfile}
      onOpenLibrary={() => setPrimaryTab('configurations')}
      editingDisabled={isCalibrating}
      layers={titleBarLayers}
      layerId={layerId}
      onSelectLayer={selectLayer}
      onManageLayers={() => setLayerManagerOpen(true)}
      onEditApplied={editApplied}
      mapping={mappingPlate}
      mappingBusy={runtimeMappingBusy}
      onToggleMapping={() => { void handleToggleMappingEnabled() }}
      output={(virtualControllerType as VirtualOutput) ?? 'NONE'}
      onOutputChange={value => handleVirtualControllerTypeChange(value)}
      onBindWholeController={() => handleBindGamepadPassthrough(virtualControllerType === 'DS4' ? 'DS4' : 'XBOX')}
      state={stateButton}
      onStatePress={pressStateButton}
    />
  )

  // Timing lines an older file still sets (2f). The file being edited is
  // changed in the editor, and saved at once unless it has other unsaved edits.
  const removeTimingLines = async (profile: string, keys: string[]) => {
    const strip = (text: string) => text.split(/\r?\n/).filter(line => !keys.some(key => new RegExp(`^\\s*${key}\\s*=`).test(line))).join('\n')
    if (profile === currentLibraryProfile) {
      const next = strip(documentText)
      setDocumentText(next)
      if (hasPendingChanges) { showToast(`Removed from ${profile} in the editor; apply it to save the file.`); return true }
      return saveConfig({ textOverride: next })
    }
    const loaded = await desktopBridge.loadLibraryProfile(profile)
    if (!loaded) return false
    return Boolean(await desktopBridge.saveLibraryProfile(profile, strip(loaded.content)))
  }

  // ---- Home (2a)
  const homeTune = (): Record<HomeTune, string> => {
    const sens = sensitivity as { gyroSensX?: number; minSensX?: number; maxSensX?: number }
    const gyroSens = sens.gyroSensX ?? sens.minSensX
    const twoPads = hasTwoTrackpads
    const mousePads = twoPads
      ? [leftTouchpadModeValue === 'MOUSE' ? 'left pad' : null, rightTouchpadModeValue === 'MOUSE' ? 'right pad' : null].filter(Boolean)
      : touchpadModeValue === 'MOUSE' ? ['touchpad'] : []
    return {
      gyro: `Gyro page${typeof gyroSens === 'number' && Number.isFinite(gyroSens) ? ` · ${gyroSens.toFixed(2)}×` : ''}`,
      mouseFeel: mousePads.length === 0 ? 'No pad set to Mouse yet' : `Trackpads · ${mousePads.length === 2 ? 'both pads' : mousePads[0]}`,
      grips: !device ? 'Controller not connected' : controllerSupportsInput(device, 'MISC5') ? 'Buttons › Grips' : 'This controller has no grip sensors',
    }
  }
  const homeStudio = (): Partial<Record<StudioTab, string>> => {
    const templates = libraryProfiles.filter(name => templateNames.has(name)).length
    const profiles = libraryProfiles.length - templates
    const hold = (runtimePreferences?.holdPressMs ?? 150) / 1000
    const poll = runtimePollingMs
    return {
      configurations: `${profiles} ${profiles === 1 ? 'profile' : 'profiles'}${templates ? ` · ${templates} ${templates === 1 ? 'template' : 'templates'}` : ''}`,
      associations: autoloadEnabled ? 'Load by app' : 'Load by app · off',
      timing: `Hold ${typeof hold === 'number' ? hold.toFixed(2) : '0.15'} s · ${poll} ms polling`,
    }
  }
  const renderHome = () => (
    <HomePage
      configName={currentLibraryProfile}
      fileName={currentLibraryProfile ? `${currentLibraryProfile}.txt` : null}
      applied={editingIsRunning && !mapperExit}
      layer={layerId ? (() => { const index = layers.findIndex(layer => layer.id === layerId); return index >= 0 ? { name: layers[index].name, colorIndex: index } : null })() : null}
      changeCount={changeCount}
      device={device}
      onSwitch={() => setPrimaryTab('configurations')}
      onContinue={() => setPrimaryTab(lastEditingPage.current)}
      onTest={() => void startTest()}
      testReason={testReason}
      tune={homeTune()}
      onTune={tile => { if (tile === 'gyro') setPrimaryTab('gyro'); else setSheet(tile === 'mouseFeel' ? 'mouseFeel' : 'gripSensors') }}
      studio={homeStudio()}
      onOpenStudio={setPrimaryTab}
    />
  )

  // Every layer's text for On-screen menus, worked out only while it is open
  // and only when the configuration changes (App re-renders per telemetry frame).
  const menuSurfaces = useMemo(() => menusOpen ? [
    { layerId: '', layerName: 'Default', text: readTextFor('') },
    ...layers.map((layer, index) => ({ layerId: layer.id, layerName: layer.name, colorIndex: index, text: readTextFor(layer.id) })),
  ] : [], // readTextFor is rebuilt every render; what it reads is below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [menusOpen, documentText, layers, effectiveConfigText])

  // ---- What opens over a page: the Configuration menu, the detail sheets
  // and the On-screen menus view. Inside the page's providers, so their rows
  // read origins and write through the same layer as the page.
  const renderOverViews = () => (
    <>
      <ConfigurationMenu open={configMenuOpen} configName={currentLibraryProfile ?? 'Configuration'} items={configMenuItems} onClose={() => setConfigMenuOpen(false)} />
      <MouseFeelSheet
        open={sheet === 'mouseFeel'}
        onClose={() => setSheet(null)}
        pads={hasTwoTrackpads
          ? [{ key: 'left', name: 'Left pad', mode: (leftTouchpadModeValue ?? '').toUpperCase() }, { key: 'right', name: 'Right pad', mode: (rightTouchpadModeValue ?? '').toUpperCase() }]
          : [{ key: 'touchpad', name: 'Touchpad', mode: (touchpadModeValue ?? '').toUpperCase() }]}
        minCutoff={touchpadMinCutoffValue}
        speedCoeff={touchpadSpeedCoeffValue}
        movementThreshold={touchpadMovementThresholdValue}
        liftSpeed={Number(getKeymapValue(effectiveConfigText, 'TOUCHPAD_LIFT_SPEED') ?? 150)}
        clickDampen={touchpadClickDampenValue}
        clickDampenThreshold={touchpadClickDampenThresholdValue}
        trackballDecay={touchpadTrackballDecayValue}
        trackballMinVelocity={touchpadTrackballMinVelocityValue}
        hapticIntensity={touchpadHapticIntensityValue}
        hapticEffect={touchpadHapticEffectValue}
        hapticInterval={touchpadHapticIntervalValue}
        clickHapticIntensity={touchpadClickHapticIntensityValue}
        clickHapticEffect={touchpadClickHapticEffectValue}
        releaseHapticIntensity={touchpadReleaseHapticIntensityValue}
        releaseHapticEffect={touchpadReleaseHapticEffectValue}
        livePressure={{ left: device?.status?.leftPad?.pressure, right: device?.status?.rightPad?.pressure }}
        onMinCutoffChange={handleTouchpadMinCutoffChange}
        onSpeedCoeffChange={handleTouchpadSpeedCoeffChange}
        onMovementThresholdChange={handleTouchpadMovementThresholdChange}
        onLiftSpeedChange={value => setConfigText(previous => updateKeymapEntry(previous, 'TOUCHPAD_LIFT_SPEED', [value]))}
        onClickDampenChange={handleTouchpadClickDampenChange}
        onClickDampenThresholdChange={handleTouchpadClickDampenThresholdChange}
        onTrackballDecayChange={handleTouchpadTrackballDecayChange}
        onTrackballMinVelocityChange={handleTouchpadTrackballMinVelocityChange}
        onHapticIntensityChange={handleTouchpadHapticIntensityChange}
        onHapticEffectChange={handleTouchpadHapticEffectChange}
        onHapticIntervalChange={handleTouchpadHapticIntervalChange}
        onClickHapticIntensityChange={handleTouchpadClickHapticIntensityChange}
        onClickHapticEffectChange={handleTouchpadClickHapticEffectChange}
        onReleaseHapticIntensityChange={handleTouchpadReleaseHapticIntensityChange}
        onReleaseHapticEffectChange={handleTouchpadReleaseHapticEffectChange}
        accel={touchpadAccelValues ? {
          values: touchpadAccelValues,
          gyroShape: sensitivity,
          link: accelCurveLinkValue,
          liveSpeed: Math.max(0, ...(sample?.devices ?? []).flatMap(d => [d.status?.leftPad?.speed ?? 0, d.status?.rightPad?.speed ?? 0])),
          onCurveChange: handleTouchpadAccelCurveChange,
          onParamChange: handleTouchpadAccelParamChange,
          onLinkChange: handleAccelCurveLinkChange,
        } : undefined}
      />
      <GripSensorsSheet
        open={sheet === 'gripSensors'}
        onClose={() => setSheet(null)}
        liveGrips={device?.status ? { left: !!device.status.leftGrip?.pressed, right: !!device.status.rightGrip?.pressed } : null}
        steamController={device?.type === 24}
        sensorRange={gripSensorRangeValue}
        flickerGuard={gripFlickerGuardValue}
        leftReleaseDelay={getKeymapValue(effectiveConfigText, 'LEFT_GRIP_RELEASE_DELAY') ?? ''}
        rightReleaseDelay={getKeymapValue(effectiveConfigText, 'RIGHT_GRIP_RELEASE_DELAY') ?? ''}
        hapticIntensity={gripHapticIntensityValue}
        hapticEffect={gripHapticEffectValue}
        releaseHapticIntensity={gripReleaseHapticIntensityValue}
        releaseHapticEffect={gripReleaseHapticEffectValue}
        leftGripHaptics={leftGripHapticsValue}
        rightGripHaptics={rightGripHapticsValue}
        onSensorRangeChange={handleGripSensorRangeChange}
        onFlickerGuardChange={handleGripFlickerGuardChange}
        onReleaseDelayChange={(side, value) => setConfigText(previous => value === '' ? removeKeymapEntry(previous, `${side}_GRIP_RELEASE_DELAY`) : updateKeymapEntry(previous, `${side}_GRIP_RELEASE_DELAY`, [value]))}
        onHapticIntensityChange={handleGripHapticIntensityChange}
        onHapticEffectChange={handleGripHapticEffectChange}
        onReleaseHapticIntensityChange={handleGripReleaseHapticIntensityChange}
        onReleaseHapticEffectChange={handleGripReleaseHapticEffectChange}
        onLeftGripHapticsChange={handleLeftGripHapticsChange}
        onRightGripHapticsChange={handleRightGripHapticsChange}
      />
      <OnScreenMenus
        open={menusOpen}
        onClose={() => setMenusOpen(false)}
        configName={currentLibraryProfile ?? 'Configuration'}
        origin={selectedMenu}
        originLayerId={layerId}
        surfaces={menuSurfaces}
        onChange={setConfigTextFor}
        padAspect={padAspectFromDevices(sample?.devices)}
      />
    </>
  )

  const renderProfileManager = () => (<ProfileManager
                currentProfileName={currentLibraryProfile}
                appliedProfileName={appliedProfileName}
                hasPendingChanges={hasPendingChanges}
                isCalibrating={isCalibrating}
                profileApplied={currentLibraryProfile === appliedProfileName && documentText === runtimeConfig}
                onImportProfile={handleImportProfile}
                libraryProfiles={libraryProfiles}
                libraryLoading={isLibraryLoading}
                editedProfileNames={editedLibraryNames}
                onProfileNameChange={handleLibraryProfileNameChange}
                onRenameProfile={handleRenameProfile}
                onDeleteProfile={handleDeleteLibraryProfile}
                onAddProfile={handleCreateProfile}
                onLoadLibraryProfile={requestLoadProfile}
                onCopyActiveProfile={handleCopyActiveProfile}
                templateNames={templateNames}
                editingDetails={{
                  output: virtualControllerType === 'XBOX' ? 'Virtual Xbox' : virtualControllerType === 'DS4' ? 'Virtual DualShock 4' : 'Keyboard and mouse only',
                  imports: [...templateNames],
                  layers: layers.map((layer, index) => ({ name: layer.name, color: layerColor(index) })),
                }}
                onApply={handleApplyWithFinalize}
                onShowInFolder={handleOpenConfigDirectory}
                onEditSource={() => { setConfigWindowPosition(null); setConfigDrawerOpen(true) }}
                // X / Apply on a row that is not being edited (Studio Home 8a):
                // open it through the unsaved guard, then apply it. With edits
                // pending the guard's dialog takes over and the apply waits for
                // the person's answer.
                onApplyLibraryProfile={async name => {
                  if (name === currentLibraryProfile) { void runEditorAction('apply'); return }
                  if (hasPendingChanges) { requestLoadProfile(name); return }
                  const profile = await desktopBridge.loadLibraryProfile(name)
                  if (!profile) { showToast(t('messages.loadProfileFailed'), 'error'); return }
                  await handleLoadProfileFromLibrary(name)
                  await applyConfig({ textOverride: profile.content, profileNameOverride: name })
                }}
                family={controllerFamily}
              />)

  const renderPrimaryContent = () => {
    if (primaryTab === 'home') return renderHome()
    if (primaryTab === 'configurations') return <div className="settings-page configuration-library">
      <Suspense fallback={<LazyPanelFallback title="Configurations" />}>{renderProfileManager()}</Suspense>
    </div>
    if (primaryTab === 'associations') return <AssociationsPage libraryProfiles={libraryProfiles} autoloadEnabled={autoloadEnabled}
      runtimeBusy={runtimeMappingBusy} onAutoloadEnabledChange={handleAutoloadEnabledChange} />
    if (primaryTab === 'layers') {
      // Live only when the mapper is running the configuration on this page.
      const running = runningProfilePath
      const runningName = running.split(/[\\/]/).pop()?.replace(/\.txt$/i, '') ?? ''
      const isThis = !!currentLibraryProfile && runningName.toLowerCase() === currentLibraryProfile.toLowerCase()
      const stack = isThis ? (layerStack && layerStack.profile.split(/[\\/]/).pop()?.replace(/\.txt$/i, '').toLowerCase() === runningName.toLowerCase() ? layerStack : { profile: running, layers: [] }) : null
      return <LayersPage text={documentText} layers={layers} selected={layerId} onChange={setDocumentText} onSelect={selectCreatedLayer} disabled={isCalibrating} family={controllerVisualFamily(sample?.devices?.[0]?.type)}
        liveStack={mapperExit ? null : stack} liveProfileName={!isThis && runningName ? runningName : null} />
    }
    // Preferences (Tuning and Studio Pages 16j): appearance and startup on the
    // left, the controller on the right.
    if (primaryTab === 'settings') return <div className="prefs-columns">
      {/* Each column is its own region for the pad's Up/Down. */}
      <div className="prefs-column" data-nav-region="appearance">
        <h3 className="prefs-eyebrow">Appearance</h3>
        <div className={sideNavStyles.navSettings}>
          <LanguageSelect className={sideNavStyles.navLanguageSelect} />
          <ThemeToggle className={sideNavStyles.navThemeToggle} />
        </div>
        <h3 className="prefs-eyebrow">Startup</h3>
        <div className={sideNavStyles.navSettings}><AutostartToggle /></div>
        <ControllerPreferences part="sounds" />
        <p className="settings-version">JSM Studio v{tauriConf.version}</p>
      </div>
      <div className="prefs-column" data-nav-region="controller">
        <h3 className="prefs-eyebrow">Controller</h3>
        <div className={sideNavStyles.navSettings}>
          <ControllerNavToggle />
          <TrackpadOverlayToggle />
          <CalibrationHudToggle />
          <ControllerFeedbackSetting className={sideNavStyles.navThemeToggle} />
        </div>
        <ControllerPreferences part="calibration" />
        {/* Set where it is used, so this says where rather than carrying a second copy. */}
        <div className="prefs-link-row">
          <span><b>Virtual output</b><small>Set from the Mapping plate in the title bar, where Bind whole controller lives too.</small></span>
        </div>
      </div>
    </div>

    if (primaryTab === 'gyro') {
      // The settings-page template (Gyro.dc.html): GyroPage draws the seven
      // sections; each carries data-section, which is how the section list
      // finds them.
      return (
        <Suspense fallback={<LazyPanelFallback title={t(pageMeta('gyro').labelKey, pageMeta('gyro').label)} />}>
          <GyroPage
            devices={sample?.devices}
            sensitivity={sensitivity}
            modeshiftSensitivity={modeshiftSensitivity}
            gyroActivationMode={gyroActivation.mode}
            gyroActivationButton={gyroActivation.button}
            touchpadMode={touchpadModeValue}
            touchpadGridCells={gyroGridCommands.length}
            touchpadGridCommands={gyroGridCommands}
            isCalibrating={isCalibrating}
            statusMessage={statusMessage}
            ignoredDevices={ignoredGyroDevices}
            onToggleIgnoreDevice={handleToggleIgnoreGyroDevice}
            onInGameSensChange={handleInGameSensChange}
            onRealWorldCalibrationChange={handleRealWorldCalibrationChange}
            onGyroSpaceChange={handleGyroSpaceChange}
            onGyroAxisXChange={handleGyroAxisXChange}
            onGyroAxisYChange={handleGyroAxisYChange}
            onGyroOutputChange={handleGyroOutputChange}
            onGyroActivationModeChange={handleGyroActivationModeChange}
            onGyroActivationButtonChange={handleGyroActivationButtonChange}
            counterOsMouseSpeed={counterOsMouseSpeedEnabled}
            onCounterOsMouseSpeedChange={handleCounterOsMouseSpeedChange}
            onOpenCalibration={handleOpenCalibration}
            onOpenRwcGuide={() => setIsRwcGuideModalOpen(true)}
            hasPendingChanges={hasPendingChanges}
            onApply={handleApplyWithFinalize}
            onCancel={handleCancel}
            lockMessage={lockMessage}
            mode={currentMode}
            sensitivityView={sensitivityView}
            sample={sample}
            telemetry={telemetryValues}
            onModeChange={(mode: 'static' | 'accel') => handleModeSelection(mode, activeSensitivityPrefix)}
            onSensitivityViewChange={setSensitivityView}
            onAccelCurveChange={handleAccelCurveChange}
            onNaturalVHalfChange={handleNaturalVHalfChange}
            onPowerVRefChange={handlePowerVRefChange}
            onPowerExponentChange={handlePowerExponentChange}
            onSigmoidMidChange={handleSigmoidMidChange}
            onSigmoidWidthChange={handleSigmoidWidthChange}
            onJumpTauChange={handleJumpTauChange}
            onMinThresholdChange={handleThresholdChange('MIN_GYRO_THRESHOLD')}
            onMaxThresholdChange={handleThresholdChange('MAX_GYRO_THRESHOLD')}
            onMinSensXChange={handleDualSensChange('MIN_GYRO_SENS', 0)}
            onMinSensYChange={handleDualSensChange('MIN_GYRO_SENS', 1)}
            onMaxSensXChange={handleDualSensChange('MAX_GYRO_SENS', 0)}
            onMaxSensYChange={handleDualSensChange('MAX_GYRO_SENS', 1)}
            onStaticSensXChange={handleStaticSensChange(0)}
            onStaticSensYChange={handleStaticSensChange(1)}
            onRollContributionChange={handleRollContributionChange}
            modeshiftButton={sensitivityModeshiftButton}
            onModeshiftButtonChange={handleSensitivityModeshiftButtonChange}
            accelCurveLink={accelCurveLinkValue}
            onAccelCurveLinkChange={handleAccelCurveLinkChange}
            onCutoffSpeedChange={handleCutoffSpeedChange}
            onCutoffRecoveryChange={handleCutoffRecoveryChange}
            onSmoothTimeChange={handleSmoothTimeChange}
            onSmoothThresholdChange={handleSmoothThresholdChange}
            onSmoothingDecayChange={handleSmoothingDecayChange}
            onOneEuroFilterChange={handleOneEuroFilterChange}
            onOneEuroMinCutoffChange={handleOneEuroMinCutoffChange}
            onOneEuroSpeedCoeffChange={handleOneEuroSpeedCoeffChange}
            onAngleSnapChange={handleAngleSnapChange}
            onAngleSnapSmoothChange={handleAngleSnapSmoothChange}
            onDecelBrakeStrengthChange={handleDecelBrakeStrengthChange}
            onDecelBrakeThresholdChange={handleDecelBrakeThresholdChange}
            onGyroClickDampenChange={handleGyroClickDampenChange}
          />
        </Suspense>
      )
    }

    if (primaryTab === 'timing') {
      // Press timing & polling (2f): a Studio page on the global store.
      return <TimingPage onRemoveLines={removeTimingLines} libraryKey={libraryProfiles.join('|')} />
    }

    if (primaryTab in CONTROL_TAB_SECTIONS) {
      const controlTab = primaryTab as ControlTab
      const sections = CONTROL_TAB_SECTIONS[controlTab]
      return (
        <Suspense fallback={<LazyPanelFallback title={t(`app.nav.${controlTab}`)} />}>
          <KeymapControls
            onConfigTextChange={setConfigText}
            visibleSections={sections}
            bindingLabels={bindingLabels}
            onBindingLabelChange={handleBindingLabelChange}
            bindingIcons={bindingIcons}
            onBindingIconChange={handleBindingIconChange}
            configText={configText}
            effectiveConfigText={effectiveConfigText}
            configIncludes={configIncludes.resolution}
            libraryProfiles={libraryProfiles}
            currentProfileName={currentLibraryProfile}
            onOpenConfigEditor={() => setConfigDrawerOpen(true)}
            hasPendingChanges={hasPendingChanges}
            isCalibrating={isCalibrating}
            statusMessage={statusMessage}
            onApply={handleApplyWithFinalize}
            onCancel={handleCancel}
            onBindingChange={handleFaceButtonBindingChange}
            onAssignSpecialAction={handleSpecialActionAssignment}
            onClearSpecialAction={handleClearSpecialAction}
            trackballDecay={trackballDecayValue}
            onTrackballDecayChange={handleTrackballDecayChange}
            holdPressTimeSeconds={holdPressTimeSeconds}
            holdPressTimeIsCustom={holdPressTimeIsCustom}
            holdPressTimeDefault={DEFAULT_HOLD_PRESS_TIME}
            onHoldPressTimeChange={handleHoldPressTimeChange}
            doublePressWindowSeconds={doublePressWindowSeconds}
            doublePressWindowIsCustom={doublePressWindowIsCustom}
            onDoublePressWindowChange={handleDoublePressWindowChange}
            simPressWindowSeconds={simPressWindowSeconds}
            simPressWindowIsCustom={simPressWindowIsCustom}
            onSimPressWindowChange={handleSimPressWindowChange}
            lightBarColor={lightBarColor}
            onLightBarChange={handleLightBarChange}
            triggerThreshold={triggerThresholdValue}
            onTriggerThresholdChange={handleTriggerThresholdChange}
            onModifierChange={handleModifierChange}
            touchpadMode={touchpadModeValue}
            touchpadMinCutoff={touchpadMinCutoffValue}
            touchpadSpeedCoeff={touchpadSpeedCoeffValue}
            touchpadTrackballDecay={touchpadTrackballDecayValue}
            touchpadTrackballMinVelocity={touchpadTrackballMinVelocityValue}
            onTouchpadMinCutoffChange={handleTouchpadMinCutoffChange}
            onTouchpadSpeedCoeffChange={handleTouchpadSpeedCoeffChange}
            onTouchpadTrackballDecayChange={handleTouchpadTrackballDecayChange}
            onTouchpadTrackballMinVelocityChange={handleTouchpadTrackballMinVelocityChange}
            leftGripHaptics={leftGripHapticsValue}
            rightGripHaptics={rightGripHapticsValue}
            onLeftGripHapticsChange={handleLeftGripHapticsChange}
            onRightGripHapticsChange={handleRightGripHapticsChange}
            gripSensorRange={gripSensorRangeValue}
            gripFlickerGuard={gripFlickerGuardValue}
            gripHapticIntensity={gripHapticIntensityValue}
            gripHapticEffect={gripHapticEffectValue}
            gripReleaseHapticIntensity={gripReleaseHapticIntensityValue}
            gripReleaseHapticEffect={gripReleaseHapticEffectValue}
            onGripSensorRangeChange={handleGripSensorRangeChange}
            onGripFlickerGuardChange={handleGripFlickerGuardChange}
            onGripHapticIntensityChange={handleGripHapticIntensityChange}
            onGripHapticEffectChange={handleGripHapticEffectChange}
            onGripReleaseHapticIntensityChange={handleGripReleaseHapticIntensityChange}
            onGripReleaseHapticEffectChange={handleGripReleaseHapticEffectChange}
            touchpadDualStageMode={touchpadDualStageModeValue}
            touchpadGridRequiresClick={gridRequiresClickValue}
            leftTouchpadMode={leftTouchpadModeValue}
            rightTouchpadMode={rightTouchpadModeValue}
            leftTouchpadDualStageMode={leftTouchpadDualStageModeValue}
            rightTouchpadDualStageMode={rightTouchpadDualStageModeValue}
            leftGridRequiresClick={leftGridRequiresClickValue}
            rightGridRequiresClick={rightGridRequiresClickValue}
            onLeftTouchpadModeChange={handleLeftTouchpadModeChange}
            onRightTouchpadModeChange={handleRightTouchpadModeChange}
            onLeftTouchpadDualStageModeChange={handleLeftTouchpadDualStageModeChange}
            onRightTouchpadDualStageModeChange={handleRightTouchpadDualStageModeChange}
            onTouchpadGridRequiresClickChange={handleGridRequiresClickChange}
            onLeftGridRequiresClickChange={handleLeftGridRequiresClickChange}
            onRightGridRequiresClickChange={handleRightGridRequiresClickChange}
            leftGridColumns={leftGridSizeValue.columns}
            leftGridRows={leftGridSizeValue.rows}
            rightGridColumns={rightGridSizeValue.columns}
            rightGridRows={rightGridSizeValue.rows}
            onLeftGridSizeChange={handleLeftGridSizeChange}
            onRightGridSizeChange={handleRightGridSizeChange}
            gridShape={gridShapeValue}
            leftGridShape={leftGridShapeValue}
            rightGridShape={rightGridShapeValue}
            gridDeadzone={gridDeadzoneValue}
            leftGridDeadzone={leftGridDeadzoneValue}
            rightGridDeadzone={rightGridDeadzoneValue}
            onGridShapeChange={handleGridShapeChange}
            onLeftGridShapeChange={handleLeftGridShapeChange}
            onRightGridShapeChange={handleRightGridShapeChange}
            onGridDeadzoneChange={handleGridDeadzoneChange}
            onLeftGridDeadzoneChange={handleLeftGridDeadzoneChange}
            onRightGridDeadzoneChange={handleRightGridDeadzoneChange}
            devices={sample?.devices}
            leftTouchpadSensitivity={leftTouchpadSensitivityValue}
            rightTouchpadSensitivity={rightTouchpadSensitivityValue}
            onLeftTouchpadSensitivityChange={handleLeftTouchpadSensitivityChange}
            onRightTouchpadSensitivityChange={handleRightTouchpadSensitivityChange}
            leftTouchpadSensitivityY={leftTouchpadSensitivityYValue}
            rightTouchpadSensitivityY={rightTouchpadSensitivityYValue}
            onLeftTouchpadSensitivityYChange={handleLeftTouchpadSensitivityYChange}
            onRightTouchpadSensitivityYChange={handleRightTouchpadSensitivityYChange}
            gridColumns={gridSizeValue.columns}
            gridRows={gridSizeValue.rows}
            touchDeadzoneInner={touchDeadzoneInnerValue}
            touchRingMode={touchRingModeValue}
            touchStickMode={touchStickModeValue}
            touchStickRadius={touchStickRadiusValue}
            touchStickAxis={touchStickAxisValue}
            touchpadWarnings={touchpadWarnings}
            touchpadAccelValues={touchpadAccelValues}
            accelCurveLink={accelCurveLinkValue}
            gyroAccelShape={sensitivity}
            onTouchpadAccelCurveChange={handleTouchpadAccelCurveChange}
            onTouchpadAccelParamChange={handleTouchpadAccelParamChange}
            onAccelCurveLinkChange={handleAccelCurveLinkChange}
            stickDeadzoneSettings={{
              defaults: stickDeadzoneDefaults,
              left: leftStickDeadzone,
              right: rightStickDeadzone,
            }}
            stickModeSettings={stickModes}
            onStickDeadzoneChange={handleStickDeadzoneChange}
            onStickModeChange={handleStickModeChange}
            onRingModeChange={handleRingModeChange}
            stickModeShiftAssignments={stickModeShiftAssignments}
            onStickModeShiftChange={handleStickModeShiftChange}
            adaptiveTriggerValue={adaptiveTriggerValue}
            onAdaptiveTriggerChange={handleAdaptiveTriggerChange}
            zlModeValue={zlModeValue}
            zrModeValue={zrModeValue}
            onZlModeChange={handleZlModeChange}
            onZrModeChange={handleZrModeChange}
            stickAimSettings={stickAimSettings}
            stickAimHandlers={stickAimHandlers}
            stickFlickSettings={stickFlickSettings}
            stickFlickHandlers={stickFlickHandlers}
            mouseRingRadius={mouseRingRadiusValue}
            onMouseRingRadiusChange={handleMouseRingRadiusChange}
            scrollSens={scrollSensValue}
            onScrollSensChange={handleScrollSensChange}
            lockMessage={lockMessage}
            selectedMappingCommand={selectedMappingCommand}
            onSelectedMappingCommandChange={setSelectedMappingCommand}
            virtualControllerType={virtualControllerType}
            virtualControllerWarnings={virtualControllerWarnings}
            onVirtualControllerTypeChange={handleVirtualControllerTypeChange}
            onBindGamepadPassthrough={handleBindGamepadPassthrough}
            onBindDirectionsToWasd={handleBindDirectionsToWasd}
          />
        </Suspense>
      )
    }

    if (primaryTab === 'touchpad') {
      // The trackpads page is for what the pads are bound to; how a mouse pad
      // feels opens as the Mouse feel sheet from its row.
      const sections = ['touch-grid', 'touch-stick', 'touch-bind']
      const panel = (
        <Suspense fallback={<LazyPanelFallback title={t('app.nav.touchpad')} />}>
          <KeymapControls
            onConfigTextChange={setConfigText}
            onOpenTuning={() => setSheet('mouseFeel')}
            view="touchpad"
            selectedMappingCommand={selectedMappingCommand}
            configText={configText}
            effectiveConfigText={effectiveConfigText}
            configIncludes={configIncludes.resolution}
            libraryProfiles={libraryProfiles}
            currentProfileName={currentLibraryProfile}
            onOpenConfigEditor={() => setConfigDrawerOpen(true)}
            hasPendingChanges={hasPendingChanges}
            isCalibrating={isCalibrating}
            statusMessage={statusMessage}
            onApply={handleApplyWithFinalize}
            onCancel={handleCancel}
            onBindingChange={handleFaceButtonBindingChange}
            onAssignSpecialAction={handleSpecialActionAssignment}
            onClearSpecialAction={handleClearSpecialAction}
            trackballDecay={trackballDecayValue}
            onTrackballDecayChange={handleTrackballDecayChange}
            holdPressTimeSeconds={holdPressTimeSeconds}
            holdPressTimeIsCustom={holdPressTimeIsCustom}
            holdPressTimeDefault={DEFAULT_HOLD_PRESS_TIME}
            onHoldPressTimeChange={handleHoldPressTimeChange}
            doublePressWindowSeconds={doublePressWindowSeconds}
            doublePressWindowIsCustom={doublePressWindowIsCustom}
            onDoublePressWindowChange={handleDoublePressWindowChange}
            simPressWindowSeconds={simPressWindowSeconds}
            simPressWindowIsCustom={simPressWindowIsCustom}
            onSimPressWindowChange={handleSimPressWindowChange}
            lightBarColor={lightBarColor}
            onLightBarChange={handleLightBarChange}
            triggerThreshold={triggerThresholdValue}
            onTriggerThresholdChange={handleTriggerThresholdChange}
            onModifierChange={handleModifierChange}
            touchpadMode={touchpadModeValue}
            touchpadMinCutoff={touchpadMinCutoffValue}
            touchpadSpeedCoeff={touchpadSpeedCoeffValue}
            touchpadTrackballDecay={touchpadTrackballDecayValue}
            touchpadTrackballMinVelocity={touchpadTrackballMinVelocityValue}
            onTouchpadMinCutoffChange={handleTouchpadMinCutoffChange}
            onTouchpadSpeedCoeffChange={handleTouchpadSpeedCoeffChange}
            onTouchpadTrackballDecayChange={handleTouchpadTrackballDecayChange}
            onTouchpadTrackballMinVelocityChange={handleTouchpadTrackballMinVelocityChange}
            touchpadMovementThreshold={touchpadMovementThresholdValue}
            onTouchpadMovementThresholdChange={handleTouchpadMovementThresholdChange}
            touchpadClickDampen={touchpadClickDampenValue}
            touchpadClickDampenThreshold={touchpadClickDampenThresholdValue}
            onTouchpadClickDampenChange={handleTouchpadClickDampenChange}
            onTouchpadClickDampenThresholdChange={handleTouchpadClickDampenThresholdChange}
            touchpadHapticIntensity={touchpadHapticIntensityValue}
            touchpadHapticEffect={touchpadHapticEffectValue}
            touchpadHapticInterval={touchpadHapticIntervalValue}
            touchpadClickHapticIntensity={touchpadClickHapticIntensityValue}
            touchpadClickHapticEffect={touchpadClickHapticEffectValue}
            touchpadReleaseHapticIntensity={touchpadReleaseHapticIntensityValue}
            touchpadReleaseHapticEffect={touchpadReleaseHapticEffectValue}
            onTouchpadHapticIntensityChange={handleTouchpadHapticIntensityChange}
            onTouchpadHapticEffectChange={handleTouchpadHapticEffectChange}
            onTouchpadHapticIntervalChange={handleTouchpadHapticIntervalChange}
            onTouchpadClickHapticIntensityChange={handleTouchpadClickHapticIntensityChange}
            onTouchpadClickHapticEffectChange={handleTouchpadClickHapticEffectChange}
            onTouchpadReleaseHapticIntensityChange={handleTouchpadReleaseHapticIntensityChange}
            onTouchpadReleaseHapticEffectChange={handleTouchpadReleaseHapticEffectChange}
            leftGripHaptics={leftGripHapticsValue}
            rightGripHaptics={rightGripHapticsValue}
            onLeftGripHapticsChange={handleLeftGripHapticsChange}
            onRightGripHapticsChange={handleRightGripHapticsChange}
            gripSensorRange={gripSensorRangeValue}
            gripFlickerGuard={gripFlickerGuardValue}
            gripHapticIntensity={gripHapticIntensityValue}
            gripHapticEffect={gripHapticEffectValue}
            gripReleaseHapticIntensity={gripReleaseHapticIntensityValue}
            gripReleaseHapticEffect={gripReleaseHapticEffectValue}
            onGripSensorRangeChange={handleGripSensorRangeChange}
            onGripFlickerGuardChange={handleGripFlickerGuardChange}
            onGripHapticIntensityChange={handleGripHapticIntensityChange}
            onGripHapticEffectChange={handleGripHapticEffectChange}
            onGripReleaseHapticIntensityChange={handleGripReleaseHapticIntensityChange}
            onGripReleaseHapticEffectChange={handleGripReleaseHapticEffectChange}
            touchpadDualStageMode={touchpadDualStageModeValue}
            touchpadGridRequiresClick={gridRequiresClickValue}
            leftTouchpadMode={leftTouchpadModeValue}
            rightTouchpadMode={rightTouchpadModeValue}
            leftTouchpadDualStageMode={leftTouchpadDualStageModeValue}
            rightTouchpadDualStageMode={rightTouchpadDualStageModeValue}
            leftGridRequiresClick={leftGridRequiresClickValue}
            rightGridRequiresClick={rightGridRequiresClickValue}
            onLeftTouchpadModeChange={handleLeftTouchpadModeChange}
            onRightTouchpadModeChange={handleRightTouchpadModeChange}
            onLeftTouchpadDualStageModeChange={handleLeftTouchpadDualStageModeChange}
            onRightTouchpadDualStageModeChange={handleRightTouchpadDualStageModeChange}
            onTouchpadGridRequiresClickChange={handleGridRequiresClickChange}
            onLeftGridRequiresClickChange={handleLeftGridRequiresClickChange}
            onRightGridRequiresClickChange={handleRightGridRequiresClickChange}
            leftGridColumns={leftGridSizeValue.columns}
            leftGridRows={leftGridSizeValue.rows}
            rightGridColumns={rightGridSizeValue.columns}
            rightGridRows={rightGridSizeValue.rows}
            onLeftGridSizeChange={handleLeftGridSizeChange}
            onRightGridSizeChange={handleRightGridSizeChange}
            gridShape={gridShapeValue}
            leftGridShape={leftGridShapeValue}
            rightGridShape={rightGridShapeValue}
            gridDeadzone={gridDeadzoneValue}
            leftGridDeadzone={leftGridDeadzoneValue}
            rightGridDeadzone={rightGridDeadzoneValue}
            onGridShapeChange={handleGridShapeChange}
            onLeftGridShapeChange={handleLeftGridShapeChange}
            onRightGridShapeChange={handleRightGridShapeChange}
            onGridDeadzoneChange={handleGridDeadzoneChange}
            onLeftGridDeadzoneChange={handleLeftGridDeadzoneChange}
            onRightGridDeadzoneChange={handleRightGridDeadzoneChange}
            devices={sample?.devices}
            leftTouchpadSensitivity={leftTouchpadSensitivityValue}
            rightTouchpadSensitivity={rightTouchpadSensitivityValue}
            onLeftTouchpadSensitivityChange={handleLeftTouchpadSensitivityChange}
            onRightTouchpadSensitivityChange={handleRightTouchpadSensitivityChange}
            leftTouchpadSensitivityY={leftTouchpadSensitivityYValue}
            rightTouchpadSensitivityY={rightTouchpadSensitivityYValue}
            onLeftTouchpadSensitivityYChange={handleLeftTouchpadSensitivityYChange}
            onRightTouchpadSensitivityYChange={handleRightTouchpadSensitivityYChange}
            onTouchpadModeChange={handleTouchpadModeChange}
            onTouchpadDualStageModeChange={handleTouchpadDualStageModeChange}
            gridColumns={gridSizeValue.columns}
            gridRows={gridSizeValue.rows}
            onGridSizeChange={handleGridSizeChange}
            touchpadSensitivity={touchpadSensitivityValue}
            onTouchpadSensitivityChange={handleTouchpadSensitivityChange}
            touchpadSensitivityY={touchpadSensitivityYValue}
            onTouchpadSensitivityYChange={handleTouchpadSensitivityYChange}
            touchStickMode={touchStickModeValue}
            leftTouchStickMode={leftTouchStickModeValue}
            rightTouchStickMode={rightTouchStickModeValue}
            touchDeadzoneInner={touchDeadzoneInnerValue}
            leftTouchDeadzoneInner={leftTouchDeadzoneInnerValue}
            rightTouchDeadzoneInner={rightTouchDeadzoneInnerValue}
            touchRingMode={touchRingModeValue}
            leftTouchRingMode={leftTouchRingModeValue}
            rightTouchRingMode={rightTouchRingModeValue}
            touchStickRadius={touchStickRadiusValue}
            leftTouchStickRadius={leftTouchStickRadiusValue}
            rightTouchStickRadius={rightTouchStickRadiusValue}
            touchStickAxis={touchStickAxisValue}
            leftTouchStickAxis={leftTouchStickAxisValue}
            rightTouchStickAxis={rightTouchStickAxisValue}
            onTouchDeadzoneInnerChange={handleTouchDeadzoneInnerChange}
            onLeftTouchDeadzoneInnerChange={handleLeftTouchDeadzoneInnerChange}
            onRightTouchDeadzoneInnerChange={handleRightTouchDeadzoneInnerChange}
            onTouchRingModeChange={handleTouchRingModeChange}
            onLeftTouchRingModeChange={handleLeftTouchRingModeChange}
            onRightTouchRingModeChange={handleRightTouchRingModeChange}
            onTouchStickModeChange={handleTouchStickModeChange}
            onLeftTouchStickModeChange={handleLeftTouchStickModeChange}
            onRightTouchStickModeChange={handleRightTouchStickModeChange}
            onTouchStickRadiusChange={handleTouchStickRadiusChange}
            onLeftTouchStickRadiusChange={handleLeftTouchStickRadiusChange}
            onRightTouchStickRadiusChange={handleRightTouchStickRadiusChange}
            onTouchStickAxisChange={handleTouchStickAxisChange}
            onLeftTouchStickAxisChange={handleLeftTouchStickAxisChange}
            onRightTouchStickAxisChange={handleRightTouchStickAxisChange}
            touchpadWarnings={touchpadWarnings}
            touchpadAccelValues={touchpadAccelValues}
            accelCurveLink={accelCurveLinkValue}
            gyroAccelShape={sensitivity}
            onTouchpadAccelCurveChange={handleTouchpadAccelCurveChange}
            onTouchpadAccelParamChange={handleTouchpadAccelParamChange}
            onAccelCurveLinkChange={handleAccelCurveLinkChange}
            stickDeadzoneSettings={{
              defaults: stickDeadzoneDefaults,
              left: leftStickDeadzone,
              right: rightStickDeadzone,
            }}
            stickModeSettings={stickModes}
            onStickDeadzoneChange={handleStickDeadzoneChange}
            onStickModeChange={handleStickModeChange}
            onRingModeChange={handleRingModeChange}
            stickModeShiftAssignments={stickModeShiftAssignments}
            onStickModeShiftChange={handleStickModeShiftChange}
            adaptiveTriggerValue={adaptiveTriggerValue}
            onAdaptiveTriggerChange={handleAdaptiveTriggerChange}
            zlModeValue={zlModeValue}
            zrModeValue={zrModeValue}
            onZlModeChange={handleZlModeChange}
            onZrModeChange={handleZrModeChange}
            stickAimSettings={stickAimSettings}
            stickAimHandlers={stickAimHandlers}
            lockMessage={lockMessage}
            visibleSections={sections}
            bindingLabels={bindingLabels}
            onBindingLabelChange={handleBindingLabelChange}
            bindingIcons={bindingIcons}
            onBindingIconChange={handleBindingIconChange}
            onBindDirectionsToWasd={handleBindDirectionsToWasd}
          />
        </Suspense>
      )

      // Jumping between Left pad / Right pad / tuning sections is now the
      // sidebar's job (see subNavByTab below); these pages just render their
      // one tall column.
      return panel
    }

    if (primaryTab === 'overview') {
      return (
        <OverviewPage
          configName={currentLibraryProfile}
          onSelectLayer={selectLayer}
          disabled={isCalibrating}
          devices={sample?.devices}
          onNavigate={(target) => setPrimaryTab(target)}
          onSelectCommand={navigateInput}
          onRecalibrate={() => { void handleRecalibrate() }}
          recalibrating={recalibrating || isCalibrating}
          // The diagram is read-only and should show what the controller
          // actually does, imported bindings included.
          configText={effectiveConfigText}
          virtualOutput={virtualControllerType === 'XBOX' ? 'virtual Xbox' : virtualControllerType === 'DS4' ? 'virtual DualShock 4' : undefined}
        />
      )
    }

    if (primaryTab === 'globalChords') {
      return (
        <Suspense fallback={<LazyPanelFallback title={t('app.nav.globalChords')} />}>
          <GlobalChordsPage devices={sample?.devices} onChordsChanged={() => { void refreshLibraryProfiles() }}
            reservedChords={reservedChords} onReservedChordsChange={async enabled => {
              const next = await desktopBridge.setReservedChords(enabled)
              if (next) setReservedChords(!!next.reservedChords)
              else showToast('Could not change the reserved chords.', 'error')
            }} />
        </Suspense>
      )
    }

    if (primaryTab === 'deviceVisibility') {
      return <HidHidePage telemetryDevices={sample?.devices} virtualOutput={virtualControllerType} />
    }

    if (primaryTab === 'debugConsole') {
      return (
        <Suspense fallback={<LazyPanelFallback title={t('app.nav.debugConsole')} />}>
          <MappingDebugPage
            consoleText={typeof sample?.console === 'string' ? sample.console : undefined}
            configText={configText}
            appliedConfig={appliedConfig}
            hasPendingChanges={hasPendingChanges}
          />
        </Suspense>
      )
    }

    if (primaryTab === 'ai') {
      return (
        <Suspense fallback={<LazyPanelFallback title={t('app.nav.aiAssistant')} />}>
          <AiMappingPage
            configText={configText}
            currentProfileName={currentLibraryProfile}
            hasPendingChanges={hasPendingChanges}
            onReplaceConfig={setConfigText}
            onApplyGeneratedConfig={async (nextConfig) => {
              await applyConfig({ textOverride: foldConfigText(nextConfig) })
            }}
            libraryProfiles={libraryProfiles}
            // Another configuration than the one being edited: its file is
            // saved and applied as it is, the editor left alone.
            onApplyToProfile={async (name, nextConfig) => {
              const text = serializeConfig(parseConfigText(ensureHeaderLines(nextConfig)))
              if (!await desktopBridge.saveLibraryProfile(name, text)) { showToast(t('messages.saveProfileFailed'), 'error'); return }
              await applyConfig({ textOverride: text, profileNameOverride: name })
            }}
          />
        </Suspense>
      )
    }

    if (primaryTab === 'help') {
      return (
        <Suspense fallback={<LazyPanelFallback title={t('app.nav.documentation')} />}>
          <HelpDocsPage focusSetting={docsFocus} onOpenPage={setPrimaryTab} />
        </Suspense>
      )
    }

    return null
  }

  const meta = pageMeta(primaryTab)
  const studioPage = isStudioPage(primaryTab)
  const configName = currentLibraryProfile ?? t('app.profileSummary.unsavedProfile', 'Unsaved')
  const eyebrow = studioPage
    ? 'Studio'
    : primaryTab === 'overview'
      ? `${configName} · ${device ? controllerDisplayName(device.type) : 'Controller'}`
      : primaryTab === 'layers'
        ? configName
        : `${configName} · Controls`
  const tuningKind = primaryTab === 'gyro' ? 'gyro' as const : null
  const pageActions = primaryTab === 'gyro'
    ? <><span className="telemetry-chip" title="Live gyro speed and sample rate"><span className="telemetry-chip__dot" aria-hidden="true" />{telemetryValues.omega} °/s · {telemetryValues.sampleHz} Hz</span><button type="button" className="button button--secondary" onClick={handleRecalibrate} disabled={recalibrating || isCalibrating}>{recalibrating ? t('app.recalibration.recalibrating') : t('app.recalibration.recalibrateGyro')}</button></>
    : primaryTab === 'layers'
      ? <button type="button" className="button button--secondary" onClick={() => setLayerManagerOpen(true)}>Manage layers</button>
    : primaryTab === 'triggers'
      // Configuration Pages 15a: the trigger calibration flow lives on the
      // page; the header button just starts it.
      ? <button type="button" className="button button--secondary" onClick={() => window.dispatchEvent(new Event('jsm:calibrate-triggers'))}>Calibrate triggers</button>
      : primaryTab === 'globalChords'
        ? <button type="button" className="button button--primary" onClick={() => window.dispatchEvent(new Event('jsm:add-chord'))}>+ Add chord</button>
      : primaryTab === 'associations'
        ? <button type="button" className="button button--primary" onClick={() => setAutoloadModalOpen(true)}>+ Add app</button>
      : primaryTab === 'configurations'
        ? <>
            {/* Import reads a .txt from anywhere into the library. */}
            <input ref={importInputRef} type="file" accept=".txt,.cfg,.ini,*/*" hidden onChange={async event => {
              const file = event.target.files?.[0]
              if (file) handleImportProfile(file.name, await file.text())
              event.target.value = ''
            }} />
            <button type="button" className="button button--secondary" onClick={() => importInputRef.current?.click()}>Import</button>
            <button type="button" className="button button--primary" onClick={handleCreateProfile}>+ New configuration</button>
          </>
        : null

  return (
    <div className="app-shell" data-width={shellWidth} data-page-group={meta.group}>
      <ToastHost />
      <LongOperationHost />
      <FocusGlide />
      <Suspense fallback={null}>
        <UpdateBanner />
      </Suspense>
      {renderTitleBar()}
      {testing ? (
        <div className="test-banner" role="status">
          <span className="test-banner__dot" aria-hidden="true" />
          <b>Testing {currentLibraryProfile ?? 'configuration'}</b>
          <span className="test-banner__text">Your controller is running the profile. Studio navigation is paused.</span>
          <span className="test-banner__exit">Hold <ButtonGlyph button="VIEW" size={22} pad /><span>+</span><ButtonGlyph button="MENU" size={22} pad /> or press Esc to return</span>
        </div>
      ) : <div />}
      {!isHomePage(primaryTab) && <PageTabs
        width={shellWidth}
        current={primaryTab}
        onSelect={setPrimaryTab}
        status={controllerStatus}
        sectionLabel={currentSection?.label}
        drawerOpen={drawerOpen}
        onOpenDrawer={() => setDrawerOpen(true)}
      />}
      <div className="shell-body" data-width={shellWidth} data-sections={shellSections.length > 0 ? 'true' : 'false'}>
        {shellWidth !== 'narrow' && shellSections.length > 0 && <SectionList sections={shellSections} ariaLabel={`${t(meta.labelKey, meta.label)} sections`} />}
        <div className="shell-content">
          <div className="shell-scroll">
            <div key={primaryTab} className={`shell-page page${isHomePage(primaryTab) ? ' shell-page--home' : ''}${primaryTab === 'overview' ? ' page--wide' : ''}${['associations', 'globalChords', 'deviceVisibility'].includes(primaryTab) ? ' page--narrow' : ''}`} data-direction={pageDirection}>
              {mapperExit && !studioPage && !isHomePage(primaryTab)
                ? <MapperDown exit={mapperExit} restarting={mapperRestarting} onRestart={() => void restartMapper()} onOpenConsole={() => setPrimaryTab('debugConsole')} />
                : <>
              {!isHomePage(primaryTab) && <header className="page-header">
                <div className="page-header__text">
                  <span className="page-header__eyebrow">{eyebrow}</span>
                  <h1 className="page-header__title">{t(meta.labelKey, meta.label)}</h1>
                  <p className="page-header__purpose">{t(`shell.purpose.${primaryTab}`, meta.purpose)}</p>
                </div>
                {(pageActions || tuningKind) && <div className="page-header__actions">
                  {/* Copy and paste of a tuning page sit with the page's other
                      actions, not above its first row: that was where the pad
                      landed on entering the page. */}
                  {tuningKind && <TuningClipboard kind={tuningKind} text={configText} onChange={text => { resetPendingSensitivityChanges(); setConfigText(text) }} disabled={isCalibrating} />}
                  {pageActions}
                </div>}
              </header>}
          <main className={`main-pane page-body${isHomePage(primaryTab) ? ' home-body' : ''}`}>
            {mapperExit && studioPage && <MapperDown compact exit={mapperExit} restarting={mapperRestarting} onRestart={() => void restartMapper()} onOpenConsole={() => setPrimaryTab('debugConsole')} />}
            {!studioPage && !isHomePage(primaryTab) && configErrors.length > 0 && dismissedConfigErrors !== configErrorsKey && (
              <ConfigErrors errors={configErrors} appliedText={runtimeConfig} onOpenSource={openSourceAtError} onDismiss={() => setDismissedConfigErrors(configErrorsKey)} />
            )}
            <ConfigBaseline.Provider value={{ text: configText, saved: savedLayerText, onChange: text => { resetPendingSensitivityChanges(); setConfigText(text) } }}>
            <LayerUsageContext.Provider value={{ text: effectiveConfigText, layers, actions: layerActions, selected: layers.find(layer => layer.id === layerId), onChangeLayers: next => setDocumentText(previous => writeLayers(previous, next)), onSetActions: (input, next) => setDocumentText(previous => setLayerActions(previous, input, next)), onSelect: selectLayer, onNavigate: navigateInput, disabled: isCalibrating, family: controllerFamily }}>
            <SettingOrigins.Provider value={{ config: currentLibraryProfile ?? undefined, text: effectiveConfigText, own: layerId ? Object.entries(layers.find(l => l.id === layerId)?.overrides ?? {}).map(([k,v]) => `${k} = ${v}`).join('\n') : defaultLayer(documentText), base: importedBase.text, baseOrigins: importedBase.origins, origins: configIncludes.resolution?.origins ?? {}, layer: layers.find(l => l.id === layerId)?.name, disabled: isCalibrating, reset: key => { resetPendingSensitivityChanges(); setDocumentText(previous => layerId ? writeLayers(previous, layers.map(l => { if(l.id !== layerId) return l; const overrides = {...l.overrides}; delete overrides[key]; return {...l, overrides} })) : previous.split(/\r?\n/).filter(line => !Object.prototype.hasOwnProperty.call(layerEntries(line), key)).join('\n')) } }}>
            <InputUsageInspector />
            <LayerBar text={documentText} layers={layers} selected={layerId} managing={layerManagerOpen} onChange={setDocumentText} onSelect={selectCreatedLayer} disabled={isCalibrating} family={controllerVisualFamily(sample?.devices?.[0]?.type)} onClose={() => setLayerManagerOpen(false)} />
            <ConfigScope match={primaryTab === 'gyro' ? /^(GYRO_|MIN_GYRO|MAX_GYRO|ACCEL_|SMOOTH_|CUTOFF_|ONE_EURO|ANGLE_|DECEL_|ROLL_|IN_GAME|REAL_WORLD)/ : /./}>{renderPrimaryContent()}</ConfigScope>
            <ConfigScope match={primaryTab === 'gyro' ? /^(GYRO_|MIN_GYRO|MAX_GYRO|ACCEL_|SMOOTH_|CUTOFF_|ONE_EURO|ANGLE_|DECEL_|ROLL_|IN_GAME|REAL_WORLD)/ : /./}><SettingsInventory open={inventoryOpen} onClose={() => setInventoryOpen(false)} pageLabel={studioPage || isHomePage(primaryTab) ? undefined : t(meta.labelKey, meta.label)} /></ConfigScope>
            {renderOverViews()}
            </SettingOrigins.Provider>
            </LayerUsageContext.Provider>
          </ConfigBaseline.Provider></main>
                </>}
            </div>
          </div>
          <HintCapsule width={shellWidth} family={controllerFamily} controller={Boolean(device)} />
        </div>
      </div>
      {shellWidth === 'narrow' && (
        <NavDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          current={primaryTab}
          onSelect={setPrimaryTab}
          onHome={() => setPrimaryTab('home')}
          sections={shellSections}
          eyebrow={configName}
          status={controllerStatus}
        />
      )}
      {isConfigDrawerOpen && (
        <div
          ref={configWindowRef}
          className={`config-source-window ${configWindowDragging ? 'dragging' : ''}`}
          style={configWindowPosition
            ? { left: `${configWindowPosition.x}px`, top: `${configWindowPosition.y}px`, transform: 'none' }
            : undefined}
          onMouseDown={event => event.stopPropagation()}
        >
          <div className="modal-header config-source-window-header">
            <div
              className="config-source-window-dragHandle"
              onPointerDown={handleConfigWindowDragStart}
              onPointerMove={handleConfigWindowDragMove}
              onPointerUp={handleConfigWindowDragEnd}
              onPointerCancel={handleConfigWindowDragEnd}
            >
              <span className="config-source-window-grip" aria-hidden="true" />
              <div>
                <h3>{t('app.profileSummary.sourceConfigTitle')}</h3>
                <p className="modal-description">{t('app.profileSummary.sourceConfigDescription')}</p>
                {/* The editor shows this profile's own text, so a reader who
                    followed an "inherited" badge here needs to be told what it
                    imports -- and told when an import is broken, which is
                    otherwise silent: the settings simply do not appear. */}
                {configIncludes.imports.length > 0 && (
                  <p className="modal-description">
                    Imports {configIncludes.imports.map(includeDisplayName).join(', ')}. Settings from those files apply
                    first; lines here override them.
                  </p>
                )}
                {configIncludes.missingImports.length > 0 && (
                  <p className="modal-description" role="alert">
                    Missing import: {configIncludes.missingImports.join(', ')} — nothing from it is being applied.
                  </p>
                )}
                {configIncludes.cyclicImports.length > 0 && (
                  <p className="modal-description" role="alert">
                    Circular import involving {configIncludes.cyclicImports.map(includeDisplayName).join(', ')} — it was
                    loaded once and not re-entered.
                  </p>
                )}
              </div>
            </div>
            <button type="button" className="ghost-btn" onClick={() => setConfigDrawerOpen(false)}>
              {t('common.close')}
            </button>
          </div>
          <div className="config-source-window-body">
            <Suspense fallback={<LazyPanelFallback title={profileFileLabel} compact />}>
              <ConfigEditor
                value={documentText}
                label={profileFileLabel}
                disabled={isCalibrating}
                hasPendingChanges={hasPendingChanges}
                statusMessage={null}
                onChange={setDocumentText}
                onApply={handleApplyWithFinalize}
                onCancel={handleCancel}
                focusLine={sourceFocusLine}
              />
            </Suspense>
          </div>
        </div>
      )}
      {isCalibrationModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>{t('app.calibrationModal.title')}</h3>
              {calibrationLoadMessage && <span className="profile-status inline-flag">{calibrationLoadMessage}</span>}
            </div>
            <p className="modal-description">
              {t('app.calibrationModal.description')}
            </p>
            <div className="flex-inputs">
              <NumberField
                label={t('app.calibrationModal.inGameSensitivity')}
                value={calibrationInGameSens}
                onChange={(value) => {
                  setCalibrationInGameSens(value)
                  setCalibrationDirty(true)
                }}
                min={0}
                max={100}
                step={0.1}
                coarseStep={1}
              />
            </div>
            <div className="flex-inputs">
              <label>
                {t('app.calibrationModal.counterOsMouseSpeed')}
                <p className="field-description">{t('app.calibrationModal.counterOsMouseSpeedHint')}</p>
                <AppSelect
                  className="app-select"
                  value={calibrationCounterOs ? 'ON' : 'OFF'}
                  onChange={(event) => {
                    setCalibrationCounterOs(event.target.value === 'ON')
                    setCalibrationDirty(true)
                  }}
                >
                  <option value="OFF">{t('common.offDefault')}</option>
                  <option value="ON">{t('common.on')}</option>
                </AppSelect>
              </label>
            </div>
            <div className="flex-inputs">
              <NumberField
                label={t('app.calibrationModal.numberOfTurns')}
                value={calibrationTurns}
                onChange={setCalibrationTurns}
                min={0.5}
                max={20}
                step={0.5}
                coarseStep={1}
              />
            </div>
            <SectionActions
              standalone
              hasPendingChanges={calibrationDirty}
              statusMessage={statusMessage}
              onApply={() => {
                handleApplyCalibrationPreset()
              }}
              onCancel={resetCalibrationInputs}
              applyDisabled={isCalibrating}
            />
            <div className="modal-actions">
              <button
                type="button"
                className="primary-btn"
                onClick={() => handleRunCalibration(parseFloat(calibrationTurns) || 1)}
                disabled={isCalibrating}
              >
                {t('app.calibrationModal.runCalculation')}
              </button>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  handleCloseCalibration()
                  showToast(t('messages.activeProfileToast', { profileName: profileLabel }))
                }}
              >
                {t('common.close')}
              </button>
            </div>
            {calibrationOutput && (
              <>
                <div className={miscStyles.calibrationOutputLabel}>{t('app.calibrationModal.calculationResult')}</div>
                <div className={miscStyles.calibrationOutput} data-capture-ignore="true">
                  <pre>{calibrationOutput}</pre>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {showHidHideElevationModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>{t('controllerStatus.hidHideElevationTitle')}</h3>
            </div>
            <p className="modal-description">{t('controllerStatus.hidHideElevationStartupBody')}</p>
            <div className="modal-actions">
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  setPrimaryTab('deviceVisibility')
                  setShowHidHideElevationModal(false)
                }}
              >
                {t('controllerStatus.hidHideOpenStatusPage')}
              </button>
              <button
                type="button"
                className="ghost-btn"
                data-modal-close
                onClick={() => setShowHidHideElevationModal(false)}
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
      {isRwcGuideModalOpen && (
        <Suspense fallback={null}>
          <RwcGuideModal
            isOpen={isRwcGuideModalOpen}
            inGameSens={String(sensitivity.inGameSens ?? '')}
            onClose={() => setIsRwcGuideModalOpen(false)}
            onApplyRwc={(rwc, sens) => {
              const baseText = configText
              const withRwc = updateKeymapEntry(baseText, 'REAL_WORLD_CALIBRATION', [parseFloat(rwc)])
              const withSens = updateKeymapEntry(withRwc, 'IN_GAME_SENS', [parseFloat(sens)])
              setConfigText(withSens)
              applyConfig({ textOverride: foldConfigText(withSens) })
            }}
          />
        </Suspense>
      )}
      {isProfileModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card profile-modal">
            <div className="modal-header">
              <h3>{t('app.profilesModal.title')}</h3>
              <button className="ghost-btn" data-modal-close onClick={() => setProfileModalOpen(false)}>
                {t('common.close')}
              </button>
            </div>
            <Suspense fallback={<LazyPanelFallback title={t('app.profilesModal.title')} compact />}>
              {renderProfileManager()}
            </Suspense>
          </div>
        </div>
      )}
      {isAutoloadModalOpen && (
        <Suspense fallback={<LazyPanelFallback title={t('autoload.title')} compact />}>
          <AutoloadManager
            libraryProfiles={libraryProfiles}
            autoloadEnabled={autoloadEnabled}
            runtimeBusy={runtimeMappingBusy}
            onAutoloadEnabledChange={handleAutoloadEnabledChange}
            onClose={() => { setAutoloadModalOpen(false); window.dispatchEvent(new Event('jsm:associations-changed')) }}
          />
        </Suspense>
      )}
      {/* The unsaved-changes guard (Components 13.13), laid out for the pad: a
          vertical stack of large choices, recommended first and destructive
          last. It is rendered last so it is the topmost overlay in DOM order,
          which is the one useKeyboardNav traps: it is raised over the
          configuration dialog, and rendered before it the pad stayed behind.
          No autoFocus: useKeyboardNav focuses the first choice itself (Cancel
          is a ghost button, so it is skipped) and records where focus came
          from, so B / Escape (Cancel, via data-modal-close) returns it there. */}
      {pendingProfileSwitch && (() => {
        const current = currentLibraryProfile ?? t('app.profileSummary.unsavedProfile')
        const choices = [
          { key: 'keep', label: t('app.unsavedSwitch.keepDraft'), hint: t('app.unsavedSwitch.keepDraftHint', { current }), tone: 'recommended' },
          { key: 'save', label: t('app.unsavedSwitch.saveAndSwitch'), hint: t('app.unsavedSwitch.saveHint', { current }), tone: 'default' },
          { key: 'discard', label: t('app.unsavedSwitch.discard'), hint: t('app.unsavedSwitch.discardHint', { current }), tone: 'danger' },
        ] as const
        return (
          <div className="modal-overlay modal-overlay--over">
            <div className="modal-card unsaved-modal" role="alertdialog" aria-modal="true" aria-labelledby="unsaved-switch-title" aria-describedby="unsaved-switch-body">
              <div className="modal-header">
                <h3 id="unsaved-switch-title">{t('app.unsavedSwitch.title', { current })}</h3>
                <button type="button" className="ghost-btn" data-modal-close onClick={() => setPendingProfileSwitch(null)}>
                  {t('common.cancel')}
                </button>
              </div>
              <p id="unsaved-switch-body" className="unsaved-modal-body">
                {t('app.unsavedSwitch.body', { current, next: pendingProfileSwitch })}
              </p>
              <div className="unsaved-choices" role="group" aria-labelledby="unsaved-switch-title">
                {choices.map(choice => (
                  <button
                    key={choice.key}
                    type="button"
                    className={`unsaved-choice unsaved-choice--${choice.tone}`}
                    aria-labelledby={`unsaved-choice-${choice.key}`}
                    aria-describedby={`unsaved-choice-${choice.key}-hint`}
                    data-hints={`A:${t('app.unsavedSwitch.choose')};B:${t('common.cancel')}`}
                    onClick={() => void resolveProfileSwitch(choice.key)}
                  >
                    <span className="unsaved-choice__text">
                      <span id={`unsaved-choice-${choice.key}`} className="unsaved-choice__label">{choice.label}</span>
                      <span id={`unsaved-choice-${choice.key}-hint`} className="unsaved-choice__hint">{choice.hint}</span>
                    </span>
                    {choice.tone === 'recommended' && <span className="unsaved-choice__tag">{t('app.unsavedSwitch.recommended')}</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

export default App

import './styles/controller-workspace.css'
