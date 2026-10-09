// The acceleration curve editor. Console v2 (P5): the gyro's curve is Gyro ▸
// Fine-tune ▸ Speed ▸ Advanced (curve on the left, Speeds / Shape / Game & lean
// parts on the right); the full-window view (AccelCurveView) keeps the
// trackpads' curve and no longer switches inputs with LB / RB (V1: the bumpers
// are tabs). Checks that rows and dragged handles rewrite the configuration and
// redraw the curve before anything is saved, that a drag on the gyro moves X
// and Y together in one write, that a held variant writes the held keys, that
// the trackpad editor shows the trackpad, and that asking it for the gyro lands
// on the gyro's page.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { assert, prepare, openGyro, top, openFineTune, openRow, valueRow, switchRow, valueText, typeValue, eff } = require('./gyro_v2_helpers.cjs');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(15000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await prepare(page);
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
    await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {})
    await openGyro(page);
    await openFineTune(page, 'speed');
    await openRow(page, 'Advanced');
    const view = top(page).locator('[data-speed-advanced]');
    await view.waitFor();
    const curve = view.locator('.curve-plot__curve');
    assert.equal(await curve.getAttribute('data-curve'), 'LINEAR');
    const handles = () => view.evaluate(host => [...host.querySelectorAll('.curve-plot__handle')].map(h => h.getAttribute('data-handle')).join(','));
    assert.equal(await handles(), 'min,max', 'a linear curve has its slow and fast corners to drag');
    await view.getByText(/live 30 °\/s/).first().waitFor();
    const drag = async (id, dx, dy) => {
      const box = await view.locator(`.curve-plot__handle[data-handle="${id}"] .curve-plot__handle-dot`).boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await page.mouse.move(x, y); await page.mouse.down();
      for (let i = 1; i <= 6; i++) { await page.mouse.move(x + (dx * i) / 6, y + (dy * i) / 6); await page.waitForTimeout(20); }
      await page.mouse.up(); await page.waitForTimeout(200);
    };
    const number = async label => parseFloat(await valueText(valueRow(view, label)));

    // ---- A row redraws the curve before anything is saved; with up/down
    // speeds separate, one axis leaves the other alone.
    await switchRow(view, 'Separate up/down speeds').click();
    const before = await curve.getAttribute('d');
    await typeValue(valueRow(view, 'Fast speed'), '3');
    assert.equal(await number('Fast speed'), 3);
    assert.notEqual(await curve.getAttribute('d'), before, 'the curve redraws as the row changes');
    assert.equal(await number('Fast speed, up/down'), 2, 'one axis row leaves the other alone');

    // ---- Changing the curve brings its own shape handle and rows.
    await view.locator('button[role="radio"][data-value="NATURAL"]').click();
    await page.waitForTimeout(200);
    assert.equal(await curve.getAttribute('data-curve'), 'NATURAL');
    assert.equal(await handles(), 'min,max,shape');
    await top(page).locator('[role="tab"]').filter({ hasText: /^Shape/ }).click();
    await typeValue(valueRow(view, 'Half-way speed'), '20');
    const halfBefore = await number('Half-way speed');
    await drag('shape', 90, 0);
    const halfAfter = await number('Half-way speed');
    assert.ok(halfAfter > halfBefore, `dragging the half-way point right raises it (${halfBefore} -> ${halfAfter})`);

    // ---- Dragging the slow corner up moves X, and Y with it in proportion.
    await top(page).locator('[role="tab"]').filter({ hasText: /^Speeds/ }).click();
    await typeValue(valueRow(view, 'Slow speed'), '1.2');
    await typeValue(valueRow(view, 'Slow speed, up/down'), '1.2');
    await drag('min', 0, -50);
    const minX = await number('Slow speed');
    const minY = await number('Slow speed, up/down');
    assert.ok(minX > 1.2, `the slow corner lifts the minimum (${minX})`);
    assert.equal(minY, minX, 'equal axes stay equal: both halves of the pair are written');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    // ---- While holding ZL, the held curve is its own.
    await page.locator('[data-gyro-front] section').first().locator('button').last().click();
    await page.locator('[data-while-holding="gyro"]').click();
    await top(page).locator('[data-held="ZL"]').click();
    await openRow(page, 'Advanced');
    const held = top(page).locator('[data-speed-advanced]');
    assert.equal(parseFloat(await valueText(valueRow(held, 'Slow speed'))), 0.5, 'the held values show');
    await typeValue(valueRow(held, 'Fast speed'), '1.5');
    for (let n = 0; n < 4; n++) await page.keyboard.press('Escape');

    // ---- The trackpad's curve stays in the full-window editor; RB no longer switches it.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:accel-curve', { detail: 'touchpad' })));
    const pad = page.locator('.curve-view');
    await pad.waitFor();
    assert.equal(await pad.getAttribute('data-side'), 'touchpad');
    await pad.locator('.curve-view__readout').getByText('420 px/s', { exact: true }).first().waitFor();
    await page.evaluate(() => (document.activeElement ?? document.body).dispatchEvent(new CustomEvent('jsm:pad', { detail: { button: 'RB' }, bubbles: true, cancelable: true })));
    await page.waitForTimeout(250);
    assert.equal(await pad.getAttribute('data-side'), 'touchpad', 'the bumpers are tabs (V1), not inputs');
    const padRow = label => pad.locator('button.summary-row').filter({ has: page.locator('.summary-row__label').getByText(label, { exact: true }) }).first();
    await padRow('Gain when fast').focus(); await page.keyboard.type('2'); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
    assert.equal((await padRow('Gain when fast').locator('.summary-row__value').textContent()).trim(), '2.00×');
    // Its Gyro chip hands over to the gyro's own page.
    await pad.getByRole('tab').filter({ hasText: /Gyro/ }).click();
    await pad.waitFor({ state: 'detached' });
    await top(page).locator('[data-speed-advanced]').waitFor();
    for (let n = 0; n < 2; n++) await page.keyboard.press('Escape');

    // ---- What was written.
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => /TOUCHPAD_ACCEL_MAX_GAIN/.test(window.__lastSaved));
    const saved = await page.evaluate(() => window.__lastSaved);
    assert.equal(eff(saved, 'MAX_GYRO_SENS'), '3 2', 'the X row wrote X only');
    assert.equal(eff(saved, 'ACCEL_CURVE'), 'NATURAL');
    assert.equal(eff(saved, 'ACCEL_NATURAL_VHALF'), String(halfAfter), 'the dragged half-way point was written');
    assert.equal(eff(saved, 'MIN_GYRO_SENS'), String(minX), 'the dragged corner wrote both axes as one');
    assert.equal(eff(saved, 'ZL,MAX_GYRO_SENS'), '1.5', 'the held editor wrote the held key');
    assert.equal(eff(saved, 'ZL,MIN_GYRO_SENS'), '0.5 0.5', 'and left the held minimum alone');
    assert.equal(eff(saved, 'TOUCHPAD_ACCEL_MAX_GAIN'), '2');
    assert.deepEqual(errors, []);
    console.log('PASS: Speed ▸ Advanced rows and handles rewrite the gyro curve live (both axes on a drag), the held editor writes held keys, the trackpad editor keeps its curve without LB/RB, and its Gyro chip opens the gyro page');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
