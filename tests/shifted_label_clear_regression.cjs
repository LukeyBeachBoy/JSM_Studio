// Clearing a shifted binding's label must stick.
//
// A shift with no label of its own shows the unshifted input's, so a shifted
// card is never anonymous. That fallback used to be a trap: emptying the field
// deleted the shifted key's label line, the next read inherited the unshifted
// label straight back, and the field refilled itself with a name you had just
// removed. There was no way to say "this shift is deliberately unnamed".
//
// An empty label line -- `# @label L,S =` -- is that record. It parses to an
// empty string rather than nothing at all, which is what stops the fallback,
// and JoyShockMapper ignores it like every other annotation.
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
  const module = { exports: {} };
  cache.set(file, module.exports);
  const localRequire = (specifier) => {
    if (!specifier.startsWith('.')) return require(specifier);
    const base = path.resolve(path.dirname(file), specifier);
    const resolved = ['.ts', '.tsx', '/index.ts', ''].map(e => base + e).find(fs.existsSync);
    if (!resolved) throw new Error(`cannot resolve ${specifier} from ${relative}`);
    return loadModule(path.relative(SRC_ROOT, resolved));
  };
  new Function('module', 'exports', 'require', js)(module, module.exports, localRequire);
  cache.set(file, module.exports);
  return module.exports;
}

const { parseBindingLabels, getBindingLabel, setBindingLabel } = loadModule('src/utils/bindingLabels.ts');
const { parseConfigText, serializeConfig } = loadModule('src/utils/configSerializer.ts');

// The two halves of the shifted card's label field, as InputModeshifts wires
// them: read the shift's own label and fall back to the input's; write to the
// shifted key, keeping an empty line only while there is a label to suppress.
const shownLabel = (text, key, command) => getBindingLabel(text, key) ?? getBindingLabel(text, command);
const writeLabel = (text, key, command, value) =>
  setBindingLabel(text, key, value, { keepEmpty: Boolean(getBindingLabel(text, command)) });

const original = [
  'RESET_MAPPINGS',
  'S = SPACE',
  'L,S = LCONTROL',
  '# @label S = Jump',
].join('\n') + '\n';

// --- the fallback itself, which is the point of the feature -----------------
assert.equal(shownLabel(original, 'L,S', 'S'), 'Jump', 'a shift with no label of its own shows the input\'s');

// --- the actual bug ---------------------------------------------------------
const cleared = writeLabel(original, 'L,S', 'S', '');
assert.equal(shownLabel(cleared, 'L,S', 'S'), '', 'clearing a shifted label must not refill from the unshifted one');
assert.match(cleared, /^# @label L,S =\s*$/m, 'the cleared shift is recorded as an empty label line');
assert.match(cleared, /# @label S = Jump/, 'clearing the shift must leave the input\'s own label alone');
assert.match(cleared, /L,S = LCONTROL/, 'the shifted binding itself is untouched');

// A cleared shift survives Save like every other annotation, or the label
// would come back the first time the profile was written to disk.
const saved = serializeConfig(parseConfigText(cleared));
assert.equal(shownLabel(saved, 'L,S', 'S'), '', 'the cleared shift must survive a save');
assert.equal(
  saved.split('\n').filter(line => line.includes('@label L,S')).length, 1,
  'one line for the cleared shift, not one per save'
);

// --- naming it again, and the plain unshifted case --------------------------
const renamed = writeLabel(cleared, 'L,S', 'S', 'Crouch');
assert.equal(shownLabel(renamed, 'L,S', 'S'), 'Crouch', 'a cleared shift can be named again');
assert.equal(
  renamed.split('\n').filter(line => line.includes('@label L,S')).length, 1,
  'naming a cleared shift replaces its empty line rather than adding a second'
);

// With nothing to inherit there is nothing to suppress: no empty line is left
// behind, so clearing a label still tidies up after itself.
const unlabelled = writeLabel('S = SPACE\nL,S = LCONTROL\n', 'L,S', 'S', '');
assert.equal(unlabelled.includes('@label'), false, 'no empty line where there is no label to suppress');
assert.equal(shownLabel(unlabelled, 'L,S', 'S'), undefined, 'and nothing is shown');

// An ordinary input's label is still removed outright when emptied.
assert.equal(setBindingLabel(original, 'S', '').includes('@label S'), false, 'clearing an input\'s own label deletes the line');

// An empty label reads as no label everywhere else, so nothing downstream
// starts rendering a blank name where it used to fall back to something.
assert.equal(parseBindingLabels('# @label RT1 =\n').RT1, '', 'an empty label line parses as an empty string');
assert.equal(Boolean(parseBindingLabels('# @label RT1 =\n').RT1), false, 'which every consumer reads as no label');

console.log('clearing a shifted binding label sticks: no refill from the unshifted label, and it survives Save');
