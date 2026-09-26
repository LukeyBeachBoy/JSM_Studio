export type BackendChoice = 'SDL' | 'legacy'

export type CalibrationStatus = {
  calibrating: boolean
  seconds?: number
}

/** The mapper stopping by itself (System States 17c). */
export type MapperExit = {
  exitCode: number
  /** Unix milliseconds. */
  stoppedAtMs: number
  lastLine?: string | null
}

export type MapperStatus = {
  running: boolean
  exit?: MapperExit | null
}

/** How a CALIBRATE_GYRO run ended; "moved" when the controller was picked up. */
/** The configuration layers the mapper has on right now, in stack order. */
export type LayerStack = { profile: string; layers: { id: string; name: string }[] }

export type GyroCalibrationResult = {
  ok: boolean
  reason?: 'moved'
  reached?: number
}

export type ApplyProfileResult = {
  restarted: boolean
  path?: string
  mappingEnabled?: boolean
}

export type RuntimeMappingState = {
  activeProfilePath: string
  mappingEnabled: boolean
  autoloadEnabled: boolean
  /** Built-in AutoLoad rule that lets the controller drive JSM Studio itself. */
  defaultPollingMs?: number
  controllerNavEnabled: boolean
  trackpadOverlayEnabled?: boolean
  gyroCalibrationSeconds?: number
  gyroCalibrationDelay?: number
  /** Built-in controller tune 0-13, or -1 for none. */
  connectSound?: number
  shutdownSound?: number
  /** Studio's reserved chords (pause mapping, calibrate gyro). */
  reservedChords?: boolean
  /** Whether the calibration HUD appears over games. */
  calibrationHudEnabled?: boolean
}

export type ControllerPreferences = {
  gyroCalibrationSeconds: number
  gyroCalibrationDelay: number
  connectSound: number
  shutdownSound: number
}

export type AutoloadRule = {
  processName: string
  fileName: string
  kind: 'profile' | 'advanced' | string
  profileName?: string
  profilePath?: string
  missingProfile: boolean
  /** The rule JSM Studio installs for its own window; read-only in the UI. */
  builtIn: boolean
  /** Kept but not used (the file is renamed so AutoLoad skips it). */
  paused?: boolean
  /** Unix milliseconds of the last time this app came to the front while the rule was on. */
  lastMatchedAtMs?: number
}

// One global chord: hold any button in `buttons`, the configuration at
// `profilePath` swaps in live for as long as it's held.
export type GlobalChord = {
  id: string
  buttons: string[]
  profilePath: string
}

export type NamedProfile = {
  path: string
  name: string
  content: string
}

export type DeleteProfileResult = {
  success: boolean
  fallback?: NamedProfile
  /** The file went to the recycle bin rather than being removed outright (System States 17g). */
  recycled?: boolean
}

/** A library profile's file facts, for the Configurations page (Studio Home 8a). */
export type LibraryProfileMeta = {
  name: string
  /** Unix milliseconds of the file's last write. */
  modifiedAtMs: number
}

/** A process with a window, for picking an association's app (16f "+ Add app"). */
export type RunningProcess = {
  /** Executable name, e.g. Cyberpunk2077.exe. */
  processName: string
  pid: number
  windowTitle?: string
}

/** The configuration loaded when the front app has no rule of its own (16f "Desktop · Fallback"). */
export type AutoloadFallback = {
  profileName: string | null
  enabled: boolean
}

export type CalibrationPresetLoadResult = {
  success: boolean
  activeProfile?: string
  calibrationProfile?: string
}

export type CalibrationPresetReadResult = {
  success: boolean
  calibrationProfile?: string
  content?: string
}

export type CalibrationCommandResult = {
  success: boolean
  output: string
}

export type InputDebugHookStatus = {
  supported: boolean
  running: boolean
  platform: string
  message?: string
}

export type InputDebugEvent = {
  id: number
  timestamp: number
  source: 'keyboard' | 'mouse' | 'wheel'
  action: 'down' | 'up' | 'wheel'
  keyCode?: number
  scanCode?: number
  keyLabel?: string
  mouseButton?: 'left' | 'right' | 'middle' | 'x1' | 'x2' | 'x'
  wheelDelta?: number
  position?: { x: number; y: number }
  injected: boolean
  lowerIntegrityInjected?: boolean
  captureSource: 'globalHook' | 'appWindow'
  summary: string
}

export type HidHideDevice = {
  instanceId: string
  displayName: string
  vendor: string
  product: string
  serialNumber?: string | null
  present: boolean
  /** Every HID interface of this controller is on HidHide's blacklist. */
  hidden: boolean
  /** Some interfaces are hidden and some are not, so apps can still read it. */
  partiallyHidden: boolean
  likelyCurrentController: boolean
  stale: boolean
  managedByApp: boolean
  vendorId?: number | null
  productId?: number | null
}

export type HidHideStatus = {
  supported: boolean
  installed: boolean
  active: boolean
  inverse: boolean
  steamAllowed: boolean
  devices: HidHideDevice[]
  managedInstanceIds: string[]
  whitelistSynced: boolean
  requiresElevation: boolean
}

export type HidHideInstallResult = {
  completed: boolean
  installerPath?: string | null
  status: HidHideStatus
}

export type ReconnectControllersResult = {
  success: boolean
  restarted: boolean
}

export type AiSettings = {
  apiKey: string
  model: string
  baseUrl: string
  temperature: number
}

export type AiSettingsInput = {
  apiKey: string
  model?: string
  baseUrl?: string
  temperature?: number
}

export type AiConversationMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type AiGenerateRequest = {
  userPrompt: string
  currentConfig?: string
  currentProfileName?: string | null
  includeCurrentConfig?: boolean
  conversationHistory?: AiConversationMessage[]
  locale?: string
}

export type AiGenerateResponse = {
  summary: string
  configText: string
  assumptions: string[]
  warnings: string[]
  model: string
}

type Unsubscribe = () => void

export interface DesktopBridge {
  launchJSM: (calibrationSeconds?: number) => Promise<void>
  terminateJSM: () => Promise<void>
  minimizeTemporarily: () => Promise<void>
  applyProfile: (profilePath: string, text: string) => Promise<ApplyProfileResult>
  getRuntimeMappingState: () => Promise<RuntimeMappingState>
  setMappingEnabled: (enabled: boolean) => Promise<RuntimeMappingState>
  setAutoloadEnabled: (enabled: boolean) => Promise<RuntimeMappingState>
  setDefaultPollingMs: (value: number) => Promise<RuntimeMappingState>
  setControllerPreferences: (preferences: ControllerPreferences) => Promise<RuntimeMappingState>
  playControllerSound: (sound: number) => Promise<{ success: boolean }>
  setControllerNavEnabled: (enabled: boolean) => Promise<RuntimeMappingState>
  /** Ends Test mode: loads Studio's navigation profile so the pad drives Studio again. */
  resumeStudioNavigation: () => Promise<boolean>
  setStudioTesting: (testing: boolean) => Promise<void>
  /** A haptic tick/click (or a rumble pulse on pads without actuators) for Studio's own UI. Fire and forget. */
  controllerFeedback: (request: ControllerFeedbackRequest) => Promise<void>
  setTrackpadOverlayEnabled: (enabled: boolean) => Promise<void>
  listAutoloadRules: () => Promise<AutoloadRule[]>
  listRunningProcesses: () => Promise<RunningProcess[]>
  getAutoloadFallback: () => Promise<AutoloadFallback>
  setAutoloadFallback: (fallback: AutoloadFallback) => Promise<AutoloadFallback | null>
  saveAutoloadRule: (processName: string, profileName: string) => Promise<AutoloadRule | null>
  deleteAutoloadRule: (processName: string) => Promise<{ success: boolean }>
  setAutoloadRulePaused: (processName: string, paused: boolean) => Promise<AutoloadRule | null>
  setReservedChords: (enabled: boolean) => Promise<RuntimeMappingState | null>
  setCalibrationHudEnabled: (enabled: boolean) => Promise<RuntimeMappingState | null>
  onRuntimeMappingState: (callback: (state: RuntimeMappingState) => void) => Unsubscribe
  listGlobalChords: () => Promise<GlobalChord[]>
  saveGlobalChord: (chord: GlobalChord) => Promise<GlobalChord[]>
  deleteGlobalChord: (id: string) => Promise<GlobalChord[]>
  recalibrateGyro: () => Promise<{ success: boolean }>
  getCalibrationSeconds: () => Promise<number | null>
  setCalibrationSeconds: (seconds: number) => Promise<number | null>
  onCalibrationStatus: (callback: (payload: CalibrationStatus) => void) => Unsubscribe
  getMapperStatus: () => Promise<MapperStatus | null>
  getLayerStack: () => Promise<LayerStack | null>
  onLayerStack: (callback: (payload: LayerStack) => void) => Unsubscribe
  onMapperStatus: (callback: (payload: MapperStatus) => void) => Unsubscribe
  onGyroCalibrationResult: (callback: (payload: GyroCalibrationResult) => void) => Unsubscribe
  listLibraryProfiles: () => Promise<string[]>
  listLibraryProfileMeta: () => Promise<LibraryProfileMeta[]>
  onLibraryProfilesChanged: (callback: (profiles: string[]) => void) => Unsubscribe
  saveLibraryProfile: (name: string, content: string) => Promise<{ name: string } | null>
  loadLibraryProfile: (name: string) => Promise<{ name: string; content: string } | null>
  readConfigFile: (path: string) => Promise<string | null>
  deleteLibraryProfile: (name: string) => Promise<DeleteProfileResult>
  getActiveProfile: () => Promise<NamedProfile | null>
  activateLibraryProfile: (name: string) => Promise<NamedProfile | null>
  createLibraryProfile: (preferredBaseName?: string) => Promise<NamedProfile | null>
  copyActiveProfile: () => Promise<NamedProfile | null>
  renameLibraryProfile: (oldName: string, newName: string) => Promise<NamedProfile | null>
  loadCalibrationPreset: () => Promise<CalibrationPresetLoadResult>
  readCalibrationPreset: () => Promise<CalibrationPresetReadResult>
  saveCalibrationPreset: (content: string) => Promise<{ success: boolean }>
  runCalibrationCommand: (command: string) => Promise<CalibrationCommandResult>
  getBackendChoice: () => Promise<BackendChoice | null>
  setBackendChoice: (choice: BackendChoice) => Promise<{ success: boolean; backend: BackendChoice } | null>
  // Registers/removes a Windows Scheduled Task (run-level Highest) rather than
  // a Registry Run key -- the app's manifest requires admin, and a Run-key
  // launch would still hit an interactive UAC prompt every logon. See
  // src-tauri/src/services/autostart.rs for why the scheduled-task route
  // avoids that.
  getAutostartEnabled: () => Promise<boolean>
  setAutostartEnabled: (enabled: boolean) => Promise<boolean>
  openExternal: (url: string) => Promise<void>
  openConfigDirectory: () => Promise<void>
  onUpdateAvailable: (callback: (version: string) => void) => Unsubscribe
  onUpdateDownloaded: (callback: () => void) => Unsubscribe
  onUpdateDownloadProgress: (callback: (percent: number) => void) => Unsubscribe
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
  onTelemetrySample: (callback: (payload: unknown) => void) => Unsubscribe
  startInputDebugHook: () => Promise<InputDebugHookStatus>
  stopInputDebugHook: () => Promise<InputDebugHookStatus>
  getInputDebugHookStatus: () => Promise<InputDebugHookStatus>
  onInputDebugEvent: (callback: (payload: InputDebugEvent) => void) => Unsubscribe
  /** Report this window’s measured display refresh rate, so telemetry is
   *  emitted at the panel’s pace rather than a fixed 60 Hz. */
  setUiRefreshHz: (hz: number) => Promise<void>
  getHidHideStatus: () => Promise<HidHideStatus>
  setHidHideActive: (active: boolean) => Promise<HidHideStatus>
  setHidHideDeviceHidden: (instanceId: string, hidden: boolean) => Promise<HidHideStatus>
  syncHidHideWhitelist: () => Promise<HidHideStatus>
  installBundledHidHide: () => Promise<HidHideInstallResult>
  openHidHideClient: () => Promise<void>
  reconnectJsmControllers: () => Promise<ReconnectControllersResult>
  getAiSettings: () => Promise<AiSettings>
  saveAiSettings: (settings: AiSettingsInput) => Promise<AiSettings>
  generateAiMapping: (request: AiGenerateRequest) => Promise<AiGenerateResponse>
}

/** One UI feedback effect (JoyShockMapper StudioFeedback.h). */
export type ControllerFeedbackRequest = {
  /** HapticEffect ordinal: 1 TICK, 2 CLICK, ... */
  effect: number
  /** 0-100 haptic dial. */
  intensity: number
  /** 1 left, 2 right, 3 both. */
  side: number
  /** Rumble pulse for pads without haptic actuators; 0 for none. */
  rumbleMs: number
  /** 0-100 motor strength for that pulse. */
  rumble: number
}

type TauriEventPayload<T> = { payload: T }

const noop: Unsubscribe = () => {}

const getElectronAPI = () => (typeof window === 'undefined' ? undefined : window.electronAPI)
const getTelemetryAPI = () => (typeof window === 'undefined' ? undefined : window.telemetry)
const isTauriWindow = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

type TauriUpdate = import('@tauri-apps/plugin-updater').Update

let pendingTauriUpdate: TauriUpdate | null = null
const tauriUpdateAvailableListeners = new Set<(version: string) => void>()
const tauriUpdateDownloadedListeners = new Set<() => void>()
const tauriUpdateProgressListeners = new Set<(percent: number) => void>()

const notifyTauriUpdateAvailable = (version: string) => {
  tauriUpdateAvailableListeners.forEach(listener => listener(version))
}

const notifyTauriUpdateDownloaded = () => {
  tauriUpdateDownloadedListeners.forEach(listener => listener())
}

const notifyTauriUpdateProgress = (percent: number) => {
  tauriUpdateProgressListeners.forEach(listener => listener(Math.max(0, Math.min(100, percent))))
}

const invokeTauri = async <T>(command: string, args?: Record<string, unknown>) => {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

const getLatestTauriTelemetrySample = () =>
  invokeTauri<unknown | null>('get_latest_telemetry_sample').catch(() => null)

const unsupportedInputDebugStatus = (): InputDebugHookStatus => ({
  supported: false,
  running: false,
  platform: typeof navigator === 'undefined' ? 'unknown' : navigator.platform,
  message: 'Global input debug hook is only supported in the Tauri desktop app on Windows.',
})

const unsupportedHidHideStatus = (): HidHideStatus => ({
  supported: typeof navigator !== 'undefined' ? navigator.platform.startsWith('Win') : false,
  installed: false,
  active: false,
  inverse: false,
  steamAllowed: false,
  devices: [],
  managedInstanceIds: [],
  whitelistSynced: false,
  requiresElevation: false,
})

const listenTauri = <T>(eventName: string, callback: (payload: T) => void): Unsubscribe => {
  let disposed = false
  let unlisten: Unsubscribe = noop

  void import('@tauri-apps/api/event')
    .then(({ listen }) =>
      listen<T>(eventName, (event: TauriEventPayload<T>) => {
        if (!disposed) {
          callback(event.payload)
        }
      })
    )
    .then(listener => {
      if (disposed) {
        listener()
      } else {
        unlisten = listener
      }
    })
    .catch(error => {
      console.error(`Failed to register Tauri listener for ${eventName}`, error)
    })

  return () => {
    disposed = true
    try {
      unlisten()
    } catch (error) {
      console.error(`Failed to unregister Tauri listener for ${eventName}`, error)
    }
  }
}

export const desktopBridge: DesktopBridge = {
  async launchJSM(calibrationSeconds = 5) {
    if (isTauriWindow()) {
      await invokeTauri<void>('launch_jsm', { calibrationSeconds })
      return
    }
    await getElectronAPI()?.launchJSM?.(calibrationSeconds)
  },
  async terminateJSM() {
    if (isTauriWindow()) {
      await invokeTauri<void>('terminate_jsm')
      return
    }
    await getElectronAPI()?.terminateJSM?.()
  },
  async minimizeTemporarily() {
    if (isTauriWindow()) {
      await invokeTauri<void>('minimize_temporarily')
      return
    }
    await getElectronAPI()?.minimizeTemporarily?.()
  },
  async applyProfile(profilePath, text) {
    if (isTauriWindow()) {
      return invokeTauri<ApplyProfileResult>('apply_profile', { profilePath, text })
    }
    const result = await getElectronAPI()?.applyProfile?.(profilePath, text)
    return result ?? { restarted: false }
  },
  async getRuntimeMappingState() {
    if (isTauriWindow()) {
      return invokeTauri<RuntimeMappingState>('get_runtime_mapping_state')
    }
    return { activeProfilePath: 'profiles-library/Profile 1.txt', mappingEnabled: true, autoloadEnabled: true, controllerNavEnabled: true, trackpadOverlayEnabled: false }
  },
  async setMappingEnabled(enabled) {
    if (isTauriWindow()) {
      return invokeTauri<RuntimeMappingState>('set_mapping_enabled', { enabled })
    }
    return { activeProfilePath: 'profiles-library/Profile 1.txt', mappingEnabled: enabled, autoloadEnabled: true, controllerNavEnabled: true }
  },
  async setAutoloadEnabled(enabled) {
    if (isTauriWindow()) {
      return invokeTauri<RuntimeMappingState>('set_autoload_enabled', { enabled })
    }
    return { activeProfilePath: 'profiles-library/Profile 1.txt', mappingEnabled: true, autoloadEnabled: enabled, controllerNavEnabled: true }
  },
  async setTrackpadOverlayEnabled(enabled) {
    if (isTauriWindow()) await invokeTauri<void>('overlay_set_enabled', { enabled })
  },

  async setDefaultPollingMs(value: number): Promise<RuntimeMappingState> {
    if (isTauriWindow()) return invokeTauri<RuntimeMappingState>('set_default_polling_ms', { value })
    return { activeProfilePath: 'profiles-library/Profile 1.txt', mappingEnabled: true, autoloadEnabled: true, controllerNavEnabled: true, defaultPollingMs: value }
  },
  async setControllerPreferences(preferences) {
    if (isTauriWindow()) return invokeTauri<RuntimeMappingState>('set_controller_preferences', { preferences })
    return { activeProfilePath: 'profiles-library/Profile 1.txt', mappingEnabled: true, autoloadEnabled: true, controllerNavEnabled: true, ...preferences }
  },
  async playControllerSound(sound) {
    if (isTauriWindow()) return invokeTauri<{ success: boolean }>('play_controller_sound', { sound })
    return { success: false }
  },
  async setControllerNavEnabled(enabled) {
    if (isTauriWindow()) {
      return invokeTauri<RuntimeMappingState>('set_controller_nav_enabled', { enabled })
    }
    return { activeProfilePath: 'profiles-library/Profile 1.txt', mappingEnabled: true, autoloadEnabled: true, controllerNavEnabled: enabled }
  },
  async setStudioTesting(testing) {
    if (isTauriWindow()) await invokeTauri<void>('set_studio_testing', { testing }).catch(() => {})
  },
  async controllerFeedback(request) {
    if (isTauriWindow()) { await invokeTauri<void>('controller_feedback', { ...request }).catch(() => {}); return }
    // Web preview: the dev mock records what would have been played.
    ;(window as unknown as { __padFeedback?: ControllerFeedbackRequest[] }).__padFeedback?.push(request)
  },
  async resumeStudioNavigation() {
    if (isTauriWindow()) {
      return invokeTauri<boolean>('resume_studio_navigation').catch(error => {
        console.error('Failed to resume Studio navigation', error)
        return false
      })
    }
    return false
  },
  async listGlobalChords() {
    if (isTauriWindow()) {
      return invokeTauri<GlobalChord[]>('list_global_chords').catch(() => [])
    }
    return []
  },
  async saveGlobalChord(chord) {
    if (isTauriWindow()) {
      return invokeTauri<GlobalChord[]>('save_global_chord', { chord })
    }
    return []
  },
  async deleteGlobalChord(id) {
    if (isTauriWindow()) {
      return invokeTauri<GlobalChord[]>('delete_global_chord', { id })
    }
    return []
  },
  async listAutoloadRules() {
    if (isTauriWindow()) {
      return invokeTauri<AutoloadRule[]>('list_autoload_rules').catch(() => [])
    }
    return (await getElectronAPI()?.listAutoloadRules?.()) ?? []
  },
  async listRunningProcesses() {
    if (isTauriWindow()) {
      return invokeTauri<RunningProcess[]>('list_running_processes').catch(() => [])
    }
    return (await getElectronAPI()?.listRunningProcesses?.()) ?? []
  },
  async getAutoloadFallback() {
    if (isTauriWindow()) {
      return invokeTauri<AutoloadFallback>('get_autoload_fallback').catch(() => ({ profileName: null, enabled: false }))
    }
    return (await getElectronAPI()?.getAutoloadFallback?.()) ?? { profileName: null, enabled: false }
  },
  async setAutoloadFallback(fallback) {
    if (isTauriWindow()) {
      return invokeTauri<AutoloadFallback>('set_autoload_fallback', { fallback }).catch(() => null)
    }
    return (await getElectronAPI()?.setAutoloadFallback?.(fallback)) ?? null
  },
  async saveAutoloadRule(processName, profileName) {
    if (isTauriWindow()) {
      return invokeTauri<AutoloadRule>('save_autoload_rule', { processName, profileName }).catch(() => null)
    }
    return null
  },
  async setCalibrationHudEnabled(enabled) {
    if (isTauriWindow()) {
      return invokeTauri<RuntimeMappingState>('set_calibration_hud_enabled', { enabled }).catch(() => null)
    }
    return null
  },
  async setReservedChords(enabled) {
    if (isTauriWindow()) {
      return invokeTauri<RuntimeMappingState>('set_reserved_chords', { enabled }).catch(() => null)
    }
    return null
  },
  onRuntimeMappingState(callback) {
    if (isTauriWindow()) {
      return listenTauri<RuntimeMappingState>('runtime-mapping-state', callback)
    }
    return noop
  },
  async setAutoloadRulePaused(processName, paused) {
    if (isTauriWindow()) {
      return invokeTauri<AutoloadRule>('set_autoload_rule_paused', { processName, paused }).catch(() => null)
    }
    return (await getElectronAPI()?.setAutoloadRulePaused?.(processName, paused)) ?? null
  },
  async deleteAutoloadRule(processName) {
    if (isTauriWindow()) {
      return invokeTauri<{ success: boolean }>('delete_autoload_rule', { processName }).catch(() => ({ success: false }))
    }
    return { success: true }
  },
  async recalibrateGyro() {
    if (isTauriWindow()) {
      return invokeTauri<{ success: boolean }>('recalibrate_gyro')
    }
    const result = await getElectronAPI()?.recalibrateGyro?.()
    return result ?? { success: false }
  },
  async getCalibrationSeconds() {
    if (isTauriWindow()) {
      return invokeTauri<number>('get_calibration_seconds').catch(() => null)
    }
    return (await getElectronAPI()?.getCalibrationSeconds?.()) ?? null
  },
  async setCalibrationSeconds(seconds) {
    if (isTauriWindow()) {
      return invokeTauri<number>('set_calibration_seconds', { seconds }).catch(() => null)
    }
    return (await getElectronAPI()?.setCalibrationSeconds?.(seconds)) ?? null
  },
  onCalibrationStatus(callback) {
    if (isTauriWindow()) {
      return listenTauri<CalibrationStatus>('calibration-status', callback)
    }
    return getElectronAPI()?.onCalibrationStatus?.(callback) ?? noop
  },
  async getLayerStack() {
    if (isTauriWindow()) {
      return invokeTauri<LayerStack>('get_layer_stack').catch(() => null)
    }
    return (await getElectronAPI()?.getLayerStack?.()) ?? null
  },
  onLayerStack(callback) {
    if (isTauriWindow()) {
      return listenTauri<LayerStack>('layer-stack', callback)
    }
    return noop
  },
  async getMapperStatus() {
    if (isTauriWindow()) {
      return invokeTauri<MapperStatus>('get_mapper_status').catch(() => null)
    }
    return (await getElectronAPI()?.getMapperStatus?.()) ?? null
  },
  onMapperStatus(callback) {
    if (isTauriWindow()) {
      return listenTauri<MapperStatus>('mapper-status', callback)
    }
    return getElectronAPI()?.onMapperStatus?.(callback) ?? noop
  },
  onGyroCalibrationResult(callback) {
    if (isTauriWindow()) {
      return listenTauri<GyroCalibrationResult>('gyro-calibration-result', callback)
    }
    return getElectronAPI()?.onGyroCalibrationResult?.(callback) ?? noop
  },
  async listLibraryProfiles() {
    if (isTauriWindow()) {
      return invokeTauri<string[]>('library_list_profiles').catch(() => [])
    }
    return (await getElectronAPI()?.listLibraryProfiles?.()) ?? []
  },
  async listLibraryProfileMeta() {
    if (isTauriWindow()) {
      return invokeTauri<LibraryProfileMeta[]>('library_list_profile_meta').catch(() => [])
    }
    return (await getElectronAPI()?.listLibraryProfileMeta?.()) ?? []
  },
  onLibraryProfilesChanged(callback) {
    if (isTauriWindow()) {
      return listenTauri<string[]>('library-profiles-changed', callback)
    }
    return noop
  },
  async saveLibraryProfile(name, content) {
    if (isTauriWindow()) {
      return invokeTauri<{ name: string }>('library_save_profile', { name, content }).catch(() => null)
    }
    return (await getElectronAPI()?.saveLibraryProfile?.(name, content)) ?? null
  },
  async loadLibraryProfile(name) {
    if (isTauriWindow()) {
      return invokeTauri<{ name: string; content: string }>('library_load_profile', { name }).catch(() => null)
    }
    return (await getElectronAPI()?.loadLibraryProfile?.(name)) ?? null
  },
  // A file a profile imports, resolved against the runtime directory -- the
  // same place the mapper looks. Null means it is not there.
  async readConfigFile(path) {
    if (isTauriWindow()) {
      return invokeTauri<string | null>('read_config_file', { path }).catch(() => null)
    }
    return (await getElectronAPI()?.readConfigFile?.(path)) ?? null
  },
  async deleteLibraryProfile(name) {
    if (isTauriWindow()) {
      return invokeTauri<DeleteProfileResult>('library_delete_profile', { name }).catch(() => ({ success: false }))
    }
    return (await getElectronAPI()?.deleteLibraryProfile?.(name)) ?? { success: false }
  },
  async getActiveProfile() {
    if (isTauriWindow()) {
      return invokeTauri<NamedProfile>('get_active_profile').catch(() => null)
    }
    return (await getElectronAPI()?.getActiveProfile?.()) ?? null
  },
  async activateLibraryProfile(name) {
    if (isTauriWindow()) {
      return invokeTauri<NamedProfile>('activate_library_profile', { name }).catch(() => null)
    }
    return (await getElectronAPI()?.activateLibraryProfile?.(name)) ?? null
  },
  async createLibraryProfile(preferredBaseName) {
    if (isTauriWindow()) {
      return invokeTauri<NamedProfile>('library_create_profile', { preferredBaseName }).catch(() => null)
    }
    return (await getElectronAPI()?.createLibraryProfile?.(preferredBaseName)) ?? null
  },
  async copyActiveProfile() {
    if (isTauriWindow()) {
      return invokeTauri<NamedProfile>('library_copy_active_profile').catch(() => null)
    }
    return (await getElectronAPI()?.copyActiveProfile?.()) ?? null
  },
  async renameLibraryProfile(oldName, newName) {
    if (isTauriWindow()) {
      // Deliberately not swallowed: the backend's message ("name in use",
      // "permission denied", ...) is the only clue the user gets.
      return invokeTauri<NamedProfile>('library_rename_profile', { oldName, newName })
    }
    return (await getElectronAPI()?.renameLibraryProfile?.(oldName, newName)) ?? null
  },
  async loadCalibrationPreset() {
    if (isTauriWindow()) {
      return invokeTauri<CalibrationPresetLoadResult>('load_calibration_preset').catch(() => ({ success: false }))
    }
    return (await getElectronAPI()?.loadCalibrationPreset?.()) ?? { success: false }
  },
  async readCalibrationPreset() {
    if (isTauriWindow()) {
      return invokeTauri<CalibrationPresetReadResult>('read_calibration_preset').catch(() => ({ success: false }))
    }
    return (await getElectronAPI()?.readCalibrationPreset?.()) ?? { success: false }
  },
  async saveCalibrationPreset(content) {
    if (isTauriWindow()) {
      return invokeTauri<{ success: boolean }>('save_calibration_preset', { content }).catch(() => ({ success: false }))
    }
    return (await getElectronAPI()?.saveCalibrationPreset?.(content)) ?? { success: false }
  },
  async runCalibrationCommand(command) {
    if (isTauriWindow()) {
      return invokeTauri<CalibrationCommandResult>('run_calibration_command', { command }).catch(() => ({ success: false, output: '' }))
    }
    return (await getElectronAPI()?.runCalibrationCommand?.(command)) ?? { success: false, output: '' }
  },
  async getBackendChoice() {
    if (isTauriWindow()) {
      return invokeTauri<BackendChoice>('get_backend_choice').catch(() => null)
    }
    return (await getElectronAPI()?.getBackendChoice?.()) ?? null
  },
  async setBackendChoice(choice) {
    if (isTauriWindow()) {
      return invokeTauri<{ success: boolean; backend: BackendChoice }>('set_backend_choice', { choice }).catch(() => null)
    }
    return (await getElectronAPI()?.setBackendChoice?.(choice)) ?? null
  },
  async getAutostartEnabled() {
    if (isTauriWindow()) {
      return invokeTauri<boolean>('get_autostart_enabled').catch(() => false)
    }
    return (await getElectronAPI()?.getAutostartEnabled?.()) ?? false
  },
  async setAutostartEnabled(enabled) {
    if (isTauriWindow()) {
      return invokeTauri<void>('set_autostart_enabled', { enabled })
        .then(() => true)
        .catch(() => false)
    }
    return (await getElectronAPI()?.setAutostartEnabled?.(enabled)) ?? false
  },
  async openExternal(url) {
    if (isTauriWindow()) {
      await invokeTauri<void>('open_external', { url })
      return
    }
    await getElectronAPI()?.openExternal?.(url)
  },
  async openConfigDirectory() {
    if (isTauriWindow()) {
      await invokeTauri<void>('open_config_directory')
      return
    }
  },
  onUpdateAvailable(callback) {
    if (isTauriWindow()) {
      tauriUpdateAvailableListeners.add(callback)
      return () => tauriUpdateAvailableListeners.delete(callback)
    }
    return getElectronAPI()?.onUpdateAvailable?.(callback) ?? noop
  },
  onUpdateDownloaded(callback) {
    if (isTauriWindow()) {
      tauriUpdateDownloadedListeners.add(callback)
      return () => tauriUpdateDownloadedListeners.delete(callback)
    }
    return getElectronAPI()?.onUpdateDownloaded?.(callback) ?? noop
  },
  onUpdateDownloadProgress(callback) {
    if (isTauriWindow()) {
      tauriUpdateProgressListeners.add(callback)
      return () => tauriUpdateProgressListeners.delete(callback)
    }
    return getElectronAPI()?.onUpdateDownloadProgress?.(callback) ?? noop
  },
  async checkForUpdates() {
    if (!isTauriWindow()) return

    try {
      const { check } = await import('@tauri-apps/plugin-updater')
      pendingTauriUpdate = await check()
      if (pendingTauriUpdate) {
        notifyTauriUpdateAvailable(pendingTauriUpdate.version)
      }
    } catch (error) {
      console.warn('Failed to check for JSM Studio updates', error)
    }
  },
  async downloadUpdate() {
    if (isTauriWindow()) {
      if (!pendingTauriUpdate) {
        throw new Error('No JSM Studio update is available to download.')
      }

      let contentLength = 0
      let downloadedLength = 0
      notifyTauriUpdateProgress(0)
      await pendingTauriUpdate.download(event => {
        if (event.event === 'Started') {
          contentLength = event.data.contentLength ?? 0
          downloadedLength = 0
          notifyTauriUpdateProgress(0)
        } else if (event.event === 'Progress') {
          downloadedLength += event.data.chunkLength
          notifyTauriUpdateProgress(
            contentLength > 0 ? Math.round((downloadedLength / contentLength) * 100) : 0,
          )
        } else if (event.event === 'Finished') {
          notifyTauriUpdateProgress(100)
        }
      })
      notifyTauriUpdateDownloaded()
      return
    }
    await getElectronAPI()?.downloadUpdate?.()
  },
  async installUpdate() {
    if (isTauriWindow()) {
      if (!pendingTauriUpdate) {
        throw new Error('No downloaded JSM Studio update is ready to install.')
      }

      await pendingTauriUpdate.install()
      pendingTauriUpdate = null
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
      return
    }
    await getElectronAPI()?.installUpdate?.()
  },
  onTelemetrySample(callback) {
    if (isTauriWindow()) {
      let disposed = false
      const unsubscribe = listenTauri<unknown>('telemetry-sample', callback)
      void getLatestTauriTelemetrySample().then(sample => {
        if (!disposed && sample) {
          callback(sample)
        }
      })
      return () => {
        disposed = true
        unsubscribe()
      }
    }
    return getTelemetryAPI()?.onSample?.(callback) ?? noop
  },
  async startInputDebugHook() {
    if (isTauriWindow()) {
      return invokeTauri<InputDebugHookStatus>('start_input_debug_hook')
    }
    return unsupportedInputDebugStatus()
  },
  async stopInputDebugHook() {
    if (isTauriWindow()) {
      return invokeTauri<InputDebugHookStatus>('stop_input_debug_hook')
    }
    return unsupportedInputDebugStatus()
  },
  async getInputDebugHookStatus() {
    if (isTauriWindow()) {
      return invokeTauri<InputDebugHookStatus>('get_input_debug_hook_status')
    }
    return unsupportedInputDebugStatus()
  },
  onInputDebugEvent(callback) {
    if (isTauriWindow()) {
      return listenTauri<InputDebugEvent>('input-debug-event', callback)
    }
    return noop
  },
  async getHidHideStatus() {
    if (isTauriWindow()) {
      return invokeTauri<HidHideStatus>('get_hidhide_status')
    }
    return unsupportedHidHideStatus()
  },
  async setUiRefreshHz(hz) {
    // Nothing to tell outside the desktop shell: the browser harness just
    // renders whatever it is handed.
    if (isTauriWindow()) await invokeTauri<void>('ui_set_refresh_hz', { hz })
  },
  async setHidHideActive(active) {
    if (isTauriWindow()) {
      return invokeTauri<HidHideStatus>('set_hidhide_active', { active })
    }
    return unsupportedHidHideStatus()
  },
  async setHidHideDeviceHidden(instanceId, hidden) {
    if (isTauriWindow()) {
      return invokeTauri<HidHideStatus>('set_hidhide_device_hidden', { instanceId, hidden })
    }
    return unsupportedHidHideStatus()
  },
  async syncHidHideWhitelist() {
    if (isTauriWindow()) {
      return invokeTauri<HidHideStatus>('sync_hidhide_whitelist')
    }
    return unsupportedHidHideStatus()
  },
  async installBundledHidHide() {
    if (isTauriWindow()) {
      return invokeTauri<HidHideInstallResult>('install_bundled_hidhide')
    }
    return {
      completed: false,
      installerPath: null,
      status: unsupportedHidHideStatus(),
    }
  },
  async openHidHideClient() {
    if (isTauriWindow()) {
      await invokeTauri<void>('open_hidhide_client')
    }
  },
  async reconnectJsmControllers() {
    if (isTauriWindow()) {
      return invokeTauri<ReconnectControllersResult>('reconnect_jsm_controllers')
    }
    return { success: false, restarted: false }
  },
  async getAiSettings() {
    if (isTauriWindow()) {
      return invokeTauri<AiSettings>('get_ai_settings').catch(() => ({
        apiKey: '',
        model: '',
        baseUrl: '',
        temperature: 0.2,
      }))
    }
    return {
      apiKey: '',
      model: '',
      baseUrl: '',
      temperature: 0.2,
    }
  },
  async saveAiSettings(settings) {
    if (isTauriWindow()) {
      return invokeTauri<AiSettings>('save_ai_settings', { settings })
    }
    return {
      apiKey: settings.apiKey,
      model: settings.model ?? '',
      baseUrl: settings.baseUrl ?? '',
      temperature: settings.temperature ?? 0.2,
    }
  },
  async generateAiMapping(request) {
    if (isTauriWindow()) {
      return invokeTauri<AiGenerateResponse>('generate_ai_mapping', { request })
    }
    return {
      summary: 'AI mapping generation is only available in the Tauri desktop app.',
      configText: request.currentConfig ?? '',
      assumptions: [],
      warnings: ['AI mapping generation is unavailable in this environment.'],
      model: '',
    }
  },
}
