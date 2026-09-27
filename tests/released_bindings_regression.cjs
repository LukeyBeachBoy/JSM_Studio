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
    await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {});
    await page.getByRole('button', { name: 'Buttons', exact: true }).click();
    const save = async () => { await page.keyboard.press('Control+s'); await page.waitForTimeout(400); return page.evaluate(() => window.__lastSaved); };
    const card = page.locator('details[data-input-command="W"]').first();
    await card.waitFor();
    if (await card.getAttribute('open') === null) await card.locator('summary').first().click();

    // A modeshift that holds while the right grip is released.
    const shifts = card.locator('section[aria-label="Modeshifts"]').first();
    await shifts.getByRole('button', { name: 'Add modeshift' }).click();
    await shifts.getByRole('radio', { name: 'Released' }).click();
    await shifts.getByRole('combobox').click();
    await page.getByRole('option', { name: /right grip/i }).first().click();
    let saved = await save();
    const shiftLine = saved.split('\n').find(line => /^!MISC\d,W\s*=/.test(line));
    assert.ok(shiftLine, `a released modeshift is written as "!MISC…,W = …":\n${saved}`);
    const trigger = shiftLine.split(',')[0];
    const shiftRow = shifts.locator('[data-modeshift-row]').first();
    assert.match(await shiftRow.innerText(), /Released/i, 'the row says released');

    // The shift's sheet (its cog, 3c) turns it into an ordinary held modeshift and back.
    await shiftRow.getByRole('button', { name: 'Modeshift settings' }).click();
    const sheet = page.getByRole('dialog').last();
    await sheet.getByRole('radio', { name: 'Held' }).first().click();
    saved = await save();
    assert.ok(saved.split('\n').some(line => line.startsWith(`${trigger.slice(1)},W`)) && !saved.includes(`${trigger},W`), `flipped to held:\n${saved}`);
    await sheet.getByRole('radio', { name: 'Released' }).first().click();
    saved = await save();
    assert.ok(saved.includes(`${trigger},W`), 'and back to released');
    await sheet.locator('[data-modal-close]').click();
    await sheet.waitFor({ state: 'detached' });

    // A layer held while a grip is released, from the input that drives it:
    // added, then set to happen on release in its cog's sheet.
    const grip = page.locator(`details[data-input-command="${trigger.slice(1)}"]`).first();
    await grip.scrollIntoViewIfNeeded();
    if (await grip.getAttribute('open') === null) await grip.locator('summary').first().click();
    const actions = grip.locator('section[aria-label="Layer actions"]').first();
    await actions.getByRole('button', { name: 'Add layer action' }).click();
    await actions.getByRole('radio', { name: 'While released' }).click();
    await actions.getByRole('combobox', { name: 'Layer', exact: true }).selectOption({ label: 'Aim' }).catch(async () => {
      await actions.getByRole('combobox', { name: 'Layer', exact: true }).click();
      await page.getByRole('option', { name: 'Aim', exact: true }).click();
    });
    saved = await save();
    assert.ok(saved.includes(`# @layer-action ${trigger} = hold aim`), `the layer action is written on the released input:\n${saved}`);
    assert.match(await actions.innerText(), /Hold Aim[\s\S]*On while .* is released/i, 'and reads as held while released');

    assert.deepEqual(errors, []);
    console.log('PASS: released modeshifts ("!X,KEY") and layer actions ("!X = hold") are added, flipped and written');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
