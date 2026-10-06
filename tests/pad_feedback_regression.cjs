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
const feedback = load('src/utils/padFeedback.ts')
const keymap = load('src/utils/keymap.ts')
const shifts = load('src/utils/modeshift.ts')
let text = 'TOUCHPAD_HAPTIC_INTENSITY = 35\nTOUCHPAD_CLICK_HAPTIC_EFFECT = SWEEP\nRIGHT_TOUCHPAD_RELEASE_HAPTIC_INTENSITY = 12\nUNKNOWN_FEEDBACK = exact\n'
const read = key => keymap.getKeymapValue(text, key) ?? undefined
assert.equal(feedback.padFeedbackValue(read, 'RIGHT', 'HAPTIC_INTENSITY'), '35')
let values = feedback.padFeedbackPolicyChanges(read, 'RIGHT', true)
assert.equal(values.RIGHT_TOUCHPAD_HAPTIC_INTENSITY, '35')
assert.equal(values.RIGHT_TOUCHPAD_CLICK_HAPTIC_EFFECT, 'SWEEP')
assert.equal(values.RIGHT_TOUCHPAD_RELEASE_HAPTIC_INTENSITY, undefined, 'latent values survive enabling')
for (const [key, value] of Object.entries(values)) text = keymap.updateKeymapEntry(text, key, [value])
assert.equal(feedback.hasSeparatePadFeedback(read, 'RIGHT'), true)
assert.equal(feedback.hasSeparatePadFeedback(read, 'LEFT'), false)
assert.equal(feedback.padFeedbackValue(read, 'RIGHT', 'RELEASE_HAPTIC_INTENSITY'), '12')
values = feedback.padFeedbackPolicyChanges(read, 'RIGHT', false)
assert.deepEqual(values, { RIGHT_TOUCHPAD_HAPTICS: 'OFF' })
text = keymap.updateKeymapEntry(text, 'RIGHT_TOUCHPAD_HAPTICS', ['OFF'])
assert.equal(feedback.padFeedbackValue(read, 'RIGHT', 'HAPTIC_INTENSITY'), '35')
assert.match(text, /RIGHT_TOUCHPAD_RELEASE_HAPTIC_INTENSITY = 12/)
assert.match(text, /UNKNOWN_FEEDBACK = exact/)
for (const side of ['LEFT', 'RIGHT']) for (const field of ['HAPTICS', ...feedback.PAD_FEEDBACK_FIELDS.map(entry => entry.field)]) {
  const key = feedback.padFeedbackKey(side, field)
  assert.ok(shifts.padModeshiftSettings(side).includes(key), 'removing/renaming a pad shift must own ' + key)
}
console.log('PASS: opt-in feedback preserves shared defaults and latent values, independent sides, native ordinary serialization, unknown lines and modeshift scope')
