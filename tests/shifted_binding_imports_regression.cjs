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
    await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {});
    // The app opens on Home (console refinement 2a); these checks start in the editing shell.
    await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {})
    await page.locator('.profile-chip').waitFor();
    await page.getByRole('button', { name: 'Buttons', exact: true }).click();

    // The import must actually have been resolved, or this test proves nothing.
    await page.waitForFunction(() => (window.__reads || []).length > 0);
    assert.deepEqual(await page.evaluate(() => window.__reads), ['profiles-library/FPS Template.txt']);

    // A shift is a row of the input's While holding page; "Every way of
    // pressing, while held" opens its sheet, the same one the input has (console v2).
    const eff = (text, key) => {
      const lines = text.split('\n');
      const own = lines.filter(line => line.startsWith(`# @controller type-24 ${key} = `)).pop();
      const shared = lines.filter(line => line.startsWith(`${key} = `)).pop();
      const line = own ? own.slice('# @controller type-24 '.length) : shared;
      return line ? line.slice(key.length + 3).trim() : undefined;
    };
    await page.locator('details[data-input-command="S"] > summary').first().click();
    await page.locator('details[data-input-command="S"][open] [data-fold="while-holding"]').click();
    await page.locator('[data-modeshift-row="RSR"]').click();
    await page.getByRole('button', { name: /Every way of pressing/ }).click();
    const shifted = page.locator('[data-input-command="RSR,S"]').first();
    const chip = shifted.locator('[data-chip-command]').first();
    await chip.waitFor();
    const label = async () => (await chip.getAttribute('aria-label')).replace(/^Choose action: /, '');
    const pickKey = async key => {
      await chip.click();
      // The key picker (console v2): Tab is on Common in games.
      const picker = page.locator('[data-picker="key"]');
      await picker.waitFor();
      await picker.locator('[data-category="common"]').click();
      await picker.locator(`button.key-cap[data-token="${key.toUpperCase()}"]`).click();
      await picker.waitFor({ state: 'detached' });
    };
    assert.match(await label(), /Hyphen|^-$/, 'the shifted binding did not load');

    // --- the key picker -------------------------------------------------------
    await pickKey('Tab');
    await page.waitForTimeout(400);
    assert.equal(await label(), 'Tab', 'the edit snapped back: the sheet read a different line than it wrote');

    // --- listen for a key ------------------------------------------------------
    // The key picker's X listens into the command it was opened on (Also send adds a new one).
    await chip.click();
    await page.locator('[data-picker="key"]').waitFor();
    await page.keyboard.press('x');
    await page.waitForFunction(() => document.body.dataset.bindingCapture === 'true');
    await page.keyboard.press('KeyJ');
    await page.waitForTimeout(400);
    assert.equal(await label(), 'J', 'capture did not reach the shifted binding');

    // --- and it is the shifted line that changed ------------------------------
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => /RSR,S/.test(window.__lastSaved || ''));
    const saved = await page.evaluate(() => window.__lastSaved);
    assert.equal(eff(saved, 'RSR,S'), 'J', `the shifted line was not written:\n${saved}`);
    assert.match(saved, /^S = SPACE/m, `the unshifted binding was changed instead:\n${saved}`);
    assert.equal(eff(saved, 'RSR,W'), 'U', `another shifted binding was disturbed:\n${saved}`);

    assert.match(saved, /^profiles-library\/FPS Template\.txt$/m, 'the import line was lost');
    // The template's own text must never be written into the profile.
    assert.ok(!/^E = LCONTROL$/m.test(saved), `the import was inlined into the profile:\n${saved}`);

    assert.deepEqual(errors, []);
    console.log('PASS: a shifted binding is editable in a profile that imports a template, and only its own line changes');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1 });
