// Calibrate gyro -- the full run with the overlay HUD (CALIBRATE_GYRO: put the
// controller down, count down, calibrate, cancel if it moves) -- is an action
// in the picker's JSM tab, offered first and described, and a binding to it
// reads "Calibrate gyro" rather than the raw token. The bare CALIBRATE special
// (calibrate only while held) is named for what it does, so the two are not
// confused. Isolated renderer check against the ?mock preview.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto((process.env.JSM_TEST_URL || 'http://127.0.0.1:1420') + '/?mock');
    // The app opens on Home (console refinement 2a); these checks start in the editing shell.
    await page.locator('[data-home-continue]').click({ timeout: 15000 });
    await page.locator('.page-tabs').getByRole('button', { name: 'Buttons', exact: true }).click();
    const row = page.locator('details[data-input-command="MISC6"]').first();
    await row.locator('summary').click();
    // Add command opens the action picker straight away (5).
    await row.getByRole('button', { name: 'Add command' }).click();

    const picker = page.locator('.action-picker');
    await picker.locator('.action-tab', { hasText: /^JSM$/ }).click();
    const choices = picker.locator('.action-picker__body button');
    assert.equal((await choices.first().innerText()).trim(), 'Calibrate gyro', 'Calibrate gyro should lead the JSM tab');
    assert.equal(await picker.getByText('CALIBRATE', { exact: true }).count(), 0, 'the hold-to-calibrate special should not show its raw token');
    assert.equal(await picker.getByText('Calibrate while held (raw)', { exact: true }).count(), 1);
    // Searching finds it by what it does, not only by its token.
    await picker.getByRole('searchbox').fill('overlay');
    assert.ok(await picker.getByText('Calibrate gyro', { exact: true }).count() >= 1, 'search should find Calibrate gyro by its description');
    await picker.getByText('Calibrate gyro', { exact: true }).first().click();

    await page.waitForFunction(() => document.querySelector('details[data-input-command="MISC6"] [data-command-row]')?.textContent?.includes('Calibrate gyro'));
    assert.deepEqual(errors, []);
    console.log('PASS Calibrate gyro is a named, described action, first in the JSM tab');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
