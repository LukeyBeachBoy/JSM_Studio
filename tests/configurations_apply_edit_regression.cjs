// Configurations page, from Luke's feedback of 2026-09-27, in the dev mock:
//
// - Apply on the configuration being edited only saved it ("Saved X. It stays
//   off the live mapping until you Apply it") and never reached the mapper.
// - Edit on another configuration only switched to it; a second press opened
//   the editor. One press does both.
// - Y applies the focused row (or, from the panel, the selected one) without
//   walking to the Apply button; X opens the row's options.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto((process.env.JSM_TEST_URL || 'http://127.0.0.1:1420') + '/?mock');
    await page.waitForFunction(() => window.__pad && document.querySelector('.titlebar') && window.electronAPI?.applyProfile);
    await page.evaluate(() => {
      window.__applied = [];
      const apply = window.electronAPI.applyProfile;
      window.electronAPI.applyProfile = async (path, text) => { window.__applied.push(path); return apply(path, text) };
    });
    await page.waitForTimeout(800);
    const openConfigurations = async () => {
      await page.evaluate(() => [...document.querySelectorAll('.titlebar button')].find(b => /Home/.test(b.textContent))?.click());
      await page.waitForTimeout(700);
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'configurations' })));
      await page.locator('[data-profile]').first().waitFor();
    };
    const applied = () => page.evaluate(() => window.__applied.slice());
    // Console v2 (Library): covers, not rows. A edits, X makes live, Y is More.
    const editing = () => page.evaluate(() => document.querySelector('[data-editing="true"]')?.dataset.profile ?? document.querySelector('.titlebar')?.textContent ?? '');

    // The Steam Controller's first-connection question comes up on its own.
    const keepSounds = page.getByRole('button', { name: 'Keep them' });
    await keepSounds.waitFor({ timeout: 5000 }).then(() => keepSounds.click()).catch(() => {});
    await openConfigurations();
    assert.match(await editing(), /Wardogs/);
    // Wardogs is live and unchanged: its Make live says so instead.
    await page.locator('[data-profile="Wardogs"] button').first().focus();
    await page.locator('aside button').filter({ hasText: /Live now$/ }).waitFor();

    // X on another cover: it becomes the one being edited, and live.
    await page.locator('[data-profile="Cyberpunk"] button').first().focus();
    await page.keyboard.press('x');
    await page.waitForTimeout(900);
    assert.equal((await applied()).at(-1), 'profiles-library/Cyberpunk.txt', 'X on another configuration did not make it live');
    assert.match(await editing(), /Cyberpunk/);

    // The detail's Make live does the same for the one focused.
    await page.locator('[data-profile="Wardogs"] button').first().focus();
    await page.locator('aside button').filter({ hasText: /Make live$/ }).click();
    await page.waitForTimeout(900);
    assert.equal((await applied()).at(-1), 'profiles-library/Wardogs.txt', 'Make live in the detail did not apply it');

    // One Edit press on another cover opens it in the editor.
    await openConfigurations();
    await page.locator('[data-profile="Gamepad"] button').first().focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(900);
    assert.equal(await page.locator('[data-profile]').count(), 0, 'Edit left the Library open');
    assert.match(await editing(), /Gamepad/, 'Edit did not switch to Gamepad');

    // Y on a cover opens More: Duplicate, Rename, Change base…
    await openConfigurations();
    await page.locator('[data-profile="Cyberpunk"] button').first().focus();
    await page.keyboard.press('y');
    const more = page.getByRole('dialog', { name: 'Cyberpunk' });
    await more.waitFor({ timeout: 2000 });
    for (const label of ['Duplicate', 'Rename', 'Change base', 'Launch with game', 'Show in folder', 'Edit the file directly', 'Delete']) await more.getByRole('button', { name: new RegExp(`^${label}`) }).first().waitFor();

    assert.deepEqual(errors, []);
    console.log('configurations apply and edit: ok');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
