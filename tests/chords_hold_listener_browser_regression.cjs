// Chords ▸ Step 1 (UX review 2026-10-09, B2): the page listens for the button
// to hold, so LT / RT must never also be "Step" -- a chord begun as LB + R5 was
// saved as RT when the reviewer stepped with the trigger. Now the two panels
// are walked with the D-pad, nothing in the footer claims LT/RT, a trigger
// pressed while panel 1 has focus picks it (that is the feature), and a press
// while panel 2 has focus changes nothing. In the dev mock (?mock), with its
// scriptable window.__pad.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const PROFILE = ['RESET_MAPPINGS', 'RSL = SPACE', 'L = G', 'S = E'].join('\n') + '\n'

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    page.setDefaultTimeout(15000);
    await page.goto((process.env.JSM_TEST_URL || 'http://127.0.0.1:1420') + '/?mock');
    await page.addLocatorHandler(page.getByRole('button', { name: 'Keep them', exact: true }), async () => { await page.getByRole('button', { name: 'Keep them', exact: true }).click() });
    await page.waitForFunction(() => window.__pad && document.querySelector('.titlebar') && window.electronAPI?.saveLibraryProfile);
    await page.waitForTimeout(800);
    await page.evaluate(text => window.electronAPI.saveLibraryProfile('Chords', text), PROFILE);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'configurations' })));
    await page.locator('[data-profile="Chords"] > button').first().focus();
    await page.keyboard.press('Enter');
    await page.locator('[data-overview-slot]').first().waitFor();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'buttons' })));
    const pad = async (keys, ms = 90) => { await page.evaluate(([k, m]) => window.__pad.press(k, m), [keys, ms]); await page.waitForTimeout(350) };
    const trigger = async side => { await page.evaluate(s => window.__pad.trigger(s, 1), side); await page.waitForTimeout(250); await page.evaluate(s => window.__pad.trigger(s, 0), side); await page.waitForTimeout(350) };
    const activeHints = () => page.evaluate(() => document.activeElement?.closest('[data-hints]')?.getAttribute('data-hints') ?? '');
    const footer = () => page.evaluate(() => [...document.querySelectorAll('.hint-capsule')].filter(c => getComputedStyle(c).visibility !== 'hidden').map(c => c.innerText.replace(/\n/g, ' · ')).join(' | '));

    // R5's binding sheet, then its Chords page.
    const summary = page.locator('details[data-input-command="RSL"] > summary');
    await summary.scrollIntoViewIfNeeded();
    await summary.click();
    const sheet = page.locator('details[data-input-command="RSL"][open] [data-binding-sheet]');
    await sheet.waitFor();
    await sheet.locator('[data-fold="while-holding"]').click();
    const step1 = page.locator('[data-step="1"]');
    await step1.waitFor();
    await page.waitForTimeout(400);
    assert.ok(await page.evaluate(() => document.querySelector('[data-step="1"]')?.contains(document.activeElement)), 'the page opens on panel 1');

    // Nothing on this page says LT/RT.
    assert.doesNotMatch(await activeHints(), /LT\/RT/, `a cap still offers LT/RT: ${await activeHints()}`);
    assert.doesNotMatch(await footer(), /Step/, `the footer still says Step: ${await footer()}`);

    // Panel 1 has focus: the trigger pressed on the controller picks it.
    await trigger('right');
    assert.equal(await step1.locator('[data-hold-input="ZR"]').getAttribute('aria-pressed'), 'true', 'pressing RT in panel 1 picks RT');
    assert.match(await step1.innerText(), /Hold RT/);

    // The chord the reviewer made: LB from the list.
    await step1.locator('[data-hold-input="L"]').click();
    await page.waitForTimeout(500);
    assert.match(await step1.innerText(), /Hold LB/);
    // A on the cap moved the pad on to panel 2; a trigger pressed there changes nothing.
    assert.ok(await page.evaluate(() => document.querySelector('[data-step="2"]')?.contains(document.activeElement)), 'choosing the held button moves on to panel 2');
    await trigger('right');
    assert.match(await step1.innerText(), /Hold LB/, 'RT pressed while panel 2 has focus rewrote the chord');
    assert.equal(await step1.locator('[data-hold-input="L"]').getAttribute('aria-pressed'), 'true');
    assert.doesNotMatch(await activeHints(), /LT\/RT/);

    // Step 2: a key.
    await page.locator('[data-step="2"] [data-kind-tile="key"]').click();
    const picker = page.getByRole('dialog', { name: /Pick a key/ });
    await picker.waitFor();
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('[data-subpage] .hint-capsule')].some(c => getComputedStyle(c).visibility !== 'hidden' && c.getBoundingClientRect().height > 0)), 'the picker renders the shared hint capsule (L3)');
    await picker.getByRole('button', { name: /^Space( ·|$)/ }).first().click();
    await picker.waitFor({ state: 'detached' });
    await page.waitForTimeout(400);
    // The chord reads LB + R5 on the page and in the list.
    const panel2 = page.locator('[data-step="2"]');
    assert.match(await panel2.innerText(), /Space/, 'panel 2 shows what R5 sends with LB held');
    assert.match(await page.locator('[data-while-holding]').getAttribute('data-while-holding'), /^L$/, 'the chord being edited is LB');
    await pad(['E']); // B: back to the list
    const list = page.locator('[data-while-holding-list]');
    await list.waitFor();
    assert.equal(await list.locator('[data-modeshift-row]').count(), 1, 'one chord in the list');
    assert.match(await list.locator('[data-modeshift-row="L"]').innerText(), /LB held/, `the chord is LB's: ${await list.innerText()}`);
    assert.equal(await list.locator('[data-modeshift-row="ZR"]').count(), 0, 'no chord on RT was made');

    assert.deepEqual(errors, []);
    console.log('PASS: Chords Step 1 never treats LT/RT as Step; a trigger picks only while panel 1 has focus; a chord begun as LB stays LB');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
