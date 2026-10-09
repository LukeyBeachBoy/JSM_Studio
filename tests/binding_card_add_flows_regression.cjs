// The binding sheet's add flows (console v2, BindingSheet / BindingWhileHolding /
// BindingMore): "Also send" with the key picker's Listen adds a command rather
// than overwriting the first, and both are presses on the base line; a
// command of several on one press is named from its own Fine-tune; a While
// holding change is named from its Y menu and opens on its held button; a
// pair (Press together with…) is listed under More with its other button.
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
    await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {});
    await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {});
    await page.locator('.profile-chip').waitFor();
    await page.getByRole('button', { name: 'Buttons', exact: true }).click();
    const save = async () => { await page.keyboard.press('Control+s'); await page.waitForTimeout(400); return page.evaluate(() => window.__lastSaved); };
    // Edits land in this controller's own layout while one is connected (V4).
    const eff = (text, key) => {
      const lines = text.split('\n');
      const own = lines.filter(line => line.startsWith(`# @controller type-24 ${key} = `)).pop();
      const shared = lines.filter(line => line.startsWith(`${key} = `)).pop();
      const line = own ? own.slice('# @controller type-24 '.length) : shared;
      return line ? line.slice(key.length + 3).trim() : undefined;
    };

    await page.locator('details[data-input-command="N"] > summary').click();
    const open = page.locator('details[data-input-command="N"][open]');
    const sheet = open.locator('[data-binding-sheet]');
    const chips = sheet.locator('[data-chip-command]');
    await chips.first().waitFor();
    assert.equal(await chips.count(), 1);

    // --- Also send ▸ the key picker's Listen adds a command (1) ----------------
    const listenFor = async key => {
      await sheet.getByRole('button', { name: 'Also send' }).click();
      const picker = page.getByRole('dialog', { name: /Pick a key/ });
      await picker.waitFor();
      await page.keyboard.press('x');
      await page.waitForFunction(() => document.body.dataset.bindingCapture === 'true');
      await page.keyboard.press(key);
    };
    await listenFor('KeyJ');
    await page.waitForFunction(() => document.querySelectorAll('details[data-input-command="N"][open] [data-chip-command]').length === 2);
    const labels = async () => (await chips.evaluateAll(list => list.map(chip => chip.getAttribute('aria-label').replace(/^Choose action: /, ''))));
    assert.deepEqual(await labels(), ['Space', 'J'], 'the capture should add J after Space');
    let saved = await save();
    // Both on the base line, each saying it is a press: `SPACE J` would mean
    // tap Space / hold J to JoyShockMapper.
    assert.equal(eff(saved, 'N'), 'SPACE\\ J\\', `both commands should be presses on the base line:\n${saved}`);
    await listenFor('KeyK');
    await page.waitForFunction(() => document.querySelectorAll('details[data-input-command="N"][open] [data-chip-command]').length === 3);
    assert.deepEqual(await labels(), ['Space', 'J', 'K']);

    // --- One of several is fine-tuned and named on its own -------------------
    await chips.nth(1).focus();
    await page.keyboard.press('y');
    const ft = page.locator('[data-fine-tune]');
    await ft.waitFor();
    assert.match(await ft.innerText(), /How J is sent/, 'Y on the J chip fine-tunes J');
    await ft.locator('[role=radio]').first().focus();
    await page.keyboard.press('y');
    await page.getByRole('menuitem', { name: 'Name this action' }).click();
    const typing = page.getByRole('dialog', { name: /^Type: / });
    await typing.waitFor();
    await page.keyboard.type('Second command');
    await page.keyboard.press('Enter');
    await typing.waitFor({ state: 'detached' });
    await page.keyboard.press('Escape');
    await ft.waitFor({ state: 'detached' });
    assert.match(await chips.nth(1).getAttribute('data-caption'), /Second command/, 'the second command keeps its own name');

    // --- While holding: named from its Y menu, opens on its held button ------
    await sheet.locator('[data-fold="while-holding"]').click();
    const row = page.locator('[data-modeshift-row="RSR"]');
    await row.waitFor();
    assert.match((await row.innerText()).replace(/\s+/g, ' '), /With R4 held/);
    await row.focus();
    await page.keyboard.press('y');
    await page.getByRole('menuitem', { name: 'Name', exact: true }).click();
    await typing.waitFor();
    await page.keyboard.type('Melee');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => /Melee/.test(document.querySelector('[data-modeshift-row="RSR"]')?.textContent ?? ''));
    await row.click();
    const step1 = page.locator('[data-step="1"]');
    await step1.waitFor();
    assert.equal(await step1.locator('[data-hold-input="RSR"]').getAttribute('aria-pressed'), 'true', 'the change opens on its held button');
    await page.keyboard.press('Escape');
    await page.locator('[data-while-holding-list]').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('[data-while-holding-list]').waitFor({ state: 'detached' });

    // --- A pair is listed under More with the other button (15) ---------------
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('details[data-input-command="N"][open]'));
    await page.locator('details[data-input-command="E"] > summary').click();
    const eSheet = page.locator('details[data-input-command="E"][open] [data-binding-sheet]');
    await eSheet.waitFor();
    assert.match(await eSheet.locator('[data-when="more"]').innerText(), /Press together with/, 'the More tile names what is set');
    await eSheet.locator('[data-when="more"]').click();
    const set = eSheet.locator('[data-rare-command]').filter({ hasText: /Press together with/ });
    await set.first().waitFor();
    assert.match((await set.first().innerText()).replace(/\s+/g, ' '), /Press together with RB.*Tab/i, 'the pair names its other button and what it sends');

    assert.deepEqual(errors, []);
    console.log('PASS: Also send + Listen adds presses, one of several is named on its own, While holding is named and reopens, pairs list under More');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
