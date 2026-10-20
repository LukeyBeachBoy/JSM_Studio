const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fixture = [
  'RESET_MAPPINGS', 'VIRTUAL_CONTROLLER = XBOX',
  'LEFT_TOUCHPAD_MODE = MOUSE', 'RIGHT_TOUCHPAD_MODE = MOUSE',
  'RIGHT_TOUCHPAD_SENS = 1.2', 'RIGHT_TOUCHPAD_AREA_FIT = UNIFORM',
  'LSR,RIGHT_TOUCHPAD_MODE = MOUSE_AREA',
  'LEFT_STICK_MODE = NO_MOUSE', 'RIGHT_STICK_MODE = AIM', 'L,RIGHT_STICK_MODE = FLICK',
  'ZL_MODE = NO_FULL', 'ZR_MODE = NO_FULL', 'R,ZL_MODE = NO_SKIP',
  'S = SPACE', 'MISC2 = MMOUSE',
].join('\n');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(12000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(text => {
      window.__saved = text;
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Parity', path: 'profiles-library/Parity.txt', content: window.__saved }),
        listLibraryProfiles: async () => ['Parity'],
        loadLibraryProfile: async () => ({ name: 'Parity', path: 'profiles-library/Parity.txt', content: window.__saved }),
        saveLibraryProfile: async (name, content) => { window.__saved = content; return { name }; },
        applyProfile: async path => ({ path, mappingEnabled: true }),
        getRuntimeMappingState: async () => ({ mappingEnabled: true, autoloadEnabled: true, controllerNavEnabled: false, firmwareSoundPromptDone: true }),
      };
      window.telemetry = { onSample: cb => {
        const emit = () => cb({ activeProfile: 'profiles-library/Parity.txt', devices: [{ handle: 1, type: 24, supportedButtons: 8589934591,
          status: { buttons: 0, leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 }, gyro: { x: 0, y: 0, z: 0 }, leftPad: { x: 0, y: 0, touched: false }, rightPad: { x: 0, y: 0, touched: false } } }] });
        emit(); const timer = setInterval(emit, 150); return () => clearInterval(timer);
      } };
    }, fixture);
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
    await page.locator('[data-home-continue]').click();
    await page.getByRole('button', { name: 'Trackpads', exact: true }).click();
    await page.locator('.section-item').filter({ hasText: 'Right pad' }).click();
    const normal = page.locator('[data-trackpad-page="right"]');
    await normal.locator('[data-mode-shift-entry]').waitFor();
    const modeValues = await normal.locator('[role="radio"][data-value]').evaluateAll(nodes => nodes.map(node => node.dataset.value));
    await normal.locator('[data-mode-shift-entry]').click();
    await page.locator('[data-modeshift="LSR"]').click();
    const shift = page.locator('[data-modeshift-editor="LSR"]');
    const shifted = shift.locator('[data-trackpad-page="right"]');
    assert.deepEqual(await shifted.locator('[role="radio"][data-value]').evaluateAll(nodes => nodes.map(node => node.dataset.value)), modeValues, 'shifted pad uses the same mode cards');
    await shifted.getByRole('heading', { name: 'Draw your screen area' }).waitFor();
    await page.waitForTimeout(250);
    await page.screenshot({ path: 'tools/desktop-config-20261020/shared-shift-area-1440.png' });
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.screenshot({ path: 'tools/desktop-config-20261020/shared-shift-area-1024.png' });
    assert.ok(await shifted.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'shift editor must not overflow at 1024px');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await shifted.getByRole('button', { name: /^Screen area/ }).click();
    await page.waitForTimeout(450);
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => /LSR,RIGHT_TOUCHPAD_AREA\s*=/.test(window.__saved));
    let saved = await page.evaluate(() => window.__saved);
    assert.match(saved, /LSR,RIGHT_TOUCHPAD_AREA\s*=\s*0\.3(?:000)?\s+0\.9/);
    assert.doesNotMatch(saved, /^(?:# @controller type-\d+ )?RIGHT_TOUCHPAD_AREA\s*=/m, 'a shifted pick must not alter the normal pad');
    assert.doesNotMatch(saved, /^(?:# @controller type-\d+ )?TOUCHPAD_AREA\s*=/m, 'the base listener must ignore a shifted picker route');
    await shifted.getByRole('radiogroup', { name: '2 · Fit the pad to your box', exact: true }).focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => /LSR,RIGHT_TOUCHPAD_AREA_FIT\s*=\s*STRETCH/.test(window.__saved));
    assert.match(await page.evaluate(() => window.__saved), /^RIGHT_TOUCHPAD_AREA_FIT = UNIFORM$/m, 'normal fit survives a shifted Stretch choice');
    await shifted.getByRole('radio', { name: /^Mouse\s/ }).first().click();
    await shifted.getByRole('button', { name: /^Fine-tune/ }).click();
    await page.locator('[data-trackpad-fine-tune-page="right"]').waitFor();
    await page.getByRole('button', { name: /^Glide/ }).click();
    await page.getByText('How quickly smoothing reacts to speed', { exact: true }).waitFor();
    assert.equal(await page.getByText('How soon flicks escape', { exact: true }).count(), 0);
    await page.screenshot({ path: 'tools/desktop-config-20261020/shared-shift-glide-1440.png' });
    // Close tuning, the shift editor and its list; the original pad stays Mouse.
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await normal.locator('[data-mode-shift-entry]').waitFor();
    assert.equal(await normal.locator('[role="radio"][data-current="true"]').getAttribute('data-value'), 'MOUSE');
    await normal.locator('[role=radio][data-value=MOUSE_AREA]').click();
    await normal.getByRole('button', { name: /^Screen area/ }).click();
    await page.waitForTimeout(450); await page.keyboard.press('Control+s');
    await page.waitForFunction(() => /^(?:# @controller type-\d+ )?RIGHT_TOUCHPAD_AREA =/m.test(window.__saved));
    saved = await page.evaluate(() => window.__saved);
    assert.match(saved, /LSR,RIGHT_TOUCHPAD_AREA\s*=/, 'normal drawing preserves the shifted area');
    await page.getByRole('button', { name: 'Sticks', exact: true }).click();
    await page.locator('.section-item').filter({ hasText: 'Right stick' }).click();
    await page.locator('[data-stick-page="right"] [data-mode-shift-entry]').click();
    await page.locator('[data-modeshift="L"]').click();
    const stickShift = page.locator('[data-modeshift-editor="L"] [data-stick-page="right"]');
    await stickShift.waitFor();
    await stickShift.locator('[data-stick-fine-tune-row]').click();
    const setNumber = async (label, value) => {
      const row = page.locator('[role="slider"]').filter({ hasText: new RegExp(`^${label}`) }).last();
      await row.locator('[data-clickable=true]').click();
      await page.getByRole('textbox', { name: label, exact: true }).fill(value);
      await page.getByRole('textbox', { name: label, exact: true }).press('Enter');
    };
    await setNumber('Flick time', '0.23');
    await page.locator('button[data-group="snap"]').click();
    await page.getByRole('radiogroup', { name: 'Snap to', exact: true }).focus(); await page.keyboard.press('ArrowRight');
    await setNumber('Snap strength', '65');
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => /L,FLICK_TIME = 0.23/.test(window.__saved) && /L,FLICK_SNAP_STRENGTH = 0.65/.test(window.__saved));
    assert.doesNotMatch(await page.evaluate(() => window.__saved), /^FLICK_TIME =/m, 'shifted stick tuning must leave default tuning unchanged');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Triggers', exact: true }).click();
    await page.locator('[data-trigger-page="left"] [data-mode-shift-entry]').click();
    await page.locator('[data-modeshift="R"]').click();
    const triggerShift = page.locator('[data-modeshift-editor="R"] [data-trigger-page="left"]');
    await triggerShift.waitFor();
    await triggerShift.locator('[role="radio"][data-value="MUST_SKIP"]').click();
    await triggerShift.getByRole('button', { name: /^Fine-tune/ }).click();
    await setNumber('Half-press point', '35');
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => /R,ZL_MODE = MUST_SKIP/.test(window.__saved) && /R,TRIGGER_THRESHOLD = 0.35/.test(window.__saved));
    assert.match(await page.evaluate(() => window.__saved), /^ZL_MODE = NO_FULL$/m);
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Sticks', exact: true }).click();
    await page.locator('[data-stick-page="right"] [data-mode-shift-entry]').click();
    await page.locator('[data-modeshift="L"]').click();
    await page.locator('[data-modeshift-editor="L"] [role="radio"][data-value="WHEEL"]').click();
    await page.locator('[data-wheel-new]').click();
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => /L,RIGHT_STICK_MODE = NO_MOUSE/.test(window.__saved) && /VIRTUAL_MENUS = HEX:/.test(window.__saved));
    assert.match(await page.evaluate(() => window.__saved), /^RIGHT_STICK_MODE = AIM$/m, 'creating a shifted wheel preserves the normal stick');
    assert.deepEqual(errors, []);
    console.log('PASS: visible mode shifts; shared pad/stick/trigger editors; scoped Draw, fit, and full fine-tuning');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
