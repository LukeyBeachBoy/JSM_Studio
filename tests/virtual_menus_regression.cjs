// The real menu/config/layer modules; no native controller or installed profile.
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
const menus = load('src/utils/virtualMenus.ts')
const emptyCatalog = menus.writeVirtualMenus('L = SPACE\n', [])
assert.deepEqual(menus.readVirtualMenus(emptyCatalog), { menus: [], problem: null }, 'deleting the final menu remains editable')
assert.deepEqual(menus.readVirtualMenus(serializeEmpty(emptyCatalog)), { menus: [], problem: null })
function serializeEmpty(text) {
  const { parseConfigText, serializeConfig } = load('src/utils/configSerializer.ts')
  return serializeConfig(parseConfigText(text))
}
const commandMenu = menus.createVirtualMenu('commands')
const cursorMenu = menus.createVirtualMenu('cursor')
cursorMenu.extra = {}
cursorMenu.attachments = [{ source: 'RSTICK', activation: 'HOLD', input: 'L', selection: 'ACTIVATION_RELEASE', confirm: 'NONE', cancel: 'NONE', navigation: 'JOYSTICK_CURSOR' }]
assert.deepEqual(menus.readVirtualMenus(menus.writeVirtualMenus('', [cursorMenu])).menus, [cursorMenu])
assert.equal(menus.virtualMenuProblem([cursorMenu]), null)
assert.ok(menus.virtualMenuProblem([{ ...cursorMenu, type: 'HOTBAR' }]))
assert.ok(menus.virtualMenuProblem([{ ...cursorMenu, attachments: [{ ...cursorMenu.attachments[0], source: 'RIGHT' }] }]))
assert.ok(menus.virtualMenuProblem([{ ...cursorMenu, attachments: [{ ...cursorMenu.attachments[0], navigation: 'FUTURE_NAV' }] }]))
commandMenu.extra = {}
commandMenu.attachments = [{ source: 'RIGHT', activation: 'COMMAND', input: 'NONE', selection: 'ACTIVATION_RELEASE', confirm: 'NONE', cancel: 'NONE' }]
assert.deepEqual(menus.readVirtualMenus(menus.writeVirtualMenus('', [commandMenu])).menus, [commandMenu])
assert.equal(menus.virtualMenuProblem([commandMenu, { ...commandMenu, id: 'second' }]), null, 'two command menus may share a navigation source')
const { commandForValue, commandTokenPreview } = load('src/utils/bindingCommands.ts')
for (const verb of ['OPEN', 'CLOSE', 'TOGGLE', 'HOLD']) {
  const binding = `"MENU_${verb} commands"\\`
  const command = commandForValue('L', binding)
  assert.equal(command.outputKind, 'command')
  assert.equal(command.outputValue, `MENU_${verb} commands`)
  assert.equal(commandTokenPreview(command), `"MENU_${verb} commands"`)
}
const { parseConfigText, serializeConfig } = load('src/utils/configSerializer.ts')
const { readLayers, writeLayers, projectLayer, foldLayer } = load('src/utils/layers.ts')
const { namedMenuOverlay } = load('src/utils/namedMenuOverlay.ts')
const { getKeymapValue } = load('src/utils/keymap.ts')
const { analyzeVirtualControllerConfig, migrateVirtualBindings } = load('src/utils/virtualController.ts')
const attachment = source => ({ source, activation: 'HOLD', input: 'L', selection: 'ACTIVATION_RELEASE', confirm: 'NONE', cancel: 'MISC6' })
let wheel = menus.createVirtualMenu('weapons', 'Armes # été 🎯')
wheel.attachments = [attachment('RIGHT'), attachment('LEFT')]
wheel.centerAction = { binding: 'X_B', label: 'Holster #', icon: 'target', futureCenter: true }
wheel.extra = { futureAppearance: { glow: .5 } }
wheel.actions[0] = { binding: 'LALT\\ !TAB\\', label: 'Équipement # 1', icon: 'target', futureAction: { color: 'gold' } }
wheel.actions[1].binding = '"CYCLE 1 | X_A | 3"'
wheel.actions[2].binding = '"ECHO # quoted text"'
const source = '# Preserve note\r\nRESET_MAPPINGS\r\nVIRTUAL_CONTROLLER = XBOX\r\nLEFT_TOUCHPAD_MODE = MOUSE\r\nRIGHT_TOUCHPAD_MODE = GRID_AND_STICK\r\nRIGHT_GRID_SIZE = 4 2\r\nUNKNOWN_MENU_FUTURE = "keep # exact" # note\r\nW = ^1_ -2/\r\n'
let text = menus.writeVirtualMenus(source, [wheel])
assert.match(text, /VIRTUAL_MENUS = HEX:[a-f0-9]+/)
assert.ok(text.includes(source.trimEnd()), 'unrelated profile lines survive exactly')
assert.deepEqual(menus.readVirtualMenus(text), { menus: [wheel], problem: null })
assert.equal(analyzeVirtualControllerConfig(text.replace('VIRTUAL_CONTROLLER = XBOX', 'VIRTUAL_CONTROLLER = NONE')).warnings[0].kind, 'modeRequired')
const migrated = menus.readVirtualMenus(migrateVirtualBindings(text, 'DS4')).menus[0]
assert.equal(migrated.centerAction.binding, 'PS_CIRCLE')
assert.equal(migrated.centerAction.futureCenter, true)
assert.equal(migrated.actions[1].binding, '"CYCLE 1 | PS_CROSS | 3"')
assert.equal(migrated.actions[2].binding, '"ECHO # quoted text"')
const saved = serializeConfig(parseConfigText(text))
assert.deepEqual(menus.readVirtualMenus(saved), { menus: [wheel], problem: null })
assert.equal(serializeConfig(parseConfigText(saved)), saved)
assert.match(saved, /UNKNOWN_MENU_FUTURE = "keep # exact" # note/)
wheel = menus.readVirtualMenus(saved).menus[0]
wheel.name = 'Updated wheel'
text = menus.writeVirtualMenus(saved, [wheel])
assert.deepEqual(menus.readVirtualMenus(text).menus[0].actions[0].futureAction, { color: 'gold' })
assert.deepEqual(menus.readVirtualMenus(text).menus[0].extra, { futureAppearance: { glow: .5 } })
assert.equal(menus.readVirtualMenus(text).menus[0].actions[2].binding, '"ECHO # quoted text"')
assert.equal(getKeymapValue(text, 'LEFT_TOUCHPAD_MODE'), 'MOUSE')
assert.equal(getKeymapValue(text, 'RIGHT_TOUCHPAD_MODE'), 'GRID_AND_STICK')
const overlay = namedMenuOverlay(wheel)
assert.equal(overlay.regions.length, 8)
assert.equal(overlay.centerRegion.command, 'weapons:8')
assert.equal(overlay.centerRegion.binding, 'X_B')
assert.equal(overlay.regions[0].command, 'weapons:0')
const bar = { ...wheel, id: 'bar', type: 'HOTBAR', attachments: [attachment('DPAD')] }
assert.equal(namedMenuOverlay(bar).displayAspect, 5)
assert.equal(namedMenuOverlay(bar).centerRegion, undefined, 'non-radial layouts preserve a latent centre without displaying it')
assert.equal(menus.virtualMenuProblem([bar]), null)
const faceBar = { ...bar, attachments: [attachment('ABXY')] }
assert.equal(menus.virtualMenuProblem([faceBar]), null)
assert.equal(menus.readVirtualMenus(menus.writeVirtualMenus('', [faceBar])).menus[0].attachments[0].source, 'ABXY')
assert.ok(menus.virtualMenuProblem([{ ...faceBar, type: 'RADIAL' }]), 'a layout change must preserve incompatible attachments rather than silently remove them')
assert.ok(menus.virtualMenuProblem([{ ...faceBar, attachments: [{ ...attachment('ABXY'), selection: 'TOUCH_RELEASE' }] }]))
assert.ok(menus.virtualMenuProblem([wheel, { ...wheel, id: 'copy' }]), 'duplicate source/activation pairs rejected')
assert.ok(menus.virtualMenuProblem([{ ...wheel, attachments: [{ ...attachment('RIGHT'), activation: 'ALWAYS' }] }]))
assert.ok(menus.virtualMenuProblem([{ ...wheel, actions: [] }]))
assert.ok(menus.virtualMenuProblem([{ ...wheel, deadzone: NaN }]))
assert.equal(menus.writeVirtualMenus(text, [{ ...wheel, deadzone: 1 }]), text)
const invalid = text.replace(/HEX:[a-f0-9]+/, 'HEX:ff')
assert.ok(menus.readVirtualMenus(invalid).problem)
assert.equal(serializeConfig(parseConfigText(invalid)).includes('VIRTUAL_MENUS = HEX:ff'), true)
const centerOnly = { ...menus.createVirtualMenu('centre'), centerAction: { binding: 'X_A', label: '', icon: '' } }
centerOnly.actions.forEach(action => { action.binding = 'NONE' })
assert.equal(analyzeVirtualControllerConfig(menus.writeVirtualMenus('', [centerOnly])).warnings[0].kind, 'modeRequired')
const forged = 'VIRTUAL_MENUS = HEX:' + Buffer.from('DEFINE centre RADIAL 2 2 .2\nACTION centre 0 1\nPRESENTATION centre ' + JSON.stringify({ name: 'Centre', actions: [], centerAction: { binding: '2', label: 'keep', icon: '', future: true } })).toString('hex') + '\n'
assert.equal(menus.readVirtualMenus(forged).menus[0].centerAction.binding, '1', 'presentation cannot replace the native centre action')
const future = 'VIRTUAL_MENUS = HEX:' + Buffer.from('FUTURE unsupported').toString('hex') + '\n'
assert.ok(menus.readVirtualMenus(future).problem, 'unknown native statements remain preserved and block editing')
const individual = 'VIRTUAL_MENU old TOUCH 2 2 .1\nVIRTUAL_MENU_ACTION old 1 !SPACE\\\nVIRTUAL_MENU_SOURCE old LEFT HOLD MISC5 TOUCH_RELEASE NONE NONE\n'
assert.equal(menus.readVirtualMenus(individual).menus[0].actions[0].binding, '!SPACE\\')
const converted = menus.writeVirtualMenus(individual + source, menus.readVirtualMenus(individual).menus)
assert.doesNotMatch(converted, /^VIRTUAL_MENU /m)
assert.equal(menus.readVirtualMenus(converted).menus[0].attachments[0].input, 'MISC5')
const layered = writeLayers(text, [{ id: 'inventory', name: 'Inventory', overrides: {} }])
const projected = projectLayer(layered, 'inventory')
const edited = menus.writeVirtualMenus(projected, [bar])
const folded = foldLayer(layered, 'inventory', edited, projected)
assert.equal(menus.readVirtualMenus(projectLayer(folded, '')).menus[0].id, 'weapons')
assert.equal(menus.readVirtualMenus(projectLayer(folded, 'inventory')).menus[0].id, 'bar')
assert.ok(readLayers(folded)[0].overrides.VIRTUAL_MENUS.startsWith('HEX:'))
console.log('PASS: named menu Unicode/quoted bindings, future display fields, native catalog/config round-trip, independent pads, invalid/future preservation, hotbar and layer isolation')

// A remembered hotbar item or a latched pad highlight is not navigation.
const { namedMenuVisible } = load('src/utils/namedMenuOverlay.ts')
for (const reveal of ['touch', 'navigate', 'ring', 'never']) {
  for (const open of [false, true]) for (const navigating of [false, true]) for (const selected of [-1, 0, 8]) {
    assert.equal(namedMenuVisible(reveal, { open, navigating, selected }), open && reveal !== 'never' && (reveal === 'touch' || navigating && (reveal === 'navigate' || selected >= 0)))
  }
  const testMenu = { ...commandMenu, placement: { ...commandMenu.placement, reveal } }
  assert.equal(menus.readVirtualMenus(menus.writeVirtualMenus('', [testMenu])).menus[0].placement.reveal, reveal)
}
assert.equal(namedMenuVisible('ring', { open: true, selected: 0 }), false, 'older telemetry cannot establish navigation')
assert.equal(namedMenuVisible('navigate', { open: true, selected: 0 }), false)
console.log('PASS: independent overlay visibility and four visibility modes round-trip')
