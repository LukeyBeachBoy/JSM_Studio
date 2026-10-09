// Menus ▸ the wheel preview: the D-pad moves to the slice that way on the
// drawing, and at the edge it leaves the preview for the panel beside it.
// Left/Right used to wrap round the ring forever, so with focus in the preview
// there was no way to reach the slice panel on the right.
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
    await page.waitForTimeout(1500);
    if (!(await page.locator('[data-menu-preview]').count())) {
      await page.getByText('8 slots on a stick').first().click();
      await page.locator('[data-menu-preview]').waitFor();
    }
    const preview = page.locator('[data-menu-preview]');
    await preview.focus();
    const selected = () => page.evaluate(() => document.querySelector('[data-menu-preview] [data-selected="true"]')?.getAttribute('aria-label')?.split(':')[1]);
    const inPreview = () => page.evaluate(() => Boolean(document.activeElement?.closest('[data-menu-preview]')));
    const press = async key => { await page.evaluate(k => window.__pad.press([k], 70), key); await page.waitForTimeout(250); };

    // Right walks the slices towards the right side, then leaves the preview.
    const seen = new Set([await selected()]);
    let left = false;
    for (let i = 0; i < 12 && !left; i++) {
      await press('RIGHT');
      if (await inPreview()) seen.add(await selected()); else left = true;
    }
    assert.ok(seen.size >= 2, 'Right moves between slices first: ' + [...seen].join(','));
    assert.ok(left, 'Right at the edge of the wheel leaves the preview');
    const landed = await page.evaluate(() => {
      const a = document.activeElement; const p = document.querySelector('[data-menu-preview]').getBoundingClientRect();
      return { right: a.getBoundingClientRect().left >= p.right - 4, text: (a.textContent || '').trim().slice(0, 40) };
    });
    assert.ok(landed.right, 'focus lands in the panel to the right of the preview: ' + landed.text);

    // Back into the preview, Left walks to the left edge and leaves to the rail.
    await preview.focus();
    let outLeft = false;
    for (let i = 0; i < 12 && !outLeft; i++) { await press('LEFT'); outLeft = !(await inPreview()); }
    assert.ok(outLeft, 'Left at the edge leaves the preview too');

    assert.deepEqual(errors, []);
    console.log('PASS: the menu preview steps slices by direction and lets focus out at its edges');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
