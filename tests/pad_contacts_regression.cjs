// Actual enum / renderer contract. No mapper, physical input or OS output.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '../JSM_GUI/jsm_gui_tauri')
const ts = require(path.join(root, 'node_modules/typescript'))
const cache = new Map()
function load(file) {
  file = path.resolve(root, file)
  if (cache.has(file)) return cache.get(file)
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  new Function('module', 'exports', 'require', code)(module, module.exports, name => name.startsWith('.') ? load(path.resolve(path.dirname(file), name) + '.ts') : require(name))
  cache.set(file, module.exports)
  return module.exports
}
const status = load('src/utils/controllerStatus.ts')
const names = load('src/keymap/inputNames.ts')
const schema = load('src/keymap/schema.ts')
const device = (left, right, type = 24) => ({ type, handle: 1, status: { buttons: 0, leftPad: { touched: left }, rightPad: { touched: right } } })
for (const [left, right] of [[false, false], [true, false], [false, true], [true, true]]) {
  const pressed = status.getPressedControllerCommandSet(device(left, right))
  assert.equal(pressed.has('MISC4'), left)
  assert.equal(pressed.has('TOUCH'), right)
  assert.equal(pressed.has('MISC2'), false, 'contact must not become click')
  assert.equal(pressed.has('MISC3'), false)
}
for (const type of [4, 5]) assert.equal(status.getPressedControllerCommandSet(device(false, true, type)).has('TOUCH'), true)
assert.equal(status.getPressedControllerCommandSet(device(true, true, 6)).has('TOUCH'), false)
for (const input of ['MISC4', 'TOUCH']) assert.equal(status.controllerSupportsInput(device(false, false), input), true)
assert.equal(status.controllerSupportsInput(device(false, false), 'CAPTURE'), false)
const translate = value => value
assert.equal(names.inputLongName(schema.MISC_BUTTONS.find(button => button.command === 'MISC4'), 'steam', translate), 'Left pad touch')
assert.equal(names.inputLongName(schema.TOUCH_BUTTONS.find(button => button.command === 'TOUCH'), 'steam', translate), 'Right pad touch')
const contact = load('src/utils/touchpadConfig.ts')
const modifiers = load('src/utils/modifierOptions.ts')
const options = modifiers.buildModifierOptions(false, 2)
const legacyTranslation = key => `${key} — extra button 4`
for (const input of ['MISC2', 'MISC3', 'MISC4', 'MISC5', 'MISC6', 'TOUCH', 'LTOUCH', 'RTOUCH']) {
  const option = options.find(option => option.value === input)
  const button = [...status.controllerButtonOrder(), ...schema.TOUCH_BUTTONS].find(button => button.command === input)
  assert.equal(modifiers.resolveModifierOptionLabel(option, legacyTranslation, 'steam'), status.controllerButtonLabel(button, 'steam'))
}
assert.deepEqual(contact.TOUCHPAD_DUAL_STAGE_OPTIONS.map(option => option.value), [...contact.TOUCHPAD_DUAL_STAGE_MODE_VALUES])
for (const option of contact.TOUCHPAD_DUAL_STAGE_OPTIONS) assert.notEqual(option.label, option.value)
console.log('PASS: independent raw pad contacts, buttonless telemetry, hardware support, human labels and all seven policy choices')
