const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('../JSM_GUI/jsm_gui_tauri/node_modules/typescript')
const file = path.resolve(__dirname, '../JSM_GUI/jsm_gui_tauri/src/nav/activeOverlay.ts')
const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const loaded = { exports: {} }
new Function('module', 'exports', source)(loaded, loaded.exports)
const { activeOverlay } = loaded.exports
const overlay = (name, z, parent = null, depth = 0) => ({ name, z, dataset: { overlayDepth: depth }, parentElement: parent ? { closest: () => parent } : null })
let shown = []
global.document = { querySelectorAll: () => shown }
global.getComputedStyle = element => ({ zIndex: element.z })
const sheet = overlay('sheet', '41')
const confirmation = overlay('confirmation', 'auto', sheet)
shown = [sheet, confirmation]
assert.equal(activeOverlay(), confirmation, 'an inline confirmation with auto z-index takes focus over its sheet')
const laterSheet = overlay('later sheet', '42')
shown.push(laterSheet)
assert.equal(activeOverlay(), laterSheet, 'a higher sibling portal takes focus over the nested confirmation')
const localHigh = overlay('local high', '999', sheet)
shown = [sheet, localHigh, laterSheet]
assert.equal(activeOverlay(), laterSheet, 'a local z-index cannot escape its parent stack')
const inner = overlay('inner', 'auto', laterSheet)
shown.push(inner)
assert.equal(activeOverlay(), inner, 'nested confirmations remain active inside the top portal')
const peer = overlay('peer', 'auto', laterSheet)
shown.push(peer)
assert.equal(activeOverlay(), peer, 'equal sibling stacks follow DOM order')
shown = []
assert.equal(activeOverlay(), null, 'no overlay leaves page navigation active')
console.log('PASS: inline confirmations, nested portals, parent stack boundaries, DOM ties and no-overlay navigation')
