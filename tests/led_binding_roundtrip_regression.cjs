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
const original = read('"LIGHT_BAR = x34c759"')[0];
const expression = updateCommandExpression(original, {ledBrightness:40});
const value = serializeBindingExpression(expression);
const commands = read(value);
assert.equal(commands.length,1, 'color plus brightness is one command even without another output');
assert.equal(commands[0].triggerKind,'regular', 'adding brightness never creates a tap/hold pair');
assert.equal(commands[0].ledBrightness,40);
const cleared = read(serializeBindingExpression(updateCommandExpression(commands[0], {ledBrightness:null})));
assert.equal(cleared.length,1);
assert.equal(cleared[0].triggerKind,'regular');
assert.equal(cleared[0].ledBrightness,undefined);
console.log('PASS: standalone LED brightness round-trips as one press command and clears without changing activation');
