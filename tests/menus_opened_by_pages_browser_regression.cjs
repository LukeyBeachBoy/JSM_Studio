// Menus ▸ Opened by and More are two pages, as the rows promise (UX review
// 2026-10-09, M1). Opened by lands on the "How it opens" card, never on a value
// stepper, so the first Right moves between cards instead of silently changing
// which stick or pad the menu uses; only the rows that apply to that choice are
// shown; its footer reads the page the moment it opens. More lands on Menu name.
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
    const press = async key => { await page.evaluate(k => window.__pad.press([k], 70), key); await page.waitForTimeout(250); };
    const active = () => page.evaluate(() => { const a = document.activeElement; return { role: a?.getAttribute('role'), label: a?.getAttribute('aria-label') || (a?.textContent || '').trim().slice(0, 40), checked: a?.getAttribute('aria-checked') } });
    const footer = () => page.locator('[data-subpage] .hint-capsule').last().innerText();

    // Opened by: its own page, landing on the current "How it opens" card.
    await page.getByRole('button', { name: /Opened by/ }).click();
    const opened = page.getByRole('dialog', { name: /Opened by$/ });
    await opened.waitFor();
    await page.waitForTimeout(400);
    let focus = await active();
    assert.equal(focus.role, 'radio', 'lands on a How it opens card, not a stepper: ' + JSON.stringify(focus));
    assert.equal(focus.checked, 'true', 'the current card');
    assert.match(await footer(), /Back to the menu/, 'the footer reads the page on open');
    const navigate = opened.getByRole('listbox', { name: 'Navigate with' });
    const before = await navigate.innerText();
    await press('RIGHT');
    focus = await active();
    assert.equal(focus.role, 'radio', 'Right moves to the next card');
    assert.notEqual(focus.checked, 'true');
    assert.equal(await navigate.innerText(), before, 'Right changed nothing');
    // Only the rows that apply: no Opener row until the menu has an opener, no Confirm button until it picks on a press.
    assert.equal(await opened.getByRole('button', { name: /^Opener/ }).count(), 0);
    assert.equal(await opened.getByRole('button', { name: /^Confirm button/ }).count(), 0);
    assert.equal(await opened.locator('[aria-disabled="true"]').count(), 0, 'nothing greyed out');
    await opened.getByRole('radio', { name: /While held/ }).click();
    assert.equal(await opened.getByRole('button', { name: /^Opener/ }).count(), 1, 'the opener row appears for While held');
    assert.doesNotMatch(await opened.innerText(), /Buttons ▸ Open a menu|\(Buttons/, 'no parenthetical control copy');
    await page.keyboard.press('Escape');
    await opened.waitFor({ state: 'detached' });

    // More: the other page, landing on its first row (Menu name), no Opened-by rows on it.
    await page.getByRole('button', { name: /^More/ }).click();
    const more = page.getByRole('dialog', { name: /More$/ });
    await more.waitFor();
    await page.waitForTimeout(400);
    focus = await active();
    assert.match(focus.label, /Menu name/, 'More lands on Menu name: ' + JSON.stringify(focus));
    assert.equal(await more.getByRole('listbox', { name: 'Navigate with' }).count(), 0);
    assert.match(await footer(), /Back to the menu/);
    await page.keyboard.press('Escape');
    await more.waitFor({ state: 'detached' });

    assert.deepEqual(errors, []);
    console.log('PASS: Opened by and More are two pages; Opened by lands on a card, shows only the rows that apply, and Right never changes the input');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
