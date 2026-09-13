// Binding an input to "switch to another configuration".
//
// The mechanism is JoyShockMapper's own: a double-quoted value is a console
// command, and a bare config path typed at the console loads that config, so
// `RSR,S = "profiles-library/Wardogs Menu.txt"` switches profiles. Nothing
// about that changed -- this is the editor learning to offer the configurations
// by name instead of asking someone to type the path, which means the written
// token must stay byte-for-byte what a hand-written profile would contain.
//
// Isolated renderer check; mocks never invoke a physical controller or runtime.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const WRITTEN = 'RSR,S = "profiles-library/Wardogs Menu.txt"';

const mount = async (page, profile) => {
  await page.addInitScript(profile => {
    const profiles = {
      Wardogs: profile,
      'Wardogs Menu': 'RESET_MAPPINGS\n',
      Cyberpunk: 'RESET_MAPPINGS\n',
    };
    window.__lastSaved = '';
    window.electronAPI = {
      getActiveProfile: async () => ({ name: 'Wardogs', path: 'profiles-library/Wardogs.txt', content: profiles.Wardogs }),
      listLibraryProfiles: async () => Object.keys(profiles),
      loadLibraryProfile: async name => ({ name, content: profiles[name] }),
      saveLibraryProfile: async (name, content) => { window.__lastSaved = content; profiles[name] = content; return { name } },
      applyProfile: async path => ({ path, mappingEnabled: true }),
    };
    window.telemetry = { onSample: cb => {
      const emit = () => cb({ console: 'Mapper ready', activeProfile: 'profiles-library/Wardogs.txt', devices: [{ handle: 1, type: 24, supportedButtons: 8589934591, status: { buttons: 0, leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 }, gyro: { x: 0, y: 0, z: 0 }, leftPad: { x: 0, y: 0, touched: false }, rightPad: { x: 0, y: 0, touched: false } } }] });
      emit(); const timer = setInterval(emit, 150); return () => clearInterval(timer);
    } };
  }, profile);
  await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
  await page.locator('.profile-chip').waitFor();
  await page.getByRole('button', { name: 'Buttons', exact: true }).click();
  await page.locator('details').filter({ hasText: 'Modeshift ·' }).first().locator(':scope > summary').click();
  const row = page.locator('[data-input-command="RSR,S"]').first();
  await row.locator(':scope > summary').click();
  return row;
};

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    // --- writing one ------------------------------------------------------
    let page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    let errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.setDefaultTimeout(15000);
    let row = await mount(page, 'RESET_MAPPINGS\nRSR,S = -\n');

    await row.getByRole('combobox', { name: /^Output$/ }).first().click();
    await page.getByRole('option', { name: 'Load configuration', exact: true }).click();

    const value = row.getByRole('combobox', { name: /Output value/i }).first();
    await value.click();
    const offered = (await page.getByRole('option').allInnerTexts()).map(text => text.replace(/\s+/g, ' ').trim());
    // Every configuration in the library, with the one being edited marked --
    // binding an input to load the profile it is already in does nothing.
    assert.ok(offered.some(item => /^Wardogs \(this configuration\)$/.test(item)), `the current config is not marked: ${offered.join(', ')}`);
    assert.ok(offered.includes('Wardogs Menu'), `the other configs are missing: ${offered.join(', ')}`);
    assert.ok(offered.includes('Cyberpunk'), `the other configs are missing: ${offered.join(', ')}`);
    assert.ok(!offered.some(item => item.includes('.txt')), `the picker shows paths rather than names: ${offered.join(', ')}`);

    await page.getByRole('option', { name: 'Wardogs Menu', exact: true }).click();
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => /RSR,S/.test(window.__lastSaved || ''));
    const saved = await page.evaluate(() => window.__lastSaved);
    const line = (saved.match(/^RSR,S.*$/m) || [])[0];
    assert.equal(line, WRITTEN, 'the written binding is not what a hand-written profile would contain');
    assert.deepEqual(errors, []);
    await page.close();

    // --- reading one back -------------------------------------------------
    // A profile that already contains the line must come back as this output
    // kind, not as a Script/command with a path in a text box.
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.setDefaultTimeout(15000);
    row = await mount(page, 'RESET_MAPPINGS\n' + WRITTEN + '\n');

    assert.match(
      (await row.locator(':scope > summary').innerText()).replace(/\s+/g, ' ').trim(),
      /Load Wardogs Menu/,
      'the row should name the configuration, not print its path'
    );
    assert.equal(
      (await row.getByRole('combobox', { name: /^Output$/ }).first().innerText()).trim(),
      'Load configuration',
      'an existing config-switch binding did not come back as one'
    );
    assert.equal(
      (await row.getByRole('combobox', { name: /Output value/i }).first().innerText()).trim(),
      'Wardogs Menu'
    );

    // Saving it again without touching it must not rewrite the line.
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => (window.__lastSaved || '').length > 0);
    assert.match(await page.evaluate(() => window.__lastSaved), new RegExp('^' + WRITTEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'm'),
      'a round trip through the editor altered the binding');

    assert.deepEqual(errors, []);
    console.log('PASS: configurations are offered by name, written as the path JoyShockMapper expects, and read back as a config switch');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1 });
