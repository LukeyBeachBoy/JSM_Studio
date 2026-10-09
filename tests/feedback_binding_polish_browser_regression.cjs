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


    // Layout ▸ Y quick menu ▸ Controller light & sounds (QuickMenu.dc.html), not
    // a row on the page itself.
    await page.getByRole('button', { name: 'Layout', exact: true }).click();
    assert.equal(await page.locator('.main-pane').getByRole('button', { name: /^Controller light/ }).count(), 0, 'no light row on the Layout page itself');
    await page.locator('[data-overview-slot]').first().focus();
    await page.keyboard.press('y');
    await page.getByRole('button', { name: /^Controller light & sounds/ }).click();
    const light = page.getByRole('dialog', { name: /Controller light/ }).last();
    await light.waitFor();
    await page.keyboard.press('Escape');
    await light.waitFor({ state: 'detached' }).catch(() => {});
    await page.getByRole('button', { name: 'Buttons', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: /^Controller light/ }).count(), 0);
    const bump = page.locator('details[data-input-command="L"] > summary');
    await bump.scrollIntoViewIfNeeded();
    const cap = bump.locator('[data-row-output]').first();
    assert.ok(await cap.evaluate(el => el.scrollWidth <= el.clientWidth), 'bumper output fits without ellipsis');
    const rowBox = await bump.boundingBox();
    const capBox = await cap.locator('..').boundingBox();
    assert.ok(Math.abs((capBox.y + capBox.height / 2) - (rowBox.y + rowBox.height / 2)) < 2, 'output is vertically centered');
    await page.screenshot({ path: path.join(ARTIFACTS, 'bumpers.png') });
    // Console v2 (P4): Triggers and Trackpads show one hand at a time, picked on the rail.
    for (const [tabName, page_, left, right] of [['Triggers', 'trigger', 'Left trigger', 'Right trigger'], ['Trackpads', 'trackpad', 'Left pad', 'Right pad']]) {
      await page.getByRole('button', { name: tabName, exact: true }).click();
      const items = page.locator('.section-item');
      await items.first().waitFor();
      assert.deepEqual(await items.evaluateAll(els => els.map(el => el.querySelector('.section-item__label').textContent.trim())), [left, right], tabName + ' rail lists each hand');
      await page.locator(`#${page_}-left`).waitFor();
      assert.equal(await page.locator(`#${page_}-right`).count(), 0, tabName + ' draws one hand at a time');
      await items.nth(1).click();
      await page.locator(`#${page_}-right`).waitFor();
      assert.equal(await page.locator(`#${page_}-left`).count(), 0, tabName + ' swaps hands on the rail');
    }
    await page.getByRole('button', { name: 'Layers', exact: true }).click();
    // Modes (console v2): Y on a mode's card opens what it changes.
    await page.locator('[data-mode-id]').filter({ hasText: 'Aim' }).focus();
    await page.keyboard.press('y');
    const overrides = page.getByRole('dialog', { name: /What changes in this layer/ });
    await overrides.waitFor();
    assert.equal(await overrides.locator('[data-change-key]').count(), 1, 'names are merged, not separate overrides');
    assert.match(await overrides.innerText(), /Driving light · Light #34c759/i);
    assert.equal(await overrides.locator('[data-change-key] [role="img"]').count(), 1, 'color preview');
    assert.ok(!(await overrides.innerText()).toLowerCase().includes('x34c759'), 'raw binding syntax is hidden');
    assert.equal(await overrides.locator('[role="group"]').filter({ hasText: 'Bring in chords' }).getAttribute('aria-disabled'), 'true', 'bringing in old changes is unavailable without existing modeshifts');
    await overrides.screenshot({ path: path.join(ARTIFACTS, 'layer-readable.png') });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Buttons', exact: true }).click();
    const inherited = page.locator('details[data-input-command="L"] > summary');
    // An origin marker only shows while a mode is being edited or an import is behind
    // the value (Modes' Y no longer selects the mode, console v2); where there is
    // one, its dot and text line up.
    for (const marker of await inherited.locator('.origin-marker').all()) {
      const dot = await marker.locator('.origin-marker__dot').boundingBox();
      const originText = await marker.locator('small').boundingBox();
      assert.ok(dot && originText && Math.abs(dot.y + dot.height / 2 - originText.y - originText.height / 2) < 2, 'origin dot and text centers match');
    }
    await page.locator('details[data-input-command="N"] > summary').click();
    // The Switch mode and Controller action pickers (console v2): a long mode
    // name and a long description must not overflow the aside.
    const sheet = page.locator('details[data-input-command="N"][open]');
    await sheet.locator('[data-kind="mode"]').first().click();
    const modePicker = page.locator('[data-picker="mode"]');
    await modePicker.waitFor();
    await modePicker.locator('[data-layer]').first().focus();
    assert.ok(await modePicker.evaluate(el => el.scrollWidth <= el.clientWidth), 'mode picker does not overflow');
    await page.screenshot({ path: path.join(ARTIFACTS, 'layer-picker.png') });
    await page.keyboard.press('Escape');
    await modePicker.waitFor({ state: 'detached' });
    await sheet.locator('[data-kind="controller"]').first().click();
    const picker = page.locator('[data-picker="controller"]');
    await picker.waitFor();
    await picker.locator('[data-action="GYRO_OFF_ALL"]').focus();
    const detail = picker.locator('aside');
    assert.ok(await detail.evaluate(el => el.scrollWidth <= el.clientWidth), 'long command description does not overflow');
    await page.screenshot({ path: path.join(ARTIFACTS, 'jsm-picker.png') });
    assert.deepEqual(errors, []);
    console.log('PASS: controller light on Overview, full bumper output, stacked triggers/trackpads, merged names and color previews');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
