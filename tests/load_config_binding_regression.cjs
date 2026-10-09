// Binding an input to "switch to another configuration".
//
// The mechanism is JoyShockMapper's own: a double-quoted value is a console
// command, and a bare config path typed at the console loads that config, so
// `S = "profiles-library/Wardogs Menu.txt"` switches profiles. Nothing about
// that changed -- this is the editor offering the configurations by name (the
// Load a configuration picker's cover shelf, console v2 PickerFamily) instead
// of asking someone to type the path, which means the written token must stay
// byte-for-byte what a hand-written profile would contain.
//
// Isolated renderer check; mocks never invoke a physical controller or runtime.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const WRITTEN = 'S = "profiles-library/Wardogs Menu.txt"';

const mount = async (page, profile) => {
  await page.addLocatorHandler(page.getByRole('dialog', { name: 'Controller power-on sound', exact: true }), async () => {
    await page.getByRole('button', { name: 'Keep them', exact: true }).click();
  });
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
      getRuntimeMappingState: async () => ({ firmwareSoundPromptDone: true }),
    };
    window.telemetry = { onSample: cb => {
      const emit = () => cb({ console: 'Mapper ready', activeProfile: 'profiles-library/Wardogs.txt', devices: [{ handle: 1, type: 24, supportedButtons: 8589934591, status: { buttons: 0, leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 }, gyro: { x: 0, y: 0, z: 0 }, leftPad: { x: 0, y: 0, touched: false }, rightPad: { x: 0, y: 0, touched: false } } }] });
      emit(); const timer = setInterval(emit, 150); return () => clearInterval(timer);
    } };
  }, profile);
  await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
  // The app opens on Home; these checks start in the editing shell.
  await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {});
  await page.getByRole('button', { name: 'Buttons', exact: true }).click();
  const card = page.locator('details[data-input-command="S"]').first();
  await card.locator(':scope > summary').click();
  return card;
};

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    // --- writing one ------------------------------------------------------
    let page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    let errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.setDefaultTimeout(15000);
    let card = await mount(page, 'RESET_MAPPINGS\n');

    await card.locator('[data-kind="config"]').first().click();
    const picker = page.locator('[data-picker="config"]');
    await picker.waitFor();
    const offered = await picker.locator('[data-config]').evaluateAll(els => els.map(el => el.dataset.config));
    // Every configuration in the library, the one being edited marked "You're
    // in it" and unavailable -- loading the profile it is already in does nothing.
    assert.deepEqual([...offered].sort(), ['Cyberpunk', 'Wardogs', 'Wardogs Menu'], `the library is not offered by name: ${offered.join(', ')}`);
    const current = picker.locator('[data-config="Wardogs"]');
    assert.equal(await current.getAttribute('aria-disabled'), 'true');
    assert.match(await current.innerText(), /You’re in it/);
    assert.ok(!(await picker.innerText()).includes('.txt'), 'the picker shows paths rather than names');
    await picker.locator('[data-config="Wardogs Menu"]').focus();
    assert.match(await picker.innerText(), /Switches to Wardogs Menu when you press/);

    await picker.locator('[data-config="Wardogs Menu"]').click();
    await picker.waitFor({ state: 'detached' });
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => /^(# @controller \S+ )?S = /m.test(window.__lastSaved || ''));
    const saved = await page.evaluate(() => window.__lastSaved);
    // A connected controller's variant is written as its scope prefix; the binding itself is unchanged.
    const line = (saved.match(/^(?:# @controller \S+ )?(S = .*)$/m) || [])[1];
    assert.equal(line, WRITTEN, 'the written binding is not what a hand-written profile would contain');
    assert.deepEqual(errors, []);
    await page.close();

    // --- reading one back -------------------------------------------------
    // A profile that already contains the line must come back as this output
    // kind, not as a command with a path in a text box.
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.setDefaultTimeout(15000);
    card = await mount(page, 'RESET_MAPPINGS\n' + WRITTEN + '\n');
    assert.match((await card.innerText()).replace(/\s+/g, ' '), /Wardogs Menu/, 'the sheet should name the configuration, not print its path');
    // The picker opens on it: a configuration switch, not a command with a path.
    await card.locator('[data-kind="config"]').first().click();
    const reopened = page.locator('[data-picker="config"]');
    await reopened.waitFor();
    assert.equal(await reopened.locator('[aria-pressed="true"]').getAttribute('data-config'), 'Wardogs Menu', 'an existing config-switch binding did not come back as one');
    await page.keyboard.press('Escape');
    await reopened.waitFor({ state: 'detached' });

    // Saving it again without touching it must not rewrite the line.
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => (window.__lastSaved || '').length > 0);
    assert.match(await page.evaluate(() => window.__lastSaved), new RegExp('^' + WRITTEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'm'),
      'a round trip through the editor altered the binding');

    assert.deepEqual(errors, []);
    console.log('PASS: configurations are offered by name on the cover shelf, written as the path JoyShockMapper expects, and read back as a config switch');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1 });
