// Modes (console v2, P6: Modes, ModeHow, ModeChanges). Isolated renderer checks:
// the mocks never reach a controller or the mapper. Proves what the old Layers
// page and Manage layers dialog did, on the new screens: create, rename, delete
// (confirmed in place, Keep it first), suppress holds, override "Use Default",
// bringing old modeshifts into a mode, plus what the redesign adds: the verb
// and buttons edited from the mode's side, reordering, the "Default: …" column,
// and Review changes reading the reorder.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
 const browser = await chromium.launch({ channel: 'msedge', headless: true });
 try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
   const profiles = { Desktop: 'RESET_MAPPINGS\nN = SPACE\nE = C\nRSR,N = J\nRSR,W = U\n# @layer {"id":"veh","name":"Vehicles","overrides":{"N":"H","LIGHT_BAR":"x34C759"}}\n# @layer {"id":"map","name":"Map","overrides":{}}\n# @layer-action LSL = hold veh\n' };
   window.__saved = '';
   window.electronAPI = {
    getActiveProfile: async () => ({ name: 'Desktop', path: 'profiles-library/Desktop.txt', content: profiles.Desktop }),
    listLibraryProfiles: async () => Object.keys(profiles),
    loadLibraryProfile: async name => ({ name, content: profiles[name] }),
    saveLibraryProfile: async (name, content) => { window.__saved = content; profiles[name] = content; return { name } },
    applyProfile: async (path) => ({ path, mappingEnabled: true }),
   };
   // No controller: edits go to the shared layout, and capture offers the list.
   window.telemetry = { onSample: cb => { const emit = () => cb({ console: 'Mapper ready', activeProfile: 'profiles-library/Desktop.txt', devices: [] }); emit(); const timer = setInterval(emit, 200); return () => clearInterval(timer) } };
  });
  await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
  await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {})
  await page.locator('.app-shell').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  const go = tab => page.evaluate(detail => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail })), tab);
  const save = async () => { await page.evaluate(() => { window.__saved = '' }); await page.keyboard.press('Control+s'); await page.waitForFunction(() => window.__saved.length > 0) ; return page.evaluate(() => window.__saved) };
  const layersOf = text => text.split(/\r?\n/).filter(line => line.startsWith('# @layer {')).map(line => JSON.parse(line.slice(9)));
  const card = name => page.locator('[data-modes-page] [data-mode-id]').filter({ hasText: name }).first();
  const typeName = async value => {
   const keyboard = page.locator('[data-text-entry] [role="dialog"]');
   await keyboard.waitFor();
   for (let i = 0; i < 24; i++) await page.keyboard.press('Backspace');
   await page.keyboard.type(value);
   await page.keyboard.press('Enter');
   await keyboard.waitFor({ state: 'detached' });
  };

  await go('layers');
  await page.locator('[data-modes-page]').waitFor();
  // The cards: Default first, then each mode with what turns it on and what it changes.
  const cards = await page.locator('[data-modes-page] [data-mode-id]').evaluateAll(els => els.map(el => el.querySelector('b')?.textContent));
  assert.deepEqual(cards.slice(0, 3), ['Default', 'Vehicles', 'Map']);
  assert.match(await card('Vehicles').innerText(), /On while held/);
  assert.match(await page.locator('[data-modes-page]').innerText(), /Only Default is on|not running/i, 'the live stack, or why there is none');
  assert.match(await page.locator('.page-header').innerText(), /The last one turned on wins/);

  // + Build: an empty mode in the next colour.
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await card('Build').waitFor();
  assert.deepEqual(layersOf(await save()).map(layer => layer.name), ['Vehicles', 'Map', 'Build']);

  // X on a card: how it turns on and off, edited from the mode's side.
  await card('Vehicles').focus();
  await page.keyboard.press('x');
  const how = page.getByRole('dialog', { name: /How it turns on and off/ });
  await how.waitFor();
  await how.getByRole('radio', { name: /Tap to toggle/ }).click();
  // Another button turns it off: picked from the list (no controller to press).
  await how.locator('[data-off-tile]').click();
  const capture = page.getByRole('dialog', { name: /Turned off by/ });
  await capture.waitFor();
  await capture.locator('[role="option"]:has(svg[data-glyph="-"])').click();
  await capture.waitFor({ state: 'detached' });
  assert.match(await how.innerText(), /turns it off/);
  await how.getByRole('switch', { name: /Pause holds/ }).click();
  // LT moves it up the order (its colour follows its place).
  await how.getByRole('radio', { name: /Tap to toggle/ }).focus();
  await page.keyboard.press('[');
  await page.waitForFunction(() => document.querySelector('[aria-label="Layers, last on top"] [data-current="true"]')?.textContent?.includes('2 · Vehicles'));
  let text = await save();
  assert.match(text, /^# @layer-action LSL = toggle veh$/m, 'Tap to toggle rewrites the action');
  assert.match(text, /^# @layer-action - = remove veh$/m, 'Another button turns it off');
  assert.equal(layersOf(text).find(layer => layer.id === 'veh').suppressHolds, true);
  assert.deepEqual(layersOf(text).map(layer => layer.name), ['Map', 'Vehicles', 'Build'], 'reordered');

  // Y: the mode's menu beside what it changes, Default's value alongside.
  await how.getByRole('radio', { name: /Holding/ }).focus();
  await page.keyboard.press('y');
  const changes = page.getByRole('dialog', { name: /What changes in this layer/ });
  await changes.waitFor();
  assert.match(await changes.innerText(), /Changed in this layer · 2/i);
  assert.match(await changes.innerText(), /Default: Space/);
  assert.match(await changes.innerText(), /Light #34c759/i);
  assert.ok(!(await changes.innerText()).includes('x34C759'), 'raw binding syntax is hidden');
  // X uses Default on a change.
  await changes.locator('[data-change-key="N"]').focus();
  await page.keyboard.press('x');
  await page.waitForFunction(() => /Changed in this layer · 1/i.test(document.body.innerText));
  // Bring in old While holding changes: RSR's two move into the mode, RSR holds it.
  const bring = changes.locator('[role="group"]').filter({ hasText: 'Bring in chords' });
  assert.match(await bring.innerText(), /· 2/);
  await bring.focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(() => /Changed in this layer · 3/i.test(document.body.innerText));
  // Rename on the on-screen keyboard; a taken name is refused.
  await changes.getByRole('button', { name: /Rename/ }).click();
  await typeName('Driving');
  await page.waitForFunction(() => document.body.innerText.includes('Driving'));
  text = await save();
  const driving = layersOf(text).find(layer => layer.id === 'veh');
  assert.equal(driving.name, 'Driving');
  assert.deepEqual(Object.keys(driving.overrides).sort(), ['LIGHT_BAR', 'N', 'W']);
  assert.equal(driving.overrides.N, 'J');
  assert.doesNotMatch(text, /^RSR,/m, 'the old modeshifts moved');
  assert.match(text, /^# @layer-action RSR = hold veh$/m);
  await page.keyboard.press('Escape');
  await changes.waitFor({ state: 'detached' });

  // Delete is confirmed in place, Keep it focused; nothing else changes.
  await card('Map').focus();
  await page.keyboard.press('y');
  await changes.waitFor();
  await changes.getByRole('button', { name: 'Delete Map' }).click();
  await page.waitForFunction(() => document.activeElement?.hasAttribute('data-keep'));
  await page.keyboard.press('Escape');
  await changes.getByRole('button', { name: 'Delete Map' }).click();
  await changes.getByRole('alertdialog').getByRole('button', { name: 'Delete Map' }).click();
  await changes.waitFor({ state: 'detached' });
  assert.equal(await card('Map').count(), 0);

  // Review changes names the reorder and the mode edits in words.
  await page.keyboard.down('m'); await page.keyboard.down('m'); await page.keyboard.up('m');
  await page.getByRole('button', { name: /^Review changes/ }).click();
  const review = page.getByRole('dialog', { name: /Review changes/ });
  await review.waitFor();
  assert.match(await review.innerText(), /Map layer[\s\S]*In the file[\s\S]*Deleted/);
  await review.getByRole('button', { name: 'Revert Map layer' }).click();
  await review.getByRole('heading', { name: 'No pending changes' }).waitFor();
  await page.keyboard.press('Escape');
  await card('Map').waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: modes are created, ordered, renamed, deleted in place; activation, suppress holds, Use Default and old modeshifts edited from the mode');
 } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) });
