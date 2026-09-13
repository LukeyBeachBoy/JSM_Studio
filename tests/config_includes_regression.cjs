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
const {resolveIncludes, extractIncludePaths, includeTarget, commandKey, inheritedFrom, includeDisplayName} =
  load('JSM_GUI/jsm_gui_tauri/src/utils/configIncludes.ts');
const {getKeymapValue, parseSensitivityValues} = load('JSM_GUI/jsm_gui_tauri/src/utils/keymap.ts');

// --- include detection ---
assert.equal(includeTarget('profiles-library/FPS Template.txt'), 'profiles-library/FPS Template.txt');
assert.equal(includeTarget('  profiles-library/FPS Template.txt  '), 'profiles-library/FPS Template.txt');
assert.equal(includeTarget('profiles-library/FPS Template.txt # baseline'), 'profiles-library/FPS Template.txt');
assert.equal(includeTarget('.\\profiles-library\\FPS Template.txt'), 'profiles-library/FPS Template.txt', 'windows separators normalize');
assert.equal(includeTarget('# profiles-library/FPS Template.txt'), null, 'commented include is inert');
assert.equal(includeTarget('RESET_MAPPINGS'), null, 'bare macro is not an include');
assert.equal(includeTarget('N = SPACE'), null, 'assignment is not an include');
assert.equal(includeTarget('../../secrets.txt'), null, 'parent traversal refused');
assert.equal(includeTarget(''), null);

assert.deepEqual(extractIncludePaths('RESET_MAPPINGS\na/one.txt\nN = S\na/one.txt\nb/two.txt'),
  ['a/one.txt', 'b/two.txt'], 'each include listed once, in order');

// --- command keys ---
assert.equal(commandKey('  misc2 , RIGHT_TOUCHPAD_MODE = GRID_AND_STICK '), 'MISC2,RIGHT_TOUCHPAD_MODE');
assert.equal(commandKey('N = SPACE # jump'), 'N');
assert.equal(commandKey('RESET_MAPPINGS'), 'RESET_MAPPINGS');
assert.equal(commandKey('   # just a comment'), null);

// --- flattening preserves runtime order ---
const files = {
  'profiles-library/Wardogs.txt': [
    'RESET_MAPPINGS',
    'profiles-library/FPS Template.txt',
    'E = C',
    'REAL_WORLD_CALIBRATION = 35.856',
  ].join('\n'),
  'profiles-library/FPS Template.txt': [
    'TICK_TIME = 1',
    'E = LCONTROL',
    'W = R',
    'MIN_GYRO_SENS = 3 3',
  ].join('\n'),
};
const res = resolveIncludes('profiles-library/Wardogs.txt', files);
assert.equal(res.missing.length, 0);
assert.equal(res.cyclic.length, 0);
assert.deepEqual(res.order, ['profiles-library/Wardogs.txt', 'profiles-library/FPS Template.txt']);
assert.equal(res.effectiveText,
  'RESET_MAPPINGS\nTICK_TIME = 1\nE = LCONTROL\nW = R\nMIN_GYRO_SENS = 3 3\nE = C\nREAL_WORLD_CALIBRATION = 35.856',
  'the include is spliced in at its own position, not appended');

// The whole point: settings the profile never mentions are visible, and the
// ones it does mention still win.
assert.equal(res.origins['TICK_TIME'], 'profiles-library/FPS Template.txt', 'inherited');
assert.equal(res.origins['W'], 'profiles-library/FPS Template.txt', 'inherited');
assert.equal(res.origins['E'], 'profiles-library/Wardogs.txt', 'override wins over the template');
assert.equal(res.origins['REAL_WORLD_CALIBRATION'], 'profiles-library/Wardogs.txt', 'own');

assert.equal(inheritedFrom(res, 'profiles-library/Wardogs.txt', 'TICK_TIME'), 'profiles-library/FPS Template.txt');
assert.equal(inheritedFrom(res, 'profiles-library/Wardogs.txt', 'E'), null, 'overridden reads as owned, not inherited');
assert.equal(inheritedFrom(res, 'profiles-library/Wardogs.txt', 'GYRO_SPACE'), null, 'unset reads as not inherited');
assert.equal(inheritedFrom(res, 'profiles-library/Wardogs.txt', ' tick_time '), 'profiles-library/FPS Template.txt', 'key lookup is normalized');
assert.equal(inheritedFrom(null, 'x', 'TICK_TIME'), null, 'no resolution yet is not inherited');
assert.equal(includeDisplayName('profiles-library/FPS Template.txt'), 'FPS Template');

// --- the readers must agree with the runtime on which line wins ---
assert.equal(getKeymapValue(res.effectiveText, 'E'), 'C', 'last assignment wins, not first');
assert.equal(getKeymapValue(res.effectiveText, 'W'), 'R', 'inherited value is readable');
assert.equal(getKeymapValue(res.effectiveText, 'TICK_TIME'), '1');
assert.equal(getKeymapValue('N = A\nN = B\nN = C', 'N'), 'C', 'duplicate keys in one hand-edited file too');
assert.equal(getKeymapValue('N = A', 'N'), 'A', 'single assignment unaffected');
assert.equal(getKeymapValue('N = A', 'MISSING'), undefined);
assert.equal(parseSensitivityValues(res.effectiveText).minSensX, 3, 'inherited sensitivity is visible');
assert.equal(parseSensitivityValues('MIN_GYRO_SENS = 1 1\nMIN_GYRO_SENS = 4 4').minSensX, 4, 'last wins for numbers');
assert.equal(parseSensitivityValues(res.effectiveText).realWorldCalibration, 35.856);

// --- nesting, missing files and cycles ---
const nested = resolveIncludes('a.txt', {
  'a.txt': 'a/one.txt\nA = 1',
  'a/one.txt': 'a/two.txt\nB = 2',
  'a/two.txt': 'C = 3',
});
assert.equal(nested.effectiveText, 'C = 3\nB = 2\nA = 1', 'depth-first, deepest baseline first');
assert.deepEqual(nested.order, ['a.txt', 'a/one.txt', 'a/two.txt']);
assert.equal(nested.origins['C'], 'a/two.txt');

const gap = resolveIncludes('a.txt', {'a.txt': 'gone.txt\nA = 1'});
assert.deepEqual(gap.missing, ['gone.txt'], 'a broken import is reported, not thrown');
assert.equal(gap.effectiveText, 'A = 1', 'and the rest of the profile still resolves');

const loop = resolveIncludes('a.txt', {'a.txt': 'b.txt\nA = 1', 'b.txt': 'a.txt\nB = 2'});
assert.deepEqual(loop.cyclic, ['a.txt'], 'a cycle is refused rather than recursed');
assert.equal(loop.effectiveText, 'B = 2\nA = 1');

const selfLoop = resolveIncludes('a.txt', {'a.txt': 'a.txt\nA = 1'});
assert.deepEqual(selfLoop.cyclic, ['a.txt']);
assert.equal(selfLoop.effectiveText, 'A = 1');

// A profile with no imports must behave exactly as it did before.
const plain = resolveIncludes('solo.txt', {'solo.txt': 'RESET_MAPPINGS\nN = SPACE'});
assert.equal(plain.effectiveText, 'RESET_MAPPINGS\nN = SPACE');
assert.deepEqual(plain.order, ['solo.txt']);
assert.equal(inheritedFrom(plain, 'solo.txt', 'N'), null);

// --- saving must not move an import below the overrides ---
// The serializer files every line into a canonical section. An import has no
// '=', so it used to land in "Custom", which is emitted last -- and an import
// below the overrides is applied after them, so the imported file silently
// started winning. Round-tripping a profile has to keep the import on top.
const {parseConfigText, serializeConfig} = load('JSM_GUI/jsm_gui_tauri/src/utils/configSerializer.ts');
const roundTrip = text => serializeConfig(parseConfigText(text));

const saved = roundTrip([
  'RESET_MAPPINGS',
  'TELEMETRY_ENABLED = ON',
  'profiles-library/FPS Template.txt',
  'E = C',
  'RIGHT_TOUCHPAD_SENS = 3.3',
].join('\n'));
const lineOf = (text, needle) => text.split('\n').findIndex(line => line.trim() === needle);
assert.ok(lineOf(saved, 'profiles-library/FPS Template.txt') >= 0, `the import was dropped entirely:\n${saved}`);
assert.ok(lineOf(saved, 'profiles-library/FPS Template.txt') < lineOf(saved, 'E = C'),
  `saving demoted the import below the overrides, inverting which file wins:\n${saved}`);
assert.ok(lineOf(saved, 'RESET_MAPPINGS') < lineOf(saved, 'profiles-library/FPS Template.txt'),
  'the import must still come after RESET_MAPPINGS');
assert.equal(lineOf(saved, 'profiles-library/FPS Template.txt'), lineOf(roundTrip(saved), 'profiles-library/FPS Template.txt'),
  'a second save must not move the import again');

// The resolver and the serializer must agree on what an import is, or a saved
// profile would resolve differently from the one that was typed.
const resaved = resolveIncludes('profiles-library/Wardogs.txt', {
  'profiles-library/Wardogs.txt': saved,
  'profiles-library/FPS Template.txt': 'E = LCONTROL\nRIGHT_TOUCHPAD_SENS = 1\n',
});
assert.equal(getKeymapValue(resaved.effectiveText, 'E'), 'C', 'after a save the profile must still win over its import');
assert.equal(resaved.origins['E'], 'profiles-library/Wardogs.txt');

// A profile with no import is unchanged by the new branch.
assert.ok(!roundTrip('RESET_MAPPINGS\nE = C').includes('# Imports'));

console.log('PASS: include detection, splice order, override precedence, origin tracking, last-assignment reads, nesting, missing imports, cycles and import position across a save');
