// The binding card review's behaviour fixes, in the browser: "Capture a key"
// adds a command rather than overwriting the first; the Add command picker
// offers a Layers tab (a layer action is a command, TODO-55); a card with no
// layers says how to make one there; a modeshift can be named from its
// sheet; the card's header keeps the card layout until the body has folded;
// a chord's second input is its own chip.
// Isolated renderer check; mocks never invoke a physical controller or runtime.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const PROFILE = ['RESET_MAPPINGS', 'N = SPACE', 'RSR,N = C', 'E = A', 'R+E = TAB', ''].join('\n');

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

    const details = page.locator('details[data-input-command="N"]').first();
    await details.locator(':scope > summary').click();
    const open = page.locator('details[data-input-command="N"][open]');
    const rows = open.locator('[data-command-row]');
    await rows.first().waitFor();
    assert.equal(await rows.count(), 1);
    assert.equal(await rows.first().getByRole('button', { name: /^Choose action/ }).innerText(), 'Space');

    // --- Capture a key adds a command (1) --------------------------------------
    await open.getByRole('button', { name: 'Capture a key' }).click();
    assert.equal(await page.locator('[data-command-row][data-capturing="true"]').count(), 0, 'the first command is waiting for the key: capture would overwrite it');
    assert.equal(await open.locator('button[data-capturing="true"]').count(), 1, 'the Capture button does not show it is listening');
    await page.keyboard.press('KeyJ');
    await page.waitForFunction(() => document.querySelectorAll('details[data-input-command="N"][open] [data-command-row]').length === 2);
    const outputs = await rows.getByRole('button', { name: /^Choose action/ }).allInnerTexts();
    assert.deepEqual(outputs, ['Space', 'J'], `the capture should add J after Space: ${outputs.join(', ')}`);
    // The new row glows and takes focus (2f).
    await page.waitForFunction(() => document.querySelector('[data-command-row][data-just-added="true"]'));
    const focusedRow = await page.evaluate(() => document.activeElement?.closest('[data-command-row]')?.dataset.commandRow ?? null);
    assert.ok(focusedRow, 'focus did not land on the new row');
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => /^N = /m.test(window.__lastSaved || ''));
    // Both on the base line, each saying it is a press: `SPACE J` would mean
    // tap Space / hold J to JoyShockMapper.
    assert.match(await page.evaluate(() => window.__lastSaved), /^N = SPACE\\ J\\$/m, 'both commands should be presses on the base line');
    const chips = await rows.getByRole('combobox', { name: 'Trigger' }).allInnerTexts();
    assert.deepEqual(chips.map(text => text.trim().toLowerCase()), ['press', 'press'], `both rows should read Press: ${chips.join(', ')}`);

    // --- X in the Add command picker adds too, and the picker offers Layers (23, TODO-55)
    await open.getByRole('button', { name: 'Add command' }).click();
    const picker = page.getByRole('dialog', { name: 'Choose an action' });
    await picker.waitFor();
    const tabs = (await picker.locator('.action-picker__tabs .action-tab').allInnerTexts()).map(text => text.trim());
    assert.ok(tabs.includes('Layers'), `the Add command picker offers no Layers tab: ${tabs.join(', ')}`);
    // --- No layers: the Layers category says so, with the way to the Layers page (29)
    await picker.locator('.action-picker__tabs .action-tab').filter({ hasText: 'Layers' }).click();
    await picker.getByRole('button', { name: 'Go to Layers' }).waitFor();
    assert.match(await picker.locator('.action-picker__content').innerText(), /Create a layer/);
    await picker.locator('.action-picker__tabs .action-tab').filter({ hasText: 'Capture' }).click();
    await page.waitForFunction(() => document.body.dataset.bindingCapture === 'true');
    await page.keyboard.press('KeyK');
    await page.waitForFunction(() => document.querySelectorAll('details[data-input-command="N"][open] [data-command-row]').length === 3);
    assert.deepEqual(await rows.getByRole('button', { name: /^Choose action/ }).allInnerTexts(), ['Space', 'J', 'K']);

    // Every command now owns a label: secondary commands keep their own name
    // when copied, reordered or assigned another activator.
    assert.equal(await rows.first().getAttribute('data-unnamed'), null);
    assert.equal(await rows.nth(1).getAttribute('data-unnamed'), null);
    await rows.nth(1).getByRole('button', { name: 'Command settings', exact: true }).click();
    const commandName = page.getByRole('dialog').getByRole('textbox', { name: 'Action name', exact: true });
    await commandName.fill('Second command'); await commandName.press('Tab');
    await page.keyboard.press('Escape');
    assert.match(await rows.nth(1).innerText(), /Second command/, 'the second command displays its own editable label');

    // --- The card is Commands and Modeshifts only (TODO-54, TODO-55) ---------
    assert.equal(await open.locator('section[data-concept="layer"]').count(), 0, 'the Layer actions lane is still on the card');
    assert.equal(await open.locator('details').filter({ hasText: 'LED while held' }).count(), 0, 'the LED while held accordion is still on the card');

    // --- A modeshift can be named from its sheet (10) -------------------------
    await open.locator('[data-modeshift-row="RSR"]').getByRole('button', { name: 'Modeshift settings' }).click();
    const sheet = page.getByRole('dialog', { name: /While .* is held/ });
    await sheet.waitFor();
    const nameField = sheet.getByRole('textbox', { name: /name/i }).first();
    await nameField.waitFor();
    await nameField.fill('Melee');
    await page.keyboard.press('Tab');
    await page.waitForFunction(() => /Melee/.test(document.querySelector('[data-modeshift-row="RSR"]')?.textContent ?? ''));
    // The held button is changed through the same grid as the add flow (22).
    assert.equal(await sheet.locator('select').count(), 0, 'the held button is still a native select');
    await sheet.getByRole('button', { name: /Change/ }).first().click();
    const holdGrid = page.getByRole('dialog', { name: /Hold which button/ });
    await holdGrid.waitFor();
    assert.equal(await holdGrid.locator('[data-hold-input="RSR"]').getAttribute('aria-pressed'), 'true', 'the current held button should be selected');
    await holdGrid.getByRole('button', { name: 'Cancel' }).click();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.sheet-layer'));

    // --- Collapse: the header keeps the card layout until the body folds (12)
    await open.locator(':scope > summary').click();
    assert.equal(await details.getAttribute('open'), null, 'the details did not close');
    assert.equal(await details.getAttribute('data-card'), 'true', 'the card shape dropped the instant the details closed');
    await page.waitForFunction(() => !document.querySelector('details[data-input-command="N"]')?.dataset.card, null, { timeout: 2000 });

    // --- A chord's second input is its own chip, outside the keycap (15) -----
    const chordCard = page.locator('details[data-input-command="E"]').first();
    await chordCard.locator(':scope > summary').click();
    const chordRow = page.locator('details[data-input-command="E"][open] [data-command-row][data-condition="true"]').first();
    await chordRow.waitFor();
    const keycapText = await chordRow.getByRole('button', { name: /^Choose action/ }).innerText();
    assert.ok(!/Chord|Pressed with/i.test(keycapText), `the chord badge is still inside the keycap: ${keycapText}`);
    assert.match((await chordRow.innerText()).replace(/\s+/g, ' '), /Pressed with RB/i, 'the chord chip should name the kind and the second input');

    assert.deepEqual(errors, []);
    console.log('PASS: capture adds a command, the add flows and the modeshift sheet behave as the review asked');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
