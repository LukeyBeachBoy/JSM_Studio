// Development only: `npm run dev:web` then open /?mock to get a configuration
// library and a live Steam Controller without the desktop runtime, the same
// shape the Playwright regressions inject. Never bundled into a build (see
// main.tsx, which only imports this behind import.meta.env.DEV).
import steamSampleV3 from '../../../../tests/fixtures/steam/wardogs_v3.vdf?raw'
import steamSampleV2 from '../../../../tests/fixtures/steam/gamepad_v2.vdf?raw'

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

// Steam layouts for the Import from Steam dialog: the regression fixtures, so
// the preview shows exactly what the tests convert.
const steamLayouts = [
  { path: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Steam Controller Configs\\1\\config\\1203220\\controller_triton.vdf', title: 'Wardogs Steam', game: 'Wardogs', appId: '1203220', controllerType: 'controller_triton', source: 'personal' as const, modifiedMs: Date.parse('2026-09-28'), text: steamSampleV3 },
  { path: 'C:\\Program Files (x86)\\Steam\\userdata\\1\\241100\\remote\\controller_config\\cyberpunk2077\\controller_neptune.vdf', title: 'Gamepad With Camera Controls', game: 'Cyberpunk 2077', appId: null, controllerType: 'controller_neptune', source: 'cloud' as const, modifiedMs: Date.parse('2026-08-02'), text: steamSampleV2 },
  { path: 'C:\\Program Files (x86)\\Steam\\controller_base\\templates\\gamepad_fps.vdf', title: 'Gamepad With Camera Controls', game: 'Steam template', appId: null, controllerType: 'controller_neptune', source: 'template' as const, modifiedMs: 0, text: steamSampleV2 },
]

// Console v2 LIBRARY: recent Steam games and their art. The art is a flat SVG
// stand-in (the real app reads Steam's librarycache), so covers show something.
const mockSteamGames = [
  { appId: '548430', name: 'Deep Rock Galactic', lastPlayed: Math.floor(Date.now() / 1000) - 86_400, hasCapsule: true, hasHeader: true, hasHero: false },
  { appId: '1086940', name: 'Baldur’s Gate 3', lastPlayed: Math.floor(Date.now() / 1000) - 3 * 86_400, hasCapsule: true, hasHeader: true, hasHero: false },
  { appId: '1145350', name: 'Hades II', lastPlayed: Math.floor(Date.now() / 1000) - 9 * 86_400, hasCapsule: true, hasHeader: true, hasHero: false },
  { appId: '620', name: 'Portal 2', lastPlayed: Math.floor(Date.now() / 1000) - 40 * 86_400, hasCapsule: true, hasHeader: true, hasHero: false },
  { appId: '1203220', name: 'Wardogs', lastPlayed: Math.floor(Date.now() / 1000) - 600, hasCapsule: true, hasHeader: true, hasHero: false },
]
const mockArt = (appId: string, kind: string) => {
  const game = mockSteamGames.find(entry => entry.appId === appId)
  if (!game || new URLSearchParams(location.search).has('noart')) return null
  let hue = 0
  for (const char of game.name) hue = (hue * 31 + char.charCodeAt(0)) % 360
  const [w, h] = kind === 'capsule' ? [600, 900] : [460, 215]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="hsl(${hue} 35% 24%)"/><rect x="${w * .08}" y="${h * .1}" width="${w * .5}" height="${h * .08}" rx="6" fill="hsl(${hue} 50% 62%)"/><circle cx="${w * .75}" cy="${h * .45}" r="${Math.min(w, h) * .22}" fill="hsl(${(hue + 40) % 360} 40% 38%)"/><text x="${w * .08}" y="${h * .32}" font-family="Segoe UI, sans-serif" font-weight="700" font-size="${Math.min(w, h) * .09}" fill="#e8eef4">${game.name.replace(/[<&]/g, '')}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
type MockAiSettings = {
  provider: string | null; careful: string
  anthropic: { model: string; hasKey: boolean; keyHint: string | null; suggestedModels: string[] }
  openaiCompatible: { model: string; baseUrl: string; hasKey: boolean; keyHint: string | null }
  local: { model: string; baseUrl: string; hasKey: boolean; keyHint: string | null }
  chatgpt: { clientId: string; model: string; redirectPort: number; authorizeUrl: string; tokenUrl: string; responsesUrl: string; signedIn: boolean; account: string | null; available: boolean; reason: string | null }
  connected: boolean; status: string
}
const mockAi: { settings: MockAiSettings } = {
  settings: {
    provider: new URLSearchParams(location.search).has('noai') ? null : 'local',
    careful: 'careful',
    anthropic: { model: 'claude-opus-5-5', hasKey: false, keyHint: null, suggestedModels: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-haiku-4-5'] },
    openaiCompatible: { model: '', baseUrl: '', hasKey: false, keyHint: null },
    local: { model: 'llama3.1:8b', baseUrl: 'http://127.0.0.1:11434/v1', hasKey: false, keyHint: null },
    chatgpt: { clientId: '', model: 'gpt-5', redirectPort: 1455, authorizeUrl: 'https://auth.openai.com/oauth/authorize', tokenUrl: 'https://auth.openai.com/oauth/token', responsesUrl: 'https://api.openai.com/v1/responses', signedIn: false, account: null, available: false, reason: 'Needs OpenAI’s approval for this app' },
    connected: false, status: 'not connected',
  },
}
const mockAiPatch = (patch: Record<string, unknown>) => {
  const settings = mockAi.settings
  if ('provider' in patch) settings.provider = (patch.provider as string | null) ?? null
  if (typeof patch.careful === 'string') settings.careful = patch.careful
  for (const key of ['anthropic', 'openaiCompatible', 'local', 'chatgpt'] as const) if (patch[key] && typeof patch[key] === 'object') Object.assign(settings[key], patch[key])
  settings.chatgpt.available = Boolean(settings.chatgpt.clientId)
  settings.chatgpt.reason = settings.chatgpt.available ? null : 'Needs OpenAI’s approval for this app'
  const connected = settings.provider === 'anthropic' ? settings.anthropic.hasKey
    : settings.provider === 'openai_compatible' ? settings.openaiCompatible.hasKey && Boolean(settings.openaiCompatible.model)
      : settings.provider === 'local' ? Boolean(settings.local.model)
        : settings.provider === 'chatgpt' ? settings.chatgpt.signedIn : false
  settings.connected = connected
  settings.status = !connected ? 'not connected' : settings.provider === 'anthropic' ? `Claude · ${settings.anthropic.model}` : settings.provider === 'local' ? `On this PC · ${settings.local.model}` : `${settings.openaiCompatible.baseUrl} · ${settings.openaiCompatible.model}`
  return { ...settings, anthropic: { ...settings.anthropic }, openaiCompatible: { ...settings.openaiCompatible }, local: { ...settings.local }, chatgpt: { ...settings.chatgpt } }
}
mockAiPatch({})

// Raw button bits (utils/controllerStatus RAW_BUTTONS) for the commands the
// scriptable pad below can hold.
const BITS: Record<string, number> = { UP: 0, DOWN: 1, LEFT: 2, RIGHT: 3, '+': 4, '-': 5, L3: 6, R3: 7, L: 8, R: 9, S: 12, E: 13, W: 14, N: 15, HOME: 16, LSL: 19, RSR: 20, LSR: 21, RSL: 22, LTOUCH: 23, RTOUCH: 24, MISC1: 27, MISC2: 28, MISC3: 29, GRIP_R: 31, GRIP_L: 32, MISC5: 31, MISC6: 32 }

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

// A mock CALIBRATE_GYRO run: phase 1 waiting (1 s), 2 calibrating (5 s), as
// the mapper's telemetry gyroCal reports it.
const mockGyroCal = { started: 0 }
const mockGyroCalNow = () => {
  const at = mockGyroCal.started ? performance.now() - mockGyroCal.started : Infinity
  if (at < 1000) return { phase: 1, remainingMs: Math.round(1000 - at), totalMs: 1000, reached: 0 }
  if (at < 6000) return { phase: 2, remainingMs: Math.round(6000 - at), totalMs: 5000, reached: 0 }
  return { phase: 0, remainingMs: 0, totalMs: 0, reached: 0 }
}

// Console v2 SHELL's preview state: Hold to swap's chords (Desktop gamepad on
// Steam, the built-in Quick tools), Startup, the update status, recent commands.
type MockChord = { id: string; buttons: string[]; triggerGroups: string[][]; controllerModel: string | null; profilePath: string; rank?: number | null }
const mockShell = {
  update: { currentVersion: '0.7.135', available: false, checking: false, checkedAtMs: null as number | null, latestVersion: null as string | null, releaseUrl: null as string | null, error: null as string | null },
  startup: { startInTray: true, startupProfile: 'last' },
  chords: [
    { id: 'desktop', buttons: [], triggerGroups: [['HOME']], controllerModel: null, profilePath: 'profiles-library/Gamepad.txt' },
    { id: 'builtin-default', buttons: [], triggerGroups: [['MISC1'], ['-', '+']], controllerModel: null, profilePath: 'profiles-library/Default Global Chords.txt' },
  ] as MockChord[],
  recent: ['LIST_CONTROLLERS', 'GYRO_SENS = 2.3', 'RESET_MAPPINGS', 'HELP'],
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
  // exePath is the executable an association was made from (TODO-46); the
  // bridge paints a coloured square for any path outside the desktop runtime.
  const mockRules: { processName: string; fileName: string; kind: string; profileName: string; missingProfile: boolean; builtIn: boolean; paused?: boolean; lastMatchedAtMs?: number; exePath?: string }[] = [
    { processName: 'JSM Evolved', fileName: 'JSM Evolved.txt', kind: 'profile', profileName: 'AppNavigation', missingProfile: false, builtIn: true },
    { processName: 'Wardogs', fileName: 'Wardogs.txt', kind: 'profile', profileName: 'Wardogs', missingProfile: false, builtIn: false, lastMatchedAtMs: Date.now() - 12 * 60_000, exePath: 'C:\\Games\\Wardogs\\Wardogs.exe' },
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
    // Gyro ▸ Speed ▸ Advanced ▸ Game & lean: Windows' default 6 of 11.
    getWindowsPointerSpeed: async () => ({ speed: 10, enhancePrecision: false }),
    // Gyro ▸ Recalibrate: a 1 s wait then a 5 s run, reported the way the
    // mapper does (telemetry gyroCal, and the countdown status).
    recalibrateGyro: async () => { mockGyroCal.started = performance.now(); return { success: true } },
    onCalibrationStatus: (callback: (payload: { calibrating: boolean; seconds?: number }) => void) => {
      const timer = setInterval(() => {
        const cal = mockGyroCalNow()
        callback(cal.phase ? { calibrating: true, seconds: Math.ceil(cal.remainingMs / 1000) } : { calibrating: false })
      }, 250)
      return () => clearInterval(timer)
    },
    deleteLibraryProfile: async (name: string) => { delete profiles[name]; return { success: true } },
    listSteamLayouts: async () => steamLayouts.map(layout => ({ ...layout, text: undefined })),
    readSteamLayout: async (path: string) => steamLayouts.find(layout => layout.path === path)?.text ?? '',
    applyProfile: async (path: string) => ({ path, mappingEnabled: true }),
    listLibraryProfileMeta: async () => Object.keys(profiles).map((name, index) => ({ name, modifiedAtMs: Date.now() - (index + 1) * 11 * 60_000 })),
    listRunningProcesses: async () => [{ processName: 'Wardogs.exe', pid: 4120, windowTitle: 'Wardogs', exePath: 'C:\\Games\\Wardogs\\Wardogs.exe' }, { processName: 'Cyberpunk2077.exe', pid: 5280, windowTitle: 'Cyberpunk 2077', exePath: 'C:\\Games\\Cyberpunk 2077\\bin\\x64\\Cyberpunk2077.exe' }, { processName: 'explorer.exe', pid: 1932, windowTitle: 'File Explorer' }],
    // New configuration (TODO-46): the name given is the file name, numbered if taken.
    createLibraryProfile: async (preferredBaseName?: string) => {
      const base = (preferredBaseName ?? 'Configuration').trim() || 'Configuration'
      const taken = new Set(Object.keys(profiles).map(name => name.toLowerCase()))
      let name = base
      for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} ${n}`
      profiles[name] = 'RESET_MAPPINGS\n'
      return { name, path: `profiles-library/${name}.txt`, content: profiles[name] }
    },
    saveAutoloadRule: async (processName: string, profileName: string, options?: { exePath?: string; autoApply?: boolean }) => {
      const stem = processName.replace(/\.exe$/i, '')
      let rule = mockRules.find(candidate => candidate.processName.toLowerCase() === stem.toLowerCase())
      if (!rule) { rule = { processName: stem, fileName: `${stem}.txt`, kind: 'profile', profileName, missingProfile: false, builtIn: false }; mockRules.push(rule) }
      rule.profileName = profileName
      if (options?.exePath) rule.exePath = options.exePath
      if (options?.autoApply !== undefined) rule.paused = !options.autoApply
      rule.fileName = rule.paused ? `${stem}.txt.paused` : `${stem}.txt`
      return { ...rule }
    },
    deleteAutoloadRule: async (processName: string) => {
      const index = mockRules.findIndex(candidate => candidate.processName.toLowerCase() === processName.replace(/\.exe$/i, '').toLowerCase())
      if (index >= 0) mockRules.splice(index, 1)
      return { success: true }
    },
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
    // ---- Console v2 SHELL (platform/shellBridge.ts). ?mock&update has 0.8.0 waiting.
    getUpdateStatus: async () => ({ ...mockShell.update }),
    checkForUpdatesNow: async () => {
      await new Promise(resolve => window.setTimeout(resolve, 700))
      const update = new URLSearchParams(location.search).has('update')
      mockShell.update = { ...mockShell.update, checking: false, checkedAtMs: Date.now(), available: update, latestVersion: update ? '0.8.0' : mockShell.update.currentVersion, releaseUrl: 'https://github.com/LukeyBeachBoy/JSM_Studio/releases' }
      return { ...mockShell.update }
    },
    installAppUpdate: async () => { await new Promise(resolve => window.setTimeout(resolve, 1500)) },
    getStartupPreferences: async () => ({ ...mockShell.startup }),
    setStartupPreferences: async (preferences: { startInTray: boolean; startupProfile: string }) => { mockShell.startup = { ...preferences }; return { ...mockShell.startup } },
    listGlobalChords: async () => mockShell.chords.map(chord => ({ ...chord })),
    saveGlobalChord: async (chord: MockChord) => { const index = mockShell.chords.findIndex(item => item.id === chord.id); if (index >= 0) mockShell.chords[index] = { ...chord }; else mockShell.chords.push({ ...chord }); return mockShell.chords.map(item => ({ ...item })) },
    deleteGlobalChord: async (id: string) => { mockShell.chords = mockShell.chords.filter(chord => chord.id !== id); return mockShell.chords.map(chord => ({ ...chord })) },
    reorderGlobalChords: async (ids: string[]) => {
      const ordered = [...ids.map(id => mockShell.chords.find(chord => chord.id === id)).filter((chord): chord is MockChord => Boolean(chord)), ...mockShell.chords.filter(chord => !ids.includes(chord.id))]
      mockShell.chords = ordered.map((chord, rank) => ({ ...chord, rank }))
      return mockShell.chords.map(chord => ({ ...chord }))
    },
    listRecentConsoleCommands: async () => [...mockShell.recent],
    recordConsoleCommand: async (command: string) => { mockShell.recent = [command, ...mockShell.recent.filter(item => item.toLowerCase() !== command.toLowerCase())].slice(0, 8); return [...mockShell.recent] },
    clearRecentConsoleCommands: async () => { mockShell.recent = []; return [] },
    getForegroundApp: async () => ({ processName: 'Wardogs', pid: 4120 }),
    // ---- Console v2 LIBRARY (platform/desktopBridge MockLibraryApi). Steam's
    // library: recent games, art (flat SVG stand-ins), running games ranked.
    listRecentSteamGames: async (limit = 8) => mockSteamGames.slice(0, limit),
    steamGameArt: async (appId: string, kind: string) => mockArt(appId, kind),
    steamAppForExe: async (exePath: string) => mockSteamGames.map(game => ({ appId: game.appId, name: game.name, installDir: `C:\\Games\\${game.name}` })).find(app => exePath.toLowerCase().includes(app.name.toLowerCase().replace(/[^a-z0-9]/g, ''))) ?? null,
    listRunningGames: async () => [
      { processName: 'Wardogs.exe', pid: 4120, windowTitle: 'Wardogs', exePath: 'C:\\Games\\Wardogs\\Wardogs.exe', kind: 'steam', steamAppId: '1203220', name: 'Wardogs' },
      { processName: 'FSD-Win64-Shipping.exe', pid: 6110, windowTitle: 'Deep Rock Galactic', exePath: 'C:\\Games\\DeepRockGalactic\\FSD-Win64-Shipping.exe', kind: 'steam', steamAppId: '548430', name: 'Deep Rock Galactic' },
      { processName: 'Discord.exe', pid: 7220, windowTitle: 'Discord', exePath: 'C:\\Users\\me\\AppData\\Local\\Discord\\Discord.exe', kind: 'app' },
    ],
    // The assistant (D18): ?mock&noai starts not connected; keys stay hints.
    getAiSettingsV2: async () => ({ ...mockAi.settings }),
    saveAiSettingsV2: async (patch: Record<string, unknown>) => mockAiPatch(patch),
    setAiKey: async (provider: string, key: string) => {
      const target = provider === 'anthropic' ? mockAi.settings.anthropic : mockAi.settings.openaiCompatible
      Object.assign(target, { hasKey: Boolean(key), keyHint: key.length > 8 ? `…${key.slice(-4)}` : '…' })
      return mockAiPatch({ provider })
    },
    forgetAiCredentials: async () => {
      Object.assign(mockAi.settings.anthropic, { hasKey: false, keyHint: null })
      Object.assign(mockAi.settings.openaiCompatible, { hasKey: false, keyHint: null })
      mockAi.settings.chatgpt.signedIn = false
      return mockAiPatch({ provider: null })
    },
    testAiConnection: async (provider: string) => {
      await new Promise(resolve => window.setTimeout(resolve, 300))
      if (provider === 'anthropic') return mockAi.settings.anthropic.hasKey ? { ok: true, models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'], error: null } : { ok: false, models: [], error: 'Paste your Claude API key first.' }
      if (provider === 'local') return { ok: true, models: ['llama3.1:8b', 'qwen2.5:7b'], error: null }
      return mockAi.settings.openaiCompatible.hasKey ? { ok: true, models: ['gpt-4.1', 'gpt-4.1-mini'], error: null } : { ok: false, models: [], error: 'Add the provider’s API key first.' }
    },
    detectLocalAiModels: async () => new URLSearchParams(location.search).has('nolocal') ? [] : [{ name: 'Ollama', baseUrl: 'http://127.0.0.1:11434/v1', models: ['llama3.1:8b', 'qwen2.5:7b'] }],
    generateAiMappingV2: async (request: { userPrompt: string; currentConfig?: string }) => {
      await new Promise(resolve => window.setTimeout(resolve, 500))
      const base = request.currentConfig ?? ''
      const prompt = request.userPrompt.toLowerCase()
      const add = prompt.includes('reload') ? ['LSR = R', 'L5 is free, so reload goes there. X keeps reload too, so nothing you’re used to breaks.', ['W']]
        : prompt.includes('sprint') ? ['S = SPACE LSHIFT', 'A tap still jumps; holding A sprints.', ['L3']]
          : ['GYRO_SMOOTH_THRESHOLD = 8', 'Small, slow gyro movements are steadied a little more, so aim twitches less.', ['GYRO_SENS']]
      const [line, summary, unchanged] = add as [string, string, string[]]
      const key = line.split('=')[0].trim()
      const configText = base.split(/\r?\n/).filter(entry => !new RegExp(`^\\s*${key.replace(/[+]/g, '\\+')}\\s*=`).test(entry)).join('\n').trimEnd() + `\n${line}\n`
      return { summary, configText, assumptions: [], warnings: [], unchanged, model: 'mock', provider: mockAi.settings.provider ?? 'local' }
    },
    chatgptSignIn: async () => { throw new Error('Continue with ChatGPT needs OpenAI’s approval for this app.') },
    restartMapper: async () => { await new Promise(resolve => window.setTimeout(resolve, 600)) },
    getHidHideStatus: async () => ({
      supported: true, installed: !new URLSearchParams(location.search).has('nohidhide'), active: true, inverse: false, steamAllowed: true,
      whitelistSynced: true, requiresElevation: false, managedInstanceIds: ['HID\\VID_28DE&PID_1302\\1'],
      devices: [
        { instanceId: 'HID\\VID_28DE&PID_1302\\1', displayName: 'Steam Controller', vendor: 'Valve', product: 'Steam Controller', serialNumber: null, present: true, hidden: true, partiallyHidden: false, likelyCurrentController: true, stale: false, managedByApp: true, vendorId: 0x28de, productId: 0x1302 },
        { instanceId: 'HID\\VID_045E&PID_0B13\\2', displayName: 'Xbox Controller', vendor: 'Microsoft', product: 'Xbox Wireless Controller', serialNumber: null, present: true, hidden: false, partiallyHidden: false, likelyCurrentController: false, stale: false, managedByApp: false, vendorId: 0x045e, productId: 0x0b13 },
        { instanceId: 'HID\\VID_054C&PID_0CE6\\3', displayName: 'DualSense', vendor: 'Sony', product: 'DualSense', serialNumber: null, present: false, hidden: true, partiallyHidden: false, likelyCurrentController: false, stale: false, managedByApp: true, vendorId: 0x054c, productId: 0x0ce6 },
      ],
      appList: [
        { path: '\\Device\\HarddiskVolume3\\JSM Evolved\\JoyShockMapper.exe', name: 'JoyShockMapper.exe', addedForYou: true, steam: false },
        { path: '\\Device\\HarddiskVolume3\\JSM Evolved\\JSM Evolved.exe', name: 'JSM Evolved.exe', addedForYou: true, steam: false },
        { path: '\\Device\\HarddiskVolume3\\Program Files (x86)\\Steam\\steam.exe', name: 'steam.exe', addedForYou: false, steam: true },
      ],
    }),
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
          gyroCal: mockGyroCalNow(),
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
