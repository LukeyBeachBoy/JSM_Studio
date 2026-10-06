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

const PROFILE = ['RESET_MAPPINGS', 'N = SPACE', '# @layer {"id":"aim","name":"Aim","overrides":{"S":"Q"}}', ''].join('\n');
const ARTIFACTS = path.resolve(__dirname, '../tmp/command-parameters');

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

    const save = async () => { await page.keyboard.press('Control+s'); await page.waitForTimeout(400); return page.evaluate(() => window.__lastSaved); };
    const card = page.locator('details[data-input-command="N"]').first();
    await card.locator(':scope > summary').click();
    const open = page.locator('details[data-input-command="N"][open]');
    const rows = open.locator('[data-command-row]');
    await rows.first().waitFor();
    assert.equal(await rows.count(), 1);
    // The card is Commands and Modeshifts only: no LED accordion, no layer lane.
    assert.equal(await open.locator('section[data-concept="layer"]').count(), 0, 'the Layer actions lane is still on the card');
    assert.equal(await open.locator('details').filter({ hasText: 'LED while held' }).count(), 0, 'the LED while held accordion is still on the card');

    const openPicker = async () => {
      await open.getByRole('button', { name: 'Add command' }).click();
      const picker = page.getByRole('dialog', { name: 'Choose an action' });
      await picker.waitFor();
      return picker;
    };
    const tab = (picker, name) => picker.locator('.action-picker__tabs .action-tab').filter({ hasText: name });
    const chipOf = row => row.locator('[data-static="true"]').first();

    // One public LED action; settings handle lasting versus temporary color.
    let picker = await openPicker();
    await tab(picker, 'JSM').click();
    assert.equal(await picker.getByRole('button', { name: /\(raw\)/ }).count(), 0);
    assert.equal(await picker.getByRole('button', { name: /LED brightness|LED while held/, exact: true }).count(), 0);
    await picker.getByRole('button', { name: 'Gyro control', exact: true }).click();
    await picker.getByRole('button', { name: 'Disable gyro (all)', exact: true }).focus();
    assert.match(await picker.locator('.picker-detail').innerText(), /every connected controller/);
    await picker.getByRole('button', { name: 'Change LED colour', exact: true }).click();
    let ledSheet = page.getByRole('dialog', { name: /Change LED Color/ });
    await ledSheet.waitFor();
    await ledSheet.getByRole('textbox', { name: 'Action name', exact: true }).fill('Driving light');
    await ledSheet.getByRole('textbox', { name: 'Action name', exact: true }).press('Enter');
    await ledSheet.locator('[data-parameter="led-color"]').getByRole('radio', { name: 'Green', exact: true }).click();
    const pressBrightness = ledSheet.getByRole('textbox', { name: 'Brightness', exact: true });
    await pressBrightness.fill('40');
    await pressBrightness.press('Enter');
    assert.equal(await rows.count(), 2, 'color and brightness stay one command row');
    let saved = await save();
    assert.match(saved, /LED_BRIGHTNESS = 40/);
    assert.match(saved, /# @label N::[^\n]+ = Driving light/);
    assert.equal(await rows.first().getByText('Driving light', { exact: true }).count(), 0, 'LED name never lands on Space');
    await ledSheet.getByRole('radio', { name: 'While held', exact: true }).click();
    const ledRow = open.locator('[data-command-row][data-held-led="true"]');
    await ledRow.waitFor();
    await page.getByRole('dialog', { name: /Change LED Color/ }).waitFor(); // mode conversion keeps the sheet open
    ledSheet = page.getByRole('dialog', { name: /Change LED Color/ });
    assert.equal(await ledSheet.getByRole('textbox', { name: 'Action name', exact: true }).inputValue(), 'Driving light');
    const brightness = ledSheet.getByRole('textbox', { name: 'Brightness while held' });
    await brightness.fill('40');
    await brightness.press('Enter');
    saved = await save();
    assert.match(saved, /^N,LIGHT_BAR = x34c759$/m);
    assert.match(saved, /^N,LED_BRIGHTNESS = 40$/m);
    assert.match(saved, /^N = SPACE/m, 'converting to hold keeps the original command');
    await ledSheet.getByRole('radio', { name: 'On press', exact: true }).click();
    const pressLed = rows.filter({ hasText: 'Driving light' });
    await page.getByRole('dialog', { name: /Change LED Color/ }).waitFor(); // converted command retains settings focus
    ledSheet = page.getByRole('dialog', { name: /Change LED Color/ });
    assert.equal(await ledSheet.getByRole('textbox', { name: 'Brightness', exact: true }).inputValue(), '40');
    assert.equal(await ledSheet.getByRole('textbox', { name: 'Action name', exact: true }).inputValue(), 'Driving light');
    saved = await save();
    assert.match(saved, /LED_BRIGHTNESS = 40/);
    assert.ok(!/^N,LIGHT_BAR/m.test(saved), 'Press removes the temporary setting');
    assert.equal(await rows.count(), 2, 'brightness stays folded into its color command');
    await ledSheet.getByRole('radio', { name: 'While held', exact: true }).click();
    await page.getByRole('dialog', { name: /Change LED Color/ }).waitFor(); // mode conversion keeps the sheet open
    ledSheet = page.getByRole('dialog', { name: /Change LED Color/ });
    await page.screenshot({ path: path.join(ARTIFACTS, 'sheet-led-while-held.png') });
    await ledSheet.locator('[data-modal-close]').click();
    await ledSheet.waitFor({ state: 'detached' });
    assert.equal(await ledRow.getByText('Driving light', { exact: true }).count(), 1);

    // ---- A layer: Layers → Aim; the verb and press/release in the sheet ----
    picker = await openPicker();
    await tab(picker, 'Layers').click();
    await picker.getByRole('button', { name: /^Aim/ }).click();
    const layerRow = open.locator('[data-command-row][data-layer-action="aim"]');
    await layerRow.waitFor();
    assert.equal((await chipOf(layerRow).innerText()).trim().toLowerCase(), 'hold', 'a new layer action is a Hold');
    // The sheet is titled after the row ("Hold Aim", then "Toggle Aim").
    const layerSheet = page.getByRole('dialog', { name: /Aim$/ });
    await layerSheet.waitFor();
    await page.getByRole('dialog', { name: /Hold Aim/ }).waitFor();
    await layerSheet.getByRole('radio', { name: 'Toggle', exact: true }).click();
    saved = await save();
    assert.match(saved, /^# @layer-action N = toggle aim$/m, `the verb is written on the input's annotation:\n${saved}`);
    assert.equal((await chipOf(layerRow).innerText()).trim().toLowerCase(), 'press', 'a toggle happens on press');
    await page.screenshot({ path: path.join(ARTIFACTS, 'sheet-layer-action.png') });
    // The same sheet: on release, and back.
    await layerSheet.getByRole('radio', { name: 'Release', exact: true }).click();
    saved = await save();
    assert.match(saved, /^# @layer-action !N = toggle aim$/m, `on release is the "!N" input:\n${saved}`);
    assert.equal((await chipOf(layerRow).innerText()).trim().toLowerCase(), 'release');
    await layerSheet.getByRole('radio', { name: 'Press', exact: true }).click();
    saved = await save();
    assert.match(saved, /^# @layer-action N = toggle aim$/m);
    await layerSheet.locator('[data-modal-close]').click();
    await layerSheet.waitFor({ state: 'detached' });
    assert.match(await layerRow.getByRole('button', { name: /^Choose action/ }).innerText(), /Toggle Aim/, 'the tile reads Toggle Aim');

    // ---- A sound: Sounds → a tune; the volume in the sheet ----
    picker = await openPicker();
    await tab(picker, 'Sounds').click();
    await picker.getByRole('button', { name: 'Play sound · Victory!', exact: true }).click();
    const soundSheet = page.getByRole('dialog', { name: /Play sound/ });
    await soundSheet.waitFor();
    const gain = soundSheet.getByRole('textbox', { name: 'Volume' });
    await gain.fill('-12');
    await gain.press('Enter');
    saved = await save();
    // The gain follows the sound, and the sound stays the Press it was added
    // as beside Space: editing a parameter must not drop the token's `\`.
    assert.match(saved, /^N = SPACE\\ "PLAY_SOUND 3 -12"\\$/m, `the gain follows the sound on the base line:\n${saved}`);
    await page.screenshot({ path: path.join(ARTIFACTS, 'sheet-sound.png') });
    await soundSheet.locator('[data-modal-close]').click();
    await soundSheet.waitFor({ state: 'detached' });
    const soundRow = rows.filter({ hasText: 'Play sound' }).first();
    assert.equal((await soundRow.getByRole('combobox', { name: 'Trigger' }).innerText()).trim().toLowerCase(), 'press', 'the sound is still a Press');

    // The card, with the three rows (and its first command).
    assert.equal(await rows.count(), 4, 'Space, the LED, the layer and the sound');
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(ARTIFACTS, 'card-three-rows.png') });

    // ---- Remove each through its sheet ----
    const removeThrough = async row => {
      await row.getByRole('button', { name: 'Command settings' }).click();
      const sheet = page.getByRole('dialog').last();
      await sheet.getByRole('button', { name: 'Remove', exact: true }).click();
      await sheet.waitFor({ state: 'detached' });
      await row.waitFor({ state: 'detached' });
    };
    await removeThrough(ledRow);
    saved = await save();
    assert.ok(!/^N,LIGHT_BAR/m.test(saved) && !/^N,LED_BRIGHTNESS/m.test(saved), `removing the LED row drops both settings:\n${saved}`);
    await removeThrough(layerRow);
    saved = await save();
    assert.ok(!/@layer-action/.test(saved), `removing the layer row drops the annotation:\n${saved}`);
    await removeThrough(rows.filter({ hasText: 'Play sound' }).first());
    saved = await save();
    assert.ok(!/PLAY_SOUND/.test(saved), `removing the sound drops its token:\n${saved}`);
    assert.match(saved, /^N = SPACE/m, 'the first command is untouched');
    assert.equal(await rows.count(), 1);

    assert.deepEqual(errors, []);
    console.log('PASS: LED while held, a layer action and a sound are command rows with their parameters in the settings sheet');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
