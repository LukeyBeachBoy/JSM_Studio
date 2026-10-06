// A binding card has only Commands and, optionally, Modeshifts (TODO-54,
// TODO-55): "LED while held", a layer action and a sound are command rows,
// added from the Add command picker, and each edits its parameter in the
// row's settings sheet -- the colour and brightness, the layer and its verb,
// the sound and its volume. The file keeps the formats it always had:
// `N,LIGHT_BAR = x…`, `N,LED_BRIGHTNESS = n`, `# @layer-action N = toggle aim`
// and `"PLAY_SOUND n -12"`. Removing a row removes its lines.
// Isolated renderer check; mocks never invoke a physical controller or runtime.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const PROFILE = ['RESET_MAPPINGS', 'N = SPACE', 'L = X_LB', 'R = X_RB', 'VIRTUAL_CONTROLLER = XBOX', '# @layer '+JSON.stringify({id:'aim',name:'Aim',overrides:{S:'X_A\\ \"LIGHT_BAR = x34c759\"\\', '# @label S::S%3ALIGHT_BAR%20%3D%20X34C759::0':'Driving light'}}), ''].join('\n');
const ARTIFACTS = path.resolve(__dirname, '../tmp/feedback-binding-polish');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.setDefaultTimeout(15000);
    await page.addInitScript(profile => {
      const profiles = { Desktop: profile };
      window.__lastSaved = '';
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Desktop', path: 'profiles-library/Desktop.txt', content: profiles.Desktop }),
        readConfigFile: async () => '',
        listLibraryProfiles: async () => Object.keys(profiles),
        loadLibraryProfile: async name => ({ name, content: profiles[name] }),
        saveLibraryProfile: async (name, content) => { window.__lastSaved = content; profiles[name] = content; return { name } },
        applyProfile: async path => ({ path, mappingEnabled: true }),
      };
      window.telemetry = { onSample: cb => {
        const emit = () => cb({ console: 'Mapper ready', activeProfile: 'profiles-library/Desktop.txt', devices: [{ handle: 1, type: 24, supportedButtons: 8589934591, status: { buttons: 0, leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 }, gyro: { x: 0, y: 0, z: 0 }, leftPad: { x: 0, y: 0, touched: false }, rightPad: { x: 0, y: 0, touched: false } } }] });
        emit(); const timer = setInterval(emit, 150); return () => clearInterval(timer);
      } };
    }, PROFILE);
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
    // A Steam Controller's first connection asks about its power-on sound.
    await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {});
    await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {});
    await page.locator('.profile-chip').waitFor();
    await page.getByRole('button', { name: 'Buttons', exact: true }).click();
    fs.mkdirSync(ARTIFACTS, { recursive: true });


    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    await page.getByRole('button', { name: /Controller light/ }).click();
    const light = page.getByRole('dialog', { name: 'Controller light', exact: true });
    await light.waitFor();
    await light.locator('[data-modal-close]').click();
    await page.getByRole('button', { name: 'Buttons', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: /Controller light/ }).count(), 0);
    const bump = page.locator('details[data-input-command="L"] > summary');
    await bump.scrollIntoViewIfNeeded();
    const cap = bump.locator('[class*=keycapKey]');
    assert.ok(await cap.evaluate(el => el.scrollWidth <= el.clientWidth), 'bumper output fits without ellipsis');
    const rowBox = await bump.boundingBox();
    const capBox = await cap.locator('..').boundingBox();
    assert.ok(Math.abs((capBox.y + capBox.height / 2) - (rowBox.y + rowBox.height / 2)) < 2, 'output is vertically centered');
    await page.screenshot({ path: path.join(ARTIFACTS, 'bumpers.png') });
    for (const tabName of ['Triggers', 'Trackpads']) {
      await page.getByRole('button', { name: tabName, exact: true }).click();
      const split = page.locator('[class*="_split_"]').first();
      await split.waitFor();
      const positions = await split.locator(':scope > section').evaluateAll(els => els.map(el => ({ x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y })));
      assert.ok(positions.length >= 2 && positions[0].x === positions[1].x && positions[1].y > positions[0].y, tabName + ' stacks hands');
    }
    await page.getByRole('button', { name: 'Layers', exact: true }).click();
    await page.locator('.layer-row').filter({ hasText: 'Aim' }).click();
    const overrides = page.locator('#layers-overrides');
    assert.equal(await overrides.locator('.layer-override').count(), 1, 'names are merged, not separate overrides');
    assert.match(await overrides.innerText(), /Driving light: Change LED color to/);
    assert.equal(await overrides.locator('[role="img"]').count(), 1, 'color preview');
    assert.ok(!(await overrides.innerText()).includes('x34c759'), 'raw binding syntax is hidden');
    assert.equal(await page.locator('.layer-migration').count(), 0, 'migration is hidden without existing modeshifts');
    await page.evaluate(() => document.activeElement?.blur());
    await overrides.locator('.layer-override').evaluate(el => el.scrollIntoView({block: 'center'}));
    await overrides.screenshot({ path: path.join(ARTIFACTS, 'layer-readable.png') });
    await page.getByRole('button', { name: 'Buttons', exact: true }).click();
    const inherited = page.locator('details[data-input-command="L"] > summary');
    const dot = await inherited.locator('.origin-marker__dot').boundingBox();
    const originText = await inherited.locator('.origin-marker small').boundingBox();
    assert.ok(dot && originText && Math.abs(dot.y + dot.height / 2 - originText.y - originText.height / 2) < 2, 'origin dot and text centers match');
    await page.locator('details[data-input-command="N"] > summary').click();
    await page.locator('details[data-input-command="N"][open]').getByRole('button', { name: 'Add command' }).click();
    const picker = page.getByRole('dialog', { name: 'Choose an action' });
    await picker.locator('.action-tab').filter({ hasText: 'Layers' }).click();
    await picker.getByRole('button', { name: /^Aim/ }).focus();
    const detail = picker.locator('.picker-detail');
    assert.ok(await detail.evaluate(el => el.scrollWidth <= el.clientWidth), 'layer preview does not overflow');
    await page.screenshot({ path: path.join(ARTIFACTS, 'layer-picker.png') });
    await picker.locator('.action-tab').filter({ hasText: 'JSM' }).click();
    await picker.getByRole('button', { name: 'Gyro control', exact: true }).click();
    await picker.getByRole('button', { name: 'Disable gyro (all)', exact: true }).focus();
    assert.ok(await detail.evaluate(el => el.scrollWidth <= el.clientWidth), 'long command description does not overflow');
    await page.screenshot({ path: path.join(ARTIFACTS, 'jsm-picker.png') });
    assert.deepEqual(errors, []);
    console.log('PASS: controller light on Overview, full bumper output, stacked triggers/trackpads, merged names and color previews');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
