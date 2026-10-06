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
const {parseRumbleBinding,rumbleBinding,hasBindingParameters}=load('JSM_GUI/jsm_gui_tauri/src/utils/bindingParameters.ts');
assert.deepEqual(parseRumbleBinding('SMALL_RUMBLE'),{small:128,big:0});
assert.deepEqual(parseRumbleBinding('BIG_RUMBLE'),{small:0,big:255});
assert.equal(rumbleBinding({small:255,big:64}),'R40FF');
assert.equal(parseRumbleBinding('RIGHT'),null);
for(const value of ['LIGHT_BAR = xffffff','LED_BRIGHTNESS = 40','PLAY_SOUND 1','CYCLE 1 | 2','HAPTIC_BOTH_CLICK','SMALL_RUMBLE','R40FF','profiles-library/FPS.txt']) assert.ok(hasBindingParameters(value),value);
for(const value of ['SPACE','GYRO_OFF','OPEN_KEYBOARD','NOT_A_PARAMETER']) assert.ok(!hasBindingParameters(value),value);
const commands=read('SMALL_RUMBLE+{60} J+{200}');
const changed=read(serializeBindingExpression(updateCommandExpression(commands[0],{outputKind:'special',outputValue:'R40FF'})));
assert.equal(changed[0].outputValue,'R40FF');assert.equal(changed[0].turboIntervalMs,60);assert.equal(changed[1].turboIntervalMs,200);
console.log('PASS: native rumble amplitudes, parameter detection and binding sibling/activator preservation');
