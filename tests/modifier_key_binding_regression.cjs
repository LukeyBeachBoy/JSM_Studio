// A binding that IS a modifier character is that key, not an empty modifier.
//
// JoyShockMapper's action and event modifiers are punctuation that you can also
// send as keys: `-` `+` `/` `'` `\` `_` `!` `^`. Its own pattern makes the
// modifier groups optional and backtracks, so a binding of just `-` matches the
// key group and sends the hyphen.
//
// Studio's tokenizer stripped them unconditionally, so `RSR,S = -` -- a
// scoreboard on the hyphen key -- parsed to a token with no value at all and
// the editor showed the binding as Unbound. The config was fine; the editor
// simply could not see it, which is the worst shape this bug can take: you go
// looking for a binding you know you wrote and conclude it is gone.
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
const { projectModeshift } = load(root + 'utils/modeshift.ts');

// --- a lone modifier character is a key ------------------------------------
// Every one of these is in nameToKey's own list of accepted characters.
for (const key of ['-', '+', '/', "'", '\\', '=', ';', ',', '.', '[', ']', '`']) {
  const expression = parseBindingExpression(key);
  assert.ok(expression, `${key} did not parse at all`);
  assert.equal(expression.tokens.length, 1, `${key} produced ${expression.tokens.length} tokens`);
  const [token] = expression.tokens;
  assert.equal(token.value, key, `${key} parsed to an empty or altered value (${JSON.stringify(token.value)})`);
  assert.equal(token.kind, 'input', `${key} is a key JoyShockMapper accepts, so it is an input (got ${token.kind})`);
  assert.equal(serializeBindingExpression(expression), key, `${key} did not survive a round trip`);
}

// --- with something to modify, the modifier is still a modifier -------------
const modified = {
  '-A': { action: '-', event: '', value: 'A' },
  "A'": { action: '', event: "'", value: 'A' },
  '!M\\': { action: '!', event: '\\', value: 'M' },
  '^SPACE_': { action: '^', event: '_', value: 'SPACE' },
};
for (const [raw, expected] of Object.entries(modified)) {
  const [token] = parseBindingExpression(raw).tokens;
  assert.equal(token.value, expected.value, `${raw} -> value`);
  assert.equal(token.actionModifier, expected.action, `${raw} -> action modifier`);
  assert.equal(token.eventModifier, expected.event, `${raw} -> event modifier`);
  assert.equal(serializeBindingExpression(parseBindingExpression(raw)), raw, `${raw} did not survive a round trip`);
}

// A modifier applied to a modifier-character key: `-` takes the action slot and
// the apostrophe is the key, which is how the backend's pattern resolves it.
const both = parseBindingExpression("-'").tokens[0];
assert.equal(both.actionModifier, '-');
assert.equal(both.value, "'");

// --- the case that was reported --------------------------------------------
// The scoreboard on R4+A, read through the modeshift projection the shifted
// editor uses.
const profile = [
  'RESET_MAPPINGS',
  'S = SPACE',
  '- = TAB',          // the minus BUTTON, bound to Tab -- a different thing
  'RSR,S = -',        // the S button under the R4 chord, sending the hyphen KEY
].join('\n') + '\n';

const rows = getButtonBindingRows(projectModeshift(profile, 'RSR'), 'S', {});
const commands = parseRowsToCommands(rows, 'S');
assert.equal(commands.length, 1, 'the shifted binding produced no command');
assert.equal(commands[0].outputValue, '-', 'the shifted scoreboard binding reads as Unbound');
assert.equal(commands[0].outputKind, 'keyboard');

// The minus button's own binding is untouched by any of this.
assert.equal(parseRowsToCommands(getButtonBindingRows(profile, '-', {}), '-')[0].outputValue, 'TAB');

console.log('PASS: modifier characters bound on their own read as keys, modifiers still modify, and the chorded hyphen binding is visible');
