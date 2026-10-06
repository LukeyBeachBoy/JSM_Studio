// A queued gyro output is a Mapping token, not a GYRO_ON/OFF assignment.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const gui = path.resolve(__dirname, '../JSM_GUI/jsm_gui_tauri')
const staged = process.env.JSM_GUI_SOURCE_STAGE
const ts = require(path.join(gui, 'node_modules/typescript'))
const cache = new Map()
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports
  const replacement = staged && path.join(staged, relative.replace(/^src\//, ''))
  const file = replacement && fs.existsSync(replacement) ? replacement : path.join(gui, relative)
  const module = { exports: {} }; cache.set(relative, module)
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  new Function('module', 'exports', 'require', js)(module, module.exports, name => {
    if (!name.startsWith('.')) return require(require.resolve(name, { paths: [gui] }))
    const base = path.resolve(gui, path.dirname(relative), name)
    const target = ['', '.ts', '.tsx'].map(suffix => base + suffix).find(fs.existsSync)
    assert(target, `Unresolved import ${name}`)
    return load(path.relative(gui, target).replace(/\\/g, '/'))
  })
  return module.exports
}
const bindings = load('src/utils/bindingCommands.ts')
const keymap = load('src/utils/keymap.ts')
const schema = load('src/keymap/schema.ts')
const source = 'RESET_MAPPINGS\nGYRO_OFF = N\nN = ^GYRO_ON_ !GYRO_OFF/\nFUTURE_SETTING = keep-this # untouched\n'
const rows = keymap.getButtonBindingRows(source, 'N', {})
const commands = bindings.parseRowsToCommands(rows, 'N', { specialKey: 'GYRO_OFF' })
const on = commands.find(command => command.outputValue === 'GYRO_ON')
const off = commands.find(command => command.outputValue === 'GYRO_OFF' && command.source.kind === 'row')
const condition = commands.find(command => command.source.kind === 'special')
assert.equal(on.outputKind, 'gyroAction')
assert.equal(on.triggerKind, 'hold')
assert.equal(on.outputBehavior, 'toggle')
assert.equal(off.outputKind, 'gyroAction')
assert.equal(off.triggerKind, 'release')
assert.equal(condition.outputKind, 'special', 'imported activation conditions keep their separate owner')
assert.equal(bindings.commandLinePreview(condition), 'GYRO_OFF = N')
assert.equal(bindings.inferOutputKindFromBindingValue('GYRO_OFF'), 'gyroAction')
const updated = bindings.updateCommandExpression(on, { outputBehavior: 'normal' })
const value = keymap.serializeBindingExpression(updated)
assert.match(value, /GYRO_ON_/)
assert.match(value, /!GYRO_OFF\//)
const saved = keymap.updateKeymapEntry(source, 'N', [value])
assert.match(saved, /^GYRO_OFF = N$/m, 'editing an action does not rewrite activation conditions')
assert.match(saved, /^FUTURE_SETTING = keep-this # untouched$/m)
assert.equal(bindings.commandForValue('N', '^GYRO_OFF\\').outputKind, 'gyroAction')
const options = schema.getActionSpecialOptionList(key => key)
for (const value of ['GYRO_ON', 'GYRO_OFF']) {
  assert(options.some(option => option.value === value && option.label.includes('this controller')))
}
console.log('PASS: native gyro actions have separate graphical identity, activators and behavior, preserve profile activation settings and unknown lines')
