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
const inputs = load('src/constants/nativeInputs.ts')
const menus = load('src/utils/virtualMenus.ts')
const header = fs.readFileSync(path.resolve(__dirname, '../JoyShockMapper/JoyShockMapper/include/JoyShockMapper.h'), 'utf8')
const enumText = header.match(/enum class ButtonID\s*\{([\s\S]*?)\};/)[1].replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '')
const names = [...enumText.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*(?:=|,|$)/gm)].map(match => match[1])
assert.deepEqual(inputs.NATIVE_INPUTS, names.filter(name => !['INVALID', 'SIZE'].includes(name)), 'a new native input requires registry review')
assert.deepEqual(inputs.RELEASE_CONDITION_INPUTS, names.slice(2, names.indexOf('SIZE')))
for (const name of [...inputs.NATIVE_INPUTS, '+', '-']) assert.ok(inputs.isNativeInput(name), name)
for (const name of [...inputs.RELEASE_CONDITION_INPUTS, '+', '-']) assert.ok(inputs.isNativeInput('!' + name), name)
for (const name of ['SIZE', 'INVALID', 'FUTURE_INPUT', '!!L', '!NONE', '!LT1', '!RM25', 'T26', 'LEFT_STICK']) assert.equal(inputs.isNativeInput(name), false, name)

const wheel = { ...menus.createVirtualMenu('released'), extra: {} }
wheel.attachments = [{ source: 'RIGHT', activation: 'HOLD', input: '!MISC5', selection: 'ACTIVATION_RELEASE', confirm: 'NONE', cancel: 'R' }]
const source = '# Preserve exact future input data\r\nUNKNOWN_INPUT_FUTURE = untouched\r\n'
const saved = menus.writeVirtualMenus(source, [wheel])
assert.deepEqual(menus.readVirtualMenus(saved), { menus: [wheel], problem: null })
assert.ok(saved.startsWith(source))
for (const field of ['input', 'confirm', 'cancel']) {
  const invalid = structuredClone(wheel)
  invalid.attachments[0][field] = 'FUTURE_INPUT'
  assert.ok(menus.virtualMenuProblem([invalid]))
  assert.equal(menus.writeVirtualMenus(saved, [invalid]), saved, 'invalid edits do not rewrite a saved catalog')
}
const badCatalog = Buffer.from('DEFINE future RADIAL 8 8 .2\nSOURCE future RIGHT HOLD FUTURE_INPUT CLICK NONE NONE').toString('hex')
assert.ok(menus.readVirtualMenus(`VIRTUAL_MENUS = HEX:${badCatalog}\n`).problem, 'unknown future inputs disable graphical rewriting')
console.log('PASS: actual ButtonID enum drift, released-condition bounds, named-menu validation, save/reload and unknown-input preservation')
