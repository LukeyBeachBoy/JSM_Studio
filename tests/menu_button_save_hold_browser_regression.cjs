// Menu / M: tap opens options; hold saves and makes the configuration live.
// The visible label explains both effects, including inside sub-pages. Failed
// applies must not announce success. Uses the renderer mock, not hardware.
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
    await page.evaluate(() => {
      window.__editorCalls = [];
      window.__editorToasts = [];
      window.addEventListener('app-toast', event => window.__editorToasts.push(event.detail));
      const api = window.electronAPI;
      const save = api.saveLibraryProfile, apply = api.applyProfile;
      api.saveLibraryProfile = async (...args) => { window.__editorCalls.push('save'); return save(...args) };
      api.applyProfile = async (...args) => {
        window.__editorCalls.push('apply');
        if (window.__failEditorApply) throw new Error('Regression: mapper unavailable');
        return apply(...args);
      };
    });
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

    await makeDirty();
    assert.match(await chipText(), /^Unsaved\u00b7(M)?Holdtosave&makelive$/);
    assert.equal(await chip.locator('.state-button__glyph, .hint-key').count(), 1);
    const shot = async width => {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(200);
      assert.equal(await chip.evaluate(el => el.scrollWidth <= el.clientWidth), true, 'save/apply label fits');
      await page.screenshot({ path: `tests/tmp/save-and-make-live-${width}.png` });
    };
    await shot(1440); await shot(1000); await page.setViewportSize({ width: 1440, height: 900 });
    const clear = () => page.evaluate(() => { window.__editorCalls = []; window.__editorToasts = [] });
    const calls = () => page.evaluate(() => window.__editorCalls);

    // A tap opens options without saving or applying.
    await clear();
    await page.evaluate(() => window.__pad.press(['+'], 80));
    await page.locator('.config-menu').waitFor();
    assert.deepEqual(await calls(), []);
    await page.keyboard.press('Escape');
    await page.locator('.config-menu').waitFor({ state: 'detached' });

    // Holding Menu saves and applies exactly once, including on release.
    await page.evaluate(() => window.__pad.press(['+'], 700));
    await saved();
    assert.deepEqual(await calls(), ['save', 'apply']);
    assert.equal(await page.locator('.config-menu').count(), 0);

    await makeDirty(); await clear();
    await page.keyboard.down('m'); await page.waitForTimeout(700); await page.keyboard.up('m');
    await saved();
    assert.deepEqual(await calls(), ['save', 'apply']);

    // Ctrl+S remains the explicit save-only alternative.
    await makeDirty(); await clear();
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => window.__editorCalls.includes('save'));
    assert.deepEqual(await calls(), ['save']);

    // Inside a sub-page the same hold still reaches save and apply.
    await makeDirty();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'joysticks' })));
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /^Fine-tune/ }).first().click();
    await page.locator('[data-subpage]').waitFor();
    await clear();
    await page.evaluate(() => window.__pad.press(['+'], 700));
    await saved();
    assert.deepEqual(await calls(), ['save', 'apply']);
    await page.keyboard.press('Escape');

    // A saved file is retained on apply failure, but no false Live success.
    await makeDirty(); await clear();
    await page.evaluate(() => { window.__failEditorApply = true });
    await page.keyboard.down('m'); await page.waitForTimeout(700); await page.keyboard.up('m');
    await page.waitForFunction(() => window.__editorToasts.some(toast => toast.kind === 'error'));
    assert.deepEqual(await calls(), ['save', 'apply']);
    assert.equal(await page.evaluate(() => window.__editorToasts.some(toast => /live now/.test(toast.message))), false);
    assert.match(await page.getByRole('alert').innerText(), /mapper unavailable/);
    await page.screenshot({ path: 'tests/tmp/save-and-make-live-error.png' });

    assert.deepEqual(errors, []);
    console.log('PASS: explicit save/apply labels at two widths, Menu/M hold saves and applies once, tap options, Ctrl+S saves only, sub-pages and failed apply feedback');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
