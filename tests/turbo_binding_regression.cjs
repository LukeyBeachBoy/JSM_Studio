const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('../JSM_GUI/jsm_gui_tauri/node_modules/typescript');
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = new Module(file); cache.set(file, mod);
  mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file));
  mod.require = name => name.startsWith('.') ? load(path.resolve(path.dirname(file), name + '.ts')) : require(name);
  mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText, file);
  return mod.exports;
}


const { getButtonBindingRows, serializeBindingExpression } = load('JSM_GUI/jsm_gui_tauri/src/utils/keymap.ts');
const { parseRowsToCommands, updateCommandExpression } = load('JSM_GUI/jsm_gui_tauri/src/utils/bindingCommands.ts');
const read = value => parseRowsToCommands(getButtonBindingRows(`N = ${value}`, 'N'), 'N');
const commands = read('SPACE+{60} J+{200} K+');
assert.deepEqual(commands.map(c => c.turboIntervalMs), [60,200,undefined]);
assert.ok(commands.every(c => c.triggerKind === 'turbo'));
const change = read(serializeBindingExpression(updateCommandExpression(commands[0], {turboIntervalMs:125})));
assert.deepEqual(change.map(c => c.turboIntervalMs), [125,200,undefined]);
assert.equal(change[0].outputValue, 'SPACE');
const reset = read(serializeBindingExpression(updateCommandExpression(change[0], {turboIntervalMs:null})));
assert.deepEqual(reset.map(c => c.turboIntervalMs), [undefined,200,undefined]);
const press = read(serializeBindingExpression(updateCommandExpression(commands[0], {triggerKind:'regular'})));
assert.equal(press[0].turboIntervalMs,undefined);
const output = read(serializeBindingExpression(updateCommandExpression(commands[1], {outputValue:'L'})));
assert.equal(output[1].turboIntervalMs,200);
const {commandTokenPreview} = load('JSM_GUI/jsm_gui_tauri/src/utils/bindingCommands.ts');
assert.equal(commandTokenPreview(commands[0]), 'SPACE+{60}');
const quoted = read('"OPEN_KEYBOARD"+{125}');
assert.equal(quoted[0].outputValue,'OPEN_KEYBOARD');
assert.equal(quoted[0].turboIntervalMs,125);
console.log('PASS: per-action turbo intervals survive independent edits, reset, output changes and quoted commands');
