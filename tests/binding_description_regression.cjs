// Bindings were shown in the UI exactly as JoyShockMapper spells them, so a
// row for the Alt-Tab switcher read `LALT\ !TAB\`. The symbols are real syntax
// -- an action modifier before the key and an event modifier after it -- but
// nothing translated them, and describeOutputValue only ever renamed a single
// key token. Anything with a modifier, or with more than one key in it, fell
// straight through to the raw text.
//
// These assert the translation against the REAL en.ts strings, so a reworded
// translation is checked here rather than silently drifting from the tests.
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

const { describeBinding, explainBinding } = loadModule('src/utils/bindingDescription.ts');
const { en } = loadModule('src/i18n/resources/en.ts');
const { zhCN } = loadModule('src/i18n/resources/zh-CN.ts');

/** i18next's resolution and {{...}} interpolation, enough for these strings. */
const translator = (resources) => (key, params) => {
  const value = key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), resources);
  assert.equal(typeof value, 'string', `missing translation for ${key}`);
  return value.replace(/\{\{(\w+)\}\}/g, (_, name) => String(params?.[name] ?? ''));
};

const t = translator(en);

const checks = [];
const check = (name, fn) => checks.push([name, fn]);

check('the reported Alt-Tab binding reads as words, not syntax', () => {
  // The exact value from the screenshot. `LALT\` is held from the moment the
  // button goes down; `!TAB\` is tapped at the same moment.
  const readable = describeBinding('LALT\\ !TAB\\', t);
  assert.equal(readable, 'Hold Left Alt + Tap Tab');
  assert.ok(!/[\\!^]/.test(readable), `syntax leaked into the label: ${readable}`);
});

check('every action modifier is named', () => {
  assert.equal(describeBinding('^RMOUSE\\', t), 'Toggle Right Mouse');
  assert.equal(describeBinding('!C\\', t), 'Tap C');
  assert.equal(describeBinding('-C\\', t), 'Release C');
  // No action modifier plus start-press is the "held while you hold it" case.
  assert.equal(describeBinding('SPACE\\', t), 'Hold Space');
});

check('every event modifier is named', () => {
  assert.equal(describeBinding('!C/', t), 'Tap C on release');
  assert.equal(describeBinding("!C'", t), 'Tap C on tap');
  assert.equal(describeBinding('C_', t), 'C on hold');
  assert.equal(describeBinding('SPACE+', t), 'Space, rapid-fire');
});

check('the examples from the JoyShockMapper docs all read as English', () => {
  // Every one of these is lifted from the binding-syntax section of the
  // bundled JSM docs, which is where the syntax in real configs comes from.
  for (const binding of ['^RMOUSE\\ RMOUSE_', '!C\\ !C/', '!1\\ 1', 'R E\\', 'SPACE+', '!1\\ LMOUSE+ !Q/']) {
    const readable = describeBinding(binding, t);
    assert.ok(readable.length > 0, `${binding} produced nothing`);
    // " + " joins the terms, so it is removed before looking for leftover
    // syntax -- otherwise the separator itself trips the check.
    const withoutSeparator = readable.split(' + ').join(' ');
    assert.ok(
      !/[\\^!+_/']/.test(withoutSeparator),
      `${binding} still shows syntax: ${readable}`
    );
  }
});

check('a plain key is left alone rather than dressed up', () => {
  // No modifiers at all: there is nothing to explain, and "Hold W" would be
  // asserting a behaviour the binding did not ask for.
  assert.equal(describeBinding('W', t), 'W');
  assert.equal(describeBinding('LMOUSE', t), 'Left Mouse');
});

check('key aliases still apply inside a modified binding', () => {
  // The whole point of keyNames.ts: `-` is Hyphen, not a modifier.
  assert.equal(describeBinding('!-\\', t), 'Tap Hyphen');
  assert.equal(describeBinding('!SCREENSHOT\\', t), 'Tap Print Screen');
  assert.equal(describeBinding('!N7\\', t), 'Tap Numpad 7');
});

check('gyro actions are named, not left as tokens', () => {
  assert.equal(describeBinding('GYRO_OFF\\', t), 'Hold Gyro off');
  assert.equal(describeBinding('!CALIBRATE\\', t), 'Tap Recalibrate gyro');
});

check('a configuration path is named, spaces and all', () => {
  // The one output whose value contains spaces. Tokenizing on whitespace used
  // to split "Wardogs Menu.txt" in two and rejoin the halves with the " + "
  // that separates real terms, giving "profiles-library/Wardogs + Menu.txt".
  assert.equal(describeBinding('"profiles-library/Wardogs Menu.txt"', t), 'Load Wardogs Menu');
  assert.equal(describeBinding('profiles-library/Wardogs Menu.txt', t), 'Load Wardogs Menu');
  // A name that really does contain a plus must not read as a turbo binding.
  assert.equal(describeBinding('"profiles-library/Wardogs + Menu.txt"', t), 'Load Wardogs + Menu');
  assert.ok(explainBinding('"profiles-library/Wardogs Menu.txt"', t).startsWith('Load Wardogs Menu\n'));
});

check('an unknown token is shown rather than swallowed', () => {
  // A binding this does not model must still be readable: losing it entirely
  // would be worse than showing it raw.
  assert.equal(describeBinding('SOME_FUTURE_THING', t), 'SOME_FUTURE_THING');
  assert.equal(describeBinding('', t), '');
  assert.equal(describeBinding('   ', t), '');
});

check('the long form spells it out and keeps the raw syntax', () => {
  const explained = explainBinding('LALT\\ !TAB\\', t);
  const lines = explained.split('\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[0], 'Presses Left Alt as soon as the button goes down, holding it until the button is let go');
  assert.equal(lines[1], 'Taps Tab as soon as the button goes down, holding it until the button is let go');
  // The raw form has to survive somewhere: it is what the docs use and what
  // the raw editor takes.
  assert.equal(lines[2], 'Config syntax: LALT\\ !TAB\\');
});

check('the Chinese locale carries every string the translator asks for', () => {
  // A missing key would throw inside the translator, so this passing means
  // zh-CN has the whole bindingText tree, not just some of it.
  const zh = translator(zhCN);
  assert.equal(describeBinding('LALT\\ !TAB\\', zh), '按住 Left Alt + 轻点 Tab');
  assert.equal(describeBinding('SPACE+', zh), 'Space，连发');
  assert.ok(explainBinding('^RMOUSE\\', zh).includes('配置语法：^RMOUSE\\'));
});

let failures = 0;
for (const [name, fn] of checks) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${name}: ${error.message}`);
  }
}
process.exit(failures ? 1 : 0);
