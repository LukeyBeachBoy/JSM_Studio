// Menus ▸ the editor with a mouse (UX review 2026-10-09, M3): clicking a slice
// selects it (the side panel follows) and leaves the action sheet closed;
// double-click, A or Enter open it. The line under the preview names the state
// ("Slice 3 of 8 · Weapon 3") rather than explaining the controls.
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
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'virtualMenus' })));
    await page.waitForTimeout(1200);
    if (!(await page.locator('[data-menu-preview]').count())) {
      await page.getByRole('radio', { name: /Weapon wheel/ }).click();
      await page.locator('[data-menu-preview]').waitFor();
    }
    const preview = page.locator('[data-menu-preview]');
    const side = page.getByRole('complementary');
    const dialogs = () => page.locator('[role="dialog"]').count();
    const centre = async index => { const box = await preview.locator(`[role="button"][aria-label^="menu1:${index}"] [data-nav-box]`).boundingBox(); return [box.x + box.width / 2, box.y + box.height / 2]; };

    const [x, y] = await centre(2);
    await page.mouse.click(x, y);
    await page.waitForTimeout(300);
    assert.match(await side.innerText(), /Slice 3 of/i, 'a click selects the slice');
    assert.equal(await dialogs(), 0, 'a click opens nothing');
    assert.match(await preview.locator('p').innerText(), /^Slice 3 of \d+ · /, 'the caption names the state');
    assert.doesNotMatch(await preview.locator('p').innerText(), /A changes|Y its/, 'no control-explaining sentence');
    assert.ok(await page.evaluate(() => document.activeElement?.hasAttribute('data-menu-preview')), 'focus stays on the preview');

    await page.mouse.dblclick(x, y);
    const sheet = page.getByRole('dialog').filter({ hasText: /sends/i }).last();
    await sheet.waitFor();
    assert.match(await sheet.innerText(), /Let go to pick · hold while pointing to hold/);
    await page.keyboard.press('Escape');
    await sheet.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.hasAttribute('data-menu-preview'));

    // Enter still opens it from the keyboard / A.
    await page.keyboard.press('Enter');
    await sheet.waitFor();
    await page.keyboard.press('Escape');
    await sheet.waitFor({ state: 'detached' });

    assert.deepEqual(errors, []);
    console.log('PASS: a click selects a slice, double-click or Enter opens its action, the caption names the state');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
