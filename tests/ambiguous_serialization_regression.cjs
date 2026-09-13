// The editor must never write a binding that means something else.
//
// JoyShockMapper's modifier characters are also keys, and its action-modifier
// group is greedy, so a modifier stuck to one of them gets read as the modifier
// rather than the key. "Tap the hyphen" serialized to `-'`, which the grammar
// reads as a release-modified apostrophe. The hyphen is gone, nothing reports
// it, and the editor then shows you the apostrophe it just invented.
//
// There is no escape syntax. What there is, is position: the first of several
// tokens is a tap and the second a hold, so a modifier the grammar already
// implies does not need writing -- and not writing it removes the ambiguity.
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
const root = 'JSM_GUI/jsm_gui_tauri/src/';
const { parseBindingExpression, serializeBindingExpression, getButtonBindingRows } = load(root + 'utils/keymap.ts');
const { parseRowsToCommands } = load(root + 'utils/bindingCommands.ts');

const token = (value, eventModifier = '', kind = 'input', actionModifier = '') =>
  ({ kind, value, raw: '', actionModifier, eventModifier });

const write = tokens => serializeBindingExpression({ raw: '', tokens });

// --- the reported shape -----------------------------------------------------
// Tap sends the hyphen, hold switches configuration. Both must survive.
const scoreboard = [token('-', "'"), token('profiles-library/Wardogs Menu.txt', '_', 'console_command')];
const line = write(scoreboard);
assert.ok(!/-'/.test(line), `the hyphen was written where it will be read as a modifier: ${line}`);

const readBack = parseBindingExpression(line).tokens;
assert.equal(readBack.length, 2, `expected two commands, got: ${line}`);
assert.equal(readBack[0].value, '-', `the tap output is no longer the hyphen: ${line}`);
assert.equal(readBack[1].value, 'profiles-library/Wardogs Menu.txt', `the hold output changed: ${line}`);

// And through the reader the editor actually uses, so the triggers are right.
const commands = parseRowsToCommands(getButtonBindingRows(`S = ${line}\n`, 'S', {}), 'S');
assert.deepEqual(
  commands.map(command => [command.triggerKind, command.outputValue]),
  [['tap', '-'], ['hold', 'profiles-library/Wardogs Menu.txt']],
  `the line does not read back as tap-then-hold: ${line}`
);

// --- everything unambiguous is written exactly as before --------------------
// This guard must not churn profiles that were already fine.
const unchanged = {
  "SPACE' ENTER_": [token('SPACE', "'"), token('ENTER', '_')],
  'SPACE': [token('SPACE')],
  '-': [token('-')],
  '-_': [token('-', '_')],           // `_` is a word character, so this one is not ambiguous
  '!M\\ !M/': [token('M', '\\', 'input', '!'), token('M', '/', 'input', '!')],
  '"profiles-library/Wardogs.txt"\'': [token('profiles-library/Wardogs.txt', "'", 'console_command')],
};
for (const [expected, tokens] of Object.entries(unchanged)) {
  assert.equal(write(tokens), expected, `an unambiguous binding was rewritten`);
}

// --- a trigger that cannot be written loses the trigger, never the key ------
// A lone `-` has nowhere to carry a tap: there is no second token for position
// to work with. Dropping the modifier leaves it visibly on Press; writing it
// would silently change which key is sent.
const lonely = write([token('-', "'")]);
assert.equal(lonely, '-', `a lone hyphen tap must keep the hyphen: ${lonely}`);
assert.equal(parseBindingExpression(lonely).tokens[0].value, '-');

console.log('PASS: ambiguous forms are never written, unambiguous ones are untouched, and an unwritable trigger loses the trigger rather than the key');
