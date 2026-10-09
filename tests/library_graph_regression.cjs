// The Library as a graph (console v2, P7), and the preset bases JSM Evolved
// ships (D24). Covers what the Library pages and the New configuration wizard
// rely on, without a browser:
//
// - a game and the base it's built on are told apart across the whole library
//   (a file without RESET_MAPPINGS is meant to be imported; so is one another
//   file imports), and an import loop is found and keeps its game a game;
// - Hold to swap links: a binding that loads another configuration, both ways;
// - Change base replaces the first import, or adds one under the header so the
//   game's own lines stay below it and win, and saving keeps it there;
// - every shipped base is importable (no RESET_MAPPINGS, AUTOCONNECT or
//   telemetry), describes itself, and the wizard picks the variant for the
//   controller in hand, never offering gyro aim to a controller without gyro.
//
// Run from the repository root: node tests/library_graph_regression.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('../JSM_GUI/jsm_gui_tauri/node_modules/typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(file, rewrite = text => text) {
  file = path.resolve(root, file);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = new Module(file); cache.set(file, mod);
  mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file));
  mod.require = name => name.startsWith('.') ? load(path.resolve(path.dirname(file), name + '.ts')) : require(name);
  mod._compile(ts.transpileModule(rewrite(fs.readFileSync(file, 'utf8')), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, file);
  return mod.exports;
}
const src = 'JSM_GUI/jsm_gui_tauri/src/utils/';
const { buildLibraryGraph, setBaseInclude, newGameText, baseFromGame, copyName, readGameMeta, setGameMeta } = load(src + 'libraryGraph.ts');
// presetBases bundles the base files through Vite's import.meta.glob; here they
// are read from disk instead, the same files the Rust service embeds.
const basesDir = path.join(root, 'JSM_GUI/jsm_gui_tauri/src-tauri/src/services/bases');
const { describeBase, presetChoices, recommendedPreset, parseBaseHeader } = load(src + 'presetBases.ts', text => text.replace(/import\.meta\.glob\([^)]*\)/, '({})'));
const { ensureHeaderLines } = load(src + 'config.ts');
const { parseConfigText, serializeConfig } = load(src + 'configSerializer.ts');
const save = text => serializeConfig(parseConfigText(ensureHeaderLines(text)));

// --- Games and bases ----------------------------------------------------------
const header = 'RESET_MAPPINGS\nAUTOCONNECT = ON\nTELEMETRY_ENABLED = ON\nTELEMETRY_PORT = 8974\n';
const shipped = fs.readdirSync(basesDir).filter(name => name.endsWith('.txt')).map(name => describeBase(name, fs.readFileSync(path.join(basesDir, name), 'utf8')));
const library = {
  Wardogs: header + 'profiles-library/FPS base.txt\nS = SPACE\nLSL = "profiles-library/Menus.txt"\n# @layer {"id":"veh","name":"Vehicles","overrides":{}}\n',
  'FPS base': 'GYRO_ON = MISC5\nW = R\n',
  Menus: header + 'S = ENTER\n',
  'Deep Rock Galactic': header + '# @game {"steamAppId":"548430","name":"Deep Rock Galactic"}\nbases/Shooter gyro aim - Steam Controller.txt\n',
  Loop: header + 'profiles-library/Loop base.txt\n',
  'Loop base': 'profiles-library/Loop.txt\nS = SPACE\n',
  Missing: header + 'profiles-library/Gone.txt\n',
};
const graph = buildLibraryGraph(library, shipped);
assert.deepEqual(graph.bases, ['FPS base', 'Loop base'], 'a file without RESET_MAPPINGS is a base');
assert.ok(graph.games.includes('Wardogs') && graph.games.includes('Loop'), 'a game in an import loop stays a game');
assert.deepEqual(graph.usedBy['FPS base'], ['Wardogs']);
assert.deepEqual(graph.builtinUsedBy['bases/Shooter gyro aim - Steam Controller.txt'], ['Deep Rock Galactic']);
assert.equal(graph.configs.Wardogs.base, 'profiles-library/FPS base.txt');
assert.equal(graph.configs.Wardogs.modes.length, 1);
assert.equal(graph.configs.Wardogs.sends, 'Keyboard & mouse');
assert.deepEqual(graph.configs['Deep Rock Galactic'].game, { steamAppId: '548430', name: 'Deep Rock Galactic' });
// Hold to swap links, both ways.
assert.deepEqual(graph.configs.Wardogs.swaps, [{ keys: 'LSL', target: 'Menus' }]);
assert.deepEqual(graph.swappedFrom.Menus, [{ by: 'Wardogs', keys: 'LSL' }]);
// Loops and missing bases.
assert.ok(graph.problems.Loop.cyclic.length > 0, 'the loop is found');
assert.deepEqual(graph.problems.Missing.missing, ['profiles-library/Gone.txt']);
assert.equal(graph.problems.Wardogs, undefined, 'a healthy game has no problem');

// --- Change base -----------------------------------------------------------
const rebased = setBaseInclude(library.Wardogs, 'bases/Shooter stick aim.txt');
assert.match(rebased, /^bases\/Shooter stick aim\.txt$/m);
assert.doesNotMatch(rebased, /FPS base/, 'the old base is replaced, not stacked');
const added = setBaseInclude(library.Menus, 'profiles-library/FPS base.txt');
const lines = added.split('\n');
assert.equal(lines.indexOf('profiles-library/FPS base.txt'), 4, 'a new base goes right under the header');
assert.ok(lines.indexOf('S = ENTER') > 4, 'the game’s own lines stay below it and win');
const saved = save(added);
assert.ok(saved.indexOf('profiles-library/FPS base.txt') < saved.indexOf('S = ENTER'), 'saving keeps the base above the game’s lines');
assert.doesNotMatch(setBaseInclude(library.Wardogs, null), /FPS base/, 'building on nothing removes the import');
assert.equal(setBaseInclude(library.Menus, null), library.Menus);

// --- New game files, base from a game, names -------------------------------
const draft = newGameText('bases/Racing and flying.txt', { steamAppId: '620', name: 'Portal 2' });
assert.match(draft, /^RESET_MAPPINGS\nAUTOCONNECT = ON\nTELEMETRY_ENABLED = ON\nTELEMETRY_PORT = 8974\n# @game .*\nbases\/Racing and flying\.txt\n$/);
assert.deepEqual(readGameMeta(draft), { steamAppId: '620', name: 'Portal 2' });
assert.equal(readGameMeta(setGameMeta(draft, null)), null);
assert.equal(save(draft).match(/bases\/Racing and flying\.txt/g).length, 1, 'the draft saves with its base once');
const made = baseFromGame(library.Wardogs);
assert.doesNotMatch(made, /RESET_MAPPINGS|AUTOCONNECT|TELEMETRY_/, 'a base made from a game can be imported');
assert.match(made, /^S = SPACE$/m);
assert.equal(copyName('Wardogs', ['Wardogs', 'wardogs copy']), 'Wardogs copy 2');

// --- Shipped bases -----------------------------------------------------------
assert.ok(shipped.length >= 8, `every shipped base is on disk: ${shipped.length}`);
for (const base of shipped) {
  const body = base.text.split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('#'))
  assert.ok(!body.some(line => /^(RESET_MAPPINGS|AUTOCONNECT|TELEMETRY_)/i.test(line.trim())), `${base.fileName} must be importable`);
  assert.ok(base.title && base.blurb && base.families.length, `${base.fileName} describes itself`);
  assert.deepEqual(parseBaseHeader(base.text).preset, base.preset);
  assert.doesNotMatch(save(base.text), /RESET_MAPPINGS/, `${base.fileName}: saving must not make it a configuration`);
}
const caps = (family, gyro, trackpads) => ({ family, gyro, trackpads, grips: family === 'steam' });
const steam = presetChoices(shipped, caps('steam', true, true));
assert.equal(recommendedPreset(steam), 'shooter-gyro', 'gyro aim is best on a Steam Controller');
assert.equal(steam.find(choice => choice.preset === 'shooter-gyro').base.fileName, 'Shooter gyro aim - Steam Controller.txt');
assert.equal(steam.find(choice => choice.preset === 'racing').base.fileName, 'Racing and flying - tilt.txt', 'a controller with gyro gets tilt steering');
const dualsense = presetChoices(shipped, caps('playstation', true, true));
assert.equal(dualsense.find(choice => choice.preset === 'shooter-gyro').base.fileName, 'Shooter gyro aim - motion controllers.txt', 'no grips: gyro on the aim trigger');
assert.equal(dualsense.find(choice => choice.preset === 'strategy').base.fileName, 'Strategy and builders.txt');
const xbox = presetChoices(shipped, caps('xbox', false, false));
assert.match(xbox.find(choice => choice.preset === 'shooter-gyro').unavailable, /gyro/, 'no gyro: the gyro shooter says why');
assert.equal(recommendedPreset(xbox), 'shooter-stick');
assert.equal(xbox.find(choice => choice.preset === 'racing').base.fileName, 'Racing and flying.txt');
assert.deepEqual(steam.map(choice => choice.preset), ['shooter-gyro', 'shooter-stick', 'third-person', 'racing', 'strategy'], 'one card per play style, in order');

console.log('PASS: the library graph tells games from bases, finds loops and Hold to swap links, changes bases safely, and the shipped bases fit every controller');
