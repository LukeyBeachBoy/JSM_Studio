// Keys are shown by the legend on them, not by the parser's name for them.
//
// JoyShockMapper has its own vocabulary -- `SCREENSHOT` for Print Screen,
// `CONTEXT` for the Menu key, `SUBTRACT` for the numpad minus, `N7` for numpad
// 7, bare punctuation for the rest. Picking the key next to `0` on the drawn
// keyboard produced a binding that read `-`, which is not recognisable as a key
// at all: in any other position that character is a modifier.
//
// The token is still what reaches the profile. This is a display layer and a
// typing convenience, and the test cares most about the first of those: no
// configuration may change because of it.
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
const { keyDisplayName, keyTokenFromDisplay } = load(root + 'utils/keyNames.ts');
const { describeOutputValue } = load(root + 'utils/virtualController.ts');

// --- the names ------------------------------------------------------------
const NAMES = {
  '-': 'Hyphen',
  '=': 'Equals',
  '`': 'Backtick',
  '[': 'Left Bracket',
  "'": 'Apostrophe',
  SCREENSHOT: 'Print Screen',
  CONTEXT: 'Menu',
  SUBTRACT: 'Numpad Minus',
  SUBSTRACT: 'Numpad Minus',   // JoyShockMapper accepts its own misspelling
  ADD: 'Numpad Plus',
  N7: 'Numpad 7',
  N0: 'Numpad 0',
  LCONTROL: 'Left Ctrl',
  PAGEUP: 'Page Up',
  VOLUME_UP: 'Volume Up',
};
for (const [token, name] of Object.entries(NAMES)) {
  assert.equal(keyDisplayName(token), name, `${token} should read as ${name}`);
  assert.equal(describeOutputValue(token), name, `${token} should read as ${name} on a binding row too`);
}

// Keys that already say what they are must not be renamed.
for (const token of ['A', 'Z', '7', 'F1', 'F12', 'SPACE']) {
  assert.equal(keyDisplayName(token), token === 'SPACE' ? 'Space' : token, `${token} was renamed unnecessarily`);
}

// Anything this editor does not model passes through untouched, rather than
// being swallowed -- the field has always accepted tokens it does not know.
for (const token of ['F13', 'OEM_102', 'SOMETHING_NEW']) {
  assert.equal(keyDisplayName(token), token);
}

// --- typing ---------------------------------------------------------------
// The field accepts the name, the token, and anything else.
assert.equal(keyTokenFromDisplay('Print Screen'), 'SCREENSHOT');
assert.equal(keyTokenFromDisplay('print screen'), 'SCREENSHOT');
assert.equal(keyTokenFromDisplay('Hyphen'), '-');
// Other reasonable names for the same key are understood when typed.
assert.equal(keyTokenFromDisplay('Minus'), '-');
assert.equal(keyTokenFromDisplay('escape'), 'ESC');
assert.equal(keyTokenFromDisplay('Numpad 7'), 'N7');
assert.equal(keyTokenFromDisplay('SCREENSHOT'), 'SCREENSHOT', 'someone who knows the tokens must still be able to type one');
assert.equal(keyTokenFromDisplay('TAB'), 'TAB');
assert.equal(keyTokenFromDisplay('F13'), 'F13');
assert.equal(keyTokenFromDisplay('  '), '');

// --- nothing may change a configuration -----------------------------------
// Every name must lead back to a token the backend accepts, and every token
// must survive being shown and typed back.
for (const token of Object.keys(NAMES)) {
  const round = keyTokenFromDisplay(keyDisplayName(token));
  // SUBSTRACT is the one token that legitimately normalises, to the spelling
  // JoyShockMapper documents; both name the same key.
  const expected = token === 'SUBSTRACT' ? 'SUBTRACT' : token;
  assert.equal(round, expected, `${token} did not survive being shown and typed back`);
}

// A display name must never collide with a different key's token.
const names = Object.values(NAMES).map(name => name.toLowerCase());
for (const token of ['A', 'TAB', 'SPACE', 'ENTER', 'F1']) {
  assert.ok(!names.includes(token.toLowerCase()), `${token} is also a display name for something else`);
}

console.log('PASS: keys read by their legend, tokens survive display and typing, and unknown tokens pass through');
