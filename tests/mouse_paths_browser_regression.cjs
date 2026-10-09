// Every control can be pointed at (console v2 rule: pad and keyboard shortcuts are
// extras, never the only way). A real mouse, in the dev mock (?mock):
//
// - Right-clicking a Buttons row opens a menu listing the X / Y actions the pad
//   has (Hold & double-tap, Copy / clear / name). There is no hover button: it
//   covered the row's own content (removed 2026-10-08).
// - A number row: click the value to type it, click or drag the bar to set it.
// - A sub-page has a visible Back that closes it.
// - A picker (a bare sub-page) has its own Back that does not overlap the header.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto((process.env.JSM_TEST_URL || 'http://127.0.0.1:1420') + '/?mock');
    await page.waitForFunction(() => window.__pad && document.querySelector('.titlebar'));
    await page.addLocatorHandler(page.getByRole('button', { name: 'Keep them', exact: true }), async () => { await page.getByRole('button', { name: 'Keep them', exact: true }).click() });
    await page.waitForTimeout(1000);
    const go = async id => { await page.evaluate(id => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: id })), id); await page.waitForTimeout(1500); };

    // 1. Right-click menu; nothing appears on hover.
    await go('buttons');
    const row = page.locator('details[data-input-command="S"] > summary');
    const box = await row.boundingBox();
    await page.mouse.move(box.x + 200, box.y + box.height / 2); await page.waitForTimeout(400);
    assert.equal(await page.locator('[data-context-actions]').count(), 0, 'hovering a row shows nothing over it');
    await row.click({ button: 'right' }); await page.waitForTimeout(300);
    const items = await page.locator('[role="menu"][aria-label="Row actions"] [role="menuitem"]').allInnerTexts();
    assert.ok(items.some(text => /Hold & double-tap/.test(text)), 'the menu lists the pad\'s X action: ' + JSON.stringify(items));
    await page.getByRole('menuitem', { name: /Hold & double-tap/ }).click(); await page.waitForTimeout(800);
    assert.ok(await page.locator('.sheet').count() > 0, 'the menu item opens the binding sheet');
    await page.keyboard.press('Escape'); await page.waitForTimeout(900);
    await page.mouse.move(5, 500); await page.waitForTimeout(200);
    await row.click({ button: 'right' }); await page.waitForTimeout(300);
    assert.ok(await page.locator('[role="menu"][aria-label="Row actions"] [role="menuitem"]').count() > 0, 'right-click opens the same menu');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);

    // 2. A number row with the mouse.
    await go('joysticks');
    const slider = page.locator('[role="slider"]').first();
    await slider.locator('b').first().click(); await page.waitForTimeout(200);
    const input = slider.locator('input');
    assert.equal(await input.count(), 1, 'clicking the value opens an inline field');
    await input.fill('30'); await input.press('Enter'); await page.waitForTimeout(400);
    assert.match(await slider.getAttribute('aria-valuetext'), /30/, 'typed value is applied');
    const bar = slider.locator('[class*="bar"]').first();
    const bb = await bar.boundingBox();
    await page.mouse.click(bb.x + bb.width * 0.2, bb.y + bb.height / 2); await page.waitForTimeout(400);
    const at20 = await slider.getAttribute('aria-valuetext');
    await page.mouse.move(bb.x + bb.width * 0.2, bb.y + 4); await page.mouse.down();
    await page.mouse.move(bb.x + bb.width * 0.6, bb.y + 4, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(400);
    const at60 = await slider.getAttribute('aria-valuetext');
    assert.notEqual(at20, at60, 'dragging the bar moves the value: ' + at20 + ' -> ' + at60);

    // 3. Back on a sub-page and a picker.
    await go('buttons');
    for (let i = 0; i < 3 && await page.locator('.sheet-layer').count(); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
    await page.locator('details[data-input-command="S"] > summary').click(); await page.waitForTimeout(800);
    await page.getByRole('button', { name: /^Fine-tune/ }).first().click(); await page.waitForTimeout(900);
    assert.equal(await page.locator('[data-subpage]').count(), 1, 'Fine-tune opens as a sub-page');
    await page.getByRole('button', { name: 'Back', exact: true }).last().click(); await page.waitForTimeout(500);
    assert.equal(await page.locator('[data-subpage]').count(), 0, 'its Back closes it');
    await page.getByRole('button', { name: /Keyboard key/ }).first().click(); await page.waitForTimeout(1200);
    assert.equal(await page.locator('[data-subpage]').count(), 1, 'the key picker opens');
    const back = page.getByRole('button', { name: 'Back', exact: true }).last();
    const backBox = await back.boundingBox();
    const badge = await page.locator('[data-subpage] h1, [data-subpage] h2').first().boundingBox();
    assert.ok(backBox.y + backBox.height <= (badge?.y ?? 9999) + 1 || backBox.x + backBox.width <= (badge?.x ?? 9999) + 1, 'Back does not sit on the picker\'s title');
    await back.click(); await page.waitForTimeout(500);
    assert.equal(await page.locator('[data-subpage]').count(), 0, 'the picker\'s Back closes it');

    assert.deepEqual(errors, [], 'no page errors: ' + errors.join(' | '));
    console.log('mouse paths ok');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
