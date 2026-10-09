// Capturing on a shifted binding must not reach the unshifted one.
//
// A capture is registered against the command's id, and ids are built from the
// input's own command -- so the shifted card for `RSR,S` and the normal card
// for `S` both registered under `S-S-tap-0`. Both rows showed as capturing, and
// the captured value landed on whichever had registered last. The visible
// symptom is that the shifted output refuses to change; the invisible one is
// that the normal binding quietly changed instead.
//
// Isolated renderer check; mocks never invoke a physical controller or runtime.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

// --- the ids themselves, before any browser gets involved -------------------
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
const { getButtonBindingRows } = load(root + 'utils/keymap.ts');
const { parseRowsToCommands } = load(root + 'utils/bindingCommands.ts');
const { projectModeshift } = load(root + 'utils/modeshift.ts');

const PROFILE = 'RESET_MAPPINGS\nS = SPACE\nRSR,S = -\n';
const normalIds = parseRowsToCommands(getButtonBindingRows(PROFILE, 'S', {}), 'S').map(c => c.id);
const shiftedIds = parseRowsToCommands(getButtonBindingRows(projectModeshift(PROFILE, 'RSR'), 'S', {}), 'S').map(c => c.id);
// The ids still collide by design -- they name the same input. What must not
// collide is the key a capture is registered under, which the card namespaces
// by its DOM command. This asserts the collision is real, so the browser half
// below is testing something.
assert.ok(normalIds.some(id => shiftedIds.includes(id)), 'the ids no longer collide; this test needs rewriting');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.setDefaultTimeout(15000);
    await page.addInitScript(profile => {
      const profiles = { Desktop: profile };
      window.__lastSaved = '';
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Desktop', path: 'profiles-library/Desktop.txt', content: profiles.Desktop }),
        listLibraryProfiles: async () => Object.keys(profiles),
        loadLibraryProfile: async name => ({ name, content: profiles[name] }),
        saveLibraryProfile: async (name, content) => { window.__lastSaved = content; profiles[name] = content; return { name } },
        applyProfile: async path => ({ path, mappingEnabled: true }),
      };
      window.telemetry = { onSample: cb => {
        const emit = () => cb({ console: 'Mapper ready', activeProfile: 'profiles-library/Desktop.txt', devices: [{ handle: 1, type: 24, supportedButtons: 8589934591, status: { buttons: 0, leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 }, gyro: { x: 0, y: 0, z: 0 }, leftPad: { x: 0, y: 0, touched: false }, rightPad: { x: 0, y: 0, touched: false } } }] });
        emit(); const timer = setInterval(emit, 150); return () => clearInterval(timer);
      } };
    }, PROFILE);
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
    // The app opens on Home (console refinement 2a); these checks start in the editing shell.
    // A Steam Controller's first connection asks about its power-on sound.
    await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {});
    await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {})
    await page.locator('.profile-chip').waitFor();
    await page.getByRole('button', { name: 'Buttons', exact: true }).click();

    // A shift is a row of the input's While holding page; "Every way of
    // pressing, while held" opens its own binding sheet (console v2).
    const eff = (text, key) => {
      const lines = text.split('\n');
      const own = lines.filter(line => line.startsWith(`# @controller type-24 ${key} = `)).pop();
      const shared = lines.filter(line => line.startsWith(`${key} = `)).pop();
      const line = own ? own.slice('# @controller type-24 '.length) : shared;
      return line ? line.slice(key.length + 3).trim() : undefined;
    };
    await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 3000 }).catch(() => {});
    await page.locator('details[data-input-command="S"] > summary').first().click();
    await page.locator('details[data-input-command="S"][open] [data-fold="while-holding"]').click();
    await page.locator('[data-modeshift-row="RSR"]').click();
    await page.getByRole('button', { name: /Every way of pressing/ }).click();
    const shifted = page.locator('[data-input-command="RSR,S"]').first();
    await shifted.locator('[data-binding-sheet]').waitFor();
    const normal = page.locator('details[data-input-command="S"]').first();

    // --- the key picker on the shifted sheet ---------------------------------
    await shifted.locator('[data-when="regular"]').focus();
    await shifted.locator('[data-kind="key"]').click();
    const picker = page.getByRole('dialog', { name: /Pick a key/ });
    await picker.getByRole('button', { name: 'Common in games', exact: true }).click();
    await picker.getByRole('button', { name: /^Tab( ·|$)/ }).first().click();
    await picker.waitFor({ state: 'detached' });
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => /RSR,S = TAB/.test(window.__lastSaved || ''));
    const withTab = await page.evaluate(() => window.__lastSaved);
    assert.equal(eff(withTab, 'RSR,S'), 'TAB', `the picker did not reach the shifted binding:\n${withTab}`);
    assert.equal(eff(withTab, 'S'), 'SPACE', `the picker changed the unshifted binding:\n${withTab}`);

    // --- and Listen for a key on the shifted sheet ---------------------------
    // Also send ▸ the key picker's X adds a command to the sheet it is on: the
    // key lands on the shifted line, after what it already sends.
    await shifted.getByRole('button', { name: 'Also send' }).click();
    await picker.waitFor();
    await page.keyboard.press('x');
    await page.waitForFunction(() => document.body.dataset.bindingCapture === 'true');
    await page.keyboard.press('KeyJ');
    await page.waitForTimeout(500);

    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => /RSR,S = TAB\\ J\\/.test(window.__lastSaved || ''));
    const saved = await page.evaluate(() => window.__lastSaved);
    assert.equal(eff(saved, 'RSR,S'), 'TAB\\ J\\', `the capture did not reach the shifted binding as a second press:\n${saved}`);
    assert.equal(eff(saved, 'S'), 'SPACE', `the capture landed on the unshifted binding instead:\n${saved}`);
    assert.ok(await normal.count(), 'the unshifted row disappeared');

    assert.deepEqual(errors, []);
    console.log('PASS: capture and the keyboard picker reach the shifted binding only');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1 });
