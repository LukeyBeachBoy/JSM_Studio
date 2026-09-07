import './App.css'
import { inputPage, normalizePreviewInput } from './utils/inputNavigation'
// The version people see must be the one on the installer they downloaded, and
// tauri.conf.json is what the installer is built from.
import tauriConf from '../src-tauri/tauri.conf.json'
import sideNavStyles from './components/SideNav.module.css'
import {
  OverviewIcon,
  ControllerIcon,
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
import { ControllerStatusPage } from './components/ControllerStatusPage'
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
type PrimaryTab = ControlTab | 'gyro' | 'touchpad' | 'globalChords' | 'sensors' | 'gripSensors' | 'timing' | 'controllerStatus' | 'debugConsole' | 'ai' | 'help' | 'deviceVisibility' | 'overview'

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
  'sensors', 'gripSensors', 'timing', 'ai', 'controllerStatus', 'debugConsole', 'deviceVisibility', 'help',
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
}

const PrimaryNav = ({ primaryTab, setPrimaryTab, includeHelp = false }: PrimaryNavProps) => {
  const { t } = useTranslation()

  return (
    <div className={sideNavStyles.navGroup}>
      <div className={sideNavStyles.navSection}>
        <div className={sideNavStyles.navSectionLabel}>{t('app.nav.dashboardGroup')}</div>
        <button
          className={`${sideNavStyles.navItem} ${primaryTab === 'controllerStatus' ? sideNavStyles.active : ''}`}
          onClick={() => setPrimaryTab('controllerStatus')}
        >
          <span className={sideNavStyles.navItemIcon}><ControllerIcon /></span>
          {t('app.nav.controllerStatus')}
        </button>
        <button
          className={`${sideNavStyles.navItem} ${primaryTab === 'debugConsole' ? sideNavStyles.active : ''}`}
          onClick={() => setPrimaryTab('debugConsole')}
        >
          <span className={sideNavStyles.navItemIcon}><ConsoleIcon /></span>
          {t('app.nav.debugConsole')}
        </button>
      </div>
      <div className={sideNavStyles.navSection}>
        <div className={sideNavStyles.navSectionLabel}>{t('app.nav.controlsGroup')}</div>
        <button
          className={`${sideNavStyles.navItem} ${primaryTab === 'overview' ? sideNavStyles.active : ''}`}
          onClick={() => setPrimaryTab('overview')}
        >
          <span className={sideNavStyles.navItemIcon}><OverviewIcon /></span>
          {t('app.nav.overview')}
        </button>
        <button
          className={`${sideNavStyles.navItem} ${primaryTab === 'buttons' ? sideNavStyles.active : ''}`}
          onClick={() => setPrimaryTab('buttons')}
        >
          <span className={sideNavStyles.navItemIcon}><ButtonsIcon /></span>
          {t('app.nav.buttons')}
        </button>
        <button
          className={`${sideNavStyles.navItem} ${primaryTab === 'dpad' ? sideNavStyles.active : ''}`}
          onClick={() => setPrimaryTab('dpad')}
        >
          <span className={sideNavStyles.navItemIcon}><DPadIcon /></span>
          {t('app.nav.dpad')}
        </button>
        <button
          className={`${sideNavStyles.navItem} ${primaryTab === 'triggers' ? sideNavStyles.active : ''}`}
          onClick={() => setPrimaryTab('triggers')}
        >
          <span className={sideNavStyles.navItemIcon}><TriggersIcon /></span>
          {t('app.nav.triggers')}
        </button>
        <button
          className={`${sideNavStyles.navItem} ${primaryTab === 'joysticks' ? sideNavStyles.active : ''}`}
          onClick={() => setPrimaryTab('joysticks')}
        >
          <span className={sideNavStyles.navItemIcon}><JoystickIcon /></span>
          {t('app.nav.joysticks')}
        </button>
        <button
          className={`${sideNavStyles.navItem} ${primaryTab === 'touchpad' ? sideNavStyles.active : ''}`}
          onClick={() => setPrimaryTab('touchpad')}
        >
          <span className={sideNavStyles.navItemIcon}><TrackpadIcon /></span>
          {t('app.nav.trackpads')}
        </button>
        <button
          className={`${sideNavStyles.navItem} ${primaryTab === 'gyro' ? sideNavStyles.active : ''}`}
          onClick={() => setPrimaryTab('gyro')}
        >
          <span className={sideNavStyles.navItemIcon}><GyroIcon /></span>
          {t('app.nav.gyro')}
        </button>
      </div>
      <div className={sideNavStyles.navSection}>
        <div className={sideNavStyles.navSectionLabel}>{t('app.nav.tuningGroup')}</div>
        <button
          className={`${sideNavStyles.navItem} ${primaryTab === 'sensors' ? sideNavStyles.active : ''}`}
          onClick={() => setPrimaryTab('sensors')}
        >
          <span className={sideNavStyles.navItemIcon}><TuneIcon /></span>
          {t('app.nav.sensors')}
        </button>
        <button
          className={`${sideNavStyles.navItem} ${primaryTab === 'gripSensors' ? sideNavStyles.active : ''}`}
          onClick={() => setPrimaryTab('gripSensors')}
        >
          <span className={sideNavStyles.navItemIcon}><GripIcon /></span>
          {t('app.nav.gripSensors')}
        </button>
        <button
          className={`${sideNavStyles.navItem} ${primaryTab === 'timing' ? sideNavStyles.active : ''}`}
          onClick={() => setPrimaryTab('timing')}
        >
          <span className={sideNavStyles.navItemIcon}><TimingIcon /></span>
          {t('app.nav.timing')}
        </button>
        <button
          className={`${sideNavStyles.navItem} ${primaryTab === 'ai' ? sideNavStyles.active : ''}`}
          onClick={() => setPrimaryTab('ai')}
        >
          <span className={sideNavStyles.navItemIcon}><SparkleIcon /></span>
          {t('app.nav.aiAssistant')}
        </button>
      </div>
      <div className={sideNavStyles.navSection}>
        <div className={sideNavStyles.navSectionLabel}>{t('app.nav.settingsGroup')}</div>
        <button
          className={`${sideNavStyles.navItem} ${primaryTab === 'globalChords' ? sideNavStyles.active : ''}`}
          onClick={() => setPrimaryTab('globalChords')}
        >
          <span className={sideNavStyles.navItemIcon}><ChordIcon /></span>
          {t('app.nav.globalChords')}
        </button>

        <button
          className={`${sideNavStyles.navItem} ${primaryTab === 'deviceVisibility' ? sideNavStyles.active : ''}`}
          onClick={() => setPrimaryTab('deviceVisibility')}
        >
          <span className={sideNavStyles.navItemIcon}><EyeIcon /></span>
          {t('app.nav.deviceVisibility')}
        </button>
      </div>
      {includeHelp && (
        <button
          className={`${sideNavStyles.navItem} ${primaryTab === 'help' ? sideNavStyles.active : ''}`}
          onClick={() => setPrimaryTab('help')}
        >
          <span className={sideNavStyles.navItemIcon}><DocumentIcon /></span>
          {t('app.nav.documentation')}
        </button>
      )}
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
  const [primaryTab, setPrimaryTab] = useState<PrimaryTab>('controllerStatus')

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
    touchpadHapticIntensityValue,
    touchpadHapticEffectValue,
    touchpadHapticIntervalValue,
    touchpadClickHapticIntensityValue,
    touchpadClickHapticEffectValue,
    touchpadReleaseHapticIntensityValue,
    touchpadReleaseHapticEffectValue,
    handleTouchpadMovementThresholdChange,
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
    appliedProfileName,
    refreshLibraryProfiles,
    handleLoadProfileFromLibrary,
    handleLibraryProfileNameChange,
    handleCreateProfile,
    handleRenameProfile,
    handleDeleteLibraryProfile,
    handleImportProfile,
    handleCopyActiveProfile,
  } = useProfileLibrary({
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
        <div className="utility-title">{t('app.profileSummary.editingTitle')}</div>
        <div aria-live="polite">
          {mappingEnabled
            ? t('app.profileSummary.appliedLabel', {
                name:
                  (typeof sample?.activeProfile === 'string'
                    ? sample.activeProfile.replace(/\\/g, '/').split('/').pop()?.replace(/\.txt$/i, '')
                    : appliedProfileName) ?? t('app.profileSummary.unknownProfile'),
              })
            : t('app.profileSummary.mappingPausedShort')}
        </div>
        <label className="utility-profile-select">
          <AppSelect
            className="app-select"
            disabled={isCalibrating}
            value={currentLibraryProfile ?? ''}
            onChange={event => {
              const name = event.target.value
              if (!name) return
              handleLoadProfileFromLibrary(name)
            }}
          >
            <option value="" disabled>
              {t('app.profileSummary.selectProfile')}
            </option>
            {(libraryProfiles ?? []).map(name => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </AppSelect>
        </label>
      </div>

      {/* One toolbar with a clear order of importance: the configuration you
          are editing leads, then managing configurations, then the two
          occasional escape hatches as quiet ghost buttons. Four equal-weight
          buttons in a row gave no clue which one you normally want. */}
      <div className="utility-actions">
        <button className="primary-btn" disabled={isCalibrating} onClick={() => void applyConfig({ textOverride: finalizePendingValues?.() ?? configText })}>
          {t('app.profileSummary.applyEditingConfiguration')}
        </button>
        <button className="secondary-btn" disabled={isCalibrating} onClick={() => void saveConfig({ textOverride: finalizePendingValues?.() ?? configText })}>
          {t('app.profileSummary.saveConfiguration')}
        </button>
        <button className="secondary-btn" onClick={() => setProfileModalOpen(true)}>
          {t('app.profileSummary.manageProfiles')}
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
          />
        </Suspense>
      )

      // The trackpads page is one tall column of Left pad, Right pad and the
      // shared buttons, so it gets its own index down the side. The two tuning
      // pages are short enough not to need one.
      if (primaryTab !== 'touchpad' || !hasTwoTrackpads) return panel
      return (
        <div className="page-with-rail">
          <PageSideNav ariaLabel={t('app.nav.trackpads')} items={trackpadRailItems} />
          <div className="page-rail-content">{panel}</div>
        </div>
      )
    }

    if (primaryTab === 'controllerStatus') {
      return (
        <ControllerStatusPage
          devices={sample?.devices}
          onSelectCommand={navigateInput}
          ignoredDevices={ignoredGyroDevices}
        />
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
    <div className="app-shell">
      <ToastHost />
      <Suspense fallback={null}>
        <UpdateBanner />
      </Suspense>
      {/* Desktop sidebar */}
      <aside className={sideNavStyles.sideNav}>
        <div className={sideNavStyles.navBrand}>{t('common.appName')}</div>
        <PrimaryNav primaryTab={primaryTab} setPrimaryTab={setPrimaryTab} includeHelp />
        <div className={sideNavStyles.navFooter}>
          <NavSettings />
          <div className={sideNavStyles.navVersion}>v{tauriConf.version}</div>
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
          <main className="main-pane">{renderPrimaryContent()}</main>
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
                  setPrimaryTab('controllerStatus')
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
                profileApplied={currentLibraryProfile === appliedProfileName && configText === appliedConfig}
                onImportProfile={handleImportProfile}
                libraryProfiles={libraryProfiles}
                libraryLoading={isLibraryLoading}
                editedProfileNames={editedLibraryNames}
                onProfileNameChange={handleLibraryProfileNameChange}
                onRenameProfile={handleRenameProfile}
                onDeleteProfile={handleDeleteLibraryProfile}
                onAddProfile={handleCreateProfile}
                onLoadLibraryProfile={handleLoadProfileFromLibrary}
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
