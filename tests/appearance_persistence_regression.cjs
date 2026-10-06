const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../JSM_GUI/jsm_gui_tauri/node_modules/typescript');
const sourceRoot = path.join(__dirname, '../JSM_GUI/jsm_gui_tauri/src');

// Each session gets a fresh JS realm, like reopening the app. The mocked IPC
// retains only native settings; the Rust test covers the actual file round-trip.
let native = {};
function session(initial = {}, blocked = false) {
  const local = new Map(Object.entries(initial));
  const listeners = {};
  const icons = [];
  const calls = [];
  const document = { documentElement: { dataset: {} } };
  const modules = {};
  const window = {
    __TAURI_INTERNALS__: {},
    addEventListener: (name, handler) => (listeners[name] ??= []).push(handler),
    matchMedia: () => ({ matches: true, addEventListener() {} }),
  };
  function load(name) {
    if (modules[name]) return modules[name];
    const exports = {};
    const code = ts.transpileModule(fs.readFileSync(path.join(sourceRoot, `${name}.ts`), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    vm.runInNewContext(code, {
      exports, window, document, console,
      localStorage: {
        getItem(key) { if (blocked) throw Error('Storage unavailable'); return local.get(key) ?? null; },
        setItem(key, value) { if (blocked) throw Error('Storage unavailable'); local.set(key, value); },
      },
      require(id) {
        if (id === 'react') return {};
        if (id.endsWith('appearanceStorage')) return load('appearanceStorage');
        if (id.endsWith('brandIcons')) return { syncBrandIcons: value => icons.push(value) };
        if (id.endsWith('brand/brand')) return { DEFAULT_ACCENT: 'cyan', isAccent: value => ['cyan','teal','amber','violet'].includes(value) };
        if (id === '@tauri-apps/api/core') return { invoke: async (command, args) => {
          calls.push(command);
          if (command === 'load_appearance_preferences') {
            native = { ...args.legacy, ...native };
            return { ...native };
          }
          await new Promise(resolve => setTimeout(resolve, args.value === 'amber' ? 15 : 0));
          native[args.key] = args.value;
        } };
        throw Error(`Unexpected import ${id}`);
      },
    });
    return modules[name] = exports;
  }
  return { load, document, icons, calls, listeners };
}

(async () => {
  const first = session({ 'jsm-theme': 'light', 'jsm-accent': 'teal' });
  await first.load('appearanceStorage').restoreAppearance();
  assert.equal(native['jsm-accent'], 'teal', 'existing choice migrates');
  await Promise.all([
    first.load('appearanceStorage').persistAppearance('jsm-accent', 'amber'),
    first.load('appearanceStorage').persistAppearance('jsm-accent', 'violet'),
    first.load('appearanceStorage').persistAppearance('jsm-theme', 'system'),
  ]);
  assert.equal(native['jsm-accent'], 'violet', 'rapid picks retain their order');

  for (const [cache, blocked] of [[{}, false], [{ 'jsm-accent': 'cyan', 'jsm-theme': 'dark' }, false], [{}, true]]) {
    const reopened = session(cache, blocked);
    await reopened.load('appearanceStorage').restoreAppearance();
    reopened.load('hooks/useTheme').initTheme();
    reopened.load('hooks/useAccent').initAccent({ syncIcons: true });
    assert.equal(reopened.document.documentElement.dataset.theme, 'light', 'system resolves at launch');
    assert.equal(reopened.document.documentElement.dataset.accent, 'violet', 'native choice survives missing/stale/blocked storage');
    assert.deepEqual(reopened.icons, ['violet'], 'first icon uses restored choice');
    assert.equal(reopened.load('appearanceStorage').readAppearance('jsm-theme'), 'system');
    assert.deepEqual(reopened.calls, ['load_appearance_preferences'], 'startup does not write defaults');
  }
  console.log('Appearance persistence regression passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
