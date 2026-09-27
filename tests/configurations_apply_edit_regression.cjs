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
      await page.evaluate(() => [...document.querySelectorAll('button, a')].find(b => b.textContent.trim().startsWith('Configurations'))?.click());
      await page.locator('[data-profile]').first().waitFor();
    };
    const applied = () => page.evaluate(() => window.__applied.slice());
    const editing = () => page.evaluate(() => document.querySelector('[data-profile] [class*="tagAccent"]')?.closest('[data-profile]')?.dataset.profile);

    await openConfigurations();
    assert.equal(await editing(), 'Wardogs');

    // Y on the row being edited applies it.
    await page.locator('[data-profile="Wardogs"] > button').first().focus();
    await page.keyboard.press('y');
    await page.waitForTimeout(600);
    assert.deepEqual(await applied(), ['profiles-library/Wardogs.txt'], 'Y on the edited configuration did not apply it');

    // The Apply button does the same.
    await page.locator('aside button').filter({ hasText: /Apply$/ }).click();
    await page.waitForTimeout(600);
    assert.equal((await applied()).length, 2, 'Apply on the edited configuration did not apply it');

    // Y on another row: it becomes the one being edited, and applied.
    await page.locator('[data-profile="Cyberpunk"] > button').first().focus();
    await page.keyboard.press('y');
    await page.waitForTimeout(900);
    assert.equal((await applied()).at(-1), 'profiles-library/Cyberpunk.txt', 'Y on another configuration did not apply it');
    assert.equal(await editing(), 'Cyberpunk');

    // One Edit press on another row opens it in the editor.
    await page.locator('[data-profile="Gamepad"] > button').first().focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(900);
    assert.equal(await page.locator('[data-profile]').count(), 0, 'Edit left the Configurations page open');
    assert.match(await page.locator('.titlebar').innerText(), /Gamepad/, 'Edit did not switch to Gamepad');

    // X on a row opens its options.
    await openConfigurations();
    await page.locator('[data-profile="Gamepad"] > button').first().focus();
    await page.keyboard.press('x');
    await page.locator('[role="menu"]').waitFor({ timeout: 2000 });

    assert.deepEqual(errors, []);
    console.log('configurations apply and edit: ok');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
