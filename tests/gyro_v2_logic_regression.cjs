// Console v2 Gyro (P5): the pure logic under the screens, no browser.
// Turn speed over static and curve settings, the speed-up / steadiness / rumble
// presets (apply, detect, Custom), the steadiness filter model's stats, the
// key -> Fine-tune group / part route map, and activation evaluation.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')

const APP = path.join(__dirname, '..', 'JSM_GUI', 'jsm_gui_tauri')
const ts = require(path.join(APP, 'node_modules', 'typescript'))
const cache = new Map()
function load(file) {
  file = path.resolve(file)
  if (cache.has(file)) return cache.get(file).exports
  const mod = new Module(file); cache.set(file, mod)
  mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file))
  mod.require = name => name.startsWith('.') ? load(path.resolve(path.dirname(file), name.endsWith('.ts') ? name : name + '.ts')) : require(name)
  mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, file)
  return mod.exports
}
const U = name => load(path.join(APP, 'src/utils', name + '.ts'))
const speed = U('gyroSpeed'), presets = U('gyroPresets'), routes = U('gyroRoutes'), steady = U('gyroSteadiness'), keymap = U('keymap')

const get = (text, key) => keymap.getKeymapValue(text, key)

// ---- Turn speed.
assert.deepEqual([speed.readGyroSpeed('').mode, speed.readGyroSpeed('').base], ['static', 1], 'an empty file is the mapper default: 1x at every speed')
let text = speed.writeTurnSpeed('', 2.3)
assert.equal(get(text, 'GYRO_SENS'), '2.3')
text = speed.writeTurnSpeed('GYRO_SENS = 2 3', 4)
assert.equal(get(text, 'GYRO_SENS'), '4 6', 'static: up/down keeps its ratio to left/right')
text = speed.writeTurnSpeed('MIN_GYRO_SENS = 2 1\nMAX_GYRO_SENS = 4 3\nMIN_GYRO_THRESHOLD = 5', 4)
assert.equal(get(text, 'MIN_GYRO_SENS'), '4 2', 'curve: turn speed scales the slow speed')
assert.equal(get(text, 'MAX_GYRO_SENS'), '8 6', 'and the fast speed with it, so every speed stays measured from it')
assert.equal(speed.readGyroSpeed('MIN_GYRO_SENS = 2 1.5\nMAX_GYRO_SENS = 4 3').separateY, true)
assert.equal(speed.readGyroSpeed('MIN_GYRO_SENS = 2 2\nMAX_GYRO_SENS = 4').separateY, false)
text = speed.joinVerticalSpeeds('MIN_GYRO_SENS = 2 1.5\nMAX_GYRO_SENS = 4 3')
assert.equal(get(text, 'MIN_GYRO_SENS'), '2') && assert.equal(get(text, 'MAX_GYRO_SENS'), '4')

// ---- Speed up fast turns.
const base = 'GYRO_SENS = 2 3\nUNKNOWN = keep'
const gentle = speed.applySpeedUp(base, 'gentle')
assert.equal(speed.detectSpeedUp(base), 'off')
assert.equal(speed.detectSpeedUp(gentle), 'gentle')
assert.equal(get(gentle, 'MIN_GYRO_SENS'), '2 3'); assert.equal(get(gentle, 'MAX_GYRO_SENS'), '3 4.5')
assert.equal(get(gentle, 'MIN_GYRO_THRESHOLD'), '5'); assert.equal(get(gentle, 'MAX_GYRO_THRESHOLD'), '75')
assert.equal(get(gentle, 'GYRO_SENS'), undefined, 'a curve replaces the single speed')
assert.match(gentle, /UNKNOWN = keep/, 'nothing else is touched')
const strong = speed.applySpeedUp(gentle, 'strong')
assert.equal(speed.detectSpeedUp(strong), 'strong')
assert.equal(get(strong, 'MAX_GYRO_SENS'), '5 7.5'); assert.equal(get(strong, 'MAX_GYRO_THRESHOLD'), '50')
assert.equal(speed.detectSpeedUp(speed.writeTurnSpeed(gentle, 3)), 'gentle', 'turn speed moves the whole curve and stays on its preset')
assert.equal(speed.detectSpeedUp(gentle + '\nACCEL_CURVE = SIGMOID'), 'custom')
assert.equal(speed.detectSpeedUp(gentle.replace('MAX_GYRO_THRESHOLD = 75', 'MAX_GYRO_THRESHOLD = 80')), 'custom')
const off = speed.applySpeedUp(strong + '\nACCEL_CURVE = POWER\nACCEL_POWER_VREF = 0.01', 'off')
assert.equal(speed.detectSpeedUp(off), 'off'); assert.equal(get(off, 'GYRO_SENS'), '2 3', 'Off keeps the turn speed'); assert.equal(get(off, 'ACCEL_CURVE'), undefined)
assert.equal(get(speed.setCurveType('GYRO_SENS = 2', 'SIGMOID'), 'ACCEL_CURVE'), 'SIGMOID')
assert.equal(speed.detectSpeedUp(speed.setCurveType('GYRO_SENS = 2', 'SIGMOID')), 'custom')
assert.equal(get(speed.setCurveType(strong, 'LINEAR'), 'ACCEL_CURVE'), undefined, 'Linear is the unset curve')

// ---- Steadiness presets.
for (const name of ['off', 'light', 'medium', 'heavy']) {
  const applied = presets.applySteadiness('UNKNOWN = keep\nGYRO_SMOOTH_TIME = 0.5', name)
  assert.equal(presets.detectSteadiness(applied), name, `${name} reads back as ${name}`)
  assert.match(applied, /UNKNOWN = keep/)
}
assert.equal(presets.detectSteadiness(''), 'off')
assert.equal(get(presets.applySteadiness('', 'off'), 'GYRO_SMOOTH_THRESHOLD'), undefined, 'Off leaves the file as it was: defaults are no lines')
const medium = presets.applySteadiness('', 'medium')
assert.deepEqual([get(medium, 'GYRO_CUTOFF_SPEED'), get(medium, 'GYRO_CUTOFF_RECOVERY'), get(medium, 'GYRO_SMOOTH_THRESHOLD'), get(medium, 'GYRO_SMOOTH_TIME')], ['0.3', '1', '6', '0.1'])
assert.equal(get(presets.applySteadiness('', 'off', true), 'GYRO_SMOOTH_THRESHOLD'), '0', 'a held Off writes its zeros: no line would follow the base')
assert.equal(presets.detectSteadiness(medium + '\nGYRO_SMOOTH_TIME = 0.2'), 'custom', 'any other number is Custom')
assert.equal(presets.detectSteadiness(medium.replace('0.125', '0.125') + '\nONE_EURO_FILTER'), 'medium', 'the adaptive filter is global: not part of a preset')
assert.deepEqual([0, 25, 50, 100].map(value => presets.detectRumble(value)), ['off', 'light', 'medium', 'strong'])
assert.equal(presets.detectRumble(40), 'custom')

// ---- The steadiness filter model: what the Steadiness visual says.
const stats = name => steady.steadinessStats(steady.readSteadyingSettings(presets.applySteadiness('', name)))
const [offStats, lightStats, mediumStats, heavyStats] = ['off', 'light', 'medium', 'heavy'].map(stats)
assert.equal(offStats.wobbleCut, 0, 'Off removes nothing')
assert.ok(lightStats.wobbleCut > 0.1 && mediumStats.wobbleCut > lightStats.wobbleCut && heavyStats.wobbleCut >= mediumStats.wobbleCut, 'each level calms more')
assert.ok(mediumStats.wobbleCut > 0.5, `Medium removes most of a still hand's wobble (${mediumStats.wobbleCut})`)
assert.ok(heavyStats.slowDelayMs >= mediumStats.slowDelayMs && mediumStats.slowDelayMs >= lightStats.slowDelayMs, 'a heavier setting lags slow aim more')
assert.ok(mediumStats.fastDelayMs <= 6 && mediumStats.fastKept > 0.99, 'a fast turn passes straight through')
assert.equal(steady.passedAt(0.4, 1, 4), 0); assert.equal(steady.passedAt(6, 1, 4), 1); assert.ok(Math.abs(steady.passedAt(2.5, 1, 4) - 0.5) < 1e-9)
assert.equal(steady.smoothedAt(0, { smoothThreshold: 8, decay: false }), 1); assert.equal(steady.smoothedAt(8, { smoothThreshold: 8, decay: false }), 0)

// ---- Where every key lives (Review changes, configuration errors, the curve editor).
const route = key => JSON.stringify(routes.gyroRouteForKey(key))
assert.equal(route('GYRO_SENS'), JSON.stringify({ view: 'fine-tune', group: 'speed' }))
assert.equal(route('MAX_GYRO_THRESHOLD'), JSON.stringify({ view: 'fine-tune', group: 'speed', sub: { view: 'speed-advanced', part: 'speeds' } }))
assert.equal(route('ACCEL_SIGMOID_MID'), JSON.stringify({ view: 'fine-tune', group: 'speed', sub: { view: 'speed-advanced', part: 'shape' } }))
assert.equal(route('REAL_WORLD_CALIBRATION'), JSON.stringify({ view: 'fine-tune', group: 'speed', sub: { view: 'speed-advanced', part: 'game' } }))
assert.equal(route('GYRO_STEADYING_FLOOR'), JSON.stringify({ view: 'fine-tune', group: 'steadiness', sub: { view: 'steadiness-advanced', part: 'jitter' } }))
assert.equal(route('ONE_EURO_MIN_CUTOFF'), JSON.stringify({ view: 'fine-tune', group: 'steadiness', sub: { view: 'steadiness-advanced', part: 'adaptive' } }))
assert.equal(route('DECEL_BRAKE_STRENGTH'), JSON.stringify({ view: 'fine-tune', group: 'steadiness', sub: { view: 'steadiness-advanced', part: 'snap' } }))
assert.equal(route('GYRO_SPACE'), JSON.stringify({ view: 'fine-tune', group: 'direction' }))
assert.equal(route('TICK_TIME'), JSON.stringify({ view: 'fine-tune', group: 'direction', sub: { view: 'direction-advanced' } }))
assert.equal(route('MOTION_STICK_MODE'), JSON.stringify({ view: 'fine-tune', group: 'direction', sub: { view: 'tilt', part: 'behaviour' } }))
assert.equal(route('TILT_OFF'), JSON.stringify({ view: 'fine-tune', group: 'direction', sub: { view: 'tilt', part: 'when' } }))
assert.equal(route('LEFT_STICK_UNPOWER'), JSON.stringify({ view: 'fine-tune', group: 'direction', sub: { view: 'stick', part: 'deadzone' } }))
assert.equal(route('GYRO_DEFLECTION_RANGE'), JSON.stringify({ view: 'fine-tune', group: 'direction', sub: { view: 'stick', part: 'setup' } }))
assert.equal(route('GYRO_HAPTIC_SIDE'), JSON.stringify({ view: 'fine-tune', group: 'rumble' }))
assert.equal(route('GYRO_ON'), JSON.stringify({ view: 'when-on' }))
assert.equal(route('GYRO_CALIBRATION_TIME'), JSON.stringify({ view: 'calibrate' }))
assert.equal(route('L,GYRO_SENS'), JSON.stringify({ view: 'while-holding', trigger: 'L' }), 'a held gyro setting opens that button\'s variant')
assert.equal(route('ZL,MOTION_STICK_MODE'), JSON.stringify({ view: 'fine-tune', group: 'direction', sub: { view: 'tilt', part: 'holding' } }), 'a held tilt setting opens Tilt ▸ While holding…')
assert.equal(route('L,S'), 'null'); assert.equal(route('LIGHT_BAR'), 'null')
// Every gyro key the app writes (utils/gyroSettingsScope, constants/configKeys) has a home.
const scope = U('gyroSettingsScope'), configKeys = load(path.join(APP, 'src/constants/configKeys.ts'))
const known = [...configKeys.gyroBehaviorKeys, ...configKeys.noiseKeys, ...configKeys.sensitivityKeys, 'ACCEL_CURVE_LINK', 'TRACKBALL_DECAY', 'IGNORE_OS_MOUSE_SPEED', 'AUTO_CALIBRATE_GYRO', 'GYRO_CALIBRATION_DELAY', 'GYRO_CALIBRATION_TIME',
  'JOYCON_GYRO_MASK', 'JOYCON_MOTION_MASK', 'GYRO_STICK_DEFLECTION', 'GYRO_DEFLECTION_RANGE', 'GYRO_DEFLECTION_LOCK_EXTENTS', 'MOUSE_X_FROM_GYRO_AXIS', 'MOUSE_Y_FROM_GYRO_AXIS', 'VIRTUAL_STICK_CALIBRATION', 'VIRTUAL_CONTROLLER',
  'LEFT_STICK_UNDEADZONE_INNER', 'RIGHT_STICK_UNDEADZONE_OUTER', 'LEFT_STICK_UNPOWER', 'RIGHT_STICK_VIRTUAL_SCALE', 'LEFT_STICK_DEADZONE_PROBE', 'GYRO_ON', 'GYRO_OFF', 'TILT_ON', 'TILT_OFF',
  'MOTION_STICK_MODE', 'MOTION_STICK_AXIS', 'MOTION_DEADZONE_INNER', 'MOTION_DEADZONE_OUTER', 'MOTION_RING_MODE', 'LEAN_THRESHOLD', 'CONTROLLER_ORIENTATION']
const unrouted = [...new Set(known)].filter(key => !routes.gyroRouteForKey(key))
// Keys the bindings own (GYRO_OFF/ON actions, trackball…) or that are not gyro screens' business are allowed to be unrouted.
assert.deepEqual(unrouted.filter(key => !/^(IGNORE_GYRO_DEVICES|GYRO_INVERT|GYRO_INV_|GYRO_TRACK|GYRO_ON_ALL|GYRO_OFF_ALL|COUNTER_OS_MOUSE_SPEED)/.test(key)).filter(key => scope.GYRO_TUNING_KEYS.test(key)), [], `every tuning key has a home: ${unrouted.join(', ')}`)

console.log('PASS: turn speed over static and curve, speed-up / steadiness / rumble presets with Custom, the steadiness model, and the key to Fine-tune route map')
