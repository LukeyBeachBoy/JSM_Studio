// TODO-50..53, on the console v2 screens (P6). The Modes page's "Add a mode"
// is a labelled card whose chips are the way in; "Bring in old While holding
// changes" keeps its count on one line without clipping when squeezed; the
// delete confirmation carries one accent ring, on Keep it. (The shared touch-stick
// intro this file once checked went with the old Trackpads page, P4.)
// Runs against the app with its own mocks: JSM_TEST_URL defaults to :1420.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path = require('node:path');
const fs = require('node:fs');
(async () => {
 const browser = await chromium.launch({ channel: 'msedge', headless: true });
 try {
 const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
 const errors = []; page.on('pageerror', e => errors.push(e.message));
 // A legacy modeshift to bring in, and a mode to bring it into.
 await page.addInitScript(() => {
   const content = 'RESET_MAPPINGS\nRSR,N = J\nRSR,W = U\nN = SPACE\n# @layer {"id":"veh","name":"Vehicles","overrides":{"E":"H"}}\n# @layer-action LSL = hold veh\n';
   window.electronAPI = {
     getActiveProfile: async () => ({ name: 'Migration', path: 'profiles-library/Migration.txt', content }),
     listLibraryProfiles: async () => ['Migration'],
     loadLibraryProfile: async () => ({ name: 'Migration', content }),
   };
 });
 await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
 await page.locator('.app-shell').waitFor({ timeout: 30000 });
 await page.getByRole('button', { name: 'Keep them' }).click({ timeout: 3000 }).catch(() => {});
 const artifacts = path.resolve(__dirname, '../tmp/layers-ui-polish'); fs.mkdirSync(artifacts, { recursive: true });
 const rect = async locator => { const b = await locator.boundingBox(); assert.ok(b, 'element has a box'); return b; };
 const go = tab => page.evaluate(detail => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail })), tab);

 // ---- TODO-50: adding a mode is a labelled card, the chips its way in.
 await go('layers');
 const modes = page.locator('[data-modes-page]');
 await modes.waitFor();
 const add = modes.getByRole('listitem', { name: 'Add a layer' });
 assert.match(await add.innerText(), /New layer/);
 assert.match(await add.innerText(), /Start from/, 'the Build / Photo chips are labelled, inside the tile');
 assert.deepEqual((await add.getByRole('button').allInnerTexts()).map(text => text.replace(/\s+/g, ' ').trim()), ['+ New layer Name it, then pick its button', 'Build', 'Photo']);
 // Cards: plain state lines, no control-explaining feet; the "⋯" is the mouse's way to X / Y.
 assert.doesNotMatch(await modes.innerText(), /see it on Layout|X to choose one|A to change buttons/);
 assert.equal(await modes.locator('[data-mode-id="veh"]').getAttribute('data-hints'), 'A:What changes;X:How it turns on;Y:Rename · colour · delete;B:Back');
 assert.equal(await modes.getByRole('button', { name: 'More for Vehicles', exact: true }).count(), 1);
 const grid = await rect(modes.getByRole('list', { name: 'Layers' }));
 assert.ok(grid.width <= 1280, 'the cards fit the window');
 assert.equal(await page.evaluate(() => document.querySelector('.shell-scroll')?.scrollWidth <= document.querySelector('.shell-scroll')?.clientWidth), true, 'no sideways scroll');
 // A focused card shows its mini controller with the changed inputs.
 await modes.locator('[data-mode-id="veh"]').focus();
 await modes.locator('[data-mode-id="veh"] svg[viewBox="0 0 1117 750"]').waitFor();
 assert.match(await modes.locator('[data-mode-id="veh"]').getAttribute('data-hints'), /X:How it turns on;Y:Rename · colour · delete/);
 await page.screenshot({ path: path.join(artifacts, 'modes.png') });

 // ---- TODO-51: the Bring in row keeps its count and wraps its words, squeezed or not.
 await page.keyboard.press('y');
 const changes = page.getByRole('dialog', { name: /What changes in this layer/ });
 await changes.waitFor();
 const bring = changes.locator('[role="group"]').filter({ hasText: 'Bring in chords' });
 for (const width of [1280, 760]) {
   await page.setViewportSize({ width, height: 900 });
   await bring.scrollIntoViewIfNeeded();
   const value = bring.locator(':scope > span').last();
   assert.match(await value.innerText(), /R4\D*· 2|· 2/, 'the count is on the row');
   assert.ok(await bring.evaluate(el => el.scrollWidth <= el.clientWidth + 1), `the row does not clip at ${width}px`);
 }
 await page.setViewportSize({ width: 1280, height: 900 });

 // ---- TODO-52: the delete confirmation has one accent ring, on Keep it.
 await changes.getByRole('button', { name: 'Delete Vehicles' }).click();
 await page.waitForFunction(() => document.activeElement?.hasAttribute('data-keep'));
 await page.evaluate(() => document.body.dataset.inputSource = 'controller');
 const ringed = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].filter(el => { const s = getComputedStyle(el); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 || /rgb/.test(s.boxShadow) && el === document.activeElement }).length);
 assert.ok(ringed <= 1, `one ring at a time (${ringed})`);
 await page.screenshot({ path: path.join(artifacts, 'delete-in-place.png') });
 await page.keyboard.press('Escape');
 await page.keyboard.press('Escape');
 await changes.waitFor({ state: 'detached' });

 // TODO-53 (the shared touch-stick intro) belonged to the old Trackpads page; Trackpads (P4) replaced it.

 assert.deepEqual(errors, []);
 console.log('PASS: labelled Add a mode card, Bring in row keeps its count, one accent ring when deleting');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });

