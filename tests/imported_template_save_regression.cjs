// A file that exists to be imported must survive being saved.
//
// Saving ran every profile through ensureHeaderLines, which puts RESET_MAPPINGS,
// AUTOCONNECT and the telemetry lines at the top. For a shared template that is
// wrong twice over: the importing profile has already run its own
// RESET_MAPPINGS, so a second one part-way through the load wipes everything
// above the import line -- and the mapper reports the file whose RESET_MAPPINGS
// it saw last as the configuration it is running, so Studio started saying
// "Currently applied: FPS Template" instead of the profile that imports it.
//
// Isolated: the real save path, no browser and no runtime.
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
  mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, file);
  return mod.exports;
}
const { ensureHeaderLines } = load('JSM_GUI/jsm_gui_tauri/src/utils/config.ts');
const { parseConfigText, serializeConfig } = load('JSM_GUI/jsm_gui_tauri/src/utils/configSerializer.ts');

// What saving does to the text, exactly as useProfileLibrary does it.
const save = text => serializeConfig(parseConfigText(ensureHeaderLines(text)));

// --- a template, which has no RESET_MAPPINGS on purpose -------------------
const template = [
  '# FPS Template',
  '# Shared baseline. Do not load this on its own.',
  '#',
  '# Deliberately NOT set here: RESET_MAPPINGS and telemetry.',
  'TICK_TIME = 1',
  'GYRO_ON = MISC5',
  'ZL = RMOUSE',
].join('\n');

const savedTemplate = save(template);
assert.ok(!/^RESET_MAPPINGS\b/m.test(savedTemplate),
  `saving a template must not turn it into a profile:\n${savedTemplate}`);
assert.ok(!/^TELEMETRY_(ENABLED|PORT)\b/m.test(savedTemplate),
  `nor give it telemetry of its own:\n${savedTemplate}`);
assert.ok(!/^AUTOCONNECT\b/m.test(savedTemplate), 'nor autoconnect');
assert.ok(/GYRO_ON = MISC5/.test(savedTemplate), 'and it must still say what it said');

// --- a real profile still gets its header tidied --------------------------
const profile = [
  'N = F',
  'RESET_MAPPINGS',          // present, but not first
  'profiles-library/FPS Template.txt',
].join('\n');

const savedProfile = save(profile);
// The serializer titles its sections, so compare the settings, not the comments.
const lines = savedProfile.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
assert.equal(lines[0], 'RESET_MAPPINGS', `a profile keeps its header first: ${lines.slice(0, 4)}`);
assert.ok(lines.includes('TELEMETRY_ENABLED = ON'), 'and gains the telemetry Studio needs');
assert.ok(lines.includes('TELEMETRY_PORT = 8974'));
assert.ok(lines.includes('AUTOCONNECT = ON'));
assert.ok(savedProfile.includes('profiles-library/FPS Template.txt'), 'and keeps its import');

console.log('PASS: saving a template leaves it importable, and a profile still gets its required header');
