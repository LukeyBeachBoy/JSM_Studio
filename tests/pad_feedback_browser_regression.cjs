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



    // Console v2 (P4, TrackpadsFeel): Trackpads ▸ Fine-tune ▸ Feel. Each pad can
    // have its own feel; Touch, Click and Release each pick a strength and effect.
    await page.getByRole('button', { name: 'Trackpads', exact: true }).click();
    const open = async side => {
      await page.locator('.section-item').filter({ hasText: side === 'left' ? 'Left pad' : 'Right pad' }).click();
      await page.locator(`#trackpad-${side} [data-trackpad-fine-tune]`).click();
      const sub = page.locator('[data-subpage]');
      await sub.locator('[data-group="feel"]').click();
      await sub.locator('[data-feel="touch"]').waitFor();
      return sub;
    };
    const close = async sub => { await sub.locator('[data-modal-close]').evaluate(button => button.click()); await sub.waitFor({ state: 'detached' }); };
    const own = (sub, name) => row(sub, new RegExp(`^${name} has its own feel`));
    const segment = (sub, column, label) => sub.locator(`[data-feel="${column}"] [role="radiogroup"][aria-label="${label}"]`);
    const chosen = async (sub, column, label) => (await segment(sub, column, label).locator('[data-current="true"]').innerText()).trim();
    const step = async (target, key, count = 1) => { await target.focus(); for (let i = 0; i < count; i++) await page.keyboard.press(key); };
    // A switch row (SummaryRow toggle): A adjusts, ◂ ▸ choose Off / On, A keeps.
    const isOn = async target => (await target.locator('.summary-row__value').innerText()).trim() === 'On';
    const flip = async target => { const on = await isOn(target); await target.focus(); await page.keyboard.press('Enter'); await page.keyboard.press(on ? 'ArrowLeft' : 'ArrowRight'); await page.keyboard.press('Enter'); };
    let sheet = await open('left');
    assert.equal(await isOn(own(sheet, 'Left pad')), false);
    await flip(own(sheet, 'Left pad'));
    assert.equal(await chosen(sheet, 'touch', 'Strength'), 'Light', 'its own feel starts from the shared 25%');
    await step(segment(sheet, 'touch', 'Strength'), 'ArrowRight');
    await step(sheet.locator('[data-feel="touch"] [role="slider"]').filter({ hasText: 'Tick every' }), 'ArrowRight', 2);
    await close(sheet);
    sheet = await open('right');
    await flip(own(sheet, 'Right pad'));
    assert.match(await sheet.locator('[data-feel="touch"]').innerText(), /Only while the pad moves the mouse/, 'a menu pad is told movement ticks are for mouse mode');
    await step(segment(sheet, 'click', 'Strength'), 'ArrowRight', 2);
    assert.equal(await chosen(sheet, 'click', 'Strength'), 'Medium');
    assert.equal(await chosen(sheet, 'click', 'Effect'), 'Sweep');
    await sheet.screenshot({ path: 'C:/Users/luker/code/JSM_Studio/tmp/parity-verification/pad-feedback-right.png' });
    await close(sheet);
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => /RIGHT_TOUCHPAD_CLICK_HAPTIC_INTENSITY = 50/.test(window.__lastSaved));
    let saved = await page.evaluate(() => window.__lastSaved);
    assert.match(saved, /^(?:# @controller type-\d+ )?LEFT_TOUCHPAD_HAPTIC_INTENSITY = 50$/m);
    assert.match(saved, /^(?:# @controller type-\d+ )?LEFT_TOUCHPAD_HAPTIC_INTERVAL = 260$/m);
    assert.match(saved, /^(?:# @controller type-\d+ )?RIGHT_TOUCHPAD_HAPTIC_INTENSITY = 25$/m);
    assert.match(saved, /^(?:# @controller type-\d+ )?TOUCHPAD_HAPTIC_INTENSITY = 25$/m);
    assert.match(saved, /^(?:# @controller type-\d+ )?UNKNOWN_FEEDBACK = exact$/m);
    // Same controls in a held-input pad, with native chorded values (While holding…).
    await page.locator('.section-item').filter({ hasText: 'Left pad' }).click();
    await page.locator('#trackpad-left [role="radio"]').first().focus();
    await page.keyboard.press('y');
    await page.locator('[data-more-item="holding"]').click();
    // Each shift is a row in the "while holding" list that opens its own editor page.
    await page.locator('[data-subpage] [data-modeshift-list] [data-modeshift="MISC5"]').click();
    const shift = page.locator('[data-modeshift-editor="MISC5"]');
    await row(shift, /^Feedback/).click();
    const shiftSheet = page.getByRole('dialog', { name: /^Left (pad|trackpad) · Feedback$/ });
    await shiftSheet.waitFor();
    assert.equal(await isOn(row(shiftSheet, /^Separate feedback/)), false);
    await flip(row(shiftSheet, /^Separate feedback/));
    await row(shiftSheet, /^Strength/).focus(); await page.keyboard.press('Enter'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Enter');
    await page.keyboard.press('Escape'); await shiftSheet.waitFor({ state: 'detached' });
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => /MISC5,LEFT_TOUCHPAD_HAPTIC_INTENSITY = 45/.test(window.__lastSaved));
    saved = await page.evaluate(() => window.__lastSaved);
    assert.match(saved, /^(?:# @controller type-\d+ )?LEFT_TOUCHPAD_HAPTIC_INTENSITY = 50$/m);
    await page.reload();
    await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {});
    await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {});
    await page.getByRole('button', { name: 'Trackpads', exact: true }).click();
    sheet = await open('left');
    assert.equal(await chosen(sheet, 'touch', 'Strength'), 'Medium');
    await flip(own(sheet, 'Left pad'));
    await close(sheet);
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => /LEFT_TOUCHPAD_HAPTICS = OFF/.test(window.__lastSaved));
    saved = await page.evaluate(() => window.__lastSaved);
    assert.match(saved, /^(?:# @controller type-\d+ )?LEFT_TOUCHPAD_HAPTIC_INTENSITY = 50$/m, 'turning custom feedback off retains latent tuning');
    assert.match(saved, /^(?:# @controller type-\d+ )?RIGHT_TOUCHPAD_HAPTICS = ON$/m);
    assert.deepEqual(errors, []);
    console.log('PASS: independent pad feedback, shared opt-in defaults, mode-specific controls, keyboard adjustment, held-input edits, saved native settings and reload');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
