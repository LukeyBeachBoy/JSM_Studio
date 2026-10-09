// "Not held": a While holding change or a mode switch that applies while an
// input is NOT held -- the use case is a mode or change held when a grip sense
// grip is let go rather than squeezed. Written "!X" (utils/released.ts): the
// mapper reads `!MISC6,W = X` (InvertedChords.cpp) and Studio's layer worker
// reads `# @layer-action !MISC6 = hold <id>` (global_chords.rs).
// Console v2: the change is made on the While holding page (step 1 the button,
// step 2 the kind and Held / Not held); the mode switch from the Switch mode
// picker with Happens on · Let go, and it then reads under More ▸ Let go.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    page.setDefaultTimeout(15000);
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
    await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {});
    await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {});
    await page.getByRole('button', { name: 'Buttons', exact: true }).click();
    const save = async () => { await page.keyboard.press('Control+s'); await page.waitForTimeout(400); return page.evaluate(() => window.__lastSaved); };
    const has = (text, line) => text.split('\n').some(row => row === line || row === `# @controller type-24 ${line}`);
    const card = page.locator('details[data-input-command="W"]').first();
    await card.waitFor();
    await card.locator(':scope > summary').click();
    const sheet = page.locator('details[data-input-command="W"][open] [data-binding-sheet]');

    // While holding: the right grip (step 1), a key (step 2), then Not held.
    await sheet.locator('[data-fold="while-holding"]').click();
    const step1 = page.locator('[data-step="1"]');
    await step1.locator('[data-hold-input="MISC5"]').click();
    await page.locator('[data-step="2"] [data-kind-tile="key"]').click();
    const picker = page.getByRole('dialog', { name: /Pick a key/ });
    await picker.getByRole('button', { name: 'Letters', exact: true }).click();
    await picker.getByRole('button', { name: /^J( ·|$)/ }).first().click();
    await picker.waitFor({ state: 'detached' });
    let saved = await save();
    assert.ok(has(saved, 'MISC5,W = J'), `the new change is written as "MISC5,W = J":\n${saved}`);
    // "While Right grip is · Held / Not held" (UX review 2026-10-09: the row names the held button).
    const works = page.locator('[data-step="2"] [role="radiogroup"]').filter({ hasText: /^While .+ is/ });
    await works.locator('button', { hasText: 'Not held' }).click();
    saved = await save();
    assert.ok(saved.includes('!MISC5,W'), `a not-held change is written as "!MISC5,W = …":\n${saved}`);
    // (Flipping back to Held while a controller layout is being edited leaves a
    // `MISC5,W = NONE` behind in it -- the controller fold's, see notes/BIND.md --
    // so this checks one flip.)
    await page.keyboard.press('Escape');
    const list = page.locator('[data-while-holding-list]');
    await list.waitFor();
    assert.match(await list.locator('[data-modeshift-row="!MISC5"]').innerText(), /let go/i, 'the chord says let go');
    await page.keyboard.press('Escape');
    await list.waitFor({ state: 'detached' });
    await page.keyboard.press('Escape');

    // A mode switch on letting go of the grip.
    const grip = page.locator('details[data-input-command="MISC5"]').first();
    await grip.scrollIntoViewIfNeeded();
    await grip.locator(':scope > summary').click();
    const gripSheet = page.locator('details[data-input-command="MISC5"][open] [data-binding-sheet]');
    await gripSheet.locator('[data-kind="mode"]').click();
    const modes = page.locator('[data-mode-on]').first();
    await modes.waitFor();
    await modes.locator('button', { hasText: 'Let go' }).click();
    await page.locator('[data-layer="aim"]').click();
    saved = await save();
    assert.ok(saved.includes('# @layer-action !MISC5 = hold aim'), `the mode switch is written on the released input:\n${saved}`);
    assert.match(await gripSheet.locator('[data-when="more"]').innerText(), /Let go/, 'it reads as a Let go');
    await gripSheet.locator('[data-when="more"]').click();
    const row = gripSheet.locator('[data-rare-command]').filter({ hasText: /Let go/ }).first();
    assert.match(await row.innerText(), /Hold Aim/, 'and as holding the mode');
    await row.click();
    await gripSheet.locator('[data-fold="fine-tune"]').click();
    const ft = page.locator('[data-fine-tune]');
    await ft.waitFor();
    const happens = ft.locator('[role="radiogroup"]').filter({ hasText: 'Happens on' });
    assert.equal(await happens.locator('button[data-current="true"]').innerText(), 'Let go', 'Fine-tune ▸ Switch mode says it happens on let go');
    await page.keyboard.press('Escape');

    assert.deepEqual(errors, []);
    console.log('PASS: not-held While holding changes ("!X,KEY") and mode switches ("!X = hold") are added, flipped and written');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
