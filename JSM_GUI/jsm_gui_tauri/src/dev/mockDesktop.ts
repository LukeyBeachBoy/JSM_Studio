// Development only: `npm run dev:web` then open /?mock to get a configuration
// library and a live Steam Controller without the desktop runtime, the same
// shape the Playwright regressions inject. Never bundled into a build (see
// main.tsx, which only imports this behind import.meta.env.DEV).
const profiles: Record<string, string> = {
  Wardogs: [
    'RESET_MAPPINGS',
    'profiles-library/FPS Template.txt',
    'S = SPACE', 'E = C', 'W = R', 'N = F',
    'L = G', 'R = MMOUSE', 'ZL = RMOUSE', 'ZR = LMOUSE',
    // Luke's real Wardogs shape: a four-way left pad, a mouse right pad whose
    // click shifts it into a four-way menu, paddles that only drive layers.
    'LEFT_TOUCHPAD_MODE = GRID_AND_STICK', 'LEFT_GRID_SHAPE = FOUR_WAY', 'LEFT_GRID_REQUIRES_CLICK = ON', 'LEFT_GRID_DEADZONE = 0.15',
    'LT1 = R', 'LT2 = B', 'LT3 = V', 'LT4 = G',
    'RIGHT_TOUCHPAD_MODE = MOUSE', 'RIGHT_TOUCHPAD_SENS = 2.5', 'RIGHT_GRID_SHAPE = FOUR_WAY', 'RIGHT_GRID_DEADZONE = 0.15',
    'MISC2,RIGHT_TOUCHPAD_MODE = GRID_AND_STICK',
    'RT1 = MMOUSE', 'RT2 = V', 'RT3 = TAB', 'RT4 = Z',
    'GYRO_ON = MISC5', 'IN_GAME_SENS = 2.3',
    'LSL = NONE', 'RSR = NONE', 'RSL = !M\\',
    'RIGHT_STICK_MODE = RADIAL_MENU', 'RIGHT_STICK_MENU_SIZE = 8', 'RM1 = 1', 'RM2 = 2', 'RM3 = 3', 'RM4 = 4',
    '# @label LT1 = Rotate', '# @label LT2 = Snap', '# @label LT3 = Dismantle', '# @label LT4 = Supply crate',
    '# @label RT1 = Ping', '# @label RT2 = Melee', '# @label RT3 = Inventory', '# @label RT4 = Sights',
    '# @label RSL = Tactical map',
    '# @overlay LEFT at 0.2 0.75 size 240', '# @overlay RIGHT:MISC2 at 0.8 0.75 size 286',
    '# @layer {"id":"veh","name":"Vehicles & utility","overrides":{"N":"H"}}',
    '# @layer {"id":"map","name":"Tactical map","suppressHolds":true,"overrides":{"S":"M"}}',
    '# @layer {"id":"comms","name":"Comms","overrides":{"E":"K"}}',
    // Several inputs per layer, and a layer only an input removes (what the
    // title bar and Layers page describe as "Nothing turns it on").
    '# @layer-action LSL = hold veh', '# @layer-action RSR = hold comms', '# @layer-action RSL = toggle map', '# @layer-action - = remove map',
  ].join('\n') + '\n',
  // Like the real template, it still sets its own polling (Timing's "Still set in a file", 2f).
  'FPS Template': 'RESET_MAPPINGS\nS = SPACE\nUP = 1\nDOWN = 2\nTICK_TIME = 1\n',
  Cyberpunk: 'RESET_MAPPINGS\nS = SPACE\nZL = RMOUSE\n',
  Gamepad: 'RESET_MAPPINGS\n',
}

// Raw button bits (utils/controllerStatus RAW_BUTTONS) for the commands the
// scriptable pad below can hold.
const BITS: Record<string, number> = { UP: 0, DOWN: 1, LEFT: 2, RIGHT: 3, '+': 4, '-': 5, L3: 6, R3: 7, L: 8, R: 9, S: 12, E: 13, W: 14, N: 15, HOME: 16 }

// window.__pad.press(['S']) taps A; .hold(['-', '+']) and .release() for chords;
// .stick / .trigger for analog input. Drives Studio's native navigation.
// .live(path) sets what the mapper says it is running: Studio's navigation
// profile while its window is in front (as the real mapper does), or e.g. a
// chord's configuration while one is held, which Studio must not navigate on.
const pad = { held: new Set<string>(), leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 }, live: 'AppNavigation.txt' }
const padApi = {
  live: (path: string) => { pad.live = path },
  hold: (commands: string[]) => { commands.forEach(command => pad.held.add(command)) },
  release: (commands?: string[]) => { if (commands) commands.forEach(command => pad.held.delete(command)); else pad.held.clear() },
  press: (commands: string[], ms = 90) => new Promise<void>(resolve => { padApi.hold(commands); setTimeout(() => { padApi.release(commands); setTimeout(resolve, 60) }, ms) }),
  stick: (side: 'left' | 'right', x: number, y: number) => { pad[side === 'left' ? 'leftStick' : 'rightStick'] = { x, y } },
  trigger: (side: 'left' | 'right', value: number) => { pad.triggers[side] = value },
}

export function installMockDesktop() {
  // What the pad would have felt (nav/feedback.ts), for checking by hand or test.
  ;(window as unknown as { __padFeedback: unknown[] }).__padFeedback = []
  const w = window as unknown as Record<string, unknown>
  // Telemetry only draws while the window has focus; a preview pane or a
  // second monitor would otherwise never see the controller.
  document.hasFocus = () => true
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
  ;(window as unknown as { __pad: typeof padApi }).__pad = padApi
  const mockUpdate: { progress?: (percent: number) => void; done?: () => void } = {}
  const mockFallback = { profileName: 'Gamepad', enabled: true }
  const mockAutostart = { enabled: true }
  // Association rules, mutable so pausing one under ?mock shows in the list.
  const mockRules: { processName: string; fileName: string; kind: string; profileName: string; missingProfile: boolean; builtIn: boolean; paused?: boolean; lastMatchedAtMs?: number }[] = [
    { processName: 'JSM Evolved', fileName: 'JSM Evolved.txt', kind: 'profile', profileName: 'AppNavigation', missingProfile: false, builtIn: true },
    { processName: 'Wardogs', fileName: 'Wardogs.txt', kind: 'profile', profileName: 'Wardogs', missingProfile: false, builtIn: false, lastMatchedAtMs: Date.now() - 12 * 60_000 },
    { processName: 'Cyberpunk2077', fileName: 'Cyberpunk2077.txt', kind: 'profile', profileName: 'Cyberpunk', missingProfile: false, builtIn: false, lastMatchedAtMs: Date.now() - 26 * 3_600_000 },
    { processName: 'steamwebhelper', fileName: 'steamwebhelper.txt.paused', kind: 'profile', profileName: 'Gamepad', missingProfile: false, builtIn: false, paused: true },
  ]
  w.electronAPI = {
    // ?mock&empty previews the first run (System States 17d): no library, nothing applied.
    getActiveProfile: async () => new URLSearchParams(location.search).has('empty') ? null : ({ name: 'Wardogs', path: 'profiles-library/Wardogs.txt', content: profiles.Wardogs }),
    listLibraryProfiles: async () => new URLSearchParams(location.search).has('empty') ? [] : Object.keys(profiles),
    loadLibraryProfile: async (name: string) => ({ name, content: profiles[name] ?? '' }),
    // Imports resolve through this, so Wardogs' FPS Template shows as a
    // template in the library and its settings read as inherited.
    readConfigFile: async (path: string) => profiles[path.replace(/^.*[\\/]/, '').replace(/\.txt$/i, '')] ?? null,
    saveLibraryProfile: async (name: string, content: string) => { profiles[name] = content; return { name } },
    applyProfile: async (path: string) => ({ path, mappingEnabled: true }),
    listLibraryProfileMeta: async () => Object.keys(profiles).map((name, index) => ({ name, modifiedAtMs: Date.now() - (index + 1) * 11 * 60_000 })),
    listRunningProcesses: async () => [{ processName: 'Wardogs.exe', pid: 4120, windowTitle: 'Wardogs' }, { processName: 'Cyberpunk2077.exe', pid: 5280, windowTitle: 'Cyberpunk 2077' }, { processName: 'explorer.exe', pid: 1932, windowTitle: 'File Explorer' }],
    // Answers late and differs from the switch's old default, so ?mock shows
    // whether Preferences opens on the real value (preferenceStore).
    getAutostartEnabled: async () => { await new Promise(resolve => window.setTimeout(resolve, 250)); return mockAutostart.enabled },
    setAutostartEnabled: async (enabled: boolean) => { mockAutostart.enabled = enabled; return true },
    getAutoloadFallback: async () => mockFallback,
    setAutoloadFallback: async (fallback: { profileName: string | null; enabled: boolean }) => { Object.assign(mockFallback, fallback); return mockFallback },
    listAutoloadRules: async () => mockRules.map(rule => ({ ...rule })),
    setAutoloadRulePaused: async (processName: string, paused: boolean) => {
      const rule = mockRules.find(candidate => candidate.processName === processName)
      if (!rule) return null
      rule.paused = paused
      rule.fileName = paused ? `${processName}.txt.paused` : `${processName}.txt`
      return { ...rule }
    },
    // ?mock&mapperdown previews the mapper having stopped by itself.
    // The mapper's live layer stack (title bar Applied segment, Layers page).
    getLayerStack: async () => ({ profile: 'profiles-library/Wardogs.txt', layers: [{ id: 'veh', name: 'Vehicles' }] }),
    getMapperStatus: async () => new URLSearchParams(location.search).has('mapperdown')
      ? { running: false, exit: { exitCode: 3, stoppedAtMs: Date.now() - 60_000, lastLine: 'Loaded Wardogs.txt' } }
      : { running: true },
    // ?mock&update previews the update banner; Install runs a fake download.
    onUpdateAvailable: (callback: (version: string) => void) => {
      if (!new URLSearchParams(location.search).has('update')) return () => {}
      const timer = window.setTimeout(() => callback('0.8.0'), 300)
      return () => window.clearTimeout(timer)
    },
    onUpdateDownloadProgress: (callback: (percent: number) => void) => { mockUpdate.progress = callback; return () => {} },
    onUpdateDownloaded: (callback: () => void) => { mockUpdate.done = callback; return () => {} },
    downloadUpdate: async () => {
      for (let percent = 0; percent <= 100; percent += 20) {
        mockUpdate.progress?.(percent)
        await new Promise(resolve => window.setTimeout(resolve, 400))
      }
      mockUpdate.done?.()
    },
    installUpdate: async () => { await new Promise(resolve => window.setTimeout(resolve, 1500)); throw new Error('mock') },
  }
  w.telemetry = {
    onSample: (callback: (sample: unknown) => void) => {
      const started = performance.now()
      const emit = () => {
        const t = (performance.now() - started) / 1000
        const wave = (speed: number, phase = 0) => Math.sin(t * speed + phase)
        callback({
          console: 'Mapper ready\nLoaded Wardogs.txt (imports FPS Template)',
          activeProfile: pad.live,
          // ?mock&configerror previews a line the mapper could not use.
          configErrors: new URLSearchParams(location.search).has('configerror')
            ? [{ profile: 'profiles-library/Wardogs.txt', file: 'profiles-library/Wardogs.txt', line: 3, text: 'MISC9 = F', reason: 'unknown command MISC9' }]
            : [],
          omega: Math.abs(wave(1.3)) * 40,
          sampleHz: 1000,
          // ?mock&nopad previews the no-controller state; &padlater connects
          // the controller two seconds in (System States 17b).
          devices: new URLSearchParams(location.search).has('nopad') || (new URLSearchParams(location.search).has('padlater') && t < 2) ? [] : [{
            handle: 1, type: 24, supportedButtons: 8589934591, batteryPercent: 82, batteryState: 1,
            touchpadWidth: 1, touchpadHeight: 1,
            status: {
              buttons: [...pad.held].reduce((mask, command) => mask + (BITS[command] !== undefined ? 2 ** BITS[command] : 0), 0),
              leftStick: pad.leftStick,
              rightStick: pad.rightStick,
              triggers: pad.triggers,
              gyro: { x: wave(.5) * 10, y: wave(.7) * 8, z: 0 },
              leftPad: { x: wave(.8) * .5, y: wave(1.2) * .5, touched: wave(.4) > 0 },
              rightPad: { x: 0.2, y: -0.1, touched: true, pressure: 0.02, speed: 420 },
              leftGrip: { pressed: false }, rightGrip: { pressed: wave(.6) > .3 },
            },
          }],
        })
      }
      emit()
      const timer = setInterval(emit, 16)
      return () => clearInterval(timer)
    },
  }
}
