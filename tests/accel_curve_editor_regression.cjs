// The acceleration curve editor (TODO-40): a full-window view with the curve
// in the middle, opened from the Gyro page and from Trackpad feel. Checks that it
// opens from both, that rows and dragged handles rewrite the configuration
// and redraw the curve before anything is saved, that a drag on the gyro moves
// X and Y together in one write (after a row edit, two single-axis writes in
// one tick would each start from that edit's stale draft), that
// the modeshift view writes the shifted keys, that LB/RB switch to the
// trackpad's curve, and that closing hands focus back to what opened it.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      const profiles = { Desktop: [
        'RESET_MAPPINGS',
        'RIGHT_TOUCHPAD_MODE = MOUSE',
        'MIN_GYRO_SENS = 1 1',
        'MAX_GYRO_SENS = 2 2',
        'MIN_GYRO_THRESHOLD = 5',
        'MAX_GYRO_THRESHOLD = 60',
        'ZL,MIN_GYRO_SENS = 0.5 0.5',
        'ZL,MAX_GYRO_SENS = 1 1',
        '',
      ].join('\n') };
      window.__lastSaved = '';
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Desktop', path: 'profiles-library/Desktop.txt', content: profiles.Desktop }),
        listLibraryProfiles: async () => Object.keys(profiles),
        loadLibraryProfile: async name => ({ name, content: profiles[name] }),
        saveLibraryProfile: async (name, content) => { window.__lastSaved = content; profiles[name] = content; return { name } },
        applyProfile: async path => ({ path, mappingEnabled: true }),
      };
      window.telemetry = { onSample: cb => {
        const emit = () => cb({ console: 'Mapper ready', activeProfile: 'profiles-library/Desktop.txt', omega: 30,
          devices: [{ handle: 1, type: 24, supportedButtons: 8589934591, status: { buttons: 0, leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 }, gyro: { x: 0, y: 0, z: 0 },
            leftPad: { x: 0, y: 0, touched: false }, rightPad: { x: 0, y: 0, touched: true, pressure: 0.02, speed: 420 } } }] });
        emit(); const timer = setInterval(emit, 50); return () => clearInterval(timer);
      } };
    });
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
    await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {});
    await page.locator('.profile-chip').filter({ hasText: 'Desktop' }).waitFor();

    // ---- In from the Gyro page's Sensitivity section.
    await page.getByRole('button', { name: 'Gyro', exact: true }).first().click();
    const entry = page.getByRole('button', { name: 'Open curve editor' });
    await entry.click();
    const view = page.locator('.curve-view');
    await view.waitFor();
    assert.equal(await view.getAttribute('role'), 'dialog');
    assert.equal(await view.getAttribute('data-side'), 'gyro', 'opened from the Gyro page, it shows the gyro');
    const curve = view.locator('.curve-plot__curve');
    assert.equal(await curve.getAttribute('data-curve'), 'LINEAR');
    const handles = () => page.evaluate(() => [...document.querySelectorAll('.curve-plot__handle')].map(h => h.getAttribute('data-handle')).join(','));
    assert.equal(await handles(), 'min,max', 'a linear curve has its slow and fast corners to drag');
    await view.locator('.curve-view__readout').getByText('30 °/s', { exact: true }).first().waitFor();

    const row = label => view.locator('button.summary-row').filter({ has: page.locator('.summary-row__label').getByText(label, { exact: true }) }).first();
    const value = async label => (await row(label).locator('.summary-row__value').textContent()).trim();
    const type = async (label, text) => { await row(label).focus(); await page.keyboard.type(text); await page.keyboard.press('Enter'); await page.waitForTimeout(150); };
    const drag = async (id, dx, dy) => {
      const box = await view.locator(`.curve-plot__handle[data-handle="${id}"] .curve-plot__handle-dot`).boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await page.mouse.move(x, y); await page.mouse.down();
      for (let i = 1; i <= 6; i++) { await page.mouse.move(x + (dx * i) / 6, y + (dy * i) / 6); await page.waitForTimeout(20); }
      await page.mouse.up(); await page.waitForTimeout(200);
    };

    // ---- A row redraws the curve before anything is saved.
    const before = await curve.getAttribute('d');
    await type('Maximum sensitivity (X)', '3');
    assert.equal(await value('Maximum sensitivity (X)'), '3.00');
    assert.notEqual(await curve.getAttribute('d'), before, 'the curve redraws as the row changes');
    assert.equal(await value('Maximum sensitivity (Y)'), '2.00', 'one axis row leaves the other alone');

    // ---- Changing the curve brings its own shape handle and rows.
    await row('Curve').focus(); await page.keyboard.press('Enter'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    assert.equal(await curve.getAttribute('data-curve'), 'NATURAL');
    assert.equal(await handles(), 'min,max,shape');
    await type('Half-way speed', '20');
    const halfBefore = parseFloat(await value('Half-way speed'));
    await drag('shape', 90, 0);
    const halfAfter = parseFloat(await value('Half-way speed'));
    assert.ok(halfAfter > halfBefore, `dragging the half-way point right raises it (${halfBefore} -> ${halfAfter})`);

    // ---- Dragging the slow corner up moves X, and Y with it in proportion.
    // The rows go first: their drafts are what a pair of single-axis writes
    // in one tick would have put back over the dragged X.
    await type('Minimum sensitivity (X)', '1.2');
    await type('Minimum sensitivity (Y)', '1.2');
    await drag('min', 0, -50);
    const minX = parseFloat(await value('Minimum sensitivity (X)'));
    const minY = parseFloat(await value('Minimum sensitivity (Y)'));
    assert.ok(minX > 1.2, `the slow corner lifts the minimum (${minX})`);
    assert.equal(minY, minX, 'equal axes stay equal: both halves of the pair are written');

    // ---- The modeshift view edits the shifted curve.
    await row('Editing').focus(); await page.keyboard.press('Enter'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    assert.equal(await value('Minimum sensitivity (X)'), '0.50', 'the shifted values show');
    assert.match(await view.locator('.eyebrow').first().textContent(), /While shifted/);
    await type('Maximum sensitivity (X)', '1.5');

    // ---- RB switches to the trackpad's curve; its live speed rides on it.
    await page.evaluate(() => document.activeElement.dispatchEvent(new CustomEvent('jsm:pad', { detail: { button: 'RB' }, bubbles: true, cancelable: true })));
    await page.waitForTimeout(250);
    assert.equal(await view.getAttribute('data-side'), 'touchpad');
    await view.locator('.curve-view__readout').getByText('420 px/s', { exact: true }).first().waitFor();
    await type('Gain when fast', '2');
    assert.equal(await value('Gain when fast'), '2.00×');

    // ---- B (Escape) closes it and hands focus back to the button.
    await page.keyboard.press('Escape');
    await view.waitFor({ state: 'detached' });
    await page.waitForTimeout(200);
    assert.equal((await page.evaluate(() => document.activeElement?.textContent ?? '')).trim(), 'Open curve editor', 'focus returns to what opened the editor');

    // ---- What was written.
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => /TOUCHPAD_ACCEL_MAX_GAIN/.test(window.__lastSaved));
    const saved = await page.evaluate(() => window.__lastSaved);
    assert.match(saved, /^MAX_GYRO_SENS = 3 2\s*$/m, 'the X row wrote X only');
    assert.match(saved, /^ACCEL_CURVE = NATURAL\s*$/m);
    assert.match(saved, new RegExp(`^ACCEL_NATURAL_VHALF = ${halfAfter}\\s*$`, 'm'), 'the dragged half-way point was written');
    assert.match(saved, new RegExp(`^MIN_GYRO_SENS = ${minX} ${minX}\\s*$`, 'm'), 'the dragged corner wrote both axes');
    assert.match(saved, /^ZL,MAX_GYRO_SENS = 1\.5 1\s*$/m, 'the shifted view wrote the shifted key');
    assert.match(saved, /^ZL,MIN_GYRO_SENS = 0\.5 0\.5\s*$/m, 'and left the shifted minimum alone');
    assert.match(saved, /^TOUCHPAD_ACCEL_MAX_GAIN = 2\s*$/m);

    // ---- In from Trackpad feel: the trackpad's curve, over the sheet, back to the sheet.
    await page.getByRole('button', { name: 'Trackpads', exact: true }).click();
    const sheetRow = (scope, label) => scope.locator('button.summary-row').filter({ has: page.locator('.summary-row__label').getByText(label, { exact: true }) }).first();
    await sheetRow(page.locator('#trackpad-right'), 'Trackpad feel').click();
    const sheet = page.locator('.sheet');
    await sheet.getByRole('heading', { name: 'Trackpad feel' }).waitFor();
    assert.equal((await sheetRow(sheet, 'Acceleration curve').locator('.summary-row__value').textContent()).trim(), 'Linear', 'the row names the trackpad curve once its gains differ');
    await sheetRow(sheet, 'Acceleration curve').click();
    await view.waitFor();
    assert.equal(await view.getAttribute('data-side'), 'touchpad', 'opened from Trackpad feel, it shows the trackpad');
    await page.keyboard.press('Escape');
    await view.waitFor({ state: 'detached' });
    await sheet.getByRole('heading', { name: 'Trackpad feel' }).waitFor();
    assert.equal(await sheet.count(), 1, 'closing the editor leaves the sheet open');

    assert.deepEqual(errors, []);
    console.log('PASS: the curve editor opens from Gyro and Trackpad feel, rows and handles rewrite the curve live (both gyro axes on a drag), the shifted view writes shifted keys, RB shows the trackpad, and B returns focus');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
