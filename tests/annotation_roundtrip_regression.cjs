// Labels, icons and overlay placements are stored as `# @...` comment lines so
// JoyShockMapper ignores them. The serializer used to drop EVERY standalone
// comment on save, which meant naming an action and giving it an icon worked
// right up until you pressed Save, at which point both silently vanished.
//
// These are app data wearing a comment. They must survive a save.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC_ROOT = path.join(__dirname, '..', 'JSM_GUI/jsm_gui_tauri');
const cache = new Map();

function loadModule(relative) {
  const file = path.join(SRC_ROOT, relative);
  if (cache.has(file)) return cache.get(file);
  const ts = require(path.join(SRC_ROOT, 'node_modules/typescript'));
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  cache.set(file, exports);
  const localRequire = (specifier) => {
    if (!specifier.startsWith('.')) return require(specifier);
    const base = path.resolve(path.dirname(file), specifier);
    const resolved = ['.ts', '.tsx', '/index.ts', ''].map(e => base + e).find(fs.existsSync);
    if (!resolved) throw new Error(`cannot resolve ${specifier} from ${relative}`);
    return loadModule(path.relative(SRC_ROOT, resolved));
  };
  const module = { exports };
  new Function('module', 'exports', 'require', js)(module, exports, localRequire);
  cache.set(file, module.exports);
  return module.exports;
}

const { parseConfigText, serializeConfig } = loadModule('src/utils/configSerializer.ts');
const { parseBindingLabels } = loadModule('src/utils/bindingLabels.ts');
const { parseBindingIcons } = loadModule('src/utils/bindingIcons.ts');
const { parseOverlayPlacements } = loadModule('src/utils/overlayLayout.ts');

const save = (text) => serializeConfig(parseConfigText(text));

const original = [
  'RESET_MAPPINGS',
  'profiles-library/FPS Template.txt',
  'LEFT_TOUCHPAD_MODE = GRID_AND_STICK',
  'LEFT_GRID_SHAPE = RADIAL',
  'LEFT_GRID_SIZE = 8 1',
  'LT1 = 1',
  'LT2 = 2',
  '# @label LT1 = Rifle',
  '# @icon LT1 = game-icons:ak47',
  '# @label LT2 = Pistol',
  '# @overlay LEFT at 0.18 0.74 size 260 keys off font 18',
  '# A hand-written note about the layout',
].join('\n');

const saved = save(original);

// --- the actual bug ---------------------------------------------------------
assert.equal(parseBindingLabels(saved).LT1, 'Rifle', 'a label must survive Save');
assert.equal(parseBindingLabels(saved).LT2, 'Pistol', 'every label must survive Save');
assert.equal(parseBindingIcons(saved).LT1, 'game-icons:ak47', 'an icon must survive Save');
assert.deepEqual(
  parseOverlayPlacements(saved).LEFT,
  { x: 0.18, y: 0.74, size: 260, showLabels: true, showKeys: false, fontSize: 18, reveal: 'touch' },
  'an overlay placement, with its options, must survive Save'
);

// Saving twice must be stable: a round trip that keeps growing or shedding
// lines is how this kind of bug hides until a profile is well used.
const twice = save(saved);
assert.equal(twice, saved, 'saving an already-saved profile must change nothing');

// One line each, not duplicated into the annotation block AND left in place.
for (const needle of ['@label LT1', '@icon LT1', '@overlay LEFT']) {
  assert.equal(
    saved.split('\n').filter(l => l.includes(needle)).length, 1,
    `${needle} must appear exactly once after a save`
  );
}

// --- what is deliberately NOT fixed here ------------------------------------
// Free prose is still dropped; that is TODO-3 and needs anchoring to the line
// it describes. Asserted so the difference is a decision on record rather than
// something discovered later and mistaken for this bug coming back.
assert.equal(
  saved.includes('A hand-written note'), false,
  'free-form comments are still dropped (TODO-3); only @-annotations are preserved'
);

// The bindings and settings themselves are untouched.
assert.match(saved, /LEFT_GRID_SHAPE = RADIAL/, 'settings survive');
assert.match(saved, /LT1 = 1/, 'bindings survive');
assert.match(saved, /profiles-library\/FPS Template\.txt/, 'imports survive');

// An import must still sit above the settings that override it, or the
// template would win instead of being a baseline.
const lines = saved.split('\n');
assert.ok(
  lines.findIndex(l => l.includes('FPS Template')) < lines.findIndex(l => l.includes('LEFT_GRID_SHAPE')),
  'the import must stay above the overrides'
);

console.log('annotations survive Save: labels, icons and overlay placements round-trip');
