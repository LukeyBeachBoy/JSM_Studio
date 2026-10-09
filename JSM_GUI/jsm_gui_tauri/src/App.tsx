import { LayerUsageContext } from './components/LayerBar'
import { InputUsageInspector } from './components/InputUsageInspector'
import { ModesPage, ModesCallout } from './components/modes/ModesPage'
import { AssociationsPage } from './components/AssociationsPage'
import { MapperDown, ConfigErrors, type ConfigError } from './components/SystemNotices'
import type { MapperExit, LayerStack } from './platform/desktopBridge'
import { writeLayers, defaultLayer, layerEntries, readLayerActions, setLayerActions, projectLayer, overrideInput } from './utils/layers'
import { SettingOrigins, SettingsInventory } from './components/SettingOrigin'
import { controllerDisplayName, controllerVisualFamily } from './utils/controllerStatus'
import { TimingPage } from './components/TimingPage'
import { ControllerSettings } from './components/settings/ControllerSettings'
import { StartupPage } from './components/settings/StartupPage'
import { BuiltinConfigurationDialog, BUILTIN_CHORD_NAME } from './components/BuiltinConfigurationDialog'
import { FirmwareSoundPrompt } from './components/FirmwareSoundPrompt'
import { flushSync } from 'react-dom'
import { appliedProfileLabel, isStudioNavigationProfile } from './utils/appliedProfile'
import { ConfigScope } from './components/ConfigScope'
import { GYRO_TUNING_KEYS } from './utils/gyroSettingsScope'
import { gyroRouteForKey, requestGyroRoute } from './utils/gyroRoutes'
import { gyroRailStatus } from './components/gyro/rail'
import { ConfigBaseline } from './hooks/configContext'
import './App.css'
import { padAspectFromDevices } from './utils/padGeometry'
import { inputPage, normalizePreviewInput } from './utils/inputNavigation'
import { usePressToFind } from './nav/usePressToFind'
import { formatSectionCount, useSectionCounts } from './components/keymap/binding/sectionCounts'
import { VariantScopeContext } from './components/keymap/binding/variantScope'
import { ShellContext, type ShellInfo } from './shell/ShellContext'
import { ContextActions } from './components/ui/console/ContextActions'
import { StatusChip } from './shell/TitleBar'
import { ButtonsPageLayout, FindButtonBar, ListeningBanner, PressToFind } from './components/PressToFind'
import { AppearancePage } from './components/AppearancePage'
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
import { changeBase as changeLibraryBase, duplicateConfiguration, libraryChanged } from './hooks/useLibraryGraph'
import { setBaseInclude, setGameMeta } from './utils/libraryGraph'
import { ControllerLayoutScope } from './components/ControllerLayoutScope'
import { controllerModelKey, foldController, projectController, controllerBase, resetControllerAssignment, sharedController } from './utils/controllerLayouts'
import { useKeymapConfig } from './hooks/useKeymapConfig'
import { useCalibration } from './hooks/useCalibration'
import { ToastHost } from './components/ToastHost'
import { LongOperationHost } from './components/LongOperation'
import { FocusGlide } from './components/FocusGlide'
import { desktopBridge } from './platform/desktopBridge'
import { usePreferences, primePreferences } from './platform/preferenceStore'
import { getKeymapValue, removeKeymapEntry, updateKeymapEntry } from './utils/keymap'
import { parseBindingLabels, setBindingLabel } from './utils/bindingLabels'
import { parseBindingIcons, setBindingIcon } from './utils/bindingIcons'
import { resolveTouchpadGrids, touchpadGridCommands } from './utils/touchpadGrids'
import { clearToasts, showToast } from './utils/toast'
import { includeDisplayName } from './utils/configIncludes'
import { useKeyboardNav } from './hooks/useKeyboardNav'
import { AppSelect } from './components/ui/AppSelect'
import { controllerHasTwoTrackpads } from './utils/controllerStatus'
import { useSectionScrollSpy } from './hooks/useSectionScrollSpy'


import { TitleBar, layerColor, OUTPUT_LABELS, OUTPUT_DESCRIPTIONS, type MappingPlateState, type StateButton, type TitleBarProfile, type VirtualOutput } from './shell/TitleBar'
import { ConfigurationMenu, type ConfigurationMenuItem } from './shell/ConfigurationMenu'
import { CreditsPage } from './components/CreditsPage'
import { HomePage } from './components/HomePage'
import { homeQuickTune, summarizeConfiguration, writeGyroSpeed } from './utils/configSummary'
import { OnScreenMenus } from './components/keymap/OnScreenMenus'
import { MenusPage } from './components/menus/MenusPage'
import { LightSounds } from './components/light/LightSounds'
import { readVirtualMenus, writeVirtualMenus } from './utils/virtualMenus'
import { AccelCurveView, type CurveSide } from './components/AccelCurveView'
import { GripSensorsSheet } from './components/keymap/GripSensorsSheet'
import { TextEntryOverlay } from './components/TextEntryOverlay'
import { hasControllerVariant, controllerVariantLabel, controllerOverrides } from './utils/controllerLayouts'
import { ButtonGlyph } from './components/glyphs/ButtonGlyph'
import { countChanges, describeChange, revertConfigChange } from './utils/configChanges'
import { ChangeReview } from './components/ChangeReview'
import { serializeConfig, parseConfigText } from './utils/configSerializer'
import { ensureHeaderLines } from './utils/config'
import { controllerSupportsInput } from './utils/controllerStatus'
import { PageTabs, type ControllerStatus } from './shell/PageTabs'
import { SectionList, scrollToSection, useDiscoveredSections, type ShellSection } from './shell/SectionList'
import { requestFineTune, revealInputSide, setInputSide, useInputSides } from './components/sticks/inputSide'
import { inputRailItems } from './components/sticks/railStatus'
import { sectionInFlight } from './nav/scroller'
import { NavDrawer } from './shell/NavDrawer'
import { HintCapsule } from './shell/HintCapsule'
import { useShellWidth } from './shell/useShellWidth'
import { isFramelessWindow } from './shell/windowControls'
import { useControllerNavigation } from './nav/useControllerNavigation'
import { ALL_PAGES, HUB_TITLE, SETTINGS_PAGES, SETTINGS_REFERENCE_START, isHomePage, isStudioPage, pageMeta, pageOrder, slideOrder, stepLabel, studioHub, type ControlTab, type PrimaryTab } from './shell/pages'
import { claimStep } from './shell/stepClaims'
import { preloadedLazy } from './utils/preloadedLazy'

// Which of KeymapControls' button groups each control page is about.
const CONTROL_TAB_SECTIONS: Record<ControlTab, string[]> = {
  // Console v2 (V5): the D-pad is a section of Buttons.
  // ButtonList's rail order: Face, Bumpers, Menu buttons, D-pad, Back buttons, Grips, Tilt gestures.
  buttons: ['face', 'bumpers', 'center', 'dpad', 'paddles', 'extra', 'motion'],
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
    { key: 'dpad', titleKey: 'keymap.dpadTitle' },
    { key: 'paddles', titleKey: 'keymap.paddlesTitle' },
    { key: 'extra', titleKey: 'keymap.extraButtonsTitle' },
    { key: 'motion', titleKey: 'keymap.tiltGesturesTitle' },
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

// Dev-only (?mock): the console kit and picker playgrounds. Defined only in dev so the production build drops them.
const DevKitPlayground = import.meta.env.DEV ? lazy(() => import('./dev/KitPlayground')) : null
const DevPickerPlayground = import.meta.env.DEV ? lazy(() => import('./dev/PickerPlayground')) : null
const GyroPage = preloadedLazy(async () => (await import('./components/GyroPage')).GyroPage)

const KeymapControls = preloadedLazy(async () => (await import('./components/KeymapControls')).KeymapControls)

const ConfigEditor = lazy(async () => {
  const module = await import('./components/ConfigEditor')
  return { default: module.ConfigEditor }
})

const ProfileManager = preloadedLazy(async () => (await import('./components/ProfileManager')).ProfileManager)

const SteamImportDialog = lazy(async () => {
  const module = await import('./components/SteamImportDialog')
  return { default: module.SteamImportDialog }
})
const AutoloadManager = lazy(async () => {
  const module = await import('./components/AutoloadManager')
  return { default: module.AutoloadManager }
})

const HelpDocsPage = preloadedLazy(async () => (await import('./components/HelpDocsPage')).HelpDocsPage)

const GlobalChordsPage = preloadedLazy(async () => (await import('./components/GlobalChordsPage')).GlobalChordsPage)

const MappingDebugPage = preloadedLazy(async () => (await import('./components/MappingDebugPage')).MappingDebugPage)

// Console v2 LIBRARY: the New configuration wizard and the assistant's
// conversation are app-level, full-window surfaces.
const NewConfigurationFlow = lazy(async () => {
  const module = await import('./components/wizard/NewConfigurationFlow')
  return { default: module.NewConfigurationFlow }
})
const AssistantPage = lazy(async () => {
  const module = await import('./components/assistant/AssistantPage')
  return { default: module.AssistantPage }
})

const AiMappingPage = preloadedLazy(async () => (await import('./components/AiMappingPage')).AiMappingPage)

// The pages LB / RB step through, fetched once the app is idle so a first
// visit draws the page itself on its first frame (utils/preloadedLazy).
const PRELOADED_PAGES = [GyroPage, KeymapControls, ProfileManager, HelpDocsPage, GlobalChordsPage, MappingDebugPage, AiMappingPage]
const preloadPages = () => { PRELOADED_PAGES.forEach(page => { void page.preload().catch(() => undefined) }) }

const UpdateBanner = lazy(async () => {
  const module = await import('./components/UpdateBanner')
  return { default: module.UpdateBanner }
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

// Settings ▸ Controller's and Startup's switches live in components/settings.

function App() {
  const { t } = useTranslation()
  const { sample: rawSample, isCalibrating, countdown } = useTelemetry()
  const [controllerEditingTarget, setControllerEditingTarget] = useState<string | null>(null)
  // Console v2 (V4): the controller scope lives in a sheet from the
  // configuration menu, not in a bar on every page.
  const [controllerLayoutOpen, setControllerLayoutOpen] = useState(false)
  // The Layout quick menu's "Only for this controller" opens the same sheet.
  useEffect(() => {
    const open = () => setControllerLayoutOpen(true)
    window.addEventListener('jsm:open-controller-layout', open)
    return () => window.removeEventListener('jsm:open-controller-layout', open)
  }, [])
  const editingControllerModel = controllerEditingTarget ?? controllerModelKey(rawSample?.devices?.[0])
  const sample = useMemo(() => {
    if (!rawSample || !editingControllerModel) return rawSample
    const devices = [...(rawSample.devices ?? [])]
    devices.sort((a, b) => Number(controllerModelKey(b) === editingControllerModel) - Number(controllerModelKey(a) === editingControllerModel))
    return { ...rawSample, devices }
  }, [rawSample, editingControllerModel])
  const { runtime: runtimePreferences } = usePreferences()
  const [firmwarePromptVisible, setFirmwarePromptVisible] = useState(false)
  useEffect(() => {
    if (runtimePreferences?.firmwareSoundPromptDone) { setFirmwarePromptVisible(false); return }
    if (!sample?.devices?.some(device => controllerVisualFamily(device.type) === 'steam')) return
    if (!document.querySelector('[role="dialog"], [role="alertdialog"]')) setFirmwarePromptVisible(true)
  }, [runtimePreferences?.firmwareSoundPromptDone, sample?.devices])
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [recalibrating, setRecalibrating] = useState(false)
  const [isProfileModalOpen, setProfileModalOpen] = useState(false)
  const [isAutoloadModalOpen, setAutoloadModalOpen] = useState(false)
  const [isSteamImportOpen, setSteamImportOpen] = useState(false)
  // Console v2 LIBRARY: the wizard and the assistant open over any page, so
  // "New for a game" works before the Library's code has loaded.
  const [newConfigurationOpen, setNewConfigurationOpen] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)
  // What the Library's focused item adds to the footer: "Library · Games · Wardogs".
  const [libraryWhere, setLibraryWhere] = useState<string | null>(null)
  const [libraryCount, setLibraryCount] = useState<string | null>(null)
  useEffect(() => {
    const openWizard = () => setNewConfigurationOpen(true)
    const openAssistant = () => setAssistantOpen(true)
    window.addEventListener('jsm:new-configuration', openWizard)
    window.addEventListener('jsm:open-assistant', openAssistant)
    return () => { window.removeEventListener('jsm:new-configuration', openWizard); window.removeEventListener('jsm:open-assistant', openAssistant) }
  }, [])
  const [isConfigDrawerOpen, setConfigDrawerOpen] = useState(false)
  const [configWindowPosition, setConfigWindowPosition] = useState<FloatingWindowPosition | null>(null)
  const [configWindowDragging, setConfigWindowDragging] = useState(false)
  const [mappingEnabled, setMappingEnabled] = useState(true)
  const [autoloadEnabled, setAutoloadEnabled] = useState(true)
  // A command binding can turn mapping off or on from the controller.
  useEffect(() => desktopBridge.onRuntimeMappingState(state => {
    setMappingEnabled(state.mappingEnabled)
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
      // Trackpad feel lives in Trackpads ▸ Fine-tune now (console v2, P4): the
      // page opens it on the first pad set to Mouse.
      if (which === 'mouseFeel') { requestFineTune('touchpad', 'mouse'); setPrimaryTab('touchpad') }
      else if (which === 'gripSensors') setSheet(which)
    }
    window.addEventListener('jsm:open-sheet', open)
    return () => window.removeEventListener('jsm:open-sheet', open)
  }, [])
  // The acceleration curve editor (TODO-40): a full-window view like On-screen
  // menus, asked for by the Gyro page and Mouse feel with the input to show.
  const [curveView, setCurveView] = useState<CurveSide | null>(null)
  const [virtualMenuId, setVirtualMenuId] = useState<string | null>(null)
  const menuSource = useRef<PrimaryTab>('home')
  const menuReturn = useRef<PrimaryTab | null>(null)
  useEffect(() => {
    const open = (event: Event) => {
      if (menuSource.current !== 'virtualMenus') menuReturn.current = menuSource.current
      setVirtualMenuId((event as CustomEvent<string>).detail); setPrimaryTab('virtualMenus')
    }
    window.addEventListener('jsm:virtual-menu', open)
    return () => window.removeEventListener('jsm:virtual-menu', open)
  }, [])
  useEffect(() => {
    const open = (event: Event) => {
      const side = (event as CustomEvent<CurveSide>).detail
      // The gyro's curve is Gyro ▸ Fine-tune ▸ Speed ▸ Advanced now (console v2,
      // P5); this view keeps the trackpads' half.
      if (side === 'touchpad') setCurveView('touchpad')
      else { requestGyroRoute({ view: 'fine-tune', group: 'speed', sub: { view: 'speed-advanced', part: 'shape' } }); setPrimaryTab('gyro') }
    }
    // Buttons ▸ Tilt gestures ▸ Tilt settings: Gyro ▸ Fine-tune ▸ Direction ▸ Advanced ▸ Tilt (D6).
    const openTilt = () => { requestGyroRoute({ view: 'fine-tune', group: 'direction', sub: { view: 'tilt', part: 'behaviour' } }); setPrimaryTab('gyro') }
    window.addEventListener('jsm:accel-curve', open)
    window.addEventListener('jsm:gyro-tilt', openTilt)
    return () => { window.removeEventListener('jsm:accel-curve', open); window.removeEventListener('jsm:gyro-tilt', openTilt) }
  }, [])
  useEffect(() => {
    const open = (event: Event) => { setSelectedMenu((event as CustomEvent<string>).detail); setMenusOpen(true) }
    window.addEventListener('jsm:menu-layout', open)
    return () => window.removeEventListener('jsm:menu-layout', open)
  }, [])
  // A page asked for from deep inside another (the layer lane's "Go to Layers").
  useEffect(() => {
    const open = (event: Event) => {
      const page = (event as CustomEvent<string>).detail
      if (ALL_PAGES.some(item => item.tab === page)) setPrimaryTab(page as PrimaryTab)
    }
    window.addEventListener('jsm:open-page', open)
    return () => window.removeEventListener('jsm:open-page', open)
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
      const asked = (event as CustomEvent<PrimaryTab | undefined>).detail
      // The D-Pad tab became a section of Buttons (console v2, V5).
      const tab = asked === 'dpad' ? 'buttons' : asked
      if (tab && ALL_PAGES.some(page => page.tab === tab)) setPrimaryTab(tab)
    }
    window.addEventListener('jsm:navigate-page', goto)
    window.addEventListener('jsm:open-docs', open)
    return () => { window.removeEventListener('jsm:open-docs', open); window.removeEventListener('jsm:navigate-page', goto) }
  }, [])
  const [primaryTab, setPrimaryTabState] = useState<PrimaryTab>('home')
  menuSource.current = primaryTab
  // Page change slides 16px in the direction of travel along the tab order.
  const [pageDirection, setPageDirection] = useState<'forward' | 'back'>('forward')
  // The configuration page B on Home (and Continue editing) returns to.
  const lastEditingPage = useRef<PrimaryTab>('overview')
  const setPrimaryTab = useCallback((next: PrimaryTab | ((previous: PrimaryTab) => PrimaryTab)) => {
    setPrimaryTabState(previous => {
      const target = typeof next === 'function' ? next(previous) : next
      if (target !== previous) {
        if (previous === 'virtualMenus') menuReturn.current = null
        const order = slideOrder(previous)
        setPageDirection(order.indexOf(target) < order.indexOf(previous) ? 'back' : 'forward')
        if (pageMeta(previous).group === 'controls') lastEditingPage.current = previous
        // Toasts belong to the page they were raised on; one raised by the
        // action that changed page (a copy made, a game opened) stays.
        clearToasts(400)
      }
      return target
    })
  }, [])
  const returnToInput = useRef<(() => void) | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  // Controller light & sounds (ControllerLight.dc.html): a sub-page opened from
  // Layout's quick menu (jsm:open-light-sounds) and from Settings ▸ Controller.
  const [lightSoundsOpen, setLightSoundsOpen] = useState(false)
  useEffect(() => {
    // preventDefault tells Layout's quick menu the surface took it (otherwise
    // Layout opens its own fallback light sheet).
    const open = (event: Event) => { event.preventDefault(); setLightSoundsOpen(true) }
    window.addEventListener('jsm:open-light-sounds', open)
    return () => window.removeEventListener('jsm:open-light-sounds', open)
  }, [])
  // Values & inheritance: a dialog from the title bar's configuration menu.
  const [inventoryOpen, setInventoryOpen] = useState(false)
  const shellWidth = useShellWidth()
  const frameless = useMemo(isFramelessWindow, [])
  useEffect(() => { if (shellWidth !== 'narrow') setDrawerOpen(false) }, [shellWidth])

  const stepPage = useCallback((delta: 1 | -1) => {
    // A page can take LB/RB for itself (Guides search steps its matches).
    if (claimStep('jsm:page-step', delta)) return
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
    if (isSteamImportOpen) { setSteamImportOpen(false); return true }
    if (drawerOpen) { setDrawerOpen(false); return true }
    if (returnToInput.current) { const restore = returnToInput.current; returnToInput.current = null; restore(); return true }
    if (primaryTab === 'virtualMenus' && menuReturn.current) {
      const source = menuReturn.current
      menuReturn.current = null
      setPrimaryTab(source)
      return true
    }
    // Home is the root: B goes nowhere (the pad feels the edge), and never
    // forward into the editor (UX review, B6). A Studio page: B is Home (2f).
    // A configuration page: back to Overview, and no further.
    if (isHomePage(primaryTab)) return false
    if (isStudioPage(primaryTab)) { setPrimaryTab('home'); return true }
    if (primaryTab !== 'overview') { setPrimaryTab('overview'); return true }
    // Layout's B is Home (console v2, Layout.dc.html footer).
    if (primaryTab === 'overview') { setPrimaryTab('home'); return true }
    // Console v2 (Layout): B on Layout goes Home.
    setPrimaryTab('home')
    return true
  }, [isConfigDrawerOpen, isAutoloadModalOpen, isSteamImportOpen, drawerOpen, primaryTab, setPrimaryTab])
  useKeyboardNav({ onPageStep: stepPage, onEscape: closeFloatingWindows, activePage: primaryTab })
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 400))
    idle(preloadPages)
  }, [])

  useEffect(() => {
    const handler = (event: Event) => setControllerNavEnabled(Boolean((event as CustomEvent<boolean>).detail))
    window.addEventListener('jsm:controller-nav', handler)
    return () => window.removeEventListener('jsm:controller-nav', handler)
  }, [])
  const [selectedMappingCommand, setSelectedMappingCommand] = useState<string | null>('N')
  // Find a button: while asked to listen, a real press jumps to its row (console v2, ButtonList).
  const pressToFind = usePressToFind({ page: primaryTab, device: rawSample?.devices?.[0], onPage: setPrimaryTab })
  const [inputRequest, setInputRequest] = useState<{ command: string; open?: boolean } | null>(null)
  // Modes ▸ What changes and Review changes: A goes to the input or setting, in
  // its mode, with a button's binding sheet open (console v2, P6).
  const goToModeChange = (id: string, key: string) => {
    if (id !== layerId) selectLayer(id)
    const target = key.split(',').pop() ?? key
    if (/^(LIGHT_BAR|LED_BRIGHTNESS|(LEFT|RIGHT)_TOUCHPAD_ROTATION)$/.test(target)) { setLightSoundsOpen(true); return }
    // A gyro or tilt setting held on a button ("L,GYRO_SENS") opens that button's variant;
    // one in a mode lands on the Fine-tune group or Advanced part that edits it (utils/gyroRoutes).
    // (The virtual-stick keys named for a stick, RIGHT_STICK_UNDEADZONE_INNER…, stay with the stick.)
    const gyroRoute = overrideInput(key) ? null : gyroRouteForKey(key)
    if (gyroRoute) { requestGyroRoute(gyroRoute); setPrimaryTab('gyro'); return }
    const input = overrideInput(key)
    navigateInput(input ?? target, Boolean(input && inputPage(normalizePreviewInput(input)) === 'buttons'))
  }
  const navigateInput = (raw: string, open = false) => {
    const from = primaryTab, scroll = document.querySelector('.shell-scroll')?.scrollTop ?? 0, fromLayer = layerId
    returnToInput.current = () => { selectLayer(fromLayer); setPrimaryTab(from); requestAnimationFrame(() => { const pane = document.querySelector('.shell-scroll'); if (pane) pane.scrollTop = scroll; document.querySelector<HTMLElement>(`[data-overview-input="${CSS.escape(raw)}"]`)?.focus({ preventScroll: true }) }) }
    returnToInputCommand.current = from === 'overview' ? raw.toUpperCase() : null
    if (/^(GYRO_|MIN_GYRO|MAX_GYRO|ACCEL_(CURVE|NATURAL|POWER|SIGMOID|JUMP)|ONE_EURO_|DECEL_BRAKE|REAL_WORLD_CALIBRATION$|IN_GAME_SENS$|ROLL_CONTRIBUTION$|MOUSE_[XY]_FROM_GYRO_AXIS$|TILT_O|MOTION_|LEAN_THRESHOLD$|JOYCON_|AUTO_CALIBRATE_GYRO$|TRACKBALL_DECAY$)/.test(raw)) {
      // Lands on the Fine-tune group or Advanced part that edits the key.
      const route = gyroRouteForKey(raw)
      if (route) requestGyroRoute(route)
      setPrimaryTab('gyro'); return
    }
    const command = normalizePreviewInput(/^(LEFT|RIGHT)_(TOUCHPAD|GRID)/.test(raw) ? raw.startsWith('LEFT') ? 'LEFT_PAD' : 'RIGHT_PAD' : raw === 'ZL_MODE' ? 'ZL' : raw === 'ZR_MODE' ? 'ZR' : raw)
    setSelectedMappingCommand(command)
    revealInputSide(command)
    setPrimaryTab(inputPage(command))
    setInputRequest({ command, open })
  }
  // Layout ▸ A on a callout opens the input's binding sheet on Buttons; closing
  // that sheet goes straight back to Layout with the same callout focused
  // (UX review 2026-10-09, L4), rather than leaving the pad on the Buttons row.
  const returnToInputCommand = useRef<string | null>(null)
  useEffect(() => {
    const back = (event: Event) => {
      const closed = ((event as CustomEvent<string>).detail ?? '').toUpperCase()
      const wanted = returnToInputCommand.current
      if (!wanted || !returnToInput.current) return
      if (closed !== wanted && normalizePreviewInput(closed) !== normalizePreviewInput(wanted)) return
      returnToInputCommand.current = null
      const restore = returnToInput.current
      returnToInput.current = null
      restore()
    }
    window.addEventListener('jsm:binding-closed', back)
    return () => window.removeEventListener('jsm:binding-closed', back)
  }, [])
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
      if (inputRequest.open && control) requestAnimationFrame(() => control.click())
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
  const [sourceFocusLine, setSourceFocusLine] = useState<{ line: number; nonce: number } | null>(null)
  const configWindowDragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null)
  const {
    configText, documentText, setDocumentText, setDocumentTextAsAction, projectedDocument, layers, layerId, selectLayer, savedLayerText, foldConfigText,
    effectiveConfigText,
    configIncludes,
    setConfigText,
    readTextFor,
    setConfigTextFor,
    defaultText, setDefaultConfigText, savedAt, historyPast, historyFuture, historyAt,
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
    handleSteadyingFloorChange,
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
    handleDualSensPairChange,
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
  } = useKeymapConfig(editingControllerModel)
  // What activates a layer lives on the inputs, so it is read from the text
  // rather than from the layers themselves.
  const setControllerDocument = (next: string | ((previous: string) => string)) => setDocumentText(previous => {
    const effectiveBase = configIncludes.resolveText(controllerBase(previous))
    const projected = projectController(previous, editingControllerModel, effectiveBase)
    const edited = typeof next === 'function' ? next(projected) : next
    return foldController(previous, editingControllerModel, projected, edited, sharedController(previous, editingControllerModel, effectiveBase))
  })
  const layerActions = useMemo(() => readLayerActions(projectedDocument, layers), [projectedDocument, layers])

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
    return controllerHasTwoTrackpads(devices[0].type)
  }, [sample?.devices])

  // The section list (LB/RB): the groups of the page on screen. Pages that
  // lay out as one long column list their anchors here and a scroll-spy lights
  // the one at the top; Gyro still switches views; any other page is read
  // from its own data-section markers.
  const sectionCounts = useSectionCounts()
  const scrollSections = useMemo<{ id: string; label: string; count?: string }[]>(() => {
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
      // Buttons' rail counts ("Menu buttons · 1 of 4", console v2 ButtonList).
      return SUB_NAV_GROUPS[primaryTab as ControlTab].map(({ key, titleKey }) => ({ id: `mapping-section-${key}`, label: key === 'extra' && grips ? t('keymap.gripsTitle', 'Grips') : t(titleKey), count: primaryTab === 'buttons' ? formatSectionCount(sectionCounts[key]) : undefined }))
    }
    return []
  }, [primaryTab, stickModes, t, sample?.devices, sectionCounts])
  const discoveredSections = useDiscoveredSections(primaryTab)
  // Trackpads has no section list (2b): the pads sit side by side instead.
  // Gyro's front is three question cards stepped by LT / RT, with no rail (P5).
  const noSections = isHomePage(primaryTab) || primaryTab === 'gyro'
  const spiedSections = useMemo(() => noSections ? [] : scrollSections.length ? scrollSections : discoveredSections, [noSections, scrollSections, discoveredSections])
  const activeSectionId = useSectionScrollSpy(spiedSections.map(section => section.id))
  const inputSides = useInputSides()
  const shellSections = useMemo<ShellSection[]>(() => {
    // Settings (console v2, V6): the rail is the categories, each its own page.
    if (studioHub(primaryTab) === 'settings') {
      return SETTINGS_PAGES.map(item => ({ id: `settings-${item.tab}`, label: t(item.labelKey, item.label), active: item.tab === primaryTab, onSelect: () => setPrimaryTab(item.tab), divider: item.tab === SETTINGS_REFERENCE_START }))
    }
    // Sticks, Triggers, Trackpads (console v2, P4): the rail picks one input,
    // with its status line, instead of scroll-spying one long column.
    if (primaryTab === 'joysticks' || primaryTab === 'triggers' || primaryTab === 'touchpad') {
      const page = primaryTab
      return inputRailItems(page, effectiveConfigText, t, hasTwoTrackpads).map(item => ({ id: item.id, label: item.label, status: item.status,
        active: item.side === 'single' || inputSides[page] === item.side, onSelect: () => { if (item.side !== 'single') setInputSide(page, item.side) } }))
    }
    // Gyro (console v2, after the UX review): the same frame as the other input fronts, with a one-item rail.
    if (primaryTab === 'gyro') return [{ id: 'gyro', label: 'Gyro', status: gyroRailStatus(effectiveConfigText, controllerVisualFamily(sample?.devices?.[0]?.type)), active: true, onSelect: () => {} }]
    return spiedSections.map(section => ({ ...section, active: activeSectionId === section.id, onSelect: () => scrollToSection(section.id) }))
  }, [spiedSections, activeSectionId, primaryTab, t, setPrimaryTab, effectiveConfigText, hasTwoTrackpads, inputSides, sample])
  const currentSection = shellSections.find(section => section.active)

  const {
    libraryProfiles,
    isLibraryLoading,
    libraryReady,
    currentLibraryProfile,
    applyConfig,
    saveConfig,
    appliedProfileName, runtimeConfig,
    refreshLibraryProfiles,
    handleLoadProfileFromLibrary,
    handleCreateProfile,
    handleRenameProfile,
    handleDeleteLibraryProfile,
    handleImportProfile,
    handleImportSteamLayout,
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
      // Save-and-make-live is one action, so it says one true sentence rather
      // than "saved, not live yet" followed by "is live" (UX review, S9).
      if (action !== 'apply' && !await saveConfig({ ...options, quiet: action === 'both' })) return
      if (action !== 'save') await applyConfig({ ...options, quiet: action === 'both' })
      if (action === 'both') showToast(`Saved ${currentLibraryProfile ?? 'configuration'} · live now`)
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
  // The switch waiting on that question came from Edit, which opens the page after.
  const openAfterSwitch = useRef(false)
  const [builtinConfigDialog, setBuiltinConfigDialog] = useState(false)
  const requestLoadProfile = (name: string) => {
    if (name === BUILTIN_CHORD_NAME) { setBuiltinConfigDialog(true); return }
    openAfterSwitch.current = false
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
    const open = openAfterSwitch.current
    openAfterSwitch.current = false
    if (choice === 'save' && !await saveConfig({ textOverride: finalizePendingValues?.() ?? configText })) return
    const loaded = handleLoadProfileFromLibrary(name, choice === 'discard')
    if (open && await loaded !== null) window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'overview' }))
  }
  // Edit on a Configurations row: make it the configuration being edited and
  // open it, in one press. Through the unsaved guard, the page opens once
  // the person has answered it.
  const openLibraryProfileForEditing = async (name: string) => {
    if (name === BUILTIN_CHORD_NAME) { setBuiltinConfigDialog(true); return }
    const open = () => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'overview' }))
    if (name === currentLibraryProfile) { open(); return }
    if (hasPendingChanges) { openAfterSwitch.current = true; setPendingProfileSwitch(name); return }
    if (await handleLoadProfileFromLibrary(name) !== null) open()
  }
  // X / Apply on a row that is not being edited (Studio Home 8a), and the tray
  // menu's configurations: open it through the unsaved guard, then apply it.
  // With edits pending the guard's dialog takes over and the apply waits for
  // the person's answer.
  const applyLibraryProfileByName = async (name: string) => {
    if (name === BUILTIN_CHORD_NAME) { setBuiltinConfigDialog(true); return }
    if (name === currentLibraryProfile) { void runEditorAction('apply'); return }
    if (hasPendingChanges) { requestLoadProfile(name); return false }
    const profile = await desktopBridge.loadLibraryProfile(name)
    if (!profile) { showToast(t('messages.loadProfileFailed'), 'error'); return }
    await handleLoadProfileFromLibrary(name)
    await applyConfig({ textOverride: profile.content, profileNameOverride: name })
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
  // What this configuration itself says (its own lines, plus this controller's
  // own layout). projectedDocument already holds the imports' values when a
  // controller is connected, so it cannot say what is inherited and what is owned.
  const ownDefaultText = useMemo(() => defaultLayer(editingControllerModel ? projectController(documentText, editingControllerModel) : projectedDocument), [documentText, editingControllerModel, projectedDocument])
  const templateNames = useMemo(() => new Set(configIncludes.imports.map(includeDisplayName)), [configIncludes.imports])
  const titleBarProfiles = useMemo<TitleBarProfile[]>(() => libraryProfiles.map(name => ({
    name,
    template: templateNames.has(name),
    description: name === currentLibraryProfile
      ? [configIncludes.imports.length ? `Built on ${configIncludes.imports.map(includeDisplayName).join(', ')}` : '', layers.length ? `${layers.length} mode${layers.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ') || undefined
      : templateNames.has(name) && currentLibraryProfile ? `${currentLibraryProfile} is built on it` : undefined,
  })), [libraryProfiles, templateNames, currentLibraryProfile, configIncludes.imports, layers.length])
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
  const [mapperExit, setMapperExit] = useState<MapperExit | null>(null)
  const [mapperRestarting, setMapperRestarting] = useState(false)
  useEffect(() => {
    void desktopBridge.getMapperStatus().then(status => { if (status && !status.running && status.exit) setMapperExit(status.exit) })
    return desktopBridge.onMapperStatus(status => setMapperExit(status.running ? null : status.exit ?? null))
  }, [])
  // The tray menu's actions run the same handlers as the window's buttons.
  // Through a ref, so the listener is registered once but always calls this
  // render's handlers, not the ones from the render that registered it.
  const trayActions = useRef({ applyLibraryProfileByName, handleToggleMappingEnabled, handleAutoloadEnabledChange, mappingEnabled })
  trayActions.current = { applyLibraryProfileByName, handleToggleMappingEnabled, handleAutoloadEnabledChange, mappingEnabled }
  useEffect(() => desktopBridge.onTrayAction(action => {
    const handlers = trayActions.current
    if (action.type === 'apply-profile') {
      // false: edits are pending and the unsaved dialog is up, which needs
      // the window in front to be answered.
      void handlers.applyLibraryProfileByName(action.name).then(done => { if (done === false) void desktopBridge.showStudio() })
    } else if (action.type === 'set-mapping') {
      if (action.enabled !== handlers.mappingEnabled) void handlers.handleToggleMappingEnabled()
    } else {
      void handlers.handleAutoloadEnabledChange(action.enabled)
    }
  }), [])
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
    // Whatever the test said is over with it.
    clearToasts()
    const back = testReturnFocus.current
    testReturnFocus.current = null
    requestAnimationFrame(() => { if (back?.isConnected) back.focus({ preventScroll: true }) })
  }, [])
  const startTest = async () => {
    testReturnFocus.current = lastPageFocus.current
    // Told first, so this Apply leaves the configuration with the controller.
    await desktopBridge.setStudioTesting(true)
    // Test it applies what is on screen without saving it, so no "is live"
    // toast: the banner says what is running (UX review, B1).
    if (!isCalibrating && !actionInFlight.current) {
      actionInFlight.current = true
      setEditorBusy(true)
      try { await applyConfig({ textOverride: finalizePendingValues?.() ?? configText, profileNameOverride: currentLibraryProfile ?? undefined, quiet: true }) }
      finally { actionInFlight.current = false; setEditorBusy(false) }
    }
    setTesting(true)
  }
  // Try it / Show in game (console v2, D13): Test mode with a text of its own --
  // a mode folded into Default, a menu shown on a button. When the test ends,
  // whatever was live before goes back.
  const [testNote, setTestNote] = useState<string | null>(null)
  const tryRestore = useRef<{ text: string; name?: string } | null>(null)
  const tryConfiguration = async (text: string, note: string) => {
    if (testing || actionInFlight.current) return
    testReturnFocus.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : lastPageFocus.current
    tryRestore.current = runtimeConfig ? { text: runtimeConfig, name: appliedProfileName ?? undefined } : null
    setTestNote(note)
    await desktopBridge.setStudioTesting(true)
    await applyConfig({ textOverride: text, profileNameOverride: currentLibraryProfile ?? undefined, quiet: true })
    setTesting(true)
  }
  // A menu's Show in game: it is always ready on its first pad or stick and
  // shows as soon as the test starts; other menus give that pad or stick up.
  const showMenuInGame = (menuId: string) => {
    const text = finalizePendingValues?.() ?? documentText
    const { menus, problem } = readVirtualMenus(text)
    const menu = menus.find(item => item.id === menuId)
    if (problem || !menu) return
    const source = menu.attachments[0]?.source ?? 'RIGHT'
    const shown = menus.map(item => item.id === menuId
      ? { ...item, placement: { ...item.placement, reveal: 'touch' as const }, attachments: [{ ...(item.attachments[0] ?? { input: 'NONE', confirm: 'NONE', cancel: 'NONE' }), source, activation: 'ALWAYS' as const, selection: item.attachments[0]?.selection === 'ACTIVATION_RELEASE' || !item.attachments[0] ? 'CLICK' as const : item.attachments[0].selection }] }
      : { ...item, attachments: item.attachments.filter(attachment => attachment.source !== source) })
    void tryConfiguration(writeVirtualMenus(text, shown), `Showing ${menu.name} · open on the ${source === 'RSTICK' ? 'right stick' : source === 'LSTICK' ? 'left stick' : source === 'LEFT' ? 'left pad' : source === 'DPAD' ? 'D-pad' : source === 'ABXY' ? 'face buttons' : 'right pad'}`)
  }
  useEffect(() => {
    if (testing) return
    setTestNote(null)
    const restore = tryRestore.current
    tryRestore.current = null
    if (restore) void applyConfig({ textOverride: restore.text, profileNameOverride: restore.name, quiet: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when a test ends
  }, [testing])
  useEffect(() => {
    const run = (event: Event) => { const detail = (event as CustomEvent<{ text: string; note: string }>).detail; if (detail?.text) void tryConfiguration(detail.text, detail.note) }
    window.addEventListener('jsm:try-configuration', run)
    return () => window.removeEventListener('jsm:try-configuration', run)
  })
  // "Try it in Test" from deep inside a page (Triggers' X, a Fine-tune's Try it).
  const startTestLatest = useRef(startTest)
  startTestLatest.current = startTest
  useEffect(() => {
    const run = () => { void startTestLatest.current() }
    window.addEventListener('jsm:start-test', run)
    return () => window.removeEventListener('jsm:start-test', run)
  }, [])
  // However the test ends (Return, Esc, View + Menu, leaving the window),
  // Apply goes back to handing the controller to Studio.
  useEffect(() => { if (!testing) void desktopBridge.setStudioTesting(false) }, [testing])
  useEffect(() => {
    if (!testing) return
    let left = false
    const key = (event: KeyboardEvent) => {
      if (!event.isTrusted || event.key !== 'Escape') return
      // The New configuration wizard's Try it sorts the draft's own Esc from
      // the person's, and ends the test itself (LIBRARY).
      if (document.body.dataset.testCapture === 'true') return
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
    // A page can take LT/RT for itself (Guides steps its topics).
    if (claimStep('jsm:section-step', delta)) return true
    // Layout has no sections: LT / RT flip which mode the picture shows
    // (console v2, 02), Default first, with ends like any strip.
    if (primaryTab === 'overview' && layers.length) {
      const order = ['', ...layers.map(layer => layer.id)]
      const next = order[Math.min(order.length - 1, Math.max(0, order.indexOf(layerId) + delta))]
      if (next === layerId) return false
      selectLayer(next)
      return true
    }
    if (!shellSections.length) return false
    const inFlight = sectionInFlight()
    const from = shellSections.findIndex(section => inFlight ? section.id === inFlight : section.active)
    const target = shellSections[Math.min(shellSections.length - 1, Math.max(0, (from < 0 ? 0 : from + delta)))]
    if (target.id === inFlight || (!inFlight && target.active)) return false
    target.onSelect()
    return true
  }, [shellSections, primaryTab, layers, layerId, selectLayer])
  // LT / RT from the pad: the same step as Page Up / Down, reporting whether
  // it moved (the strip has ends) for the haptic.
  const stepPageFromPad = useCallback((delta: 1 | -1) => {
    if (claimStep('jsm:page-step', delta)) return true
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
    // Menu tapped: what the status chip does (save and make live, make live,
    // stop testing). Holding Menu opens the Configuration menu instead.
    onSave: () => {
      if (isStudioPage(primaryTab) || stateButton.kind === 'idle') return false
      pressStateButton()
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
  const [changeReviewOpen, setChangeReviewOpen] = useState(false)
  const openChangeReview = () => {
    const next = finalizePendingValues?.()
    if (next !== undefined) setDocumentText(next)
    resetPendingSensitivityChanges()
    setChangeReviewOpen(true)
  }
  const testReason = !device ? 'Connect a controller to test' : mappingPlate !== 'studio' ? 'Test it runs while the app has the controller' : !currentLibraryProfile ? 'Choose a configuration to test' : null
  // What the title bar holds, reachable from the pad through Menu: Apply,
  // then the configuration, layer and output being worked on, then mapping.
  // Console v2 (V3): ☰ opens the configuration menu: Review changes, Undo,
  // Save first; then what the old title bar held -- which configuration,
  // the controller output, mapping on or off. Modes are switched on the
  // Layout mode strip and the Modes tab, not here.
  const stateLabel = stateButton.kind === 'changes' ? `Save and make live · ${stateButton.count} ${stateButton.count === 1 ? 'change' : 'changes'}`
    : stateButton.kind === 'apply' ? `Make ${stateButton.name} live`
    : stateButton.kind === 'applied' ? 'Live · saved'
    : stateButton.kind === 'testing' ? 'Stop testing'
    : 'Make live'
  const currentOutput = ((virtualControllerType as VirtualOutput) ?? 'NONE') as VirtualOutput
  const titleBarMenuItems: ConfigurationMenuItem[] = [
    { key: 'configuration', icon: 'library', label: 'Switch game', divider: true, meta: currentLibraryProfile ?? 'None chosen', idle: isCalibrating,
      choices: [
        ...titleBarProfiles.map(profile => ({
          key: `profile:${profile.name}`, label: profile.name, checked: profile.name === currentLibraryProfile,
          meta: profile.name === appliedName ? 'Live' : profile.template ? 'Base' : undefined,
          onSelect: () => requestLoadProfile(profile.name),
        })),
        { key: 'library', label: 'Open the library…', onSelect: () => setPrimaryTab('configurations') },
      ] },
    // Named for what it is (UX review, S1): the virtual controller games see.
    ...(currentLibraryProfile ? [{ key: 'output', icon: 'stVirtual' as const, label: 'Virtual controller', meta: OUTPUT_LABELS[currentOutput],
      choices: [
        ...(Object.keys(OUTPUT_LABELS) as VirtualOutput[]).map(value => ({ key: `output:${value}`, label: OUTPUT_LABELS[value], meta: OUTPUT_DESCRIPTIONS[value], checked: value === currentOutput, onSelect: () => handleVirtualControllerTypeChange(value) })),
        { key: 'bind', label: 'Bind whole controller', meta: currentOutput === 'NONE' ? 'Choose a virtual output first' : undefined, idle: currentOutput === 'NONE',
          onSelect: () => handleBindGamepadPassthrough(currentOutput === 'DS4' ? 'DS4' : 'XBOX') },
      ] }] : []),
    { key: 'mapping', icon: 'catJsm', label: mappingPlate === 'off' ? 'Resume mapping' : 'Pause mapping',
      meta: mappingPlate === 'off' ? 'Mapping is off' : 'Mapping is on', idle: runtimeMappingBusy,
      onSelect: () => { void handleToggleMappingEnabled() } },
    // One name on Home and in the editor (UX review, S1): "This controller only", Off or On.
    { key: 'controllerLayout', icon: 'connected', label: 'This controller only', meta: hasControllerVariant(documentText, editingControllerModel ?? '') ? `On · ${device ? controllerVariantLabel(device) : 'this controller'}` : 'Off', idle: !currentLibraryProfile, onSelect: () => setControllerLayoutOpen(true) },
  ]
  // The status (Live · saved, Unsaved, Testing) is the menu's header line, not
  // an item: only an action that can be taken is listed (UX review, S1).
  const configMenuStatus = stateButton.kind === 'applied' ? 'Live · saved'
    : stateButton.kind === 'changes' ? `Unsaved · ${stateButton.count} ${stateButton.count === 1 ? 'change' : 'changes'}`
    : stateButton.kind === 'testing' ? 'Testing'
    : stateButton.kind === 'apply' ? 'Saved · not live'
    : stateButton.reason
  const configMenuItems: ConfigurationMenuItem[] = [
    { key: 'review', icon: 'buttons', label: 'Review changes', meta: changeCount ? `${changeCount} unsaved ${changeCount === 1 ? 'change' : 'changes'}` : 'Nothing unsaved', idle: isCalibrating, defaultFocus: changeCount > 0, onSelect: openChangeReview },
    { key: 'undo', icon: 'undo', label: 'Undo', meta: canUndo && !isCalibrating ? describeChange(undoTarget, documentText) ?? 'Last change' : 'Nothing to undo', idle: !canUndo || isCalibrating, onSelect: undo },
    { key: 'redo', icon: 'redo', label: 'Redo', meta: canRedo && !isCalibrating ? describeChange(documentText, redoTarget ?? documentText) ?? 'Last undo' : 'Nothing to redo', idle: !canRedo || isCalibrating, onSelect: redo },
    ...(stateButton.kind === 'changes' || stateButton.kind === 'apply' || stateButton.kind === 'testing'
      ? [{ key: 'apply', icon: 'apply' as const, label: stateLabel, divider: true, meta: stateButton.kind === 'testing' ? undefined : 'Ctrl+Shift+A', onSelect: pressStateButton }]
      : []),
    { key: 'save', icon: 'save', label: 'Save, not live yet', divider: stateButton.kind === 'applied' || stateButton.kind === 'idle', meta: saveIdleReason ?? 'Ctrl+S', idle: Boolean(saveIdleReason), onSelect: () => void runEditorAction('save') },
    { key: 'copy', icon: 'copy', label: 'Save as copy…', idle: !currentLibraryProfile || isCalibrating, meta: !currentLibraryProfile ? 'Choose a configuration first' : undefined, onSelect: () => void handleSaveAsCopy(finalizePendingValues?.() ?? configText) },
    { key: 'discard', icon: 'remove', label: hasPendingChanges ? `Discard ${changeCount} ${changeCount === 1 ? 'change' : 'changes'}` : 'Discard changes', idle: !hasPendingChanges || isCalibrating, meta: hasPendingChanges ? undefined : 'Nothing unsaved', onSelect: handleCancel },
    { key: 'test', icon: 'test', label: 'Test it', idle: Boolean(testReason) || testing, meta: testing ? 'Testing now' : testReason ?? undefined, onSelect: () => void startTest() },
    ...titleBarMenuItems,
    { key: 'inherit', icon: 'inherited', label: 'Settings origin', meta: 'Which file each value comes from', idle: !currentLibraryProfile, onSelect: () => setInventoryOpen(true) },
  ]

  const renderTitleBar = () => (
    <TitleBar
      width={shellWidth}
      frameless={frameless}
      variant={isHomePage(primaryTab) ? 'home' : isStudioPage(primaryTab) ? 'studio' : 'editing'}
      studioTitle={studioHub(primaryTab) ? HUB_TITLE[studioHub(primaryTab)!] : undefined}
      onHome={() => setPrimaryTab('home')}
      controllerLabel={{ text: controllerStatus.kind === 'connected' ? `${controllerStatus.name}${controllerStatus.battery ? ` · ${controllerStatus.battery}` : ''}` : 'No controller · searching', connected: controllerStatus.kind === 'connected' }}
      onOpenConfigMenu={() => setConfigMenuOpen(true)}
      controllerScope={!editingControllerModel ? 'Shared layout' : hasControllerVariant(documentText, editingControllerModel) ? `Only for ${device ? controllerVariantLabel(device) : 'this controller'}` : 'Shared layout'}
      onOpenControllerLayout={() => setControllerLayoutOpen(true)}
      // Console v2 (V3/V4): the game chip names the controller, and says so
      // when this configuration has a layout only for it.
      // "Its own layout" whenever edits go to this controller's variant (a
      // controller connected, or chosen), the same truth Layout's quick menu
      // reports (UX review 2026-10-09, L1); the rows badge only what differs.
      chipController={device ? `${controllerDisplayName(device.type)}${editingControllerModel ? ' · its own layout' : ''}` : 'No controller'}
      modeName={layerId ? layers.find(layer => layer.id === layerId)?.name ?? null : null}
      modeColor={layerId ? layerColor(Math.max(0, layers.findIndex(layer => layer.id === layerId))) : undefined}
      // One header row (V3): the tabs sit between the game chip and the status chip.
      tabs={!isHomePage(primaryTab) && studioHub(primaryTab) !== 'settings' ? <PageTabs
        width={shellWidth}
        current={primaryTab}
        onSelect={setPrimaryTab}
        status={controllerStatus}
        sectionLabel={currentSection?.label}
        drawerOpen={drawerOpen}
        onOpenDrawer={() => setDrawerOpen(true)}
      /> : undefined}
      editingName={currentLibraryProfile}
      dirty={hasPendingChanges}
      profiles={titleBarProfiles}
      // A mapper that has stopped applies nothing (System States 17c).
      appliedName={mapperExit ? null : appliedName}
      onSelectProfile={requestLoadProfile}
      onOpenLibrary={() => setPrimaryTab('configurations')}
      editingDisabled={isCalibrating}
      onEditApplied={editApplied}
      mapping={mappingPlate}
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

  // ---- Home (console v2, Home.dc.html)
  // "Desktop gamepad · When no game matches": the Launch-with-game fallback.
  const [homeFallback, setHomeFallback] = useState<string | null>(null)
  useEffect(() => {
    if (primaryTab !== 'home') return
    let live = true
    void desktopBridge.getAutoloadFallback().then(fallback => { if (live) setHomeFallback(fallback.enabled ? fallback.profileName : null) }).catch(() => {})
    return () => { live = false }
  }, [primaryTab])
  // Quick tune's gyro speed is written at once and, when nothing else was
  // unsaved, saved and made live as soon as the stick rests ("changes apply live").
  const quickTuneTimer = useRef<number | null>(null)
  const quickTuneLive = useRef(false)
  const quickTuneGyroSpeed = (value: number) => {
    if (quickTuneTimer.current === null) quickTuneLive.current = editingIsRunning && !hasPendingChanges
    setConfigText(previous => writeGyroSpeed(previous, value))
    if (quickTuneTimer.current !== null) window.clearTimeout(quickTuneTimer.current)
    quickTuneTimer.current = window.setTimeout(() => {
      quickTuneTimer.current = null
      if (quickTuneLive.current) void editorActionRef.current('both')
    }, 900)
  }
  const renderHome = () => {
    const quick = homeQuickTune(effectiveConfigText, controllerFamily, hasTwoTrackpads)
    return (
      <HomePage
        configName={currentLibraryProfile}
        configText={currentLibraryProfile ? configText : undefined}
        applied={editingIsRunning && !mapperExit}
        summary={currentLibraryProfile ? summarizeConfiguration(effectiveConfigText, layers.length, controllerFamily) : ''}
        changeCount={changeCount}
        onSwitch={() => setPrimaryTab('configurations')}
        // A edits the layout: the Layout tab, where every input is.
        onContinue={() => setPrimaryTab('overview')}
        onTest={() => void startTest()}
        onMakeLive={() => void editorActionRef.current('both')}
        testReason={testReason}
        quickTune={quick}
        onGyroSpeed={quickTuneGyroSpeed}
        onOpenTune={tile => setPrimaryTab(tile === 'gyro' ? 'gyro' : 'touchpad')}
        libraryProfiles={libraryProfiles}
        firstRun={libraryReady && libraryProfiles.length === 0}
        games={libraryProfiles.filter(name => name !== currentLibraryProfile && !templateNames.has(name) && name !== homeFallback)}
        fallback={homeFallback && homeFallback !== currentLibraryProfile && libraryProfiles.includes(homeFallback) ? homeFallback : null}
        // Ask the assistant opens the conversation; Settings ▸ Assistant holds the setup.
        onOpenStudio={tab => { if (tab === 'ai') setAssistantOpen(true); else setPrimaryTab(tab) }}
        onOpenGame={name => requestLoadProfile(name)}
        onNewGame={() => setNewConfigurationOpen(true)}
      />
    )
  }

  // Every layer's text for On-screen menus, worked out only while it is open
  // and only when the configuration changes (App re-renders per telemetry frame).
  const menuSurfaces = useMemo(() => menusOpen ? [
    { layerId: '', layerName: 'Default', text: readTextFor('') },
    ...layers.map((layer, index) => ({ layerId: layer.id, layerName: layer.name, colorIndex: index, text: readTextFor(layer.id) })),
  ] : [], // readTextFor is rebuilt every render; what it reads is below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [menusOpen, documentText, layers, effectiveConfigText])

  // The faster pad's finger speed, for the trackpad curve's live dot.
  const trackpadLiveSpeed = Math.max(0, ...(sample?.devices ?? []).flatMap(d => [d.status?.leftPad?.speed ?? 0, d.status?.rightPad?.speed ?? 0]))

  // ---- What opens over a page: the Configuration menu, the detail sheets,
  // the On-screen menus view and the curve editor. Inside the page's
  // providers, so their rows read origins and write through the same layer
  // as the page.
  const renderOverViews = () => (
    <>
      <ConfigurationMenu open={configMenuOpen} configName={currentLibraryProfile ?? 'Configuration'} status={configMenuStatus} items={configMenuItems} onClose={() => setConfigMenuOpen(false)} />
      {changeReviewOpen && <ChangeReview baseline={appliedConfig} text={documentText} family={controllerFamily} disabled={isCalibrating} canUndo={canUndo} canRedo={canRedo} onUndo={undo} onRedo={redo}
        onRevert={change => { resetPendingSensitivityChanges(); setDocumentTextAsAction(previous => revertConfigChange(previous, appliedConfig, change)) }}
        onRevertAll={() => { resetPendingSensitivityChanges(); setDocumentTextAsAction(appliedConfig) }} onApply={() => { setChangeReviewOpen(false); pressStateButton() }} onClose={() => setChangeReviewOpen(false)}
        history={{ past: historyPast, future: historyFuture, at: historyAt }} savedAt={savedAt}
        onGoTo={change => {
          setChangeReviewOpen(false)
          if (change.kind === 'menu') { window.dispatchEvent(new CustomEvent('jsm:virtual-menu', { detail: change.menuId })); return }
          if (change.kind === 'controller') { window.dispatchEvent(new Event('jsm:open-controller-layout')); return }
          if (change.kind === 'layer' || change.kind === 'order' || change.kind === 'property' || /^#\s*@layer-action/.test(change.key)) { setPrimaryTab('layers'); return }
          goToModeChange(change.layerId ?? '', change.key.replace(/^#\s*@(label|icon)\s+/i, '').split('::')[0])
        }} />}
      {/* Trackpad feel (the old Mouse feel sheet) is Trackpads ▸ Fine-tune now
          (console v2, P4): Speed & curve, Glide, Click and Feel. */}
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

      <AccelCurveView
        open={curveView !== null}
        side={curveView ?? 'gyro'}
        onSideChange={setCurveView}
        onClose={() => setCurveView(null)}
        configName={currentLibraryProfile ?? 'Configuration'}
        disabled={isCalibrating}
        link={accelCurveLinkValue}
        onLinkChange={handleAccelCurveLinkChange}
        gyro={{
          values: sensitivity,
          mode: currentMode,
          onModeChange: mode => handleModeSelection(mode, activeSensitivityPrefix),
          view: sensitivityView,
          onViewChange: setSensitivityView,
          shiftButton: sensitivityModeshiftButton,
          liveSpeed: asNumber(sample?.omega),
          onCurveChange: handleAccelCurveChange,
          onMinThresholdChange: handleThresholdChange('MIN_GYRO_THRESHOLD'),
          onMaxThresholdChange: handleThresholdChange('MAX_GYRO_THRESHOLD'),
          onNaturalVHalfChange: handleNaturalVHalfChange,
          onPowerVRefChange: handlePowerVRefChange,
          onPowerExponentChange: handlePowerExponentChange,
          onSigmoidMidChange: handleSigmoidMidChange,
          onSigmoidWidthChange: handleSigmoidWidthChange,
          onJumpTauChange: handleJumpTauChange,
          onMinSensXChange: handleDualSensChange('MIN_GYRO_SENS', 0),
          onMinSensYChange: handleDualSensChange('MIN_GYRO_SENS', 1),
          onMaxSensXChange: handleDualSensChange('MAX_GYRO_SENS', 0),
          onMaxSensYChange: handleDualSensChange('MAX_GYRO_SENS', 1),
          onSensPairChange: (which, x, y) => handleDualSensPairChange(which === 'min' ? 'MIN_GYRO_SENS' : 'MAX_GYRO_SENS', x, y),
        }}
        touchpad={{
          values: touchpadAccelValues,
          liveSpeed: trackpadLiveSpeed,
          onCurveChange: handleTouchpadAccelCurveChange,
          onParamChange: handleTouchpadAccelParamChange,
        }}
      />
    </>
  )

  // Console v2 LIBRARY: Games and Bases (components/ProfileManager).
  const renderProfileManager = (view: 'games' | 'bases' = 'games') => (<ProfileManager
                view={view}
                libraryProfiles={libraryProfiles}
                libraryLoading={isLibraryLoading}
                currentProfileName={currentLibraryProfile}
                appliedProfileName={mappingEnabled && !mapperExit ? appliedProfileName : null}
                runtimeConfig={runtimeConfig}
                hasPendingChanges={hasPendingChanges}
                isCalibrating={isCalibrating}
                refreshKey={appliedConfig}
                family={controllerFamily}
                controllerName={device ? controllerDisplayName(device.type) : null}
                onEdit={name => void openLibraryProfileForEditing(name)}
                // Make live: the one being edited saves and applies (what the
                // status chip does); another opens through the unsaved guard.
                onMakeLive={name => { if (name === currentLibraryProfile) void runEditorAction(hasPendingChanges ? 'both' : 'apply'); else void applyLibraryProfileByName(name) }}
                onRename={(name, next) => handleRenameProfile(name, next)}
                onDelete={name => handleDeleteLibraryProfile(name)}
                onEditSource={name => {
                  const show = () => { setConfigWindowPosition(null); setConfigDrawerOpen(true) }
                  if (name === currentLibraryProfile) { show(); return }
                  void handleLoadProfileFromLibrary(name).then(loaded => { if (loaded !== null) show() })
                }}
                onShowInFolder={handleOpenConfigDirectory}
                onNewConfiguration={() => setNewConfigurationOpen(true)}
                onImportFromSteam={() => setSteamImportOpen(true)}
                onImportFile={(fileName, content) => void handleImportProfile(fileName, content)}
                onChangeBase={changeBaseOf}
                onOpenBuiltin={() => setBuiltinConfigDialog(true)}
                onWhere={setLibraryWhere}
                onCount={setLibraryCount}
              />)
  // The Library wrote files itself (duplicate, a base from a game): the list
  // follows at once, without waiting on the folder watcher.
  const refreshLibraryLatest = useRef(refreshLibraryProfiles)
  refreshLibraryLatest.current = refreshLibraryProfiles
  useEffect(() => {
    const refresh = () => { void refreshLibraryLatest.current() }
    window.addEventListener('jsm:library-changed', refresh)
    return () => window.removeEventListener('jsm:library-changed', refresh)
  }, [])
  // Change base (Library ▸ Y): the file on disk, or -- for the one being
  // edited -- the editor's text, saved at once unless other edits are waiting.
  const changeBaseOf = async (name: string, path: string | null) => {
    if (name === currentLibraryProfile) {
      const next = setBaseInclude(documentText, path)
      setDocumentText(next)
      if (hasPendingChanges) { showToast(`Changed in the editor; save ${name} to keep it.`); return }
      await saveConfig({ textOverride: next })
      return
    }
    await changeLibraryBase(name, path)
  }
  // The wizard's and the assistant's Try it (D13): Test mode with a draft; the
  // test's end puts the live configuration back unless the draft was kept.
  const tryDraft = async (text: string, note: string) => {
    if (testReason) return false
    await tryConfiguration(text, note)
    return true
  }
  const endDraftTry = async (restore: boolean) => {
    if (!restore) tryRestore.current = null
    exitTest()
  }

  const renderPrimaryContent = () => {
    if (primaryTab === 'home') return renderHome()
    if (primaryTab === 'credits') return <CreditsPage />
    if (primaryTab === 'configurations') return <div className="settings-page configuration-library">
      <Suspense fallback={<LazyPanelFallback title="Games" />}>{renderProfileManager('games')}</Suspense>
    </div>
    if (primaryTab === 'bases') return <div className="settings-page configuration-library">
      <Suspense fallback={<LazyPanelFallback title="Bases" />}>{renderProfileManager('bases')}</Suspense>
    </div>
    if (primaryTab === 'associations') return <AssociationsPage libraryProfiles={libraryProfiles} autoloadEnabled={autoloadEnabled}
      runtimeBusy={runtimeMappingBusy} onAutoloadEnabledChange={handleAutoloadEnabledChange}
      appliedProfileName={mappingEnabled && !mapperExit ? appliedProfileName : null} onWhere={setLibraryWhere} onCount={setLibraryCount} />
    // Menus always save to Default (console v2, D16), whichever mode is chosen.
    if (primaryTab === 'virtualMenus') return <MenusPage initialMenuId={virtualMenuId} text={defaultText} setText={setDefaultConfigText} configName={configName} deviceType={sample?.devices?.[0]?.type} sample={sample}
      layers={layers} showReason={testReason} onShowInGame={showMenuInGame} />
    if (primaryTab === 'layers') {
      // Live only when the mapper is running the configuration on this page.
      const running = runningProfilePath
      const runningName = running.split(/[\\/]/).pop()?.replace(/\.txt$/i, '') ?? ''
      const isThis = !!currentLibraryProfile && runningName.toLowerCase() === currentLibraryProfile.toLowerCase()
      const stack = isThis ? (layerStack && layerStack.profile.split(/[\\/]/).pop()?.replace(/\.txt$/i, '').toLowerCase() === runningName.toLowerCase() ? layerStack : { profile: running, layers: [] }) : null
      return <ModesPage text={projectedDocument} layers={layers} selected={layerId} defaultText={defaultText} onChange={setControllerDocument}
        onEditOnLayout={id => { selectLayer(id); setPrimaryTab('overview') }} onGoTo={goToModeChange}
        onTry={id => void tryConfiguration(projectLayer(finalizePendingValues?.() ?? documentText, id), `Trying ${layers.find(layer => layer.id === id)?.name ?? 'this layer'}`)} tryReason={testReason}
        disabled={isCalibrating} family={controllerVisualFamily(sample?.devices?.[0]?.type)} device={sample?.devices?.[0]}
        liveStack={mapperExit ? null : stack} liveProfileName={!isThis && runningName ? runningName : null} />
    }
    // Appearance: theme, language and the accent (components/AppearancePage).
    if (primaryTab === 'appearance') return <AppearancePage />
    // Settings ▸ Controller and Settings ▸ Startup (console v2, V6): separate
    // categories now (components/settings).
    if (primaryTab === 'settings') return <ControllerSettings controllerType={sample?.devices?.[0]?.type} />
    if (primaryTab === 'startup') return <StartupPage libraryProfiles={libraryProfiles.filter(name => !templateNames.has(name))} liveName={appliedName} />

    if (primaryTab === 'gyro') {
      // The settings-page template (Gyro.dc.html): GyroPage draws the seven
      // sections; each carries data-section, which is how the section list
      // finds them.
      return (
        <Suspense fallback={<LazyPanelFallback title={t(pageMeta('gyro').labelKey, pageMeta('gyro').label)} />}>
          <GyroPage
            configText={effectiveConfigText}
            setConfigText={setConfigText}
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
            onTryIt={testReason ? undefined : () => { void startTest() }}
            onRecalibrate={() => { void handleRecalibrate() }}
            calibrationCountdown={countdown}
            onOpenControllerSettings={() => setPrimaryTab('settings')}
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
            onSteadyingFloorChange={handleSteadyingFloorChange}
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
      return <TimingPage onRemoveLines={removeTimingLines} libraryKey={libraryProfiles.join('|')} configName={currentLibraryProfile}
        // Press timing ▸ Advanced links to the configuration's own timing, which
        // stays at the foot of Buttons (BIND's page).
        onOpenConfigurationTiming={() => {
          setPrimaryTab('buttons')
          const reveal = (tries: number) => {
            const summary = Array.from(document.querySelectorAll<HTMLElement>('.main-pane summary, .main-pane [data-nav-disclosure-trigger], .main-pane button')).find(node => /Configuration timing|own timing/i.test(node.textContent ?? ''))
            if (!summary) { if (tries > 0) window.setTimeout(() => reveal(tries - 1), 150); return }
            summary.scrollIntoView({ block: 'center' })
            summary.focus({ preventScroll: true })
          }
          window.setTimeout(() => reveal(20), 200)
        }} />
    }

    if (primaryTab in CONTROL_TAB_SECTIONS) {
      const controlTab = primaryTab as ControlTab
      const sections = CONTROL_TAB_SECTIONS[controlTab]
      return (
        <Suspense fallback={<LazyPanelFallback title={t(`app.nav.${controlTab}`)} />}>
          {/* Buttons (console v2, ButtonList): the list, and "Where it is on
              your controller · Press it now" beside it. Rows read whether they
              are this controller's own from the variant scope. */}
          <VariantScopeContext.Provider value={editingControllerModel ? { model: editingControllerModel, label: device ? controllerVariantLabel(device) : 'This controller', text: documentText } : null}>
          <ButtonsPageLayout aside={controlTab === 'buttons' ? <PressToFind device={device} listening={pressToFind.listening} onListen={pressToFind.listen} onStop={pressToFind.stop} /> : undefined}>
          {controlTab === 'buttons' && <FindButtonBar device={device} listening={pressToFind.listening} onListen={pressToFind.listen} onStop={pressToFind.stop} />}
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
          </ButtonsPageLayout>
          </VariantScopeContext.Provider>
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
            onOpenTuning={() => requestFineTune('touchpad', 'mouse')}
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
          onConfigTextChange={setConfigText}
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
          // Console v2 Layout: X Try it, and Quick menu ▸ Only for this controller.
          onTryIt={() => { void startTest() }}
          tryItReason={testReason}
          // On whenever edits fold into this controller's own layout (setControllerDocument),
          // not only once the first one has: the quick menu, the title bar and the
          // rows then agree (UX review 2026-10-09, L1).
          controllerScope={{ name: device ? controllerVariantLabel(device) : null, variant: Boolean(editingControllerModel), changes: editingControllerModel ? controllerOverrides(documentText, editingControllerModel).length : 0 }}
        />
      )
    }

    if (primaryTab === 'globalChords') {
      return (
        <Suspense fallback={<LazyPanelFallback title={t('app.nav.globalChords')} />}>
          <GlobalChordsPage onEditConfiguration={name => { requestLoadProfile(name); setPrimaryTab('overview') }} devices={sample?.devices} onChordsChanged={() => { void refreshLibraryProfiles() }} currentName={appliedName ?? currentLibraryProfile} />
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
            liveName={mapperExit ? null : appliedName}
            mapperStopped={Boolean(mapperExit)}
          />
        </Suspense>
      )
    }

    if (primaryTab === 'ai') {
      return (
        <Suspense fallback={<LazyPanelFallback title={t('app.nav.aiAssistant')} />}>
          {/* Settings ▸ Assistant: how it connects (console v2, D18). The
              conversation is its own page (assistantOpen). */}
          <AiMappingPage onOpenAssistant={() => setAssistantOpen(true)} />
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
  const hubTitle = studioHub(primaryTab) ? HUB_TITLE[studioHub(primaryTab)!] : 'Studio'
  const eyebrow = studioPage
    ? hubTitle
    : primaryTab === 'overview'
      ? `${configName} · ${device ? controllerDisplayName(device.type) : 'Controller'}`
      : `${configName} · Controls`
  // Gyro has no page header (console v2, P5): Recalibrate and Copy / Paste tuning moved into its screens.
  const pageActions = primaryTab === 'layers'
      ? <ModesCallout />
      // Triggers' Calibrate moved to the page's Y menu (console v2, D22).
      // Hold to swap adds with its own "Add one" card (console v2).
      // The Library's counts (console v2, LIBRARY): adding and importing are
      // covers and rows on the pages themselves now.
      : primaryTab === 'associations' || primaryTab === 'configurations' || primaryTab === 'bases'
        ? <span className="page-header__count" style={{ color: 'var(--text-3)', fontSize: 16 }}>{libraryCount}</span>
        : null

  // What full-screen sub-pages (ui/SubPage) draw their header and footer from.
  const shellInfo: ShellInfo = {
    width: shellWidth,
    family: controllerFamily,
    controller: Boolean(device),
    configName: currentLibraryProfile,
    modeName: layerId ? layers.find(layer => layer.id === layerId)?.name ?? null : null,
    statusChip: <StatusChip state={stateButton} onPress={pressStateButton} editingName={currentLibraryProfile} />,
  }
  return (
    <ShellContext.Provider value={shellInfo}>
    <div className="app-shell" data-width={shellWidth} data-page-group={meta.group} data-hub={studioHub(primaryTab)}
      // What LT/RT step here, for the footer (console v2: Section, Mode, Category, Topic).
      data-step-label={stepLabel(primaryTab)} data-steps={primaryTab === 'overview' && layers.length ? 'true' : undefined}>
      <ToastHost />
      <ListeningBanner until={pressToFind.until} onStop={pressToFind.stop} />
      <LongOperationHost />
      <FocusGlide />
      <TextEntryOverlay />
      <ContextActions />
      {DevKitPlayground && <Suspense fallback={null}><DevKitPlayground /></Suspense>}
      {DevPickerPlayground && <Suspense fallback={null}><DevPickerPlayground /></Suspense>}
      <Suspense fallback={null}>
        <UpdateBanner />
      </Suspense>
      {renderTitleBar()}
      {testing ? (
        // One exit, named the same way everywhere (pill, banner, footer): B
        // (Esc on the keyboard) stops the test; holding View + Menu does too.
        <div className="test-banner" role="status">
          <span className="test-banner__dot" aria-hidden="true" />
          <b>{testNote ?? `Testing ${currentLibraryProfile ?? 'configuration'}`}</b>
          <span className="test-banner__text">Your controller plays it as the game would.</span>
          <span className="test-banner__exit">
            <button type="button" className="test-banner__stop" onClick={exitTest} data-hints="A:Stop testing;B:Stop testing"
              data-caption="Stop testing · B (Esc), this button, or holding View + Menu stops it">
              <ButtonGlyph button="B" size={22} family={controllerFamily} />Stop testing
            </button>
            <span className="test-banner__also">or hold <ButtonGlyph button="VIEW" size={22} pad family={controllerFamily} /><span>+</span><ButtonGlyph button="MENU" size={22} pad family={controllerFamily} /></span>
          </span>
        </div>
      ) : <div />}
      {/* The page tabs are in the title bar's one row (console v2, V3);
          Settings has none: its categories are the rail (V6). */}
      <div className="shell-body" data-width={shellWidth} data-sections={shellSections.length > 0 ? 'true' : 'false'}>
        {shellSections.length > 0 && <SectionList sections={shellSections} ariaLabel={studioHub(primaryTab) === 'settings' ? 'Settings categories' : `${t(meta.labelKey, meta.label)} sections`}
          // The input fronts' rail steps the other stick / trigger / pad, and their footers say so (UX review, inputs polish).
          stepLabel={studioHub(primaryTab) === 'settings' ? 'Category' : primaryTab === 'joysticks' ? 'Other stick' : primaryTab === 'triggers' ? 'Other trigger' : primaryTab === 'touchpad' ? 'Other pad' : 'Section'} />}
        <div className="shell-content">
          <div className="shell-scroll">
            <div key={primaryTab} className={`shell-page page${isHomePage(primaryTab) ? ' shell-page--home' : ''}${['overview', 'virtualMenus', 'layers', 'configurations', 'bases', 'associations'].includes(primaryTab) ? ' page--wide' : ''}${['globalChords', 'deviceVisibility'].includes(primaryTab) ? ' page--narrow' : ''}`} data-direction={pageDirection}>
              {mapperExit && !studioPage && !isHomePage(primaryTab)
                ? <MapperDown exit={mapperExit} restarting={mapperRestarting} onRestart={() => void restartMapper()} onOpenConsole={() => setPrimaryTab('debugConsole')} />
                : <>
              {/* Sticks, Triggers and Trackpads drop the page header (console v2,
                  D4): the rail and "<Left stick> is for…" say where you are. */}
              {/* Buttons too (ButtonList): its rail and rows say where you are. */}
              {!isHomePage(primaryTab) && !['joysticks', 'triggers', 'touchpad', 'buttons', 'gyro'].includes(primaryTab) && <header className="page-header">
                <div className="page-header__text">
                  <span className="page-header__eyebrow">{eyebrow}</span>
                  <h1 className="page-header__title">{t(meta.labelKey, meta.label)}</h1>
                  <p className="page-header__purpose">{primaryTab === 'credits' ? t('credits.purpose') : t(`shell.purpose.${primaryTab}`, meta.purpose)}</p>
                </div>
                {pageActions && <div className="page-header__actions">
                  {pageActions}

                </div>}
              </header>}
          <main className={`main-pane page-body${isHomePage(primaryTab) ? ' home-body' : ''}`}>
            {mapperExit && studioPage && <MapperDown compact exit={mapperExit} restarting={mapperRestarting} onRestart={() => void restartMapper()} onOpenConsole={() => setPrimaryTab('debugConsole')} />}
            {!studioPage && !isHomePage(primaryTab) && configErrors.length > 0 && dismissedConfigErrors !== configErrorsKey && (
              <ConfigErrors errors={configErrors} appliedText={runtimeConfig} onOpenSource={openSourceAtError} onDismiss={() => setDismissedConfigErrors(configErrorsKey)} />
            )}
            <ConfigBaseline.Provider value={{ text: configText, saved: savedLayerText, onChange: text => { resetPendingSensitivityChanges(); setConfigText(text) } }}>
            {/* Layout for this controller (console v2, ControllerVariant): a full page. */}
            <ControllerLayoutScope open={controllerLayoutOpen} onClose={() => setControllerLayoutOpen(false)} text={documentText} effectiveText={configIncludes.resolveText(documentText)} devices={sample?.devices} model={editingControllerModel} onModel={next => { if (next === editingControllerModel) return; setDocumentText(finalizePendingValues()); resetPendingSensitivityChanges(); setControllerEditingTarget(next) }} onChange={setDocumentTextAsAction} />
            {/* Controller light & sounds (console v2, ControllerLight). */}
            <LightSounds open={lightSoundsOpen} fromSettings={studioHub(primaryTab) === 'settings'} onClose={() => setLightSoundsOpen(false)} text={defaultText} onChange={setDefaultConfigText} layers={layers}
              onChangeDocument={setControllerDocument} device={sample?.devices?.[0]} onOpenSettings={() => { setLightSoundsOpen(false); setPrimaryTab('settings') }} />
            <LayerUsageContext.Provider value={{ text: effectiveConfigText, layers, actions: layerActions, selected: layers.find(layer => layer.id === layerId), onChangeLayers: next => setControllerDocument(previous => writeLayers(previous, next)), onSetActions: (input, next) => setControllerDocument(previous => setLayerActions(previous, input, next)), onSelect: selectLayer, onNavigate: navigateInput, disabled: isCalibrating, family: controllerFamily }}>
            <SettingOrigins.Provider value={{ config: currentLibraryProfile ?? undefined, text: effectiveConfigText, own: layerId ? Object.entries(layers.find(l => l.id === layerId)?.overrides ?? {}).map(([k,v]) => `${k} = ${v}`).join('\n') : ownDefaultText, base: importedBase.text, baseOrigins: importedBase.origins, origins: configIncludes.resolution?.origins ?? {}, layer: layers.find(l => l.id === layerId)?.name, disabled: isCalibrating, reset: key => { resetPendingSensitivityChanges(); if (editingControllerModel && !layerId) { setDocumentText(previous => resetControllerAssignment(previous, editingControllerModel, key)); return } setControllerDocument(previous => layerId ? writeLayers(previous, layers.map(l => { if(l.id !== layerId) return l; const overrides = {...l.overrides}; delete overrides[key]; return {...l, overrides} })) : previous.split(/\r?\n/).filter(line => !Object.prototype.hasOwnProperty.call(layerEntries(line), key)).join('\n')) } }}>
            <InputUsageInspector />
            <ConfigScope match={primaryTab === 'gyro' ? GYRO_TUNING_KEYS : /./}>{renderPrimaryContent()}</ConfigScope>
            <ConfigScope match={primaryTab === 'gyro' ? GYRO_TUNING_KEYS : /./}><SettingsInventory open={inventoryOpen} onClose={() => setInventoryOpen(false)} pageLabel={studioPage || isHomePage(primaryTab) ? undefined : t(meta.labelKey, meta.label)} /></ConfigScope>
            {renderOverViews()}
            </SettingOrigins.Provider>
            </LayerUsageContext.Provider>
          </ConfigBaseline.Provider></main>
                </>}
            </div>
          </div>
        </div>
      </div>
      {/* Console v2 (V2): the hints dock as a full-width footer row that the
          scroll area never runs under; its left side says where you are. */}
      <HintCapsule width={shellWidth} family={controllerFamily} controller={Boolean(device)}
        // While testing the pad belongs to the configuration: the footer
        // names the one way out (the same one the pill and banner name).
        override={testing ? { hints: [{ button: 'B', label: 'Stop testing' }], message: testNote ?? `Testing ${currentLibraryProfile ?? 'configuration'} · hold View + Menu stops it too` } : undefined}
        where={isHomePage(primaryTab)
          ? t('app.nav.home', 'Home')
          // The mode being edited, once the title bar's selector is gone (console
          // v2, P6): "Wardogs · Buttons · Face buttons · Vehicles mode".
          : [studioPage ? hubTitle : configName, t(meta.labelKey, meta.label), studioHub(primaryTab) === 'settings' ? undefined : studioHub(primaryTab) === 'library' ? libraryWhere ?? undefined : currentSection?.label].filter(Boolean).join(' · ')}
        mode={!studioPage && !isHomePage(primaryTab) && layerId ? { name: layers.find(layer => layer.id === layerId)?.name ?? layerId, color: layerColor(Math.max(0, layers.findIndex(layer => layer.id === layerId))) } : null} />
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
      {newConfigurationOpen && (
        <Suspense fallback={<LazyPanelFallback title="New configuration" compact />}>
          <NewConfigurationFlow
            open
            onClose={() => setNewConfigurationOpen(false)}
            device={device}
            family={controllerFamily}
            libraryProfiles={libraryProfiles}
            testing={testing}
            testReason={testReason && testReason !== 'Choose a configuration to test' ? testReason : null}
            onTry={text => tryDraft(text, 'Trying a new configuration · nothing saved yet')}
            onEndTry={endDraftTry}
            onCreate={async draft => (await handleCreateProfile(draft)) ?? null}
            onOpenExisting={name => { setNewConfigurationOpen(false); void handleLoadProfileFromLibrary(name).then(() => setPrimaryTab('overview')) }}
            onFinish={(name, next, text) => {
              setNewConfigurationOpen(false)
              libraryChanged()
              // Kept after trying it: it goes live as it was tried.
              if (text) void applyConfig({ textOverride: text, profileNameOverride: name })
              setPrimaryTab(next === 'change' ? 'buttons' : 'overview')
              if (next === 'change') window.setTimeout(() => pressToFind.listen(), 300)
            }}
            onImportFromSteam={() => setSteamImportOpen(true)}
            onImportFile={(fileName, content) => void handleImportProfile(fileName, content)}
            onCopyFrom={async (source, name, game) => {
              const copied = await duplicateConfiguration(source)
              if (!copied) { showToast(`Couldn’t copy ${source}.`, 'error'); return }
              let finalName = copied
              if (name && name !== copied) { await handleRenameProfile(copied, name); finalName = (await desktopBridge.listLibraryProfiles()).find(entry => entry.toLowerCase() === name.toLowerCase()) ?? copied }
              if (game.steamAppId) { const profile = await desktopBridge.loadLibraryProfile(finalName); if (profile) await desktopBridge.saveLibraryProfile(finalName, setGameMeta(profile.content, { steamAppId: game.steamAppId, name: game.name })) }
              if (game.processName) await desktopBridge.saveAutoloadRule(game.processName, finalName, { exePath: game.exePath, autoApply: false })
              setNewConfigurationOpen(false)
              libraryChanged()
              await refreshLibraryProfiles()
              void openLibraryProfileForEditing(finalName)
            }}
          />
        </Suspense>
      )}
      {assistantOpen && (
        <Suspense fallback={<LazyPanelFallback title="Assistant" compact />}>
          <AssistantPage
            open
            onClose={() => setAssistantOpen(false)}
            configText={configText}
            currentProfileName={currentLibraryProfile}
            hasPendingChanges={hasPendingChanges}
            libraryProfiles={libraryProfiles}
            family={controllerFamily}
            // Keep it: the configuration being edited takes the change in the
            // editor and saves and applies it; another is saved and applied.
            onKeep={async (name, text) => {
              if (!name || name === currentLibraryProfile) {
                setConfigText(text)
                const folded = foldConfigText(text)
                if (await saveConfig({ textOverride: folded })) await applyConfig({ textOverride: folded })
                return
              }
              const saved = serializeConfig(parseConfigText(ensureHeaderLines(text)))
              if (!await desktopBridge.saveLibraryProfile(name, saved)) throw new Error(t('messages.saveProfileFailed'))
              await applyConfig({ textOverride: saved, profileNameOverride: name })
              libraryChanged()
            }}
            onTry={async (_name, text) => { if (!await tryDraft(text, 'Trying the assistant’s change · nothing saved yet')) showToast(testReason ?? 'Test can’t start now.', 'error') }}
            onOpenSettings={() => { setAssistantOpen(false); setPrimaryTab('ai') }}
          />
        </Suspense>
      )}
      {isSteamImportOpen && (
        <Suspense fallback={<LazyPanelFallback title="Import from Steam" compact />}>
          <SteamImportDialog
            onClose={() => setSteamImportOpen(false)}
            onImport={(conversion, renames) => { setSteamImportOpen(false); void handleImportSteamLayout(conversion, renames).then(name => { libraryChanged(); if (name) window.dispatchEvent(new CustomEvent('jsm:library-select', { detail: name })) }) }}
            libraryProfiles={libraryProfiles}
          />
        </Suspense>
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
      {firmwarePromptVisible && runtimePreferences && !runtimePreferences.firmwareSoundPromptDone
        && <FirmwareSoundPrompt onOpenPreferences={() => setPrimaryTab('settings')} />}
      {/* The unsaved-changes guard (Components 13.13), laid out for the pad: a
          vertical stack of large choices, recommended first and destructive
          last. It is rendered last so it is the topmost overlay in DOM order,
          which is the one useKeyboardNav traps: it is raised over the
          configuration dialog, and rendered before it the pad stayed behind.
          No autoFocus: useKeyboardNav focuses the first choice itself (Cancel
          is a ghost button, so it is skipped) and records where focus came
          from, so B / Escape (Cancel, via data-modal-close) returns it there. */}
      {builtinConfigDialog && <BuiltinConfigurationDialog onClose={() => setBuiltinConfigDialog(false)} onCloned={name => { setBuiltinConfigDialog(false); void refreshLibraryProfiles(); requestLoadProfile(name); setPrimaryTab('overview') }} />}
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
    </ShellContext.Provider>
  )
}

export default App

import './styles/controller-workspace.css'
