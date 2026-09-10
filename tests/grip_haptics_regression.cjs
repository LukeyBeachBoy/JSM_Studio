const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const app = path.resolve(__dirname, '../JSM_GUI/jsm_gui_tauri')
const ts = require(path.join(app, 'node_modules/typescript'))
const cache = new Map()
function load(file) {
  if (cache.has(file)) return cache.get(file)
  const context = { exports: {}, require: name => {
    if (name === 'react') return { useCallback: callback => callback }
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name + '.ts'))
    throw new Error(`Unexpected dependency ${name}`)
  } }
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  vm.runInNewContext(compiled, context, { filename: file })
  cache.set(file, context.exports)
  return context.exports
}
const { useGripConfig } = load(path.join(app, 'src/hooks/useGripConfig.ts'))
const { getKeymapValue } = load(path.join(app, 'src/utils/keymap.ts'))
const { gripKeys } = load(path.join(app, 'src/constants/configKeys.ts'))
const { scopedConfig, replaceScope } = load(path.join(app, 'src/utils/configScopes.ts'))
let text = '# Existing profile\nMISC5 = GYRO_ON\nMISC6 = NONE\nGRIP_HAPTIC_INTENSITY = 65\nGRIP_RELEASE_HAPTIC_INTENSITY = 30\n'
const state = () => useGripConfig({ configText: text, setConfigText: update => { text = update(text) } })
assert.equal(state().leftGripHapticsValue, true)
assert.equal(state().rightGripHapticsValue, true)
state().handleLeftGripHapticsChange(false)
assert.equal(state().leftGripHapticsValue, false)
assert.equal(state().rightGripHapticsValue, true)
assert.equal(getKeymapValue(text, 'LEFT_GRIP_HAPTICS'), 'OFF')
assert.equal(getKeymapValue(text, 'RIGHT_GRIP_HAPTICS'), undefined)
assert.equal(state().gripHapticIntensityValue, 65)
assert.equal(state().gripReleaseHapticIntensityValue, 30)
assert.equal(getKeymapValue(text, 'MISC5'), 'GYRO_ON')
assert.equal(getKeymapValue(text, 'MISC6'), 'NONE')
state().handleRightGripHapticsChange(false)
state().handleLeftGripHapticsChange(true)
assert.equal(state().leftGripHapticsValue, true)
assert.equal(state().rightGripHapticsValue, false)
const saved = text
state().handleRightGripHapticsChange(true)
text = saved // Cancel restores both independent switches from config text.
assert.equal(state().rightGripHapticsValue, false)
const gripScope = /^(?:(?:LEFT_|RIGHT_)?GRIP_)/
const copied = scopedConfig(text, gripScope)
text = replaceScope('MISC5 = GYRO_ON\nLEFT_GRIP_HAPTICS = OFF', copied, gripScope)
assert.equal(state().leftGripHapticsValue, true)
assert.equal(state().rightGripHapticsValue, false)
assert.equal(getKeymapValue(text, 'MISC5'), 'GYRO_ON')
for (const key of ['LEFT_GRIP_HAPTICS', 'RIGHT_GRIP_HAPTICS']) assert.ok(gripKeys.includes(key))
text = 'LEFT_GRIP_HAPTICS = off\nRIGHT_GRIP_HAPTICS = on'
assert.equal(state().leftGripHapticsValue, false)
assert.equal(state().rightGripHapticsValue, true)
console.log('PASS: legacy defaults, independent switches, preserved bindings/effects, cancel and tuning copy/paste')
