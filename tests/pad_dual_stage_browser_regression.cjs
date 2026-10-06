// Native touch/click policies, with simulated Steam Controller telemetry.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const PROFILE = ['RESET_MAPPINGS', 'LEFT_TOUCHPAD_MODE = MOUSE', 'RIGHT_TOUCHPAD_MODE = MOUSE',
  'LEFT_TOUCHPAD_DUAL_STAGE_MODE = NO_SKIP', 'RIGHT_TOUCHPAD_DUAL_STAGE_MODE = NO_SKIP',
  'MISC2,RIGHT_TOUCHPAD_DUAL_STAGE_MODE = MAY_SKIP', '# untouched odd line', 'UNRECOGNIZED_PAD_FEATURE = keep-exact'].join('\n') + '\n';
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
      await row(page.locator(`#trackpad-${side}`), /^Click$/).first().click();
      const sheet = page.getByRole('dialog', { name: `${side === 'left' ? 'Left' : 'Right'} pad · Click`, exact: true });
      await sheet.waitFor();
      return { sheet, choice: sheet.getByRole('combobox', { name: 'Touch and click dual-stage mode', exact: true }) };
    };
    const choose = async (choice, label) => {
      await choice.focus(); await page.keyboard.press('Enter');
      await page.getByRole('option', { name: label, exact: true }).click();
    };
    let { sheet, choice } = await open('left');
    assert.equal(await choice.innerText(), 'Touch and click');
    await choice.click();
    assert.equal(await page.getByRole('option').count(), 7);
    for (const option of await page.getByRole('option').all()) {
      await option.hover();
      const help = page.locator('[aria-live="polite"]').filter({ has: page.locator('strong') });
      await help.waitFor();
      assert.ok((await help.locator('p').innerText()).length > 30);
      assert.doesNotMatch(await help.innerText(), /Soft press|full.pull/i);
    }
    await page.screenshot({ path: 'tmp/choice-dropdown-dual-stage.png' });
    await page.keyboard.press('Escape');
    assert.equal(await choice.innerText(), 'Touch and click');
    // Keyboard/controller-style list navigation previews help without writing.
    await choice.focus(); await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    assert.equal(await choice.innerText(), 'Touch and click');
    await choose(choice, 'Touch only');
    assert.equal(await choice.innerText(), 'Touch only');
    await page.keyboard.press('Escape'); await sheet.waitFor({ state: 'detached' });
    ({ sheet, choice } = await open('right'));
    await choose(choice, 'Click replaces touch');
    assert.equal(await choice.innerText(), 'Click replaces touch');
    await page.keyboard.press('Escape'); await sheet.waitFor({ state: 'detached' });
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => /RIGHT_TOUCHPAD_DUAL_STAGE_MODE = NO_SKIP_EXCLUSIVE/.test(window.__lastSaved));
    let saved = await page.evaluate(() => window.__lastSaved);
    assert.match(saved, /^LEFT_TOUCHPAD_DUAL_STAGE_MODE = NO_FULL$/m);
    assert.match(saved, /^MISC2,RIGHT_TOUCHPAD_DUAL_STAGE_MODE = MAY_SKIP$/m);
    assert.match(saved, /^UNRECOGNIZED_PAD_FEATURE = keep-exact$/m);
    // A held-input pad has the same control even when it remains a mouse.
    const shift = page.locator('#trackpad-right details[data-modeshift="MISC2"]');
    await shift.locator(':scope > summary').click();
    await row(shift, /^Click$/).click();
    sheet = page.getByRole('dialog').filter({ has: page.getByRole('combobox', { name: 'Touch and click dual-stage mode', exact: true }) });
    await sheet.waitFor(); choice = sheet.getByRole('combobox', { name: 'Touch and click dual-stage mode', exact: true });
    assert.equal(await choice.innerText(), 'Quick click skips delayed touch');
    await choose(choice, 'Quick click skips immediate touch');
    assert.equal(await choice.innerText(), 'Quick click skips immediate touch');
    await page.keyboard.press('Escape'); await sheet.waitFor({ state: 'detached' });
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => /MISC2,RIGHT_TOUCHPAD_DUAL_STAGE_MODE = MAY_SKIP_R/.test(window.__lastSaved));
    saved = await page.evaluate(() => window.__lastSaved);
    assert.match(saved, /^LEFT_TOUCHPAD_DUAL_STAGE_MODE = NO_FULL$/m);
    assert.match(saved, /^RIGHT_TOUCHPAD_DUAL_STAGE_MODE = NO_SKIP_EXCLUSIVE$/m);
    await page.reload();
    await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {});
    await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {});
    await page.getByRole('button', { name: 'Trackpads', exact: true }).click();
    ({ sheet, choice } = await open('right'));
    await choice.filter({ hasText: /^Click replaces touch$/ }).waitFor();
    assert.equal(await choice.innerText(), 'Click replaces touch');
    assert.deepEqual(errors, []);
    console.log('PASS: both mouse pads expose friendly dual-stage controls; dropdown descriptions, cancel without changes, direct selection, independent save/reload, held-input parity and unknown config preservation');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
