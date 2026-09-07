// The two quick binds write raw config text, so they are checked here rather
// than through the UI: the whole controller passed through to a virtual pad, and
// a four-way directional pointed at WASD.
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const app = path.resolve(__dirname, '../JSM_GUI/jsm_gui_tauri')
const ts = require(path.join(app, 'node_modules/typescript'))

// The modules under test import each other, so transpile the graph on demand
// rather than a single file. Type-only imports (i18next's TFunction) are elided
// by the transpiler, so nothing outside src has to resolve.
const cache = new Map()
const requireTs = (file) => {
  const full = file.endsWith('.ts') ? file : file + '.ts'
  if (cache.has(full)) return cache.get(full)
  const compiled = ts.transpileModule(fs.readFileSync(full, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const module = { exports: {} }
  cache.set(full, module.exports)
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: (spec) => (spec.startsWith('.') ? requireTs(path.resolve(path.dirname(full), spec)) : require(spec)),
  })
  cache.set(full, module.exports)
  return module.exports
}

const src = path.join(app, 'src')
const { applyGamepadPassthrough, applyWasdBindings, wasdBindingChangesStickMode } = requireTs(path.join(src, 'utils/quickBind'))
const { getKeymapValue } = requireTs(path.join(src, 'utils/keymap'))
const { analyzeVirtualControllerConfig } = requireTs(path.join(src, 'utils/virtualController'))
const { isDirectionalStickMode } = requireTs(path.join(src, 'constants/sticks'))

const countLines = (text, key) =>
  text.split('\n').filter(line => line.trim().toUpperCase().startsWith(key.toUpperCase() + ' =')).length

// --- Whole controller passed through to a virtual Xbox pad -------------------
const xbox = applyGamepadPassthrough('', 'XBOX')
assert.equal(getKeymapValue(xbox, 'VIRTUAL_CONTROLLER'), 'XBOX')
Object.entries({
  S: 'X_A', E: 'X_B', W: 'X_X', N: 'X_Y',
  L: 'X_LB', R: 'X_RB', L3: 'X_LS', R3: 'X_RS',
  '-': 'X_BACK', '+': 'X_START', HOME: 'X_GUIDE',
  UP: 'X_UP', DOWN: 'X_DOWN', LEFT: 'X_LEFT', RIGHT: 'X_RIGHT',
}).forEach(([input, token]) => assert.equal(getKeymapValue(xbox, input), token, input + ' should pass through as ' + token))
// Analog triggers rather than digital bindings -- JSM calls feeding both undefined.
assert.equal(getKeymapValue(xbox, 'ZL_MODE'), 'X_LT')
assert.equal(getKeymapValue(xbox, 'ZR_MODE'), 'X_RT')
assert.equal(getKeymapValue(xbox, 'ZL'), undefined)
assert.equal(getKeymapValue(xbox, 'ZR'), undefined)
assert.equal(getKeymapValue(xbox, 'LEFT_STICK_MODE'), 'LEFT_STICK')
assert.equal(getKeymapValue(xbox, 'RIGHT_STICK_MODE'), 'RIGHT_STICK')
// ViGEm's xbox pad has no touchpad, so nothing is written for the pad click.
assert.equal(getKeymapValue(xbox, 'CAPTURE'), undefined)
// The scheme and every token it wrote have to agree, or the panel warns.
assert.equal(analyzeVirtualControllerConfig(xbox).warnings.length, 0)

// --- ... and to a virtual DS4, which does have a pad click -------------------
const ds4 = applyGamepadPassthrough('', 'DS4')
assert.equal(getKeymapValue(ds4, 'VIRTUAL_CONTROLLER'), 'DS4')
assert.equal(getKeymapValue(ds4, 'S'), 'PS_CROSS')
assert.equal(getKeymapValue(ds4, 'N'), 'PS_TRIANGLE')
assert.equal(getKeymapValue(ds4, 'CAPTURE'), 'PS_PAD_CLICK')
assert.equal(getKeymapValue(ds4, 'ZL_MODE'), 'PS_L2')
assert.equal(getKeymapValue(ds4, 'ZR_MODE'), 'PS_R2')
assert.equal(analyzeVirtualControllerConfig(ds4).warnings.length, 0)

// --- Applied over an existing config ----------------------------------------
const existing = [
  'S = SPACE',
  'S,S = LMOUSE',
  'ZL = RMOUSE',
  'ZLF = LMOUSE',
  'ZR_MODE = NO_SKIP',
  'LSL = Q',
  'MISC5 = TAB',
  'GYRO_OFF = R3',
  'LUP = W',
].join('\n')
const merged = applyGamepadPassthrough(existing, 'XBOX')
assert.equal(getKeymapValue(merged, 'S'), 'X_A')
assert.equal(countLines(merged, 'S'), 1, 'the replaced binding should not be duplicated')
// Digital soft and full pull bindings come off with the analog mode going on.
assert.equal(getKeymapValue(merged, 'ZL'), undefined)
assert.equal(getKeymapValue(merged, 'ZLF'), undefined)
assert.equal(getKeymapValue(merged, 'ZR_MODE'), 'X_RT')
// Anything a virtual pad has no equivalent for is left exactly as it was, and so
// is the gyro button setting, which coexists with a binding on the same button.
assert.equal(getKeymapValue(merged, 'LSL'), 'Q')
assert.equal(getKeymapValue(merged, 'MISC5'), 'TAB')
assert.equal(getKeymapValue(merged, 'GYRO_OFF'), 'R3')
assert.equal(getKeymapValue(merged, 'S,S'), 'LMOUSE')

// --- Four-way directional pointed at WASD -----------------------------------
const dpad = applyWasdBindings('', 'dpad')
assert.equal(getKeymapValue(dpad, 'UP'), 'W')
assert.equal(getKeymapValue(dpad, 'LEFT'), 'A')
assert.equal(getKeymapValue(dpad, 'DOWN'), 'S')
assert.equal(getKeymapValue(dpad, 'RIGHT'), 'D')
// The d-pad is always digital, so no stick mode is involved.
assert.equal(getKeymapValue(dpad, 'LEFT_STICK_MODE'), undefined)
assert.equal(wasdBindingChangesStickMode('', 'dpad'), false)

const touch = applyWasdBindings('', 'touchStick')
assert.equal(['TUP', 'TLEFT', 'TDOWN', 'TRIGHT'].map(input => getKeymapValue(touch, input)).join(' '), 'W A S D')

// A stick in an analog mode never sends its directions, so the quick bind puts
// it back on digital directions -- otherwise the bindings would do nothing.
assert.equal(wasdBindingChangesStickMode('LEFT_STICK_MODE = AIM', 'leftStick'), true)
const aiming = applyWasdBindings('LEFT_STICK_MODE = AIM', 'leftStick')
// Cleared rather than written as NO_MOUSE: unset is JSM's own default, and the
// mode picker shows that default rather than a blank when nothing is set.
assert.equal(getKeymapValue(aiming, 'LEFT_STICK_MODE'), undefined)
assert.equal(getKeymapValue(aiming, 'LUP'), 'W')
assert.equal(getKeymapValue(aiming, 'LLEFT'), 'A')

// Modes that already send directions are left alone, including the unset default.
assert.equal(wasdBindingChangesStickMode('', 'rightStick'), false)
assert.equal(getKeymapValue(applyWasdBindings('', 'rightStick'), 'RIGHT_STICK_MODE'), undefined)
assert.equal(wasdBindingChangesStickMode('LEFT_STICK_MODE = INNER_RING', 'leftStick'), false)
assert.equal(
  getKeymapValue(applyWasdBindings('LEFT_STICK_MODE = INNER_RING', 'leftStick'), 'LEFT_STICK_MODE'),
  'INNER_RING'
)

// The passthrough's own stick modes are the analog ones, so binding WASD after it
// has to take the stick back off the virtual stick.
assert.equal(wasdBindingChangesStickMode(xbox, 'leftStick'), true)
assert.equal(getKeymapValue(applyWasdBindings(xbox, 'leftStick'), 'LEFT_STICK_MODE'), undefined)

// The shared mode check the button list also keys off.
assert.equal(isDirectionalStickMode(undefined), true)
assert.equal(isDirectionalStickMode('no_mouse'), true)
assert.equal(isDirectionalStickMode('FLICK'), false)

console.log('PASS: gamepad passthrough tokens, trigger and stick modes, untouched extras, WASD quick bind')
