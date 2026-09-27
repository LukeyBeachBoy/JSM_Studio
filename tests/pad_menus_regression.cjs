// Menus and dialogs driven by the pad, in the dev mock (?mock, its scriptable
// window.__pad). Each of these failed on a real controller:
//
// - A dropdown opened with A put focus on the list itself: the whole menu wore
//   the ring and the first Down only reached an option.
// - Delete from a configuration's options (Y) opened its confirmation, then
//   the options menu pulled focus back to the row behind it, so the dialog
//   could not be reached. Rename lost its name field the same way.
// - The Configuration menu (Menu) holds what the title bar holds; a list of
//   choices in it snapped focus back to the current choice on every render of
//   the live preview, so Down could not move.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto((process.env.JSM_TEST_URL || 'http://127.0.0.1:1420') + '/?mock');
    await page.waitForFunction(() => window.__pad && document.querySelector('.titlebar'));
    await page.waitForTimeout(1000);
    const press = async (buttons, ms = 70) => { await page.evaluate(([b, m]) => window.__pad.press(b, m), [buttons, ms]); await page.waitForTimeout(250); };
    const active = () => page.evaluate(() => { const a = document.activeElement; return { role: a.getAttribute('role') ?? a.tagName, text: a.textContent.trim(), label: a.getAttribute('aria-label') ?? '', inDialog: Boolean(a.closest('[role="alertdialog"], [role="dialog"]')) }; });
    const until = async (predicate, button = 'DOWN', tries = 6) => { for (let i = 0; i < tries && !predicate(await active()); i++) await press([button], 60); return active(); };

    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Continue editing'))?.click());
    await page.waitForTimeout(1200);

    // A dropdown opens onto its current option, never onto the list.
    await page.evaluate(() => [...document.querySelectorAll('.titlebar button')].find(b => /^Layer/.test(b.textContent.trim())).focus());
    await press(['S']); await page.waitForTimeout(300);
    let now = await active();
    assert.equal(now.role, 'menuitem', `A on the layer segment lands on an option, not the ${now.role}`);
    assert.match(now.text, /^Default/);
    await press(['DOWN']);
    assert.match((await active()).text, /^Vehicles/, 'the first Down moves to the next option');
    await press(['E']);

    // The Configuration menu reaches what the title bar holds.
    await press(['DOWN']);
    await press(['+']); await page.waitForTimeout(300);
    assert.match((await active()).text, /^Configuration/, 'Menu opens on the first thing it can act on');
    now = await until(a => a.text.startsWith('Controller output'));
    await press(['S']);
    assert.equal((await active()).role, 'radio', 'A opens the choices in place');
    now = await until(a => a.text.startsWith('Virtual Xbox'));
    assert.match(now.text, /^Virtual Xbox/, 'Down moves through the choices (focus is not pulled back)');
    await page.waitForTimeout(400);
    assert.match((await active()).text, /^Virtual Xbox/, 'and stays there while the preview keeps rendering');
    await press(['E']);
    assert.match((await active()).text, /^Controller output/, 'B steps back to the item the list came from');
    await press(['E']);
    assert.equal(await page.locator('.config-menu').count(), 0, 'and B again closes the menu');

    // Delete and Rename from a configuration's options keep their focus.
    await page.evaluate(() => [...document.querySelectorAll('.titlebar button')].find(b => /Home/.test(b.textContent))?.click());
    await page.waitForTimeout(900);
    await page.evaluate(() => [...document.querySelectorAll('button, a')].find(b => b.textContent.trim().startsWith('Configurations'))?.click());
    await page.waitForTimeout(1200);
    await page.evaluate(() => document.querySelector('[data-profile] > button').focus());
    await press(['N']);
    await until(a => a.text.startsWith('Delete'));
    await press(['S']); await page.waitForTimeout(300);
    now = await active();
    assert.ok(now.inDialog && now.text === 'Cancel', `Delete's confirmation has focus, on Cancel (got ${now.text})`);
    await press(['RIGHT']);
    assert.equal((await active()).text, 'Delete', 'and the pad can reach Delete');
    await press(['E']); await page.waitForTimeout(200);
    assert.equal(await page.locator('[role="alertdialog"]').count(), 0);
    assert.ok((await page.evaluate(() => document.activeElement.closest('[data-profile]') !== null && !document.activeElement.matches('[data-nav-skip]'))), 'B returns to the row, not the hidden options button');
    await press(['N']);
    await until(a => a.text.startsWith('Rename'));
    await press(['S']); await page.waitForTimeout(300);
    assert.equal((await active()).label, 'Configuration name', 'Rename keeps its name field');

    assert.deepEqual(errors, []);
    console.log('PASS: dropdowns open onto an option, the Configuration menu reaches the title bar with lists that hold focus, Delete and Rename from Y keep their focus');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
