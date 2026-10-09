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
    await page.addLocatorHandler(page.getByRole('button',{name:'Keep them',exact:true}), async () => { await page.getByRole('button',{name:'Keep them',exact:true}).click() });
    await page.waitForTimeout(1000);
    const press = async (buttons, ms = 70) => { await page.evaluate(([b, m]) => window.__pad.press(b, m), [buttons, ms]); await page.waitForTimeout(250); };
    const active = () => page.evaluate(() => { const a = document.activeElement; return { role: a.getAttribute('role') ?? a.tagName, text: a.textContent.trim(), label: a.getAttribute('aria-label') ?? '', inDialog: Boolean(a.closest('[role="alertdialog"], [role="dialog"]')) }; });
    const until = async (predicate, button = 'DOWN', tries = 6) => { for (let i = 0; i < tries && !predicate(await active()); i++) await press([button], 60); return active(); };

    // Console v2: Home's A is "Edit layout" (data-home-continue).
    await page.evaluate(() => document.querySelector('[data-home-continue]')?.click());
    await page.waitForTimeout(1200);
    // A Steam Controller's first connection asks about its power-on sound; it takes focus when it appears.
    await page.getByRole('button',{name:'Keep them',exact:true}).click({timeout:8000}).catch(() => {});

    // A dropdown opens onto its current option, never onto the list: the game
    // chip lists the configurations and opens on the one being edited.
    await page.evaluate(() => document.querySelector('.profile-chip').focus());
    await press(['S']); await page.waitForTimeout(300);
    let now = await active();
    assert.equal(now.role, 'menuitem', `A on the game chip lands on an option, not the ${now.role}`);
    assert.match(now.text, /^Wardogs/);
    await press(['DOWN']);
    assert.match((await active()).text, /^Cyberpunk/, 'the first Down moves to the next option');
    await press(['E']); await page.waitForTimeout(600);

    // The Options menu (Menu) holds what the old title bar held: it opens on
    // the first thing it can act on, Down moves through it, B closes it.
    await press(['+'], 700); await page.waitForTimeout(500); // hold Menu: the Configuration menu
    assert.match((await active()).text, /^Review changes/, 'Menu opens on the first thing it can act on');
    await press(['DOWN']);
    assert.match((await active()).text, /^Undo/, 'Down moves through the menu (focus is not pulled back)');
    await page.waitForTimeout(400);
    assert.match((await active()).text, /^Undo/, 'and stays there while the preview keeps rendering');
    await press(['E']);
    assert.equal(await page.locator('.config-menu').count(), 0, 'B closes the menu');

    // Delete and Rename from a configuration's More menu keep their focus.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'configurations' })));
    await page.waitForTimeout(1200);
    await page.evaluate(() => document.querySelector('[data-profile] button, button[data-profile]').focus());
    // Y opens a configuration's More menu (X makes it live).
    await press(['N']);
    await until(a => a.text.startsWith('Delete'));
    await press(['S']); await page.waitForTimeout(300);
    now = await active();
    assert.ok(now.inDialog && now.text.startsWith('Keep it'), `Delete's confirmation has focus, on Keep it (got ${now.text})`);
    await press(['DOWN']);
    assert.match((await active()).text, /^Delete /, 'and the pad can reach Delete');
    await press(['E']); await page.waitForTimeout(200);
    assert.ok((await active()).text.startsWith('Delete'), 'B steps back to the More menu item, not the page behind');
    await until(a => a.text.startsWith('Rename'), 'UP');
    await press(['S']); await page.waitForTimeout(300);
    // Console v2: Rename opens the on-screen keyboard, with focus on its first key.
    assert.ok(await page.locator('[aria-label^="Type:"]').count() === 1 && (await active()).text === 'q', 'Rename keeps focus, on the on-screen keyboard');

    assert.deepEqual(errors, []);
    console.log('PASS: dropdowns open onto an option, the Options menu opens on its first action and holds focus, Delete and Rename from Y keep their focus');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
