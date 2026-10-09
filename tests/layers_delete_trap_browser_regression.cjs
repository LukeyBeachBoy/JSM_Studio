// Layers ▸ delete confirmation (UX review 2026-10-09, M5): while "Delete X?" is
// open the pad stays on its two buttons -- Up / Left are Keep it, Down / Right
// Delete -- and a click elsewhere counts as Keep it. Up used to walk out to the
// title bar with the question still pending. The Menus ▸ More delete uses the
// same guard.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const base = process.env.JSM_TEST_URL || 'http://127.0.0.1:1420';
    await page.goto(base.includes('?') ? base : `${base}/?mock`);
    await page.waitForFunction(() => window.__pad && document.querySelector('.titlebar'));
    await page.addLocatorHandler(page.getByRole('button', { name: 'Keep them', exact: true }), async () => { await page.getByRole('button', { name: 'Keep them', exact: true }).click() });
    const press = async key => { await page.evaluate(k => window.__pad.press([k], 70), key); await page.waitForTimeout(250); };
    const inDialog = () => page.evaluate(() => ({ inside: !!document.activeElement?.closest('[role="alertdialog"]'), text: (document.activeElement?.textContent || '').trim().slice(0, 30) }));

    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'layers' })));
    const modes = page.locator('[data-modes-page]');
    await modes.waitFor();
    await page.waitForTimeout(600);
    await modes.locator('[data-mode-id="veh"]').focus();
    await press('N');
    const changes = page.getByRole('dialog', { name: /What changes in this layer/ });
    await changes.waitFor();
    await changes.getByRole('button', { name: /^Delete / }).click();
    await page.waitForFunction(() => document.activeElement?.hasAttribute('data-keep'));
    for (const key of ['UP', 'UP', 'LEFT']) {
      await press(key);
      const now = await inDialog();
      assert.ok(now.inside && /Keep it/.test(now.text), `${key} stays on Keep it: ${JSON.stringify(now)}`);
    }
    await press('DOWN');
    let now = await inDialog();
    assert.ok(now.inside && /^Delete/.test(now.text), `Down reaches Delete: ${JSON.stringify(now)}`);
    await press('RIGHT');
    now = await inDialog();
    assert.ok(now.inside && /^Delete/.test(now.text), 'Right stays on Delete');
    await press('UP');
    now = await inDialog();
    assert.ok(now.inside && /Keep it/.test(now.text), 'Up from Delete is Keep it');
    assert.equal(await modes.locator('[data-mode-id="veh"]').count(), 1, 'nothing deleted');
    // A click elsewhere on the page is Keep it: the question closes, the Delete row is back.
    await changes.getByRole('heading', { level: 1 }).click();
    await changes.getByRole('button', { name: /^Delete / }).waitFor();
    assert.equal(await changes.getByRole('alertdialog').count(), 0);
    await page.keyboard.press('Escape');
    await changes.waitFor({ state: 'detached' });
    assert.equal(await modes.locator('[data-mode-id="veh"]').count(), 1, 'still nothing deleted');

    // Menus ▸ More ▸ Delete this menu: the same guard.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'virtualMenus' })));
    await page.waitForTimeout(1000);
    if (!(await page.locator('[data-menu-preview]').count())) {
      await page.getByRole('radio', { name: /Weapon wheel/ }).click();
      await page.locator('[data-menu-preview]').waitFor();
    }
    await page.getByRole('button', { name: /^More/ }).click();
    const more = page.getByRole('dialog', { name: /More$/ });
    await more.waitFor();
    await more.getByRole('button', { name: /Delete this menu/ }).click();
    await page.waitForFunction(() => document.activeElement?.hasAttribute('data-keep'));
    await press('UP'); await press('LEFT');
    now = await inDialog();
    assert.ok(now.inside && /Keep it/.test(now.text), 'menu delete: Up / Left stay on Keep it');
    await page.keyboard.press('Escape');
    await more.getByRole('button', { name: /Delete this menu/ }).waitFor();
    await page.keyboard.press('Escape');
    await more.waitFor({ state: 'detached' });

    assert.deepEqual(errors, []);
    console.log('PASS: the delete confirmation keeps the pad on Keep it / Delete, and leaving it is Keep it');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
