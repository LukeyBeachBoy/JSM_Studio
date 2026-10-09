// Calibrate gyro -- the full run with the overlay HUD (CALIBRATE_GYRO: put the
// controller down, count down, calibrate, cancel if it moves) -- leads the
// Controller action picker's Calibrate group (console v2,
// ControllerActionsCalibrate), and a binding to it reads "Calibrate gyro"
// rather than the raw token. The bare CALIBRATE special (calibrate only while
// held) is named for what it does, so the two are not confused, and
// continuous start/finish are tiles of their own. Isolated renderer check
// against the ?mock preview.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto((process.env.JSM_TEST_URL || 'http://127.0.0.1:1420') + '/?mock');
    const keep = page.getByRole('button', { name: 'Keep them', exact: true });
    await page.locator('[data-home-continue]').waitFor({ timeout: 15000 });
    if (await keep.count()) await keep.click();
    await page.locator('[data-home-continue]').click();
    await page.locator('.page-tabs').getByRole('button', { name: 'Buttons', exact: true }).click();
    const row = page.locator('details[data-input-command="MISC6"]').first();
    await row.locator(':scope > summary').click();

    const picker = page.locator('[data-picker="controller"]');
    const open = async () => {
      await row.locator('[data-kind="controller"]').first().click();
      await picker.waitFor();
      await picker.locator('[data-category="calibrate"]').click();
    };
    await open();
    const tiles = picker.locator('[data-action]');
    assert.equal(await tiles.first().getAttribute('data-action'), 'CALIBRATE_GYRO', 'Calibrate gyro should lead the Calibrate group');
    assert.match(await tiles.first().innerText(), /Calibrate gyro/);
    assert.equal(await picker.getByText('CALIBRATE', { exact: true }).count(), 0, 'the hold-to-calibrate special should not show its raw token');
    assert.equal(await picker.getByText('Calibrate while held', { exact: true }).count(), 1);
    assert.equal(await picker.locator('[data-action="RESTART_GYRO_CALIBRATION"]').count(), 1);
    assert.equal(await picker.locator('[data-action="FINISH_GYRO_CALIBRATION"]').count(), 1);
    // The aside says what the run does and what you will see.
    await tiles.first().focus();
    assert.match(await picker.locator('aside').innerText(), /Same as Recalibrate on the Gyro tab[\s\S]*Put down[\s\S]*Done/);
    // Search every action finds it by what it does, not only by its token.
    await page.keyboard.press('y');
    const search = page.getByRole('dialog', { name: 'Search every action' });
    await search.getByRole('searchbox').fill('overlay');
    assert.ok(await search.getByText('Calibrate gyro', { exact: true }).count() >= 1, 'search should find Calibrate gyro by its description');
    await search.getByText('Calibrate gyro', { exact: true }).first().click();
    await page.waitForFunction(() => document.querySelector('details[data-input-command="MISC6"]')?.textContent?.includes('Calibrate gyro'));

    for (const token of ['RESTART_GYRO_CALIBRATION', 'FINISH_GYRO_CALIBRATION']) {
      await open();
      await picker.locator(`[data-action="${token}"]`).click();
      await picker.waitFor({ state: 'detached' });
    }
    await page.waitForFunction(() => /continuous/i.test(document.querySelector('details[data-input-command="MISC6"]')?.textContent ?? ''));
    assert.equal(await row.getByText(/\(raw\)/).count(), 0, 'native command identifiers must not be the primary labels');
    assert.deepEqual(errors, []);
    console.log('PASS timed, held and continuous start/finish calibration actions have readable graphical choices');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
