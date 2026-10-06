// Native touch/click policies, with simulated Steam Controller telemetry.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const PROFILE = ['RESET_MAPPINGS', 'LEFT_TOUCHPAD_MODE = MOUSE', 'RIGHT_TOUCHPAD_MODE = GRID_AND_STICK',
  'TOUCHPAD_HAPTIC_INTENSITY = 25', 'TOUCHPAD_CLICK_HAPTIC_EFFECT = SWEEP', 'TOUCHPAD_RELEASE_HAPTIC_INTENSITY = 10',
  'MISC5,LEFT_TOUCHPAD_HAPTICS = OFF', 'UNKNOWN_FEEDBACK = exact'].join('\n') + '\n';
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(profile => {
      const profiles = { Wardogs: localStorage.getItem('pad-stage-fixture') ?? profile };
      window.__lastSaved = '';
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Wardogs', path: 'profiles-library/Wardogs.txt', content: profiles.Wardogs }),
        listLibraryProfiles: async () => Object.keys(profiles),
        loadLibraryProfile: async name => ({ name, content: profiles[name] }),
        saveLibraryProfile: async (name, content) => { window.__lastSaved = content; profiles[name] = content; localStorage.setItem('pad-stage-fixture', content); return { name } },
        applyProfile: async path => ({ path, mappingEnabled: true }),
      };
      window.telemetry = { onSample: cb => {
        const emit = () => cb({ activeProfile: 'profiles-library/Wardogs.txt', devices: [{ handle: 1, type: 24, supportedButtons: 8589934591, status: { buttons: 0, leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 }, gyro: { x: 0, y: 0, z: 0 }, leftPad: { x: 0, y: 0, touched: false }, rightPad: { x: 0, y: 0, touched: false } } }] });
        emit(); const timer = setInterval(emit, 100); return () => clearInterval(timer);
      } };
    }, PROFILE);
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
    await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {});
    // The app opens on Home (console refinement 2a); these checks start in the editing shell.
    await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {})
    page.setDefaultTimeout(10000);

    const row = (scope, label) => scope.locator('.summary-row').filter({ has: page.locator('.summary-row__label', { hasText: label }) });



    await page.getByRole('button', { name: 'Trackpads', exact: true }).click();
    const open = async side => {
      await row(page.locator(`#trackpad-${side}`), /^Feedback$/).first().click();
      const sheet = page.getByRole('dialog', { name: `${side === 'left' ? 'Left' : 'Right'} pad · Feedback`, exact: true });
      await sheet.waitFor(); return sheet;
    };
    const adjust = async (choice, direction, count = 1) => {
      await choice.focus(); await page.keyboard.press('Enter');
      assert.equal(await choice.getAttribute('data-adjusting'), 'true');
      for (let i = 0; i < count; i++) await page.keyboard.press(direction);
      await page.keyboard.press('Enter');
    };
    let sheet = await open('left');
    assert.equal(await row(sheet, /^Separate feedback$/).getAttribute('aria-pressed'), 'false');
    await row(sheet, /^Separate feedback$/).click();
    const movement = sheet.locator('.row-group').filter({ has: page.getByText('Movement ticks', { exact: true }) });
    assert.equal(await row(movement, /^Strength$/).locator('.summary-row__value').innerText(), '25%');
    await adjust(row(movement, /^Strength$/), 'ArrowRight', 2);
    await adjust(row(movement, /^Tick spacing$/), 'ArrowRight', 2);
    await page.keyboard.press('Escape'); await sheet.waitFor({ state: 'detached' });
    sheet = await open('right');
    await row(sheet, /^Separate feedback$/).click();
    assert.equal(await sheet.getByText('Movement ticks', { exact: true }).count(), 0, 'menu mode hides mouse-only movement feedback');
    await row(sheet, /^On click$/).click();
    const strength = row(sheet, /^Strength$/); // only this event is expanded
    await adjust(strength, 'ArrowRight', 8);
    assert.equal(await strength.locator('.summary-row__value').innerText(), '40%');
    assert.equal(await row(sheet, /^Effect$/).locator('.summary-row__value').innerText(), 'Sweep');
    await sheet.screenshot({ path: 'C:/Users/luker/code/JSM_Studio/tmp/parity-verification/pad-feedback-right.png' });
    await row(sheet, /^On click$/).click(); // collapse the nested editor before backing out of the sheet

    await page.keyboard.press('Escape'); await sheet.waitFor({ state: 'detached' });
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => /RIGHT_TOUCHPAD_CLICK_HAPTIC_INTENSITY = 40/.test(window.__lastSaved));
    let saved = await page.evaluate(() => window.__lastSaved);
    assert.match(saved, /^LEFT_TOUCHPAD_HAPTIC_INTENSITY = 35$/m);
    assert.match(saved, /^LEFT_TOUCHPAD_HAPTIC_INTERVAL = 300$/m);
    assert.match(saved, /^RIGHT_TOUCHPAD_HAPTIC_INTENSITY = 25$/m);
    assert.match(saved, /^TOUCHPAD_HAPTIC_INTENSITY = 25$/m);
    assert.match(saved, /^UNKNOWN_FEEDBACK = exact$/m);
    // Same controls in a held-input pad, with native chorded values.
    const shift = page.locator('#trackpad-left details[data-modeshift="MISC5"]');
    await shift.locator(':scope > summary').click();
    await row(shift, /^Feedback$/).click();
    sheet = page.getByRole('dialog', { name: 'Left pad · Feedback', exact: true });
    await sheet.waitFor();
    assert.equal(await row(sheet, /^Separate feedback$/).getAttribute('aria-pressed'), 'false');
    await row(sheet, /^Separate feedback$/).click();
    await adjust(row(sheet, /^Strength$/), 'ArrowLeft');
    await page.keyboard.press('Escape'); await sheet.waitFor({ state: 'detached' });
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => /MISC5,LEFT_TOUCHPAD_HAPTIC_INTENSITY = 30/.test(window.__lastSaved));
    saved = await page.evaluate(() => window.__lastSaved);
    assert.match(saved, /^LEFT_TOUCHPAD_HAPTIC_INTENSITY = 35$/m);
    await page.reload();
    await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {});
    await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {});
    await page.getByRole('button', { name: 'Trackpads', exact: true }).click();
    sheet = await open('left');
    await row(sheet, /^Strength$/).locator('.summary-row__value').filter({ hasText: /^35%$/ }).waitFor();
    await row(sheet, /^Separate feedback$/).click();
    await page.keyboard.press('Escape'); await sheet.waitFor({ state: 'detached' });
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => /LEFT_TOUCHPAD_HAPTICS = OFF/.test(window.__lastSaved));
    saved = await page.evaluate(() => window.__lastSaved);
    assert.match(saved, /^LEFT_TOUCHPAD_HAPTIC_INTENSITY = 35$/m, 'turning custom feedback off retains latent tuning');
    assert.match(saved, /^RIGHT_TOUCHPAD_HAPTICS = ON$/m);
    assert.deepEqual(errors, []);
    console.log('PASS: independent pad feedback, shared opt-in defaults, mode-specific controls, keyboard adjustment, held-input edits, saved native settings and reload');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
