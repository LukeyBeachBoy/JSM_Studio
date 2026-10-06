// "While released": a modeshift or a layer action that applies while an input
// is NOT held -- the use case is a layer or modeshift held when a grip sense
// grip is let go rather than squeezed. Written "!X" (utils/released.ts): the
// mapper reads `!MISC6,W = X` (InvertedChords.cpp) and Studio's layer worker
// reads `# @layer-action !MISC6 = hold <id>` (global_chords.rs).
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      const layer = JSON.stringify({ id: 'aim', name: 'Aim', overrides: { S: 'Q' } });
      const profiles = { Desktop: `RESET_MAPPINGS\nW = U\nS = SPACE\n# @layer ${layer}\n` };
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
        const emit = () => cb({ console: 'ready', activeProfile: 'profiles-library/Desktop.txt', devices: [{ handle: 1, type: 24, supportedButtons: 8589934591, status: { buttons: 0, leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 }, gyro: { x: 0, y: 0, z: 0 }, leftPad: { x: 0, y: 0, touched: false }, rightPad: { x: 0, y: 0, touched: false } } }] });
        emit(); const timer = setInterval(emit, 100); return () => clearInterval(timer);
      } };
    });
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
    // A Steam Controller's first connection asks about its power-on sound.
    await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {});
    await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {});
    await page.getByRole('button', { name: 'Buttons', exact: true }).click();
    const save = async () => { await page.keyboard.press('Control+s'); await page.waitForTimeout(400); return page.evaluate(() => window.__lastSaved); };
    const card = page.locator('details[data-input-command="W"]').first();
    await card.waitFor();
    if (await card.getAttribute('open') === null) await card.locator('summary').first().click();

    // A modeshift that holds while the right grip is released: added through
    // "Hold which button?" and the picker (3e), then set to released in the
    // shift's own sheet (its cog, 3c).
    const shifts = card.locator('section[aria-label="Modeshifts"]').first();
    await shifts.getByRole('button', { name: 'Add modeshift' }).click();
    const hold = page.getByRole('dialog', { name: /Hold which button/ });
    await hold.locator('[data-hold-input][title*="right grip" i]').first().click();
    await hold.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('dialog', { name: 'Choose an action' }).locator('button.key-cap').filter({ hasText: /^J$/ }).click();
    let saved = await save();
    const heldLine = saved.split('\n').find(line => /^MISC\d,W\s*=\s*J$/.test(line));
    assert.ok(heldLine, `the new shift is written as "MISC…,W = J":\n${saved}`);
    const trigger = '!' + heldLine.split(',')[0];
    const shiftRow = shifts.locator('[data-modeshift-row]').first();
    await shiftRow.getByRole('button', { name: 'Modeshift settings' }).click();
    const sheet = page.getByRole('dialog').last();
    await sheet.getByRole('radio', { name: 'Released' }).first().click();
    saved = await save();
    assert.ok(saved.includes(`${trigger},W`), `a released modeshift is written as "!MISC…,W = …":\n${saved}`);
    assert.match(await shifts.locator('[data-modeshift-row]').first().innerText(), /Released/i, 'the row says released');

    // The same switch turns it into an ordinary held modeshift and back.
    await sheet.getByRole('radio', { name: 'Held' }).first().click();
    saved = await save();
    assert.ok(saved.split('\n').some(line => line.startsWith(`${trigger.slice(1)},W`)) && !saved.includes(`${trigger},W`), `flipped to held:\n${saved}`);
    await sheet.getByRole('radio', { name: 'Released' }).first().click();
    saved = await save();
    assert.ok(saved.includes(`${trigger},W`), 'and back to released');
    await sheet.locator('[data-modal-close]').click();
    await sheet.waitFor({ state: 'detached' });

    // A layer held while a grip is released, from the input that drives it: a
    // layer action is a command (TODO-55), added from the Add command picker's
    // Layers tab; its sheet opens on the new row, where Release is chosen.
    const grip = page.locator(`details[data-input-command="${trigger.slice(1)}"]`).first();
    await grip.scrollIntoViewIfNeeded();
    if (await grip.getAttribute('open') === null) await grip.locator('summary').first().click();
    await grip.getByRole('button', { name: 'Add command' }).click();
    const picker = page.getByRole('dialog', { name: 'Choose an action' });
    await picker.locator('.action-picker__tabs .action-tab').filter({ hasText: 'Layers' }).click();
    await picker.getByRole('button', { name: /^Aim/ }).click();
    await picker.waitFor({ state: 'detached' });
    const actionRow = grip.locator('[data-command-row][data-layer-action="aim"]');
    await actionRow.waitFor();
    const actionSheet = page.getByRole('dialog', { name: /Hold Aim/ });
    await actionSheet.waitFor();
    await actionSheet.getByRole('radio', { name: 'Release' }).click();
    await actionSheet.locator('[data-modal-close]').click();
    saved = await save();
    assert.ok(saved.includes(`# @layer-action ${trigger} = hold aim`), `the layer action is written on the released input:\n${saved}`);
    // The row's chip says Release; its tile keeps the layer's words.
    assert.match((await actionRow.locator('[data-static="true"]').first().innerText()).trim(), /^Release$/i, 'the row says release');
    assert.match(await actionRow.innerText(), /Hold Aim/, 'and reads as holding the layer');
    // The row's own cog reopens the same sheet, which explains the action.
    await actionRow.getByRole('button', { name: 'Command settings' }).click();
    await page.getByRole('dialog', { name: /Hold Aim/ }).waitFor();
    assert.equal(await page.getByRole('dialog', { name: /Hold Aim/ }).getByRole('radio', { name: 'Release' }).getAttribute('aria-checked'), 'true');
    await page.keyboard.press('Escape');
    await page.getByRole('dialog', { name: /Hold Aim/ }).waitFor({ state: 'detached' });

    assert.deepEqual(errors, []);
    console.log('PASS: released modeshifts ("!X,KEY") and layer actions ("!X = hold") are added, flipped and written');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
