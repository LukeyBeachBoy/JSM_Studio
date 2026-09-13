// Editing a shifted binding in a profile that imports a template.
//
// The shifted editor is the only place that both READS from and WRITES to the
// import-resolved text: it projects the shift onto an ordinary configuration,
// hands that to the normal binding card, and folds the result back into chorded
// lines. Everywhere else reads the resolved text and writes the profile's own.
//
// A profile that imports a template routinely assigns a key twice -- the
// template sets it, the profile sets it again -- and only the last one is in
// force. The projection was substituting the shifted value into BOTH, so the
// card wrote to one occurrence and read back the other. The edit appeared to do
// nothing at all: pick a key, watch the field snap back.
//
// Every other browser test here mocks `loadLibraryProfile` but not
// `readConfigFile`, so they all run with imports unresolved and none of them
// could have caught this. This one resolves them.
//
// Isolated renderer check; mocks never invoke a physical controller or runtime.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

// The shape that breaks it: both files assign S, and the shift overrides it.
const TEMPLATE = ['RESET_MAPPINGS', 'W = R', 'S = SPACE', 'E = LCONTROL'].join('\n') + '\n';
const PROFILE = [
  'RESET_MAPPINGS',
  'profiles-library/FPS Template.txt',
  'S = SPACE      # Jump',
  'RSR,S = -      # Scoreboard',
  'RSR,W = U',
].join('\n') + '\n';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.setDefaultTimeout(15000);
    await page.addInitScript(([profile, template]) => {
      const profiles = { Wardogs: profile, 'FPS Template': template };
      window.__lastSaved = '';
      window.__reads = [];
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Wardogs', path: 'profiles-library/Wardogs.txt', content: profiles.Wardogs }),
        listLibraryProfiles: async () => Object.keys(profiles),
        loadLibraryProfile: async name => ({ name, content: profiles[name] }),
        saveLibraryProfile: async (name, content) => { window.__lastSaved = content; profiles[name] = content; return { name } },
        applyProfile: async path => ({ path, mappingEnabled: true }),
        readConfigFile: async path => {
          window.__reads.push(path);
          const name = String(path).replace(/^profiles-library\//, '').replace(/\.txt$/, '');
          return Object.prototype.hasOwnProperty.call(profiles, name) ? profiles[name] : null;
        },
      };
      window.telemetry = { onSample: cb => {
        const emit = () => cb({ console: 'Mapper ready', activeProfile: 'profiles-library/Wardogs.txt', devices: [{ handle: 1, type: 24, supportedButtons: 8589934591, status: { buttons: 0, leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 }, gyro: { x: 0, y: 0, z: 0 }, leftPad: { x: 0, y: 0, touched: false }, rightPad: { x: 0, y: 0, touched: false } } }] });
        emit(); const timer = setInterval(emit, 150); return () => clearInterval(timer);
      } };
    }, [PROFILE, TEMPLATE]);
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
    await page.locator('.profile-chip').waitFor();
    await page.getByRole('button', { name: 'Buttons', exact: true }).click();

    // The import must actually have been resolved, or this test proves nothing.
    await page.waitForFunction(() => (window.__reads || []).length > 0);
    assert.deepEqual(await page.evaluate(() => window.__reads), ['profiles-library/FPS Template.txt']);

    await page.locator('details').filter({ hasText: 'Modeshift ·' }).first().locator(':scope > summary').click();
    const shifted = page.locator('[data-input-command="RSR,S"]').first();
    await shifted.locator(':scope > summary').click();
    const field = shifted.getByRole('textbox', { name: /Output value/i }).first();
    await field.waitFor();
    assert.equal(await field.inputValue(), 'Hyphen', 'the shifted binding did not load');

    // --- the keyboard picker --------------------------------------------------
    await shifted.getByRole('button', { name: /Keyboard…/ }).first().click();
    await page.getByRole('button', { name: 'Tab', exact: true }).first().click();
    await page.waitForTimeout(400);
    assert.equal(await field.inputValue(), 'Tab', 'the edit snapped back: the card read a different line than it wrote');

    // --- capture --------------------------------------------------------------
    await shifted.getByRole('button', { name: /^Capture$/ }).first().click();
    await page.keyboard.press('KeyJ');
    await page.waitForTimeout(400);
    assert.equal(await field.inputValue(), 'J', 'capture did not reach the shifted binding');

    // --- and it is the shifted line that changed ------------------------------
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => /RSR,S/.test(window.__lastSaved || ''));
    const saved = await page.evaluate(() => window.__lastSaved);
    assert.match(saved, /^RSR,S = J$/m, `the shifted line was not written:\n${saved}`);
    assert.match(saved, /^S = SPACE/m, `the unshifted binding was changed instead:\n${saved}`);
    assert.match(saved, /^RSR,W = U$/m, `another shifted binding was disturbed:\n${saved}`);
    assert.match(saved, /^profiles-library\/FPS Template\.txt$/m, 'the import line was lost');
    // The template's own text must never be written into the profile.
    assert.ok(!/^E = LCONTROL$/m.test(saved), `the import was inlined into the profile:\n${saved}`);

    assert.deepEqual(errors, []);
    console.log('PASS: a shifted binding is editable in a profile that imports a template, and only its own line changes');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1 });
