// A modeshift trigger on the Overview, from Luke's feedback of 2026-09-27 on
// his Cyberpunk profile: D-pad Left turns the right pad into a 2x2 button pad
// while held, which the profile writes as the pad's mode, grid size, touch
// stick mode, click requirement and 25 region cells (24 of them NONE).
//
// - Holding it said "29 shifted": every config key counted as an input. It is
//   one input, the right trackpad, and the status names it ("Left held → Right pad").
// - The D-pad Left row carried an "Inspect uses" button that opened a list of
//   raw keys ("Rt2 → NONE →"). The D callout's focus card now names the pad
//   it changes, and the inspector (Every use) shows one row per input changed.
// In the dev mock (?mock), with its scriptable window.__pad.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const PROFILE = [
  'RESET_MAPPINGS', 'VIRTUAL_CONTROLLER = XBOX', 'S = X_A', 'UP = X_UP', 'DOWN = X_DOWN', 'LEFT = X_LEFT', 'RIGHT = X_RIGHT',
  'RIGHT_TOUCHPAD_MODE = MOUSE', 'MISC2 = F',
  'LEFT,RIGHT_GRID_SIZE = 2 2', 'LEFT,RIGHT_GRID_REQUIRES_CLICK = OFF', 'LEFT,RIGHT_TOUCH_STICK_MODE = NO_MOUSE',
  ...Array.from({ length: 24 }, (_, i) => `LEFT,RT${i + 2} = NONE`),
  'LEFT,RIGHT_TOUCHPAD_MODE = GRID_AND_STICK', 'LEFT,RT1 = F3',
  // A button shift beside it, so a count is still a count.
  'L = X_LB', 'LSL = X_RS', 'LSL,L = V', 'LSL,S = C',
].join('\n') + '\n'

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: Number(process.env.JSM_SHOT_SCALE || 1) });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto((process.env.JSM_TEST_URL || 'http://127.0.0.1:1420') + '/?mock');
    // A Steam Controller's first connection asks about its power-on sound.
    await page.addLocatorHandler(page.getByRole('button',{name:'Keep them',exact:true}), async () => { await page.getByRole('button',{name:'Keep them',exact:true}).click() });
    await page.waitForFunction(() => window.__pad && document.querySelector('.titlebar') && window.electronAPI?.saveLibraryProfile);
    await page.waitForTimeout(800);
    await page.evaluate(text => window.electronAPI.saveLibraryProfile('Cyberpunk', text), PROFILE);
    await page.evaluate(() => [...document.querySelectorAll('.titlebar button')].find(b => /Home/.test(b.textContent))?.click());
    await page.waitForTimeout(700);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'configurations' })));
    await page.locator('[data-profile="Cyberpunk"] > button').first().focus();
    await page.keyboard.press('Enter');
    // Layout (console v2): the D-pad is one callout (D) standing for all four.
    const row = page.locator('[data-overview-slot="dpad"]');
    await row.waitFor({ timeout: 10000 });
    await page.waitForTimeout(2500);
    assert.ok((await row.getAttribute('data-overview-inputs')).split(' ').includes('LEFT'), 'D-pad Left is part of the D callout');

    // Its focus card names the pad D-pad Left changes; no "Inspect uses".
    assert.equal(await page.getByText('Inspect uses').count(), 0, 'an "Inspect uses" button is still drawn');
    await row.focus();
    const card = page.locator('[data-focus-card="dpad"]');
    await card.waitFor();
    assert.match(await card.innerText(), /while held, changes Right trackpad/, 'the card does not name the right pad');
    assert.doesNotMatch(await card.innerText(), /RT\d|NONE|29/, 'nor counts the pad\'s keys');
    // LSL shifts two buttons: a count, on its one line.
    assert.match(await page.locator('[data-overview-input="LSL"]').innerText(), /changes 2 while held/);
    await row.scrollIntoViewIfNeeded();
    if (process.env.JSM_SHOT_DIR) await page.screenshot({ path: `${process.env.JSM_SHOT_DIR}/overview-dpad-left.png` });

    // Holding the trigger must not add a live shell indicator.
    await page.evaluate(() => window.__pad.hold(['LEFT']));
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.shift-status, .hint-capsule__status').count(), 0);
    if (process.env.JSM_SHOT_DIR) await page.locator('.titlebar').screenshot({ path: `${process.env.JSM_SHOT_DIR}/titlebar-held.png` });
    await page.evaluate(() => window.__pad.release(['LEFT']));
    await page.waitForTimeout(300);

    // The inspector (Every use, jsm:input-uses): one Right trackpad row,
    // described, not 29 key rows.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:input-uses', { detail: 'LEFT' })));
    const sheet = page.getByRole('dialog').filter({ hasText: /Where D-Pad Left is used/i });
    await sheet.waitFor();
    assert.match(await sheet.innerText(), /Where D-Pad Left is used/i);
    const rows = sheet.locator('button[data-hints="A:Open;B:Close"]');
    assert.equal(await rows.count(), 1, `expected one row, got ${await rows.count()}: ${await sheet.innerText()}`);
    const text = (await rows.first().innerText()).replace(/\s+/g, ' ');
    assert.match(text, /Right trackpad/);
    assert.match(text, /Button pad · 2×2 grid · no click needed · touch stick: directions/);
    assert.match(text, /region 1 → F3/);
    assert.doesNotMatch(text, /NONE|RT2/i);
    await page.waitForTimeout(400);
    if (process.env.JSM_SHOT_DIR) await page.screenshot({ path: `${process.env.JSM_SHOT_DIR}/uses-inspector.png` });
    // A on it opens the right pad's editor.
    await rows.first().click();
    await page.waitForTimeout(800);
    assert.equal(await sheet.count(), 0, 'the inspector stayed open');
    assert.ok(await page.locator('[data-input-command="RIGHT_PAD"]').count() > 0, 'did not open the right trackpad');

    assert.deepEqual(errors, []);
    console.log('modeshift trigger on the Overview: ok');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
