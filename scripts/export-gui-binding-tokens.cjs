// Export the actual graphical catalogs without mounting React or using hardware.
const fs = require('node:fs')
const path = require('node:path')
const gui = path.resolve(__dirname, '../JSM_GUI/jsm_gui_tauri')
const ts = require(path.join(gui, 'node_modules/typescript'))
const cache = new Map()
function load(file) {
  file = path.resolve(gui, file)
  if (cache.has(file)) return cache.get(file).exports
  const module = { exports: {} }; cache.set(file, module)
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText
  new Function('module', 'exports', 'require', code)(module, module.exports, name => {
    if (/\.css$/.test(name)) return {}
    if (!name.startsWith('.')) return require(require.resolve(name, { paths: [gui] }))
    const base = path.resolve(path.dirname(file), name)
    const target = ['', '.ts', '.tsx', '/index.ts'].map(suffix => base + suffix).find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
    if (!target) throw new Error(`Unresolved GUI import ${name} in ${file}`)
    return load(target)
  })
  return module.exports
}
const keyboard = load('src/components/keymap/KeyboardBindingModal.tsx')
const actions = load('src/components/keymap/actionCatalog.ts')
const virtual = load('src/utils/virtualController.ts')
const schema = load('src/keymap/schema.ts')
const picker = fs.readFileSync(path.join(gui, 'src/components/keymap/ActionPicker.tsx'), 'utf8')
const inlineNative = [...picker.matchAll(/token: '([A-Z_]+)', kind: 'special'/g)].map(match => match[1]).filter(value => value !== 'STICK_SHIFT')
const tokens = new Set([
  ...inlineNative,
  ...[keyboard.MAIN_ROWS, keyboard.NAV_ROWS, keyboard.NUMPAD_ROWS, keyboard.EXTENDED_FUNCTION_ROWS ?? []].flat(2).map(key => key.token).filter(token => token !== 'SPACER'),
  ...actions.systemKeyChoices.map(key => key.token), ...actions.mouseOptions, ...actions.wheelOptions,
  ...virtual.getVirtualControllerOptions('XBOX', key => key).map(option => option.token),
  ...virtual.getVirtualControllerOptions('DS4', key => key).map(option => option.token),
  ...schema.getActionSpecialOptionList(key => key).map(option => option.value).filter(value => !value.startsWith('STICK_SHIFT:') && value !== 'DEFAULT'),
])
process.stdout.write(JSON.stringify([...tokens].sort()))
