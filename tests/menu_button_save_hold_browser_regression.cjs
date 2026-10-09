// Menu (☰ / M): a tap saves and makes the configuration live -- from anywhere,
// sub-pages included, which used to swallow it -- and holding it opens the
// Configuration menu. The status chip carries the Menu glyph inside it.
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
    await page.waitForTimeout(800);
    const chip = page.locator('.titlebar .state-button');
    const chipText = async () => (await chip.innerText()).replace(/\s/g, '');
    const makeDirty = async () => {
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'gyro' })));
      const speed = page.locator('[data-setting="GYRO_SENS"]').first();
      await speed.waitFor();
      await speed.focus();
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => /^Unsaved/.test(document.querySelector('.titlebar .state-button')?.textContent ?? ''));
    };
    const saved = () => page.waitForFunction(() => /^Live/.test(document.querySelector('.titlebar .state-button')?.textContent ?? ''), null, { timeout: 8000 });

    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'buttons' })));
    await page.waitForTimeout(800);

    // The glyph is inside the chip, which reads "Unsaved · ☰ Save".
    await makeDirty();
    assert.match(await chipText(), /^Unsaved·(M)?Save$/);
    assert.equal(await chip.locator('.state-button__glyph, .hint-key').count(), 1, 'the Menu glyph sits inside the chip');

    // Pad: a tap of Menu saves (no menu opens).
    await page.evaluate(() => window.__pad.press(['+'], 80));
    await saved();
    assert.equal(await page.locator('.config-menu').count(), 0, 'a tap does not open the menu');

    // Pad: holding Menu opens the Configuration menu and does not also save-press on release.
    await page.evaluate(() => window.__pad.press(['+'], 700));
    await page.locator('.config-menu').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.config-menu').waitFor({ state: 'detached' });

    // Keyboard: M tapped saves, held opens the menu.
    await makeDirty();
    await page.keyboard.press('m');
    await saved();
    assert.equal(await page.locator('.config-menu').count(), 0);
    await page.keyboard.down('m'); await page.keyboard.down('m'); await page.keyboard.up('m');
    await page.locator('.config-menu').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.config-menu').waitFor({ state: 'detached' });

    // Inside a sub-page (it used to swallow Menu): a tap still saves.
    await makeDirty();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'joysticks' })));
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /^Fine-tune/ }).first().click();
    await page.locator('[data-subpage]').waitFor();
    await page.evaluate(() => window.__pad.press(['+'], 80));
    await saved();

    assert.deepEqual(errors, []);
    console.log('PASS: Menu tap saves (also from a sub-page), hold opens the Configuration menu; the glyph is inside the chip');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
