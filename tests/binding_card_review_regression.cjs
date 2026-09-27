// The binding card review (after the 0.7.88 refresh): the pure parts of the
// fixes it asked for. The hint capsule reads one hint per button in a fixed
// order (the Back-hint de-dup); hint labels translate by their declared text;
// an add is the first id that was not there before; every surface colours a
// layer through one helper that wraps after the palette; a held chord fills
// the same status slot as a held modeshift; the system keys are one list.
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

const { parseHints, onePerButton, translateHintLabel, HINT_ORDER } = loadModule('src/shell/hintLabels.ts');
const { freshId } = loadModule('src/components/keymap/laneRows.ts');
const { layerSlot, layerSlotOf, layerHue, LAYER_HUES } = loadModule('src/utils/layers.ts');
const { chordTriggerTargets, shiftTriggerTargets, heldStatus } = loadModule('src/utils/modeshift.ts');
const { systemKeyChoices, systemKeyOptions } = loadModule('src/components/keymap/actionCatalog.ts');
const { en } = loadModule('src/i18n/resources/en.ts');
const { zhCN } = loadModule('src/i18n/resources/zh-CN.ts');

/** i18next's resolution, {{...}} interpolation and defaultValue, enough for these. */
const translator = (resources) => (key, params) => {
  const value = key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), resources);
  if (typeof value !== 'string') return params && 'defaultValue' in params ? params.defaultValue : key;
  return value.replace(/\{\{(\w+)\}\}/g, (_, name) => String(params?.[name] ?? ''));
};

const checks = [];
const check = (name, fn) => checks.push([name, fn]);

// ---- The capsule: one hint per button, in one order (1h, the Back-hint fix).
check('a row that names B and a wrapper that appends B:Back draw one B', () => {
  const hints = parseHints('A:Bind;B:Back;B:Back');
  assert.deepEqual(hints, [{ button: 'A', label: 'Bind' }, { button: 'B', label: 'Back' }]);
});
check('the last declaration of a button wins', () => {
  assert.deepEqual(parseHints('B:Back;A:Open;B:Close RB').map(h => h.label), ['Open', 'Close RB']);
});
check('hints read in the fixed order whatever order they were declared in', () => {
  const hints = parseHints('B:Back;LB/RB:Category;Y:Search;X:Capture;A:Choose;MOVE:Move');
  assert.deepEqual(hints.map(h => h.button), ['MOVE', 'A', 'X', 'Y', 'B', 'LB/RB']);
  assert.deepEqual([...hints.map(h => h.button)].sort((a, b) => HINT_ORDER.indexOf(a) - HINT_ORDER.indexOf(b)), hints.map(h => h.button));
});
check('X that repeats A is dropped, X that differs stays', () => {
  assert.deepEqual(parseHints('A:Toggle;X:Toggle').map(h => h.button), ['A']);
  assert.deepEqual(parseHints('A:Open;X:Capture').map(h => h.button), ['A', 'X']);
});
check('onePerButton also de-duplicates the shell\'s own lists', () => {
  const hints = onePerButton([{ button: 'B', label: 'Back' }, { button: 'A', label: 'Select' }, { button: 'B', label: 'Home' }]);
  assert.deepEqual(hints, [{ button: 'A', label: 'Select' }, { button: 'B', label: 'Home' }]);
});
check('a malformed part is ignored rather than becoming a hint', () => {
  assert.deepEqual(parseHints('A:Open;garbage;B:Back').map(h => h.button), ['A', 'B']);
});

// ---- Hint labels in the app's language (24).
check('English shows a declared label as it is', () => {
  const t = translator(en);
  assert.equal(translateHintLabel(t, 'Change action'), 'Change action');
  assert.equal(translateHintLabel(t, 'Close RB'), 'Close RB');
  assert.equal(translateHintLabel(t, 'Press a key… Esc to cancel'), 'Press a key… Esc to cancel');
});
check('Chinese translates the common labels and the "Close <input>" pattern', () => {
  const t = translator(zhCN);
  assert.equal(translateHintLabel(t, 'Back'), zhCN.hints.Back);
  assert.notEqual(translateHintLabel(t, 'Back'), 'Back');
  assert.equal(translateHintLabel(t, 'Close RB'), zhCN.hints.closeNamed.replace('{{name}}', 'RB'));
  assert.equal(translateHintLabel(t, 'Capture a key'), zhCN.hints['Capture a key']);
  // A label nobody translated is still shown, in English.
  assert.equal(translateHintLabel(t, 'Frobnicate'), 'Frobnicate');
});
check('every capsule label the binding card declares has a Chinese entry', () => {
  const declared = ['Add command', 'Capture a key', 'Change action', 'Change activation', 'Settings', 'Details', 'Add modeshift', 'Add layer action', 'Go to Layers', 'Inspect uses', 'Remove', 'Next', 'Cancel', 'Add', 'Move', 'Choose', 'Search', 'Category', 'Use icon', 'No icon', 'Show more'];
  const missing = declared.filter(label => typeof zhCN.hints[label] !== 'string');
  assert.deepEqual(missing, [], `no Chinese for: ${missing.join(', ')}`);
});

// ---- Just added (2f, 5): the new row is the first id that was not there.
check('the fresh id is the one that was not there before', () => {
  assert.equal(freshId(new Set(['a', 'b']), ['a', 'b', 'c']), 'c');
  assert.equal(freshId(new Set(['a', 'b']), ['c', 'a', 'b']), 'c');
});
check('a write that added nothing (a replace, a failure) yields no fresh id', () => {
  assert.equal(freshId(new Set(['a', 'b']), ['b', 'a']), null);
  assert.equal(freshId(new Set(['a', 'b']), ['a']), null);
});

// ---- Layer colour (3, 4): one helper, wrapping after the palette.
check('a layer\'s slot is its place in the list, from one helper', () => {
  const layers = [{ id: 'x' }, { id: 'y' }, { id: 'z' }];
  assert.deepEqual(layers.map(layer => layerSlot(layers, layer.id)), [1, 2, 3]);
  assert.deepEqual([0, 1, 2].map(layerSlotOf), [1, 2, 3]);
  assert.equal(layerSlot(layers, 'missing'), 1, 'an unknown layer wears the first hue rather than breaking');
});
check('a fourth, fifth and sixth layer get their own hue; the seventh wraps', () => {
  assert.equal(LAYER_HUES, 6);
  assert.deepEqual([3, 4, 5, 6].map(layerSlotOf), [4, 5, 6, 1]);
  assert.equal(layerHue(4), 'var(--layer-4)');
  assert.equal(layerHue(5, '-soft'), 'var(--layer-5-soft)');
});
check('the tokens define every hue the helper can hand out, in both themes', () => {
  const tokens = fs.readFileSync(path.join(SRC_ROOT, 'src/styles/design-tokens.css'), 'utf8');
  const inks = fs.readFileSync(path.join(SRC_ROOT, 'src/styles/tokens.css'), 'utf8');
  for (let slot = 1; slot <= LAYER_HUES; slot++) {
    assert.equal((tokens.match(new RegExp(`--layer-${slot}:`, 'g')) ?? []).length, 2, `--layer-${slot} in dark and light`);
    assert.equal((tokens.match(new RegExp(`--layer-${slot}-soft:`, 'g')) ?? []).length, 2, `--layer-${slot}-soft in dark and light`);
    assert.equal((inks.match(new RegExp(`--layer-${slot}-ink:`, 'g')) ?? []).length, 2, `--layer-${slot}-ink in dark and light`);
  }
});
check('every surface that enumerates layer slots covers all of them', () => {
  const files = ['src/components/keymap/ConceptTiles.module.css', 'src/components/OverviewPage.module.css', 'src/components/ui/Menu.module.css', 'src/styles/console.css'];
  for (const file of files) {
    const css = fs.readFileSync(path.join(SRC_ROOT, file), 'utf8');
    for (let slot = 2; slot <= LAYER_HUES; slot++) assert.ok(css.includes(`--layer-${slot}-soft`), `${file} has no rule for layer ${slot}`);
  }
});

// ---- The held status slot (2, 2g): chords fill it too.
const CONFIG = ['RESET_MAPPINGS', 'L = SPACE', 'LSL,L = V', 'LSL,E = C', 'R+S = X', 'R+E = TAB', 'S = A'].join('\n');
check('a chord line names each member as a trigger for the others', () => {
  const chords = chordTriggerTargets(CONFIG);
  assert.deepEqual([...chords.get('R')].sort(), ['E', 'S']);
  assert.deepEqual([...chords.get('S')], ['R']);
  assert.equal(chords.has('L'), false, 'a modeshift line is not a chord');
  assert.equal(chords.has('LSL'), false);
});
check('a held modeshift trigger comes first, then a held chord member', () => {
  const shifts = shiftTriggerTargets(CONFIG), chords = chordTriggerTargets(CONFIG);
  assert.deepEqual(heldStatus(shifts, chords, new Set(['LSL'])), { kind: 'shift', trigger: 'LSL', count: 2 });
  assert.deepEqual(heldStatus(shifts, chords, new Set(['R'])), { kind: 'chord', trigger: 'R', count: 2 });
  assert.deepEqual(heldStatus(shifts, chords, new Set(['LSL', 'R'])), { kind: 'shift', trigger: 'LSL', count: 2 });
  // Every member of a chord is a trigger for the others: E held chords with R.
  assert.deepEqual(heldStatus(shifts, chords, new Set(['E'])), { kind: 'chord', trigger: 'E', count: 1 });
  assert.equal(heldStatus(shifts, chords, new Set(['HOME'])), null, 'HOME is in no shift and no chord');
  assert.equal(heldStatus(shifts, chords, new Set()), null);
});
check('the status texts exist for both kinds in both languages', () => {
  for (const resources of [en, zhCN]) {
    assert.equal(typeof resources.keymap.shiftHeld, 'string');
    assert.ok(resources.keymap.shiftedShort && resources.keymap.chordedShort);
    assert.ok(resources.keymap.shiftedInputs_other ?? resources.keymap.shiftedInputs);
    assert.ok(resources.keymap.chordedInputs_other ?? resources.keymap.chordedInputs);
  }
});

// ---- System keys (21): one list.
check('the system key tokens derive from the picker\'s choices, Stop included', () => {
  assert.deepEqual(systemKeyOptions, systemKeyChoices.map(choice => choice.token));
  assert.ok(systemKeyOptions.includes('STOP_TRACK'));
  // JoyShockMapper's own README lists it as a media key.
  const readme = fs.readFileSync(path.join(SRC_ROOT, 'src/assets/docs/JoyShockMapper-README.md'), 'utf8');
  assert.match(readme, /STOP_TRACK/);
});

// ---- Overview and the modeshift sheet's strings (24).
check('the Overview\'s callout texts are translated', () => {
  for (const key of ['chipChord', 'reservedByChord', 'heldGyroOn', 'holdToEnableGyro', 'inspectUses', 'showUsesOf', 'whileHeld']) {
    assert.equal(typeof en.overview[key], 'string', `en overview.${key}`);
    assert.equal(typeof zhCN.overview[key], 'string', `zh overview.${key}`);
  }
  for (const key of ['pickerGamepad', 'pickerKeyboard', 'pickerCapture', 'goToLayers', 'layerActionReplaces', 'holdGroupOther', 'iconShowMore', 'iconImportButton']) {
    assert.equal(typeof en.keymap[key], 'string', `en keymap.${key}`);
    assert.equal(typeof zhCN.keymap[key], 'string', `zh keymap.${key}`);
  }
});

let failed = 0;
for (const [name, fn] of checks) {
  try { fn(); console.log(`ok - ${name}`); }
  catch (error) { failed++; console.log(`not ok - ${name}\n  ${String(error.message).replace(/\n/g, '\n  ')}`); }
}
if (failed) { console.error(`${failed} of ${checks.length} checks failed`); process.exit(1); }
console.log(`PASS: ${checks.length} binding card review checks`);
