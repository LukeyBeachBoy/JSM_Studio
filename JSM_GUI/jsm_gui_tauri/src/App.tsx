import { flushSync } from 'react-dom'
import { ConfigScope } from './components/ConfigScope'
import { ConfigBaseline } from './hooks/configContext'
import { TuningClipboard } from './components/TuningClipboard'
import './App.css'
import { inputPage, normalizePreviewInput } from './utils/inputNavigation'
// The version people see must be the one on the installer they downloaded, and
// tauri.conf.json is what the installer is built from.
import tauriConf from '../src-tauri/tauri.conf.json'
import sideNavStyles from './components/SideNav.module.css'
import {
  OverviewIcon,
  ConsoleIcon,
  ButtonsIcon,
  DPadIcon,
  TriggersIcon,
  JoystickIcon,
  TrackpadIcon,
  GyroIcon,
  TuneIcon,
  GripIcon,
  TimingIcon,
  SparkleIcon,
  EyeIcon,
  DocumentIcon,
  ChordIcon,
} from './components/NavIcons'
import { ThemeToggle } from './components/ThemeToggle'
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
import { desktopBridge } from './platform/desktopBridge'
import { updateKeymapEntry } from './utils/keymap'
import { parseBindingLabels, setBindingLabel } from './utils/bindingLabels'
import { resolveTouchpadGrids, touchpadGridCommands } from './utils/touchpadGrids'
import { showToast } from './utils/toast'
import { LanguageSelect } from './components/LanguageSelect'
import { useKeyboardNav } from './hooks/useKeyboardNav'
import { ControllerGlyphBar } from './components/ControllerGlyphBar'
import { AppSelect } from './components/ui/AppSelect'
import { PageSideNav } from './components/keymap/PageSideNav'
import { TRACKPAD_ANCHORS } from './constants/trackpadAnchors'
import { controllerHasTwoTrackpads } from './utils/controllerStatus'


// One page per physical control, the way Steam Input splits them up, instead of
// one page carrying every binding on the controller.
type ControlTab = 'buttons' | 'dpad' | 'triggers' | 'joysticks'
type PrimaryTab = ControlTab | 'gyro' | 'touchpad' | 'globalChords' | 'sensors' | 'gripSensors' | 'timing' | 'debugConsole' | 'ai' | 'help' | 'deviceVisibility' | 'overview'

// Which of KeymapControls' button groups each control page is about.
const CONTROL_TAB_SECTIONS: Record<ControlTab, string[]> = {
  buttons: ['face', 'bumpers', 'center', 'paddles', 'extra'],
  dpad: ['dpad'],
  triggers: ['triggers'],
  joysticks: ['leftStick', 'rightStick'],
}
// Page Up / Page Down (controller triggers) walk this order.
const PAGE_ORDER: PrimaryTab[] = [
  'overview', 'buttons', 'dpad', 'triggers', 'joysticks', 'touchpad', 'gyro', 'globalChords',
  'sensors', 'gripSensors', 'timing', 'ai', 'debugConsole', 'deviceVisibility', 'help',
]
type GyroSubTab = 'behavior' | 'sensitivity' | 'noise'

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

const GyroBehaviorControls = lazy(async () => {
  const module = await import('./components/GyroBehaviorControls')
  return { default: module.GyroBehaviorControls }
})

const SensitivityControls = lazy(async () => {
  const module = await import('./components/SensitivityControls')
  return { default: module.SensitivityControls }
})

const NoiseSteadyingControls = lazy(async () => {
  const module = await import('./components/NoiseSteadyingControls')
  return { default: module.NoiseSteadyingControls }
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

type PrimaryNavProps = {
  primaryTab: PrimaryTab
  setPrimaryTab: (tab: PrimaryTab) => void
  includeHelp?: boolean
  /** Icon-only rail: labels move to the tooltip and accessible name. */
  collapsed?: boolean
}

const NAV_COLLAPSED_KEY = 'jsm.sidebarCollapsed'

const editorIcon = {
  width: 18, height: 18, viewBox: '0 0 24 24', 'aria-hidden': true, fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
} as const

const UndoIcon = () => (
  <svg {...editorIcon}><path d="m8 4-5 5 5 5" /><path d="M3 9h11a6 6 0 0 1 0 12h-3" /></svg>
)

const RedoIcon = () => (
  <svg {...editorIcon}><path d="m16 4 5 5-5 5" /><path d="M21 9H10a6 6 0 0 0 0 12h3" /></svg>
)

// A floppy disk: the outline, the shutter at the top and the label below.
const SaveIcon = () => (
  <svg {...editorIcon}>
    <path d="M20 21H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h12l5 5v12a1 1 0 0 1-1 1Z" />
    <path d="M7 3v6h9V3M7 21v-7h10v7M13 5v2" />
  </svg>
)

const ChevronDown = () => (
  <svg {...editorIcon} width="12" height="12" viewBox="0 0 16 16"><path d="M4 6.5 8 10.5l4-4" /></svg>
)

// A chevron pointing the way the rail will move, which is the one thing the
// button needs to say without a label.
const CollapseIcon = ({ collapsed }: { collapsed: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor"
    strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1.5" y="2" width="13" height="12" rx="2" />
    <path d="M5.5 2v12" />
    <path d={collapsed ? 'm9 6 2 2-2 2' : 'm11 6-2 2 2 2'} />
  </svg>
)

// One list, rather than fifteen near-identical buttons: the collapsed rail is
// then a rendering choice rather than fifteen more places to keep in step.
const NAV_SECTIONS: { groupKey: string; items: { tab: PrimaryTab; labelKey: string; Icon: () => JSX.Element }[] }[] = [
  {
    groupKey: 'app.nav.controlsGroup',
    items: [
      { tab: 'overview', labelKey: 'app.nav.overview', Icon: OverviewIcon },
      { tab: 'buttons', labelKey: 'app.nav.buttons', Icon: ButtonsIcon },
      { tab: 'dpad', labelKey: 'app.nav.dpad', Icon: DPadIcon },
      { tab: 'triggers', labelKey: 'app.nav.triggers', Icon: TriggersIcon },
      { tab: 'joysticks', labelKey: 'app.nav.joysticks', Icon: JoystickIcon },
      { tab: 'touchpad', labelKey: 'app.nav.trackpads', Icon: TrackpadIcon },
      { tab: 'gyro', labelKey: 'app.nav.gyro', Icon: GyroIcon },
    ],
  },
  {
    groupKey: 'app.nav.tuningGroup',
    items: [
      { tab: 'sensors', labelKey: 'app.nav.sensors', Icon: TuneIcon },
      { tab: 'gripSensors', labelKey: 'app.nav.gripSensors', Icon: GripIcon },
      { tab: 'timing', labelKey: 'app.nav.timing', Icon: TimingIcon },
      { tab: 'ai', labelKey: 'app.nav.aiAssistant', Icon: SparkleIcon },
    ],
  },
  {
    groupKey: 'app.nav.settingsGroup',
    items: [
      { tab: 'debugConsole', labelKey: 'app.nav.debugConsole', Icon: ConsoleIcon },
      { tab: 'globalChords', labelKey: 'app.nav.globalChords', Icon: ChordIcon },
      { tab: 'deviceVisibility', labelKey: 'app.nav.deviceVisibility', Icon: EyeIcon },
    ],
  },
]

const PrimaryNav = ({ primaryTab, setPrimaryTab, includeHelp = false, collapsed = false }: PrimaryNavProps) => {
  const { t } = useTranslation()

  // Collapsed, the label is gone from the screen but not from the button: it
  // stays the accessible name and the hover tooltip, so an icon that reads
  // ambiguously is still identifiable without expanding the rail.
  const renderItem = ({ tab, labelKey, Icon }: { tab: PrimaryTab; labelKey: string; Icon: () => JSX.Element }) => (
    <button
      key={tab}
      className={`${sideNavStyles.navItem} ${primaryTab === tab ? sideNavStyles.active : ''}`}
      onClick={() => setPrimaryTab(tab)}
      title={collapsed ? t(labelKey) : undefined}
      aria-label={collapsed ? t(labelKey) : undefined}
    >
      <span className={sideNavStyles.navItemIcon}><Icon /></span>
      {!collapsed && <span className={sideNavStyles.navItemLabel}>{t(labelKey)}</span>}
    </button>
  )

  return (
    <div className={sideNavStyles.navGroup}>
      {NAV_SECTIONS.map(section => (
        <div className={sideNavStyles.navSection} key={section.groupKey}>
          {/* The grouping survives collapsing -- the rule stands in for the
              heading, so the rail still reads as three sets rather than one
              undifferentiated column of icons. */}
          {collapsed
            ? <div className={sideNavStyles.navSectionRule} aria-hidden="true" />
            : <div className={sideNavStyles.navSectionLabel}>{t(section.groupKey)}</div>}
          {section.items.map(renderItem)}
        </div>
      ))}
      {includeHelp && renderItem({ tab: 'help', labelKey: 'app.nav.documentation', Icon: DocumentIcon })}
    </div>
  )
}

type NavSettingsProps = {
  compactThemeToggle?: boolean
}

// Registers a Windows Scheduled Task rather than a Registry Run entry -- see
// desktopBridge.getAutostartEnabled/setAutostartEnabled and
// src-tauri/src/services/autostart.rs for why that's the version that
// actually launches without a UAC prompt at every logon.
function AutostartToggle() {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let cancelled = false
    desktopBridge.getAutostartEnabled().then(value => {
      if (!cancelled) setEnabled(value)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleChange = async (next: boolean) => {
    setPending(true)
    const previous = enabled
    setEnabled(next)
    const success = await desktopBridge.setAutostartEnabled(next)
    setPending(false)
    if (!success) {
      // Revert the optimistic flip and say so -- a silent failure here would
      // leave someone thinking Windows will start the app for them when it
      // won't, which they'd only discover the next time they reboot.
      setEnabled(previous)
      showToast(t('messages.autostartFailed'), 'error')
    }
  }

  return (
    <button
      type="button"
      className={`${themeToggleStyles.themeToggle} ${enabled ? themeToggleStyles.on : ''} ${sideNavStyles.navThemeToggle}`}
      aria-pressed={enabled}
      aria-label={t('app.nav.startWithWindows')}
      disabled={pending}
      onClick={() => handleChange(!enabled)}
    >
      <span className={themeToggleStyles.labelGroup}>
        <span className={themeToggleStyles.text}>{t('app.nav.startWithWindows')}</span>
      </span>
      <span className={themeToggleStyles.switch} aria-hidden="true">
        <span className={themeToggleStyles.thumb} />
      </span>
    </button>
  )
}

// Installs / removes the AutoLoad rule that maps the controller to keyboard
// and mouse while JSM Studio's own window is in front (AppNavigation.txt).
// Needs AutoLoad on to do anything, which the toggle's hint says.
function ControllerNavToggle() {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(true)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let cancelled = false
    desktopBridge.getRuntimeMappingState().then(state => {
      if (!cancelled) setEnabled(state.controllerNavEnabled)
    }).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const handleChange = async (next: boolean) => {
    setPending(true)
    const previous = enabled
    setEnabled(next)
    try {
      const state = await desktopBridge.setControllerNavEnabled(next)
      setEnabled(state.controllerNavEnabled)
      window.dispatchEvent(new CustomEvent('jsm:controller-nav', { detail: state.controllerNavEnabled }))
    } catch (error) {
      console.error('Failed to update controller navigation', error)
      setEnabled(previous)
      showToast(t('messages.controllerNavUpdateFailed'), 'error')
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      className={`${themeToggleStyles.themeToggle} ${enabled ? themeToggleStyles.on : ''} ${sideNavStyles.navThemeToggle}`}
      aria-pressed={enabled}
      aria-label={t('app.nav.controllerNav')}
      disabled={pending}
      onClick={() => handleChange(!enabled)}
    >
      <span className={themeToggleStyles.labelGroup}>
        <span className={themeToggleStyles.text}>{t('app.nav.controllerNav')}</span>
      </span>
      <span className={themeToggleStyles.switch} aria-hidden="true">
        <span className={themeToggleStyles.thumb} />
      </span>
    </button>
  )
}

const NavSettings = ({ compactThemeToggle = false }: NavSettingsProps) => (
  <div className={sideNavStyles.navSettings}>
    <LanguageSelect className={sideNavStyles.navLanguageSelect} />
    <ThemeToggle compact={compactThemeToggle} className={sideNavStyles.navThemeToggle} />
    <ControllerNavToggle />
    <AutostartToggle />
  </div>
)

function App() {
  const { t } = useTranslation()
  const { sample, isCalibrating, countdown } = useTelemetry()
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
  const [controllerNavEnabled, setControllerNavEnabled] = useState(true)
  const [runtimeMappingBusy, setRuntimeMappingBusy] = useState(false)
  const [calibrationTurns, setCalibrationTurns] = useState('1')
  const [primaryTab, setPrimaryTab] = useState<PrimaryTab>('overview')
  // Remembered per machine. Reading storage can throw outright in a locked-down
  // webview, so a failure just means the rail starts open.
  const [navCollapsed, setNavCollapsed] = useState(() => {
    try { return localStorage.getItem(NAV_COLLAPSED_KEY) === '1' } catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem(NAV_COLLAPSED_KEY, navCollapsed ? '1' : '0') } catch { /* preference is not worth failing over */ }
  }, [navCollapsed])

  const stepPage = useCallback((delta: 1 | -1) => {
    setPrimaryTab(prev => {
      const index = Math.max(0, PAGE_ORDER.indexOf(prev))
      return PAGE_ORDER[(index + delta + PAGE_ORDER.length) % PAGE_ORDER.length]
    })
  }, [])
  const closeFloatingWindows = useCallback(() => {
    if (isConfigDrawerOpen) {
      setConfigDrawerOpen(false)
      return true
    }
    return false
  }, [isConfigDrawerOpen])
  const { modalOpen } = useKeyboardNav({ onPageStep: stepPage, onEscape: closeFloatingWindows, activePage: primaryTab })

  useEffect(() => {
    const handler = (event: Event) => setControllerNavEnabled(Boolean((event as CustomEvent<boolean>).detail))
    window.addEventListener('jsm:controller-nav', handler)
    return () => window.removeEventListener('jsm:controller-nav', handler)
  }, [])
  const [gyroSubTab, setGyroSubTab] = useState<GyroSubTab>('behavior')
  const [selectedMappingCommand, setSelectedMappingCommand] = useState<string | null>('N')
  const [inputRequest, setInputRequest] = useState<{ command: string } | null>(null)
  const navigateInput = (raw: string) => {
    const command = normalizePreviewInput(raw)
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
      target.scrollIntoView({ block: 'center' })
      const control = target.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled]), [role="combobox"]')
      ;(control ?? target).focus({ preventScroll: true })
      return true
    }
    if (focus()) return
    const observer = new MutationObserver(() => { if (focus()) observer.disconnect() })
    observer.observe(pane, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [inputRequest])

  const [showHidHideElevationModal, setShowHidHideElevationModal] = useState(false)
  const configWindowRef = useRef<HTMLDivElement | null>(null)
  const configWindowDragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null)
  const {
    configText,
    setConfigText,
    resetConfigHistory, canUndo, canRedo, undo, redo,
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
    handleTickTimeChange,
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
        })
      ),
    [
      gridSizeValue,
      leftGridSizeValue,
      leftTouchpadModeValue,
      rightGridSizeValue,
      rightTouchpadModeValue,
      touchpadModeValue,
    ]
  )

  // Mirrors KeymapControls' own showPerPadTouchpads: with nothing plugged in the
  // page still shows both pads, so the side rail has to as well.
  const hasTwoTrackpads = useMemo(() => {
    const devices = sample?.devices
    if (!devices || devices.length === 0) return true
    return devices.some(device => controllerHasTwoTrackpads(device.type))
  }, [sample?.devices])

  const trackpadRailItems = useMemo(
    () => [
      { id: TRACKPAD_ANCHORS.left, tag: 'L', label: t('keymap.leftTrackpadSection', 'Left trackpad') },
      { id: TRACKPAD_ANCHORS.right, tag: 'R', label: t('keymap.rightTrackpadSection', 'Right trackpad') },
      { id: TRACKPAD_ANCHORS.buttons, label: t('keymap.touchButtonsTitle') },
    ],
    [t]
  )

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
  } = useProfileLibrary({
    resetConfigHistory,
    configText,
    setConfigText,
    setAppliedConfig,
    setStatusMessage,
    resetPendingSensitivityChanges: resetPendingSensitivityChanges,
  })
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
        requestAnimationFrame(() => target.select())
      } else if (target instanceof HTMLTextAreaElement) {
        if (target.disabled || target.readOnly) return
        const skipAutoSelect = target.closest('.config-panel')
        if (skipAutoSelect) return
        requestAnimationFrame(() => target.select())
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
  const resolveProfileSwitch = async (choice: 'save' | 'discard') => {
    const name = pendingProfileSwitch
    if (!name) return
    setPendingProfileSwitch(null)
    // Save what is on screen, including any value still being typed, before it
    // is replaced -- the same finalize step the Save button runs.
    if (choice === 'save' && !await saveConfig({ textOverride: finalizePendingValues?.() ?? configText })) return
    void handleLoadProfileFromLibrary(name)
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
  const bindingLabels = useMemo(() => parseBindingLabels(configText), [configText])
  const handleBindingLabelChange = useCallback((command: string, label: string) => {
    setConfigText(prev => setBindingLabel(prev, command, label))
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

  const renderGyroNav = () => (
    <div className="subnav">
      <button className={`pill-tab ${gyroSubTab === 'behavior' ? 'active' : ''}`} onClick={() => setGyroSubTab('behavior')}>
        {t('app.tabs.gyroBehavior')}
      </button>
      <button className={`pill-tab ${gyroSubTab === 'sensitivity' ? 'active' : ''}`} onClick={() => setGyroSubTab('sensitivity')}>
        {t('app.tabs.sensitivity')}
      </button>
      <button className={`pill-tab ${gyroSubTab === 'noise' ? 'active' : ''}`} onClick={() => setGyroSubTab('noise')}>
        {t('app.tabs.noiseAndSteadying')}
      </button>
    </div>
  )

  const renderUtilityBar = () => (
    <div className="utility-bar">
      <div className={`utility-mapping-switch ${mappingEnabled ? 'is-enabled' : 'is-paused'}`}>
        <label className={`mapping-toggle-control ${mappingEnabled ? 'is-enabled' : 'is-paused'}`}>
          <input
            type="checkbox"
            checked={mappingEnabled}
            disabled={runtimeMappingBusy}
            aria-label={t('app.profileSummary.mappingOutput')}
            onChange={() => {
              void handleToggleMappingEnabled()
            }}
          />
          <span className="mapping-toggle-slider" aria-hidden="true" />
          <span className="mapping-toggle-state">
            {mappingEnabled ? t('app.profileSummary.mappingOutputOn') : t('app.profileSummary.mappingOutputPaused')}
          </span>
        </label>
      </div>

      <div className="utility-profile-group">
        <div className="utility-applied" aria-live="polite">
          {mappingEnabled
            ? t('app.profileSummary.appliedLabel', {
                name:
                  (typeof sample?.activeProfile === 'string'
                    ? sample.activeProfile.replace(/\\/g, '/').split('/').pop()?.replace(/\.txt$/i, '')
                    : appliedProfileName) ?? t('app.profileSummary.unknownProfile'),
              })
            : t('app.profileSummary.mappingPausedShort')}
        </div>
        {/* One control, not two. The name is the quick-glance indicator of what
            you are editing, and pressing it opens the one place that switches,
            renames, creates and deletes configurations -- the dropdown beside a
            separate Manage button was a second way to do the same thing. */}
        <button
          type="button"
          className="profile-chip"
          title={`${t('app.profileSummary.editingTitle')}: ${currentLibraryProfile ?? t('app.profileSummary.selectProfile')}`}
          aria-label={`${t('app.profileSummary.editingTitle')}: ${currentLibraryProfile ?? t('app.profileSummary.selectProfile')}`}
          disabled={isCalibrating}
          onClick={() => setProfileModalOpen(true)}
          aria-haspopup="dialog"
        >
          <span className="profile-chip-name">{currentLibraryProfile ?? t('app.profileSummary.selectProfile')}</span>
          {hasPendingChanges && <span className="profile-chip-dot" aria-hidden="true" />}
          <ChevronDown />
        </button>
      </div>

      {/* One toolbar with a clear order of importance: the configuration you
          are editing leads, then managing configurations, then the two
          occasional escape hatches as quiet ghost buttons. Four equal-weight
          buttons in a row gave no clue which one you normally want. */}
      <div className="utility-actions">
        <button className="icon-btn" disabled={!canUndo || isCalibrating} onClick={undo}
          title={`${t('app.profileSummary.undo')} (Ctrl+Z)`} aria-label={t('app.profileSummary.undo')}><UndoIcon /></button>
        <button className="icon-btn" disabled={!canRedo || isCalibrating} onClick={redo}
          title={`${t('app.profileSummary.redo')} (Ctrl+Shift+Z)`} aria-label={t('app.profileSummary.redo')}><RedoIcon /></button>
        {/* Save writes the configuration being edited back to its own file;
            Apply sends it to the controller. Naming what each one acts on beats
            one button that did both to something you had to infer. */}
        <button className="icon-btn" disabled={isCalibrating || editorBusy || !currentLibraryProfile}
          onClick={() => void runEditorAction('save')}
          title={currentLibraryProfile
            ? `${t('app.profileSummary.saveNamed', { name: currentLibraryProfile })} (Ctrl+S)`
            : t('app.profileSummary.saveConfiguration')}
          aria-label={t('app.profileSummary.saveConfiguration')}><SaveIcon /></button>
        {hasPendingChanges && <span className="pill pill--warning">{t('app.profileSummary.unsavedChanges')}</span>}
        <button className="primary-btn" disabled={isCalibrating || editorBusy || !currentLibraryProfile}
          onClick={() => void runEditorAction('apply')}
          title={currentLibraryProfile
            ? `${t('app.profileSummary.applyNamed', { name: currentLibraryProfile })} (Ctrl+Shift+A)`
            : t('app.profileSummary.applyEditingConfiguration')}>
          {t('app.profileSummary.applyEditingConfiguration')}
        </button>
        <button className="ghost-btn" onClick={() => setAutoloadModalOpen(true)}>
          {t('app.profileSummary.autoloadManager')}
        </button>
        <button
          className="ghost-btn"
          onClick={() => {
            setConfigWindowPosition(null)
            setConfigDrawerOpen(true)
          }}
        >
          {t('app.profileSummary.openSourceConfig')}
        </button>
        <button className="ghost-btn" onClick={handleOpenConfigDirectory}>
          {t('app.profileSummary.openConfigDirectory')}
        </button>
        {isCalibrating ? (
          <span className="calibration-pill calibration-pill-inline utility-calibration-pill">
            {t('app.recalibration.calibratingCountdown', { seconds: countdown ?? '-' })}
          </span>
        ) : (
          <button className="primary-btn" onClick={handleRecalibrate} disabled={recalibrating}>
            {recalibrating ? t('app.recalibration.recalibrating') : t('app.recalibration.recalibrateGyro')}
          </button>
        )}
      </div>
    </div>
  )

  const renderPrimaryContent = () => {
    if (primaryTab === 'gyro') {
      return (
        <div className="page-with-subnav">
          <div className="page-subnav">{renderGyroNav()}</div>
          {gyroSubTab === 'behavior' && (
            <Suspense fallback={<LazyPanelFallback title={t('app.tabs.gyroBehavior')} />}>
              <GyroBehaviorControls
                sensitivity={sensitivity}
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
                onTickTimeChange={handleTickTimeChange}
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
                appliedSampleHz={telemetryValues.sampleHz}
              />
            </Suspense>
          )}
          {gyroSubTab === 'sensitivity' && (
            <Suspense fallback={<LazyPanelFallback title={t('app.tabs.sensitivity')} />}>
              <SensitivityControls
                sensitivity={sensitivity}
                modeshiftSensitivity={modeshiftSensitivity}
                isCalibrating={isCalibrating}
                statusMessage={statusMessage}
                accelCurve={sensitivity.accelCurve}
                naturalVHalf={sensitivity.naturalVHalf}
                powerVRef={sensitivity.powerVRef}
                powerExponent={sensitivity.powerExponent}
                sigmoidMid={sensitivity.sigmoidMid}
                sigmoidWidth={sensitivity.sigmoidWidth}
                jumpTau={sensitivity.jumpTau}
                mode={currentMode}
                sensitivityView={sensitivityView}
                hasPendingChanges={hasPendingChanges}
                sample={sample}
                telemetry={telemetryValues}
                touchpadMode={touchpadModeValue}
                touchpadGridCells={gyroGridCommands.length}
                onModeChange={(mode) => handleModeSelection(mode, activeSensitivityPrefix)}
                onSensitivityViewChange={setSensitivityView}
                onApply={handleApplyWithFinalize}
                onCancel={handleCancel}
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
                lockMessage={lockMessage}
                accelCurveLink={accelCurveLinkValue}
                onAccelCurveLinkChange={handleAccelCurveLinkChange}
              />
            </Suspense>
          )}
          {gyroSubTab === 'noise' && (
            <Suspense fallback={<LazyPanelFallback title={t('app.tabs.noiseAndSteadying')} />}>
              <NoiseSteadyingControls
                sensitivity={sensitivity}
                isCalibrating={isCalibrating}
                statusMessage={statusMessage}
                hasPendingChanges={hasPendingChanges}
                onApply={handleApplyWithFinalize}
                onCancel={handleCancel}
                lockMessage={lockMessage}
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
                telemetry={{
                  omega: telemetryValues.omega,
                  timestamp: telemetryValues.timestamp,
                  sampleHz: telemetryValues.sampleHz,
                }}
              />
            </Suspense>
          )}
        </div>
      )
    }

    if (primaryTab === 'timing') {
      return (
        <Suspense fallback={<LazyPanelFallback title={t('app.nav.timing')} />}>
          <KeymapControls
            onConfigTextChange={setConfigText}
            visibleSections={['global']}
            configText={configText}
            onBindingChange={handleFaceButtonBindingChange}
            onAssignSpecialAction={handleSpecialActionAssignment}
            onClearSpecialAction={handleClearSpecialAction}
            trackballDecay={trackballDecayValue}
            onTrackballDecayChange={handleTrackballDecayChange}
            onModifierChange={handleModifierChange}
            hasPendingChanges={hasPendingChanges}
            isCalibrating={isCalibrating}
            statusMessage={statusMessage}
            onApply={handleApplyWithFinalize}
            onCancel={handleCancel}
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
            adaptiveTriggerValue={adaptiveTriggerValue}
            onAdaptiveTriggerChange={handleAdaptiveTriggerChange}
            triggerThreshold={triggerThresholdValue}
            onTriggerThresholdChange={handleTriggerThresholdChange}
            virtualControllerType={virtualControllerType}
            virtualControllerWarnings={virtualControllerWarnings}
            onVirtualControllerTypeChange={handleVirtualControllerTypeChange}
            onBindGamepadPassthrough={handleBindGamepadPassthrough}
            onBindDirectionsToWasd={handleBindDirectionsToWasd}
            lockMessage={lockMessage}
          />
        </Suspense>
      )
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
            configText={configText}
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

    if (primaryTab === 'touchpad' || primaryTab === 'sensors' || primaryTab === 'gripSensors') {
      // One panel, three disjoint slices of it. Mouse tuning describes the pads'
      // output, the grip sensors are a different piece of hardware entirely, and
      // the trackpads page is for what the pads are bound to.
      const sections = primaryTab === 'sensors'
        ? ['touch-sensors']
        : primaryTab === 'gripSensors'
          ? ['grip-sensors']
          : ['touch-grid', 'touch-stick', 'touch-bind']
      const panel = (
        <Suspense fallback={<LazyPanelFallback title={t('app.nav.touchpad')} />}>
          <KeymapControls
            onConfigTextChange={setConfigText}
            onOpenTuning={() => setPrimaryTab('sensors')}
            view="touchpad"
            selectedMappingCommand={selectedMappingCommand}
            configText={configText}
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
            onBindDirectionsToWasd={handleBindDirectionsToWasd}
          />
        </Suspense>
      )

      // The trackpads page is one tall column of Left pad, Right pad and the
      // shared buttons, so it gets its own index down the side. The two tuning
      // pages are short enough not to need one.
      if (primaryTab === 'sensors') return <div className="page-with-rail">
        <PageSideNav ariaLabel="Trackpad tuning sections" items={[
          { id: 'touch-smoothing', label: 'Motion' }, { id: 'touch-release', label: 'Press & release' },
          { id: 'touch-glide', label: 'Trackball' }, { id: 'touch-haptics', label: 'Haptics' }, { id: 'touch-accel', label: 'Acceleration' },
        ]} /><div className="page-rail-content">{panel}</div></div>
      if (primaryTab !== 'touchpad' || !hasTwoTrackpads) return panel
      return (
        <div className="page-with-rail">
          <PageSideNav ariaLabel={t('app.nav.trackpads')} items={trackpadRailItems} />
          <div className="page-rail-content">{panel}</div>
        </div>
      )
    }

    if (primaryTab === 'overview') {
      return (
        <OverviewPage
          devices={sample?.devices}
          onNavigate={(target) => setPrimaryTab(target)}
          onSelectCommand={navigateInput}
          configText={configText}
        />
      )
    }

    if (primaryTab === 'globalChords') {
      return (
        <Suspense fallback={<LazyPanelFallback title={t('app.nav.globalChords')} />}>
          <GlobalChordsPage devices={sample?.devices} onChordsChanged={() => { void refreshLibraryProfiles() }} />
        </Suspense>
      )
    }

    if (primaryTab === 'deviceVisibility') {
      return <HidHidePage telemetryDevices={sample?.devices} />
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
              await applyConfig({ textOverride: nextConfig })
            }}
          />
        </Suspense>
      )
    }

    if (primaryTab === 'help') {
      return (
        <Suspense fallback={<LazyPanelFallback title={t('app.nav.documentation')} />}>
          <HelpDocsPage />
        </Suspense>
      )
    }

    return null
  }

  return (
    <div className={`app-shell ${navCollapsed ? 'nav-collapsed' : ''}`}>
      <ToastHost />
      <Suspense fallback={null}>
        <UpdateBanner />
      </Suspense>
      {/* Desktop sidebar */}
      <aside className={`${sideNavStyles.sideNav} ${navCollapsed ? sideNavStyles.collapsed : ''}`}>
        <div className={sideNavStyles.navBrandRow}>
          {!navCollapsed && <div className={sideNavStyles.navBrand}>{t('common.appName')}</div>}
          <button
            type="button"
            className={sideNavStyles.navCollapseToggle}
            onClick={() => setNavCollapsed(value => !value)}
            title={t(navCollapsed ? 'app.nav.expandSidebar' : 'app.nav.collapseSidebar')}
            aria-label={t(navCollapsed ? 'app.nav.expandSidebar' : 'app.nav.collapseSidebar')}
            aria-expanded={!navCollapsed}
          >
            <CollapseIcon collapsed={navCollapsed} />
          </button>
        </div>
        <PrimaryNav primaryTab={primaryTab} setPrimaryTab={setPrimaryTab} includeHelp collapsed={navCollapsed} />
        <div className={sideNavStyles.navFooter}>
          {!navCollapsed && <NavSettings />}
          {!navCollapsed && <div className={sideNavStyles.navVersion}>v{tauriConf.version}</div>}
        </div>
      </aside>
      {/* Narrow-width sticky header */}
      <div className="responsive-header">
        <div className={sideNavStyles.navHeaderRow}>
          <div>
            <div className={sideNavStyles.navBrand}>{t('common.appName')}</div>
            <PrimaryNav primaryTab={primaryTab} setPrimaryTab={setPrimaryTab} includeHelp />
          </div>
          <NavSettings compactThemeToggle />
        </div>
      </div>
      <div className="shell-main">
        {renderUtilityBar()}
        <div className="shell-scroll"><div className="content-grid">
          <main className="main-pane"><ConfigBaseline.Provider value={{ text: configText, saved: appliedConfig, onChange: text => { resetPendingSensitivityChanges(); setConfigText(text) } }}>
            {(primaryTab === 'gyro' || primaryTab === 'sensors' || primaryTab === 'gripSensors') && <TuningClipboard kind={primaryTab === 'gyro' ? 'gyro' : primaryTab === 'sensors' ? 'trackpad' : 'grip'} text={configText} onChange={text => { resetPendingSensitivityChanges(); setConfigText(text) }} disabled={isCalibrating} />}
            <ConfigScope match={primaryTab === 'gyro' ? /^(GYRO_|MIN_GYRO|MAX_GYRO|ACCEL_|SMOOTH_|CUTOFF_|ONE_EURO|ANGLE_|DECEL_|ROLL_|IN_GAME|REAL_WORLD|TICK_TIME)/ : /./}>{renderPrimaryContent()}</ConfigScope>
          </ConfigBaseline.Provider></main>
        </div></div>
        <ControllerGlyphBar
          devices={sample?.devices}
          modalOpen={modalOpen}
          enabled={mappingEnabled && autoloadEnabled && controllerNavEnabled}
        />
      </div>
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
              </div>
            </div>
            <button type="button" className="ghost-btn" onClick={() => setConfigDrawerOpen(false)}>
              {t('common.close')}
            </button>
          </div>
          <div className="config-source-window-body">
            <Suspense fallback={<LazyPanelFallback title={profileFileLabel} compact />}>
              <ConfigEditor
                value={configText}
                label={profileFileLabel}
                disabled={isCalibrating}
                hasPendingChanges={hasPendingChanges}
                statusMessage={null}
                onChange={setConfigText}
                onApply={handleApplyWithFinalize}
                onCancel={handleCancel}
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
              const baseText = finalizePendingValues ? finalizePendingValues() : configText
              const withRwc = updateKeymapEntry(baseText, 'REAL_WORLD_CALIBRATION', [parseFloat(rwc)])
              const withSens = updateKeymapEntry(withRwc, 'IN_GAME_SENS', [parseFloat(sens)])
              setConfigText(withSens)
              applyConfig({ textOverride: withSens })
            }}
          />
        </Suspense>
      )}
      {pendingProfileSwitch && (
        <div className="modal-overlay modal-overlay--over">
          <div className="modal-card unsaved-modal" role="alertdialog" aria-modal="true" aria-labelledby="unsaved-switch-title">
            <div className="modal-header">
              <h3 id="unsaved-switch-title">{t('app.unsavedSwitch.title')}</h3>
            </div>
            <p className="unsaved-modal-body">
              {t('app.unsavedSwitch.body', {
                current: currentLibraryProfile ?? t('app.profileSummary.unsavedProfile'),
                next: pendingProfileSwitch,
              })}
            </p>
            <div className="unsaved-modal-actions">
              <button className="ghost-btn" onClick={() => setPendingProfileSwitch(null)}>
                {t('common.cancel')}
              </button>
              <button className="secondary-btn" onClick={() => void resolveProfileSwitch('discard')}>
                {t('app.unsavedSwitch.discard')}
              </button>
              <button className="primary-btn" onClick={() => void resolveProfileSwitch('save')}>
                {t('app.unsavedSwitch.saveAndSwitch')}
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
              <ProfileManager
                currentProfileName={currentLibraryProfile}
                appliedProfileName={appliedProfileName}
                hasPendingChanges={hasPendingChanges}
                isCalibrating={isCalibrating}
                profileApplied={currentLibraryProfile === appliedProfileName && configText === runtimeConfig}
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
              />
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
            onClose={() => setAutoloadModalOpen(false)}
          />
        </Suspense>
      )}
    </div>
  )
}

export default App
