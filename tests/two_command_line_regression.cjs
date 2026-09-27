// Two commands on one line (binding card review follow-up, 2026-09-27).
//
// JoyShockMapper reads a lone key as a press, and two bare keys as a tap and
// a hold. So adding a second Press to an input wrote `SPACE J`, which means
// tap Space / hold J -- not what the picker's "Press" promised. And editing
// either row of a tap-and-hold pair from the card wrote that row's token as
// the whole line, dropping the other one.
//
// Now: a token added to a base line carries its modifier (`SPACE\ J\`), the
// tokens already there keep what they meant, removing a token keeps the
// rest's meaning, and the tap row of a bare pair reads as Tap, not Press.
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

const keymap = loadModule('src/utils/keymap.ts');
const commands = loadModule('src/utils/bindingCommands.ts');
const { appendBaseLineTokens, explicitBindingTokens, impliedBindingTokens, replaceBaseLineToken, createBindingExpression, parseBindingExpression, serializeBindingExpression, removeBindingExpressionToken, getButtonBindingRows } = keymap;
const { parseRowsToCommands, bindingCommandToToken } = commands;

const BS = String.fromCharCode(92);
const tokens = (text) => parseBindingExpression(text).tokens;
const write = (list) => serializeBindingExpression(createBindingExpression(list));
const press = (value) => bindingCommandToToken({ triggerKind: 'regular', outputKind: 'keyboard', outputValue: value, outputBehavior: 'normal' });
const readBack = (line) => parseRowsToCommands(getButtonBindingRows(`RESET_MAPPINGS\nS = ${line}\n`, 'S', {}), 'S').map(c => `${c.triggerKind}:${c.outputValue}`);

const checks = [];
const check = (name, fn) => checks.push([name, fn]);

check('a Press added beside a Press writes both as presses', () => {
  const line = write(appendBaseLineTokens(tokens('SPACE'), [press('J')]));
  assert.equal(line, `SPACE${BS} J${BS}`);
  assert.deepEqual(readBack(line), ['regular:SPACE', 'regular:J'], 'and reads back as two presses');
});
check('a Press added beside a tap-and-hold pair leaves the pair alone', () => {
  const line = write(appendBaseLineTokens(tokens('R E'), [press('K')]));
  assert.deepEqual(readBack(line), ['tap:R', 'hold:E', 'regular:K'], line);
});
check('a Hold added beside a Press keeps its own modifier', () => {
  const hold = bindingCommandToToken({ triggerKind: 'hold', outputKind: 'keyboard', outputValue: 'J', outputBehavior: 'normal' });
  const line = write(appendBaseLineTokens(tokens('SPACE'), [hold]));
  assert.deepEqual(readBack(line), ['regular:SPACE', 'hold:J'], line);
});
check('the first command on an empty line stays a bare press', () => {
  assert.equal(write(appendBaseLineTokens([], [press('SPACE')])), 'SPACE');
});
check('the ambiguous hyphen still cannot take a modifier that would eat it', () => {
  const line = write(appendBaseLineTokens(tokens('-'), [press('J')]));
  assert.deepEqual(readBack(line).map(c => c.split(':')[1]), ['-', 'J'], `the hyphen was lost: ${line}`);
  assert.ok(!/-'/.test(line), line);
});
check('explicit modifiers say what position implied', () => {
  assert.deepEqual(explicitBindingTokens(tokens('R E')).map(t => t.eventModifier), ["'", '_']);
  assert.deepEqual(explicitBindingTokens(tokens('R')).map(t => t.eventModifier), [BS]);
  assert.deepEqual(explicitBindingTokens(tokens(`R' E${BS}`)).map(t => t.eventModifier), ["'", BS], 'a modifier already there is kept');
});
check('a bare pair still writes byte-for-byte when nothing is added', () => {
  assert.equal(write(tokens('R E')), 'R E');
  assert.equal(write(impliedBindingTokens(explicitBindingTokens(tokens('R E')))), 'R E', 'implied modifiers are dropped again');
  assert.equal(write(impliedBindingTokens(tokens(`SPACE' ENTER_`))), 'SPACE ENTER', 'explicit tap-and-hold is the same line');
});
check('removing a press from three presses leaves two presses, not tap and hold', () => {
  const line = serializeBindingExpression(removeBindingExpressionToken(parseBindingExpression(`A${BS} B${BS} C${BS}`), 2));
  assert.deepEqual(readBack(line), ['regular:A', 'regular:B'], line);
  const bare = serializeBindingExpression(removeBindingExpressionToken(parseBindingExpression('A B C'), 2));
  assert.deepEqual(readBack(bare), ['regular:A', 'regular:B'], `a bare trio is three presses; two of them must stay presses: ${bare}`);
});
check('removing the hold from a tap-and-hold pair leaves a tap', () => {
  const line = serializeBindingExpression(removeBindingExpressionToken(parseBindingExpression('R E'), 1));
  assert.deepEqual(readBack(line), ['tap:R'], line);
});

// The reader: the tap row of a bare pair is a tap.
check('a bare pair reads as tap then hold in the card', () => {
  assert.deepEqual(readBack('R E'), ['tap:R', 'hold:E']);
  assert.deepEqual(readBack('R'), ['regular:R']);
});

// The card's write for a row of a pair: the whole line, this token replaced.
// Mirrors ButtonBindingsCard.updateCommand's pair branch.
const pairWrite = (line, slot, next) => {
  const rows = getButtonBindingRows(`RESET_MAPPINGS\nS = ${line}\n`, 'S', {});
  const pairRow = rows.find(row => row.slot === 'tap' && row.writeMode === 'slot' && row.expression?.tokens.length === 2);
  assert.ok(pairRow, `${line} is not read as a pair`);
  return write(replaceBaseLineToken(pairRow.expression.tokens, slot === 'tap' ? 0 : 1, bindingCommandToToken(next)));
};
check('changing the tap output of a pair keeps the hold', () => {
  const line = pairWrite('SPACE J', 'tap', { triggerKind: 'tap', outputKind: 'keyboard', outputValue: 'TAB', outputBehavior: 'normal' });
  assert.equal(line, 'TAB J');
  assert.deepEqual(readBack(line), ['tap:TAB', 'hold:J']);
});
check('changing the hold output of a pair keeps the tap', () => {
  const line = pairWrite('SPACE J', 'hold', { triggerKind: 'hold', outputKind: 'keyboard', outputValue: 'X', outputBehavior: 'normal' });
  assert.equal(line, 'SPACE X');
  assert.deepEqual(readBack(line), ['tap:SPACE', 'hold:X']);
});
check('turning the tap of a pair into a press writes the press and keeps the hold', () => {
  const line = pairWrite('SPACE J', 'tap', { triggerKind: 'regular', outputKind: 'keyboard', outputValue: 'SPACE', outputBehavior: 'normal' });
  assert.deepEqual(readBack(line), ['regular:SPACE', 'hold:J'], line);
});
check('the hyphen tap of a pair can change its hold without losing the hyphen', () => {
  const line = pairWrite('- J', 'hold', { triggerKind: 'hold', outputKind: 'keyboard', outputValue: 'TAB', outputBehavior: 'normal' });
  assert.deepEqual(readBack(line), ['tap:-', 'hold:TAB'], line);
});

let failed = 0;
for (const [name, fn] of checks) {
  try { fn(); console.log(`ok - ${name}`); }
  catch (error) { failed++; console.log(`not ok - ${name}\n  ${String(error.message).replace(/\n/g, '\n  ')}`); }
}
if (failed) { console.error(`${failed} of ${checks.length} checks failed`); process.exit(1); }
console.log(`PASS: ${checks.length} two-command line checks`);
