// Layout: moving the mouse from one row to the next crosses the gap between
// them. The hovered row used to clear on each row's edge, so for a moment the
// preview fell back to another input (the other face of the controller, or
// both) and flickered. The hover now sticks until the pointer leaves the stage.
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
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'overview' })));
    const rows = page.locator('[data-overview-group="right"] [data-overview-slot]');
    await rows.nth(1).waitFor();
    const current = () => page.evaluate(() => document.querySelector('[data-overview-slot][data-current="true"]')?.getAttribute('data-overview-slot'));

    const first = await rows.nth(0).boundingBox(), second = await rows.nth(1).boundingBox();
    const firstId = await rows.nth(0).getAttribute('data-overview-slot');
    const secondId = await rows.nth(1).getAttribute('data-overview-slot');
    const x = first.x + first.width / 2;
    await page.mouse.move(x, first.y + first.height / 2); await page.waitForTimeout(150);
    assert.equal(await current(), firstId, 'hovering a row shows it');
    // Walk down through the gap in small steps; the preview must never fall back to anything else.
    const seen = new Set();
    for (let y = first.y + first.height / 2; y <= second.y + second.height / 2; y += 2) {
      await page.mouse.move(x, y);
      seen.add(await current());
    }
    assert.deepEqual([...seen].sort(), [firstId, secondId].sort(), 'only the two rows are ever shown: ' + [...seen].join(','));

    // Leaving the stage altogether lets the focused row take over again.
    await page.mouse.move(5, 895); await page.waitForTimeout(150);
    assert.notEqual(await current(), undefined);
    assert.deepEqual(errors, []);
    console.log('PASS: Layout hover sticks across the gaps between rows');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
