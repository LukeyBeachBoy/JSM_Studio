// Number rows in the sheets (SummaryRow adjust mode), from Luke's feedback of
// 2026-09-27, in the dev mock (?mock, which records controller feedback in
// window.__padFeedback instead of playing it):
//
// - The grip Flicker guard could be lowered but not raised past 5%: the
//   controller stores 25-100 whole numbers, a 1% step was 0.75 of one, and
//   rounding put the value back where it started.
// - A number can be typed while the row is focused or adjusting; Enter keeps
//   it, Esc drops the typing. X swaps the coarse step for a fine one.
// - A grip haptic's strength and effect play on the controller as they change,
//   and X plays them again, before anything is saved or applied.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto((process.env.JSM_TEST_URL || 'http://127.0.0.1:1420') + '/?mock');
    await page.waitForFunction(() => window.__pad && document.querySelector('.titlebar'));
    await page.waitForTimeout(800);
    await page.evaluate(() => { window.__padFeedback = []; window.dispatchEvent(new CustomEvent('jsm:open-sheet', { detail: 'gripSensors' })) })
    // Console v2 (GripSensors.dc.html): the grip sheet's rows are console rows
    // whose value ◂ ▸ change directly (Shift is the fine step); A types a number.
    const slider = label => page.locator('.sheet [role="slider"]').filter({ hasText: label }).first();
    const value = async label => (await slider(label).getAttribute('aria-valuetext')).trim();
    await slider('Flicker guard').waitFor();

    // Up in fine steps: every press moves the stored value (it used to stick at 5%).
    await slider('Flicker guard').focus();
    for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowLeft');
    const seen = [await value('Flicker guard')];
    for (let i = 0; i < 4; i++) { await page.keyboard.press('Shift+ArrowRight'); seen.push(await value('Flicker guard')) }
    const numbers = seen.map(text => Number.parseInt(text, 10));
    for (let i = 1; i < numbers.length; i++) assert.ok(numbers[i] > numbers[i - 1], `the flicker guard stuck: ${seen.join(' → ')}`);
    // Coarse: one plain press is a bigger step.
    const before = Number.parseInt(await value('Flicker guard'), 10);
    await page.keyboard.press('ArrowRight');
    assert.ok(Number.parseInt(await value('Flicker guard'), 10) - before >= 4, 'a plain arrow is not the coarse step');

    // Haptic preview: strength, each effect, and X (Feel it).
    await page.locator('.sheet button').filter({ hasText: /^Squeeze rumble/ }).focus();
    await page.keyboard.press('Enter');
    const strength = slider('Strength');
    await strength.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    let played = await page.evaluate(() => window.__padFeedback.slice());
    assert.deepEqual(played.at(-1), { effect: 2, intensity: 10, side: 3, rumbleMs: 0, rumble: 0, grips: true }, 'the strength did not preview as a Click at 10%, at the grips');
    const effect = page.locator('.sheet [role="radiogroup"][aria-label="Effect"]').first();
    await effect.focus();
    await page.keyboard.press('ArrowRight');
    played = await page.evaluate(() => window.__padFeedback.slice());
    assert.equal(played.at(-1).effect, 3, 'the next effect did not play');
    assert.equal(played.at(-1).intensity, 10, 'the effect did not play at the chosen strength');
    const count = played.length;
    await page.keyboard.press('x');
    assert.equal(await page.evaluate(() => window.__padFeedback.length), count + 1, 'X did not replay the haptic');

    assert.deepEqual(errors, []);
    console.log('row stepper and haptic preview: ok');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
