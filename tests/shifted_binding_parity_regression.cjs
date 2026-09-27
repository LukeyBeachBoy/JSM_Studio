// A shifted binding is edited with the card the unshifted input uses.
//
// The modeshift panel used to carry its own, smaller binding editor: no
// activation kinds beyond what was already written, no output-kind picker, no
// advanced options, no capture, a bare "Add Another Trigger" button. Anything
// added to the real card had to be added again here or quietly went missing
// under a shift. This requires the two to be the same card, and requires the
// writes it produces to stay inside the one shift being edited.
//
// Isolated renderer check; mocks never invoke a physical controller or runtime.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const PROFILE = [
  'RESET_MAPPINGS',
  'N = SPACE',
  'E = R',
  'S = T',
  'L,N = F',
  'L,E = G',
  'R,N = H',
].join('\n') + '\n';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(profile => {
      const profiles = { Desktop: profile };
      window.__lastSaved = '';
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Desktop', path: 'profiles-library/Desktop.txt', content: profiles.Desktop }),
        listLibraryProfiles: async () => Object.keys(profiles),
        loadLibraryProfile: async name => ({ name, content: profiles[name] }),
        saveLibraryProfile: async (name, content) => { window.__lastSaved = content; profiles[name] = content; return { name } },
        applyProfile: async (path, text) => ({ path, mappingEnabled: true }),
      };
      window.telemetry = { onSample: cb => {
        const emit = () => cb({ console: 'Mapper ready', activeProfile: 'profiles-library/Desktop.txt', devices: [{ handle: 1, type: 24, supportedButtons: 8589934591, status: { buttons: 0, leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 }, gyro: { x: 0, y: 0, z: 0 }, leftPad: { x: 0, y: 0, touched: false }, rightPad: { x: 0, y: 0, touched: false } } }] });
        emit(); const timer = setInterval(emit, 150); return () => clearInterval(timer);
      } };
    }, PROFILE);
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
    // The app opens on Home (console refinement 2a); these checks start in the editing shell.
    await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {})
    page.setDefaultTimeout(15000);
    await page.locator('.profile-chip').filter({ hasText: 'Desktop' }).waitFor();
    await page.getByRole('button', { name: 'Buttons', exact: true }).click();

    // --- the compact row says what the input does before it is opened --------
    const north = page.locator('details[data-input-command="N"]').first();
    const rowText = await north.locator(':scope > summary').innerText();
    assert.match(rowText, /Space/, 'the row must show what the binding sends');
    // The first shift is a tile and the rest one "+n" (3b).
    assert.match(rowText.replace(/\s+/g, ' '), /LB → F \+1/, 'the row must show the first shift and count the rest');

    // --- the shifted card is the normal card --------------------------------
    // A shift is a row in the input's Modeshifts lane; its cog opens the
    // shift's sheet, which holds the shift's commands as the same rows the
    // card's own Commands lane has (3c).
    await north.locator(':scope > summary').click();
    const openN = page.locator('details[data-input-command="N"][open]');
    const shiftRow = openN.locator('[data-modeshift-row="L"]');
    await shiftRow.waitFor();
    await shiftRow.getByRole('button', { name: 'Modeshift settings' }).click();
    const shifted = page.locator('[data-input-command="L,N"]');
    await shifted.waitFor();
    assert.equal(await shifted.count(), 1, 'a shifted card must be separately addressable from the normal one');

    // One trigger picker, offering the same activation kinds the normal card
    // offers for a binding already written to its line.
    const trigger = shifted.getByRole('combobox', { name: 'Trigger' });
    await trigger.first().waitFor();
    assert.equal(await trigger.count(), 1, 'the shifted card offers the trigger in more than one place');
    await trigger.first().click();
    assert.deepEqual(
      (await page.getByRole('option').allInnerTexts()).map(text => text.trim()),
      ['Press', 'Tap', 'Hold', 'Double press', 'Release', 'Turbo'],
      'a shifted binding must offer the same activation kinds as an unshifted one'
    );
    await page.keyboard.press('Escape');

    // The editing capabilities the reduced version did not have.
    for (const name of [/Add command/i, /Capture a key/i]) {
      assert.ok(await shifted.getByRole('button', { name }).count() >= 1, `the shifted card is missing ${name}`);
    }
    // Its commands are named in their settings sheet, like any other.
    await shifted.locator('[data-command-row]').first().getByRole('button', { name: 'Command settings' }).click();
    const commandSheet = page.getByRole('dialog').last();
    assert.equal(await commandSheet.getByRole('textbox', { name: /Action name/i }).count(), 1, 'a shifted binding cannot be named');
    const sheets = await page.getByRole('dialog').count();
    await commandSheet.locator('[data-modal-close]').click();
    await page.waitForFunction(count => document.querySelectorAll('[role=dialog]').length < count, sheets);

    // A shift has no second condition to hang a chord on, so it must not offer
    // to make one: the chip above offers no chord kind, and Add command goes
    // straight to the picker as a Press (5).

    // --- writes stay inside the shift ---------------------------------------
    const choose = async (index, key) => {
      await shifted.locator('[data-command-row]').nth(index).getByRole('button', { name: /^Choose action/ }).click();
      await page.getByRole('dialog', { name: 'Choose an action' }).locator('button.key-cap').filter({ hasText: new RegExp(`^${key}$`) }).click();
    };
    await choose(0, 'K');
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => /L,N\s*=\s*K/.test(window.__lastSaved || ''));
    const saved = await page.evaluate(() => window.__lastSaved);

    assert.match(saved, /^N = SPACE$/m, 'editing a shift rewrote the normal binding');
    assert.match(saved, /^L,E = G$/m, 'editing one shifted input disturbed another');
    assert.match(saved, /^R,N = H$/m, 'editing one shift disturbed a different trigger');
    // The shift inherits S through the projection; reading it must not be
    // enough to mint an override for it.
    assert.ok(!/^L,S\s*=/m.test(saved), `an untouched inherited binding was written as an override:\n${saved}`);
    assert.equal((saved.match(/^L,N\s*=/gm) || []).length, 1, 'the shifted line was written twice');


    // --- a second command on the same shifted input --------------------------
    // Editing one command must not take the other with it: both live on one
    // config line, and the old shifted editor wrote that line from a single
    // binding expression.
    await shifted.getByRole('button', { name: /Add command/i }).click();
    await page.getByRole('dialog', { name: 'Choose an action' }).locator('button.key-cap').filter({ hasText: /^M$/ }).click();
    await shifted.locator('[data-command-row]').nth(1).waitFor();
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => /L,N\s*=.*M/.test(window.__lastSaved || ''));
    const both = await page.evaluate(() => window.__lastSaved);
    const line = (both.match(/^L,N\s*=\s*(.*)$/m) || [])[1] ?? '';
    assert.match(line, /K/, `editing the second command dropped the first: ${line}`);
    assert.match(line, /M/, `the second command was not written: ${line}`);
    assert.match(both, /^N = SPACE$/m, 'a second shifted command reached the normal binding');

    assert.deepEqual(errors, []);
    console.log('PASS: shifted bindings use the normal card, offer no chords, keep several commands on one line, and write only their own shift');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1 });
