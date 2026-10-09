// Focus never drops to <body> around the binding sheet (UX review 2026-10-09,
// B3): after B on Press together with… / Stick diagonal, when the Chords list
// and editor open, after leaving the Chords page, and after closing a picker,
// document.activeElement is inside the topmost open dialog, so the next D-pad
// press never lands on the Buttons list behind. Also L5: `E,E = G` is B's
// double-tap, never "With B held: G". In the dev mock (?mock).
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const PROFILE = ['RESET_MAPPINGS', 'E = C', 'E,E = G', 'L,E = V', 'LUP = W', 'S = SPACE'].join('\n') + '\n'

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
    await page.evaluate(text => window.electronAPI.saveLibraryProfile('Focus', text), PROFILE);
    await page.evaluate(() => window.dispatchEvent(new Event('jsm:library-changed')));
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'configurations' })));
    await page.locator('[data-profile="Focus"] > button').first().focus();
    await page.keyboard.press('Enter');
    await page.locator('[data-overview-slot]').first().waitFor();
    await page.waitForTimeout(1500);

    // L5 on Layout: the face group's card never says B changes itself while held.
    await page.locator('[data-overview-slot="face"]').focus();
    const faceCard = page.locator('[data-focus-card="face"]');
    await faceCard.waitFor();
    assert.doesNotMatch(await faceCard.innerText(), /while held, changes B/, `Layout reads the double-tap as a chord: ${await faceCard.innerText()}`);

    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'buttons' })));
    const pad = async (keys, ms = 90) => { await page.evaluate(([k, m]) => window.__pad.press(k, m), [keys, ms]); await page.waitForTimeout(400) };
    const where = () => page.evaluate(() => {
      const active = document.activeElement
      const traps = [...document.querySelectorAll('.modal-overlay, [data-focus-trap="true"]')]
      const top = traps[traps.length - 1] ?? null
      return { onBody: !active || active === document.body, inTop: Boolean(top && active && top.contains(active)), traps: traps.length, active: active ? `${active.tagName}${active.getAttribute('data-when') ? `[when=${active.getAttribute('data-when')}]` : ''}${active.getAttribute('data-more-card') ? `[more=${active.getAttribute('data-more-card')}]` : ''}${active.getAttribute('data-fold') ? `[fold=${active.getAttribute('data-fold')}]` : ''} ${(active.textContent || '').trim().slice(0, 40)}` : 'none' }
    });
    const expectInside = async (step) => {
      const state = await where();
      assert.ok(!state.onBody, `${step}: focus dropped to <body>`);
      assert.ok(state.inTop, `${step}: focus (${state.active}) is outside the top dialog (${state.traps} open)`);
      return state;
    };

    // L5 on the row: B's preview names Double-tap, never "With B held".
    const summary = page.locator('details[data-input-command="E"] > summary');
    await summary.scrollIntoViewIfNeeded();
    await summary.focus();
    await page.waitForTimeout(300);
    const preview = await summary.innerText();
    assert.match(preview, /Double-tap: G/, `the row's preview: ${preview}`);
    assert.doesNotMatch(preview, /With B held/, `the double-tap reads as a chord of B with itself: ${preview}`);
    assert.match(preview, /With LB held: V/, 'the real chord is still listed');

    await summary.click();
    const sheet = page.locator('details[data-input-command="E"][open] [data-binding-sheet]');
    await sheet.waitFor();
    await page.waitForTimeout(300);
    await expectInside('sheet open');

    // Press together with…: B returns to its card.
    await sheet.locator('[data-when="more"]').click();
    await page.waitForTimeout(300);
    await sheet.locator('[data-more-card="simultaneous"]').focus();
    await pad(['S']);
    await page.getByRole('dialog', { name: 'Press together with…' }).waitFor();
    await expectInside('pair picker open');
    await pad(['E']);
    await page.getByRole('dialog', { name: 'Press together with…' }).waitFor({ state: 'detached' });
    const afterPair = await expectInside('B from Press together with…');
    assert.match(afterPair.active, /more=simultaneous/, `focus went back to the card: ${afterPair.active}`);
    // The next DOWN stays in the sheet, never on the list behind.
    await pad(['DOWN']);
    await expectInside('DOWN after the pair picker');

    // Stick diagonal is not offered on a face button.
    assert.equal(await sheet.locator('[data-more-card="diagonal"]').count(), 0, 'Stick diagonal is offered on B');
    await sheet.locator('[data-more-card="release"]').focus();
    await page.keyboard.press('Escape'); // closes More
    await page.waitForTimeout(300);

    // Chords: the list opens on its first row; A opens the editor on the held cap; B unwinds with focus kept.
    await sheet.locator('[data-fold="while-holding"]').click();
    const list = page.locator('[data-while-holding-list]');
    await list.waitFor();
    await page.waitForTimeout(500);
    const onList = await expectInside('Chords list open');
    assert.ok(await page.evaluate(() => document.activeElement?.closest('[data-modeshift-row]')), `the first chord row has focus: ${onList.active}`);
    await pad(['S']);
    await page.locator('[data-while-holding="L"]').waitFor();
    await page.waitForTimeout(500);
    const onEditor = await expectInside('chord editor open');
    assert.ok(await page.evaluate(() => document.activeElement?.closest('[data-step="1"]')), `the editor opens on panel 1: ${onEditor.active}`);
    await pad(['DOWN']);
    await expectInside('DOWN in the editor');
    await pad(['E']);
    await list.waitFor();
    await page.waitForTimeout(400);
    await expectInside('B back to the list');
    await pad(['E']);
    await list.waitFor({ state: 'detached' });
    await page.waitForTimeout(500);
    const afterChords = await expectInside('B out of Chords');
    assert.match(afterChords.active, /fold=while-holding/, `focus went back to the Chords row: ${afterChords.active}`);

    // A picker: B comes back to the kind tile.
    await sheet.locator('[data-when="regular"]').focus();
    await sheet.locator('[data-kind="key"]').focus();
    await pad(['S']);
    await page.getByRole('dialog', { name: /Pick a key/ }).waitFor();
    await expectInside('key picker open');
    await pad(['E']);
    await page.getByRole('dialog', { name: /Pick a key/ }).waitFor({ state: 'detached' });
    await page.waitForTimeout(500);
    const afterPicker = await expectInside('B from the key picker');
    assert.ok(/data-kind|kind/.test(afterPicker.active) || await page.evaluate(() => document.activeElement?.hasAttribute('data-kind')), `focus is on a kind tile: ${afterPicker.active}`);
    await pad(['DOWN']);
    await expectInside('DOWN after the picker');

    assert.deepEqual(errors, []);
    console.log('PASS: focus stays inside the top dialog around the pair picker, Chords and the pickers; a double-tap never reads as a chord with itself');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
