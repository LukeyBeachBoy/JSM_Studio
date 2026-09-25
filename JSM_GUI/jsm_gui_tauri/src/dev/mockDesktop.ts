// Development only: `npm run dev:web` then open /?mock to get a configuration
// library and a live Steam Controller without the desktop runtime, the same
// shape the Playwright regressions inject. Never bundled into a build (see
// main.tsx, which only imports this behind import.meta.env.DEV).
const profiles: Record<string, string> = {
  Wardogs: [
    'RESET_MAPPINGS',
    'IMPORT "profiles-library/FPS Template.txt"',
    'S = SPACE', 'E = C', 'W = R', 'N = F',
    'L = G', 'R = MMOUSE', 'ZL = RMOUSE', 'ZR = LMOUSE',
    'LEFT_TOUCHPAD_MODE = GRID_AND_STICK', 'LEFT_GRID_SIZE = 2 2', 'LT1 = 1', 'LT2 = 2', 'LT3 = 3', 'LT4 = 4',
    'RIGHT_TOUCHPAD_MODE = MOUSE', 'GYRO_ON = MISC5', 'IN_GAME_SENS = 2.3',
    'RIGHT_STICK_MODE = RADIAL_MENU', 'RIGHT_STICK_MENU_SIZE = 8', 'RM1 = 1', 'RM2 = 2', 'RM3 = 3', 'RM4 = 4',
    '# @layer {"id":"veh","name":"Vehicles","overrides":{"N":"E"}}',
    '# @layer {"id":"map","name":"Tactical map","suppressHolds":true,"overrides":{"S":"M"}}',
    '# @layer-action LSL = hold veh', '# @layer-action L3 = toggle map',
  ].join('\n') + '\n',
  'FPS Template': 'RESET_MAPPINGS\nS = SPACE\nUP = 1\nDOWN = 2\n',
  Cyberpunk: 'RESET_MAPPINGS\nS = SPACE\nZL = RMOUSE\n',
  Gamepad: 'RESET_MAPPINGS\n',
}

// Raw button bits (utils/controllerStatus RAW_BUTTONS) for the commands the
// scriptable pad below can hold.
const BITS: Record<string, number> = { UP: 0, DOWN: 1, LEFT: 2, RIGHT: 3, '+': 4, '-': 5, L3: 6, R3: 7, L: 8, R: 9, S: 12, E: 13, W: 14, N: 15, HOME: 16 }

// window.__pad.press(['S']) taps A; .hold(['-', '+']) and .release() for chords;
// .stick / .trigger for analog input. Drives Studio's native navigation.
const pad = { held: new Set<string>(), leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 } }
const padApi = {
  hold: (commands: string[]) => { commands.forEach(command => pad.held.add(command)) },
  release: (commands?: string[]) => { if (commands) commands.forEach(command => pad.held.delete(command)); else pad.held.clear() },
  press: (commands: string[], ms = 90) => new Promise<void>(resolve => { padApi.hold(commands); setTimeout(() => { padApi.release(commands); setTimeout(resolve, 60) }, ms) }),
  stick: (side: 'left' | 'right', x: number, y: number) => { pad[side === 'left' ? 'leftStick' : 'rightStick'] = { x, y } },
  trigger: (side: 'left' | 'right', value: number) => { pad.triggers[side] = value },
}

export function installMockDesktop() {
  const w = window as unknown as Record<string, unknown>
  // Telemetry only draws while the window has focus; a preview pane or a
  // second monitor would otherwise never see the controller.
  document.hasFocus = () => true
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
  ;(window as unknown as { __pad: typeof padApi }).__pad = padApi
  const mockUpdate: { progress?: (percent: number) => void; done?: () => void } = {}
  w.electronAPI = {
    getActiveProfile: async () => ({ name: 'Wardogs', path: 'profiles-library/Wardogs.txt', content: profiles.Wardogs }),
    listLibraryProfiles: async () => Object.keys(profiles),
    loadLibraryProfile: async (name: string) => ({ name, content: profiles[name] ?? '' }),
    saveLibraryProfile: async (name: string, content: string) => { profiles[name] = content; return { name } },
    applyProfile: async (path: string) => ({ path, mappingEnabled: true }),
    listAutoloadRules: async () => [
      { processName: 'JSM Studio', fileName: 'JSM Studio.txt', kind: 'profile', profileName: 'AppNavigation', missingProfile: false, builtIn: true },
      { processName: 'Wardogs', fileName: 'Wardogs.txt', kind: 'profile', profileName: 'Wardogs', missingProfile: false, builtIn: false },
      { processName: 'Cyberpunk2077', fileName: 'Cyberpunk2077.txt', kind: 'profile', profileName: 'Cyberpunk', missingProfile: false, builtIn: false },
      { processName: 'steamwebhelper', fileName: 'steamwebhelper.txt.paused', kind: 'profile', profileName: 'Gamepad', missingProfile: false, builtIn: false, paused: true },
    ],
    // ?mock&mapperdown previews the mapper having stopped by itself.
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
          activeProfile: 'profiles-library/Wardogs.txt',
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
