const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '../JSM_GUI/jsm_gui_tauri')
const ts = require(path.join(root, 'node_modules/typescript'))
const cache = new Map()
function load(file) {
  file = path.resolve(root, file)
  if (cache.has(file)) return cache.get(file)
  const module = { exports: {} }; cache.set(file, module.exports)
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  new Function('module', 'exports', 'require', code)(module, module.exports, name => name.startsWith('.') ? load(path.resolve(path.dirname(file), name) + '.ts') : require(name))
  cache.set(file, module.exports); return module.exports
}
const { findVirtualControllerOutputs, analyzeVirtualControllerConfig, fixVirtualControllerOutputs } = load('src/utils/virtualController.ts')
const { getKeymapValue } = load('src/utils/keymap.ts')
const menus = load('src/utils/virtualMenus.ts')
const source = '# N = PS_CROSS\nVIRTUAL_CONTROLLER = XBOX\nZL_MODE = X_LT\nL,ZR_MODE = X_RT\nN = PS_TRIANGLE! # keep comment\nL,S = PS_CROSS\\ SPACE\nE = "CYCLE PS_CIRCLE | X_A"\nW = "ECHO PS_SQUARE"\nT = PS_PAD_CLICK\n'
assert.deepEqual(findVirtualControllerOutputs(source).map(({ command, token }) => [command, token]), [
  ['N', 'PS_TRIANGLE'], ['L,S', 'PS_CROSS'], ['E', 'PS_CIRCLE'], ['E', 'X_A'], ['T', 'PS_PAD_CLICK'],
])
const fixed = fixVirtualControllerOutputs(source, source, 'XBOX')
assert.match(fixed, /N = X_Y! # keep comment/)
assert.match(fixed, /L,S = X_A\\ SPACE/)
assert.match(fixed, /E = "CYCLE X_B \| X_A"/)
assert.match(fixed, /W = "ECHO PS_SQUARE"/)
assert.match(fixed, /ZL_MODE = X_LT/)
assert.deepEqual(findVirtualControllerOutputs(fixed).filter(output => output.type === 'DS4').map(output => output.token), ['PS_PAD_CLICK'])
assert.equal(analyzeVirtualControllerConfig('VIRTUAL_CONTROLLER = DS4\nZL_MODE = X_LT\n# N = X_A').warnings.length, 0)
const local = 'template.txt\nVIRTUAL_CONTROLLER = XBOX\nW = SPACE\n'
const inheritedFix = fixVirtualControllerOutputs(local, local + 'N = PS_CROSS\n', 'XBOX')
assert.match(inheritedFix, /^template.txt/m)
assert.equal(getKeymapValue(inheritedFix, 'W'), 'SPACE')
assert.equal(getKeymapValue(inheritedFix, 'N'), 'X_A')
let menu = menus.createVirtualMenu('weapons', 'Weapons')
menu.actions[0].binding = 'PS_TRIANGLE'
menu.actions[0].label = 'Weapon'
const effective = menus.writeVirtualMenus(local, [menu])
assert.ok(findVirtualControllerOutputs(effective).some(output => output.command === 'Menu: Weapons / Weapon'))
const menuFixed = fixVirtualControllerOutputs(local, effective, 'XBOX')
assert.equal(menus.readVirtualMenus(menuFixed).menus[0].actions[0].binding, 'X_Y')
assert.equal(menus.readVirtualMenus(menuFixed).menus[0].actions[0].label, 'Weapon')
assert.match(menuFixed, /^template.txt/m)
assert.equal(fixVirtualControllerOutputs(menuFixed, menuFixed, 'XBOX'), menuFixed)
assert.equal(fixVirtualControllerOutputs(source, source, 'NONE'), source)
console.log('PASS: output locations, safe conversion, unsupported outputs, inherited overrides and menu actions')
